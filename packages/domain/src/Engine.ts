import { Either, Option } from "effect"
import { type CardSlug, isPowerRank, rank } from "./Card.js"
import { type Command } from "./Command.js"
import { type GameError } from "./GameError.js"
import { type GameEvent } from "./GameEvent.js"
import {
  type GameState,
  type Hand,
  handOf,
  lowestFreeSlot,
  slotCard,
  type SlotRef,
} from "./GameState.js"
import { Timestamp, type UserId } from "./Ids.js"
import { shuffle } from "./Prng.js"
import { checkCommand, drawable, powerHasValidTarget } from "./Legality.js"
import { gameScores, winnersOf } from "./Scoring.js"

/**
 * The rules engine (§12 step 1): a pure state machine. Every transition
 * routes through `checkCommand` first — no rule check lives here, only
 * state construction. Illegal commands leave the input state untouched
 * (C7.3); all updates are immutable.
 */

export type EngineResult = Either.Either<readonly [GameState, ReadonlyArray<GameEvent>], GameError>

type Step = readonly [GameState, ReadonlyArray<GameEvent>]

// ---------------------------------------------------------------------------
// Shared state-construction helpers. Legality is already established.
// ---------------------------------------------------------------------------

const sortHand = (hand: Hand): Hand => [...hand].sort((a, b) => a.slotIndex - b.slotIndex)

const withHand = (state: GameState, playerId: UserId, f: (hand: Hand) => Hand): GameState => ({
  ...state,
  players: state.players.map((p) => (p.id === playerId ? { ...p, hand: sortHand(f(p.hand)) } : p)),
})

/** Advance to the next seat, `(seat + 1) % n` — zero-card players included (§1.6). */
const advanceTurn = (state: GameState, fromPlayerId: UserId): Step => {
  const seat = state.players.findIndex((p) => p.id === fromPlayerId)
  const next = state.players[(seat + 1) % state.players.length]!.id
  return [
    { ...state, phase: { _tag: "AwaitingDraw", playerId: next } },
    [{ _tag: "TurnAdvanced", playerId: next }],
  ]
}

/**
 * Reshuffle the pile minus its top into a new deck the moment the state
 * allows it — deck empty, discard reshufflable (§1.7, ADR-0040: eager,
 * single mechanism). No-op otherwise. Composed at every site that can leave
 * the deck empty: right after each of the three draw sites (below), and at
 * the discard-landing sites — `openWindowOrAdvance`'s entry (covering the
 * five handlers that funnel through it) and the slam's two non-window
 * returns. Idempotent by construction: a reshuffle never leaves the deck
 * empty, so composing it twice on one path cannot double-fire.
 */
const eagerReshuffle = (state: GameState): Step => {
  if (state.deck.length > 0 || !drawable(state)) return [state, []]
  const [deck, prng] = shuffle(state.discard.slice(1), state.prng)
  return [
    { ...state, deck, discard: [state.discard[0]!], prng },
    [{ _tag: "DeckReshuffled", deck, prng }],
  ]
}

/**
 * Open the slam window against the top discard (§1.5) — or, when the pile is
 * empty (a zero-card keep took its last card), skip the window entirely and
 * advance the turn (ADR-0012). Reshuffles eagerly first (ADR-0040): a card
 * that just landed on the pile may re-arm a deck that emptied earlier with
 * nothing to reshuffle — the retained top is unchanged, so the window rank
 * this reads is unaffected.
 */
const openWindowOrAdvance = (state: GameState, turnPlayerId: UserId, now: Timestamp): Step => {
  const [reshuffled, reshuffleEvents] = eagerReshuffle(state)
  const top = reshuffled.discard[0]
  if (top === undefined) {
    const [advanced, events] = advanceTurn(reshuffled, turnPlayerId)
    return [advanced, [...reshuffleEvents, ...events]]
  }
  const closesAt = Timestamp.make(now + reshuffled.config.slamWindowMs)
  const windowRank = rank(top)
  return [
    { ...reshuffled, phase: { _tag: "SlamWindow", turnPlayerId, closesAt, rank: windowRank } },
    [...reshuffleEvents, { _tag: "SlamWindowOpened", turnPlayerId, closesAt, rank: windowRank }],
  ]
}

