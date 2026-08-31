import { Data, Either, Option } from "effect"
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
import { checkCommand, powerHasValidTarget } from "./Legality.js"
import { gameScores, winnersOf } from "./Scoring.js"

/**
 * The rules engine (§12 step 1): a pure state machine. Every transition
 * routes through `checkCommand` first — no rule check lives here, only
 * state construction. Illegal commands leave the input state untouched
 * (C7.3); all updates are immutable.
 */

export type EngineResult = Either.Either<
  readonly [GameState, ReadonlyArray<GameEvent>],
  GameError
>

type Step = readonly [GameState, ReadonlyArray<GameEvent>]

/**
 * Scaffold error for milestone-by-milestone construction. Private on
 * purpose: no test may rely on it, and it is deleted once every handler is
 * real (verified by grep in the plan's validation).
 */
class TransitionNotReached extends Data.TaggedError("TransitionNotReached")<{
  readonly commandTag: string
}> {}

type Handler = Either.Either<Step, GameError | TransitionNotReached>

const todo = (commandTag: string): Handler =>
  Either.left(new TransitionNotReached({ commandTag }))

// ---------------------------------------------------------------------------
// Shared state-construction helpers. Legality is already established.
// ---------------------------------------------------------------------------

const sortHand = (hand: Hand): Hand => [...hand].sort((a, b) => a.slotIndex - b.slotIndex)

const withHand = (state: GameState, playerId: UserId, f: (hand: Hand) => Hand): GameState => ({
  ...state,
  players: state.players.map((p) =>
    p.id === playerId ? { ...p, hand: sortHand(f(p.hand)) } : p,
  ),
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
 * Open the slam window against the top discard (§1.5) — or, when the pile is
 * empty (a zero-card keep took its last card), skip the window entirely and
 * advance the turn (ADR-0012).
 */
const openWindowOrAdvance = (state: GameState, turnPlayerId: UserId, now: Timestamp): Step => {
  const top = state.discard[0]
  if (top === undefined) return advanceTurn(state, turnPlayerId)
  const closesAt = Timestamp.make(now + state.config.slamWindowMs)
  const windowRank = rank(top)
  return [
    { ...state, phase: { _tag: "SlamWindow", turnPlayerId, closesAt, rank: windowRank } },
    [{ _tag: "SlamWindowOpened", turnPlayerId, closesAt, rank: windowRank }],
  ]
}

/** Reshuffle the pile minus its top into a new deck when empty (§1.7). */
const reshuffleIfEmpty = (state: GameState): Step => {
  if (state.deck.length > 0 || state.discard.length <= 1) return [state, []]
  const [deck, prng] = shuffle(state.discard.slice(1), state.prng)
  return [
    { ...state, deck, discard: [state.discard[0]!], prng },
    [{ _tag: "DeckReshuffled", deck }],
  ]
}

/**
 * Take the top deck card, reshuffling first if needed. Returns `None` when
 * no card exists anywhere even after reshuffle — callers decide whether that
 * skips a penalty (ADR-0011) or was already ruled out by legality (C6.2).
 */
const drawOne = (
  state: GameState,
): Option.Option<readonly [GameState, ReadonlyArray<GameEvent>, GameState["deck"][number]]> => {
  const [reshuffled, events] = reshuffleIfEmpty(state)
  const top = reshuffled.deck[0]
  if (top === undefined) return Option.none()
  return Option.some([{ ...reshuffled, deck: reshuffled.deck.slice(1) }, events, top])
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
  const [drawn, events, card] = Option.getOrThrow(drawOne(state))
  const drawEvents: ReadonlyArray<GameEvent> = [...events, { _tag: "CardDrawn", playerId, card }]
  const cardRank = rank(card)

  if (!isPowerRank(cardRank)) {
    return [
      { ...drawn, phase: { _tag: "HoldingCard", playerId, card, source: "deck" } },
      drawEvents,
    ]
  }

  if (powerHasValidTarget(cardRank, drawn, playerId)) {
    return [{ ...drawn, phase: { _tag: "ResolvingPower", playerId, card } }, drawEvents]
  }

  // No valid target: the obligatory power fizzles straight to the pile (ADR-0010).
  const fizzled: GameState = { ...drawn, discard: [card, ...drawn.discard] }
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
  return [
    windowState,
    [{ _tag: "HeldDiscarded", playerId, card: phase.card }, ...windowEvents],
  ]
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

const closeSlamWindow = (state: GameState): Step => {
  const phase = state.phase as Extract<GameState["phase"], { _tag: "SlamWindow" }>
  const [advanced, events] = advanceTurn(state, phase.turnPlayerId)
  return [advanced, [{ _tag: "SlamWindowClosed" }, ...events]]
}

export const applyCommand = (
  state: GameState,
  command: Command,
  now: Timestamp,
): EngineResult => {
  const illegal = checkCommand(state, command, now)
  if (Option.isSome(illegal)) return Either.left(illegal.value)

  const result: Handler = (() => {
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
        return Either.right(
          powerSwap(state, command.playerId, command.first, command.second, now),
        )
      case "Slam":
        return todo(command._tag)
      case "CloseSlamWindow":
        return Either.right(closeSlamWindow(state))
    }
  })()

  // The scaffold error never escapes once all handlers are implemented.
  return result as EngineResult
}