/**
 * Take the top deck card. Returns `None` when the deck is empty — callers
 * decide whether that skips a penalty (ADR-0011) or was already ruled out by
 * legality (C6.2). No reshuffle here (single mechanism, ADR-0040): a draw
 * that empties the deck reshuffles *after*, composed explicitly by each call
 * site once its own event is built — see the three sites below.
 */
const drawOne = (state: GameState): Option.Option<readonly [GameState, CardSlug]> => {
  const top = state.deck[0]
  if (top === undefined) return Option.none()
  return Option.some([{ ...state, deck: state.deck.slice(1) }, top])
}

// ---------------------------------------------------------------------------
// Handlers, one per command. Each assumes checkCommand passed.
// ---------------------------------------------------------------------------

const callCambio = (state: GameState, playerId: UserId): Step => {
  const scores = gameScores(state)
  return [
    { ...state, phase: { _tag: "Ended", calledBy: playerId } },
    [
      { _tag: "CambioCalled", playerId },
      { _tag: "GameEnded", calledBy: playerId, scores, winners: winnersOf(scores) },
    ],
  ]
}

const takeDiscard = (state: GameState, playerId: UserId): Step => {
  const top = state.discard[0]!
  return [
    {
      ...state,
      discard: state.discard.slice(1),
      phase: { _tag: "HoldingCard", playerId, card: top, source: "discard" },
    },
    [{ _tag: "DiscardTaken", playerId, card: top }],
  ]
}

const drawFromDeck = (state: GameState, playerId: UserId, now: Timestamp): Step => {
  // Legality (C6.2) guarantees a card exists, so the None branch is unreachable.
  const [drawn, card] = Option.getOrThrow(drawOne(state))
  // Eager (ADR-0040): a draw that takes the last deck card reshuffles right
  // after, so CardDrawn always precedes DeckReshuffled in the batch.
  const [reshuffled, reshuffleEvents] = eagerReshuffle(drawn)
  const drawEvents: ReadonlyArray<GameEvent> = [
    { _tag: "CardDrawn", playerId, card },
    ...reshuffleEvents,
  ]
  const cardRank = rank(card)

  if (!isPowerRank(cardRank)) {
    return [
      { ...reshuffled, phase: { _tag: "HoldingCard", playerId, card, source: "deck" } },
      drawEvents,
    ]
  }

  if (powerHasValidTarget(cardRank, reshuffled, playerId)) {
    return [{ ...reshuffled, phase: { _tag: "ResolvingPower", playerId, card } }, drawEvents]
  }

  // No valid target: the obligatory power fizzles straight to the pile (ADR-0010).
  const fizzled: GameState = { ...reshuffled, discard: [card, ...reshuffled.discard] }
  const [windowState, windowEvents] = openWindowOrAdvance(fizzled, playerId, now)
  return [
    windowState,
    [
      ...drawEvents,
      { _tag: "PowerFizzled", playerId, power: cardRank },
      { _tag: "PowerDiscarded", playerId, card },
      ...windowEvents,
    ],
  ]
}

const swapHeld = (
  state: GameState,
  playerId: UserId,
  slotIndex: Hand[number]["slotIndex"],
  now: Timestamp,
): Step => {
  const phase = state.phase as Extract<GameState["phase"], { _tag: "HoldingCard" }>
  const displaced = Option.getOrThrow(slotCard(state, { playerId, slotIndex }))
  const swapped = withHand(state, playerId, (hand) =>
    hand.map((s) => (s.slotIndex === slotIndex ? { slotIndex, card: phase.card } : s)),
  )
  const resolved: GameState = { ...swapped, discard: [displaced, ...swapped.discard] }
  const [windowState, windowEvents] = openWindowOrAdvance(resolved, playerId, now)
  return [
    windowState,
    [
      { _tag: "HeldSwapped", playerId, slotIndex, placed: phase.card, discarded: displaced },
      ...windowEvents,
    ],
  ]
}

const discardHeld = (state: GameState, playerId: UserId, now: Timestamp): Step => {
  const phase = state.phase as Extract<GameState["phase"], { _tag: "HoldingCard" }>
  const resolved: GameState = { ...state, discard: [phase.card, ...state.discard] }
  const [windowState, windowEvents] = openWindowOrAdvance(resolved, playerId, now)
  return [windowState, [{ _tag: "HeldDiscarded", playerId, card: phase.card }, ...windowEvents]]
}

const keepHeld = (state: GameState, playerId: UserId, now: Timestamp): Step => {
  const phase = state.phase as Extract<GameState["phase"], { _tag: "HoldingCard" }>
  const slotIndex = lowestFreeSlot(Option.getOrElse(handOf(state, playerId), () => []))
  const kept = withHand(state, playerId, (hand) => [...hand, { slotIndex, card: phase.card }])
  const [windowState, windowEvents] = openWindowOrAdvance(kept, playerId, now)
  return [
    windowState,
    [{ _tag: "HeldKept", playerId, slotIndex, card: phase.card }, ...windowEvents],
  ]
}

const setSlot = (state: GameState, ref: SlotRef, newCard: CardSlug): GameState =>
  withHand(state, ref.playerId, (hand) =>
    hand.map((s) => (s.slotIndex === ref.slotIndex ? { ...s, card: newCard } : s)),
  )

const powerPeek = (state: GameState, playerId: UserId, target: SlotRef, now: Timestamp): Step => {
  const phase = state.phase as Extract<GameState["phase"], { _tag: "ResolvingPower" }>
  const peeked = Option.getOrThrow(slotCard(state, target))
  const peekEvent: GameEvent = { _tag: "CardPeeked", viewerId: playerId, target, card: peeked }

  if (rank(phase.card) === "Q") {
    // Step one of two: the swap is still owed (§1.4).
    return [
      { ...state, phase: { _tag: "ResolvingQueenSwap", playerId, card: phase.card } },
      [peekEvent],
    ]
  }

  const resolved: GameState = { ...state, discard: [phase.card, ...state.discard] }
  const [windowState, windowEvents] = openWindowOrAdvance(resolved, playerId, now)
  return [
    windowState,
    [peekEvent, { _tag: "PowerDiscarded", playerId, card: phase.card }, ...windowEvents],
  ]
}

const powerSwap = (
  state: GameState,
  playerId: UserId,
  first: SlotRef,
  second: SlotRef,
  now: Timestamp,
): Step => {
  const phase = state.phase as Extract<
    GameState["phase"],
    { _tag: "ResolvingPower" } | { _tag: "ResolvingQueenSwap" }
  >
  const cardA = Option.getOrThrow(slotCard(state, first))
  const cardB = Option.getOrThrow(slotCard(state, second))
  const swapped = setSlot(setSlot(state, first, cardB), second, cardA)
  const resolved: GameState = { ...swapped, discard: [phase.card, ...swapped.discard] }
  const [windowState, windowEvents] = openWindowOrAdvance(resolved, playerId, now)
  return [
    windowState,
    [
      { _tag: "CardsBlindSwapped", by: playerId, first, second },
      { _tag: "PowerDiscarded", playerId, card: phase.card },
      ...windowEvents,
    ],
  ]
}

/** All four slam outcomes (§1.5), plus ADR-0009's draw-then-give and ADR-0011's skips. */
const slam = (
  state: GameState,
  playerId: UserId,
  target: SlotRef,
  giveSlot: Hand[number]["slotIndex"] | null,
): Step => {
  const phase = state.phase as Extract<GameState["phase"], { _tag: "SlamWindow" }>
  const targetCard = Option.getOrThrow(slotCard(state, target))

  if (rank(targetCard) !== phase.rank) {
    const failed: GameEvent = { _tag: "SlamFailed", slammerId: playerId, target, card: targetCard }
    const drawn = drawOne(state)
    if (Option.isNone(drawn)) {
      // No card exists anywhere: penalty skipped (ADR-0011).
      return [state, [failed, { _tag: "DrawSkipped", playerId, kind: "penalty" }]]
    }
    const [drawnState, penalty] = drawn.value
    const slotIndex = lowestFreeSlot(Option.getOrElse(handOf(drawnState, playerId), () => []))
    const penalized = withHand(drawnState, playerId, (hand) => [
      ...hand,
      { slotIndex, card: penalty },
    ])
    // Eager (ADR-0040): reshuffle after the penalty draw, not before.
    const [reshuffled, reshuffleEvents] = eagerReshuffle(penalized)
    return [
      reshuffled,
      [failed, { _tag: "PenaltyDrawn", playerId, slotIndex, card: penalty }, ...reshuffleEvents],
    ]
  }

  const removed = withHand(state, target.playerId, (hand) =>
    hand.filter((s) => s.slotIndex !== target.slotIndex),
  )
  const succeeded: GameEvent = {
    _tag: "SlamSucceeded",
    slammerId: playerId,
    target,
    card: targetCard,
  }
  const slammed: GameState = { ...removed, discard: [targetCard, ...removed.discard] }
  // Eager (ADR-0040): slams don't open a window, so the re-arm reshuffle
  // this landing may trigger is composed here, not via openWindowOrAdvance.
  const [reshuffled, reshuffleEvents] = eagerReshuffle(slammed)

  if (target.playerId === playerId) return [reshuffled, [succeeded, ...reshuffleEvents]]

  if (giveSlot !== null) {
    const giveCard = Option.getOrThrow(slotCard(reshuffled, { playerId, slotIndex: giveSlot }))
    const taken = withHand(reshuffled, playerId, (hand) =>
      hand.filter((s) => s.slotIndex !== giveSlot),
    )
    const given = withHand(taken, target.playerId, (hand) => [
      ...hand,
      { slotIndex: target.slotIndex, card: giveCard },
    ])
    return [
      given,
      [
        succeeded,
        ...reshuffleEvents,
        { _tag: "CardGivenFromHand", slammerId: playerId, fromSlot: giveSlot, to: target },
      ],
    ]
  }

  // Zero-card slammer: draw-then-give, unseen (ADR-0009).
  const drawn = drawOne(reshuffled)
  if (Option.isNone(drawn)) {
    return [
      reshuffled,
      [succeeded, ...reshuffleEvents, { _tag: "DrawSkipped", playerId, kind: "give" }],
    ]
  }
  const [drawnState, giveCard] = drawn.value
  // The give-draw can itself empty the deck; reshuffle after it too.
  const [reshuffledAfterGive, reshuffleAfterGiveEvents] = eagerReshuffle(drawnState)
  const given = withHand(reshuffledAfterGive, target.playerId, (hand) => [
    ...hand,
    { slotIndex: target.slotIndex, card: giveCard },
  ])
  return [
    given,
    [
      succeeded,
      ...reshuffleEvents,
      { _tag: "CardGivenFromDeck", slammerId: playerId, to: target, card: giveCard },
      ...reshuffleAfterGiveEvents,
    ],
  ]
}

const closeSlamWindow = (state: GameState): Step => {
  const phase = state.phase as Extract<GameState["phase"], { _tag: "SlamWindow" }>
  const [advanced, events] = advanceTurn(state, phase.turnPlayerId)
  return [advanced, [{ _tag: "SlamWindowClosed" }, ...events]]
}

export const applyCommand = (state: GameState, command: Command, now: Timestamp): EngineResult => {
  const illegal = checkCommand(state, command, now)
  if (Option.isSome(illegal)) return Either.left(illegal.value)

  return (() => {
    switch (command._tag) {
      case "CallCambio":
        return Either.right(callCambio(state, command.playerId))
      case "TakeDiscard":
        return Either.right(takeDiscard(state, command.playerId))
      case "DrawFromDeck":
        return Either.right(drawFromDeck(state, command.playerId, now))
      case "SwapHeld":
        return Either.right(swapHeld(state, command.playerId, command.slotIndex, now))
      case "DiscardHeld":
        return Either.right(discardHeld(state, command.playerId, now))
      case "KeepHeld":
        return Either.right(keepHeld(state, command.playerId, now))
      case "PowerPeek":
        return Either.right(powerPeek(state, command.playerId, command.target, now))
      case "PowerSwap":
        return Either.right(powerSwap(state, command.playerId, command.first, command.second, now))
      case "Slam":
        return Either.right(slam(state, command.playerId, command.target, command.giveSlot))
      case "CloseSlamWindow":
        return Either.right(closeSlamWindow(state))
    }
  })()
}
