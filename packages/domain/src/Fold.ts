import { Data, Either } from "effect"
import { type CardSlug, isPowerRank, rank } from "./Card.js"
import { type GameEvent, type GameStarted } from "./GameEvent.js"
import { type GameState, type Hand, type SlotRef } from "./GameState.js"
import { type UserId } from "./Ids.js"

/**
 * Fold-to-state (§6, ADR-0014): rebuild the exact `GameState` from an event
 * stream folded from seq 0. The fold **transcribes** payloads — cards, deck,
 * discard, config, and `prng` are copied, never recomputed — and its only
 * re-derivation is phase inference from the last phase-bearing event. It
 * never calls `shuffle` and never replays commands through the engine.
 *
 * The input must be a **whole-command prefix**: event batches append
 * atomically per command (the driver and the repository only ever cut at
 * step boundaries), so intermediate phases inside a batch are transient and
 * folding a mid-batch prefix is unspecified.
 *
 * Every disagreement between a payload and the accumulated state (a drawn
 * card that isn't the deck top, a swap naming an empty slot) is a typed
 * `InconsistentEvent` — corrupt logs surface as values, never throws.
 */

export class EmptyEventLog extends Data.TaggedError("EmptyEventLog") {}

export class MissingGameStarted extends Data.TaggedError("MissingGameStarted")<{
  readonly firstTag: string
}> {}

export class InconsistentEvent extends Data.TaggedError("InconsistentEvent")<{
  readonly index: number
  readonly tag: string
  readonly reason: string
}> {}

export type FoldError = EmptyEventLog | MissingGameStarted | InconsistentEvent

// Mirrors the engine's private hand discipline (Engine.ts): unique slots,
// sorted ascending, holes never compacted.
const sortHand = (hand: Hand): Hand => [...hand].sort((a, b) => a.slotIndex - b.slotIndex)

const withHand = (state: GameState, playerId: UserId, f: (hand: Hand) => Hand): GameState => ({
  ...state,
  players: state.players.map((p) => (p.id === playerId ? { ...p, hand: sortHand(f(p.hand)) } : p)),
})

const slotCardOf = (state: GameState, ref: SlotRef): CardSlug | undefined =>
  state.players.find((p) => p.id === ref.playerId)?.hand.find((s) => s.slotIndex === ref.slotIndex)
    ?.card

const initialState = (started: GameStarted): Either.Either<GameState, InconsistentEvent> => {
  if (started.players.length === 0 || started.players.length !== started.hands.length) {
    return Either.left(
      new InconsistentEvent({
        index: 0,
        tag: "GameStarted",
        reason: `players/hands mismatch: ${started.players.length} players, ${started.hands.length} hands`,
      }),
    )
  }
  return Either.right({
    players: started.players.map((id, seat) => ({ id, hand: started.hands[seat]! })),
    deck: started.deck,
    discard: [started.firstDiscard],
    prng: started.prng,
    phase: { _tag: "AwaitingDraw", playerId: started.players[0]! },
    config: started.config,
  })
}

const applyEvent = (
  state: GameState,
  event: GameEvent,
  index: number,
): Either.Either<GameState, InconsistentEvent> => {
  const bad = (reason: string): Either.Either<GameState, InconsistentEvent> =>
    Either.left(new InconsistentEvent({ index, tag: event._tag, reason }))

  switch (event._tag) {
    case "GameStarted":
      return bad("second GameStarted in the stream")

    case "CambioCalled":
    case "PowerFizzled":
    case "DrawSkipped":
    case "SlamWindowClosed":
      return Either.right(state)

    case "GameEnded":
      return Either.right({ ...state, phase: { _tag: "Ended", calledBy: event.calledBy } })

    case "CardDrawn": {
      const top = state.deck[0]
      if (top !== event.card) {
        return bad(`deck top is ${top ?? "(empty)"}, event drew ${event.card}`)
      }
      const drawn = { ...state, deck: state.deck.slice(1) }
      // Phase inference (ADR-0014): a power rank enters resolution; anything
      // else is held. The fizzle path's transient ResolvingPower is
      // overwritten by the same batch's later events.
      return Either.right(
        isPowerRank(rank(event.card))
          ? {
              ...drawn,
              phase: { _tag: "ResolvingPower", playerId: event.playerId, card: event.card },
            }
          : {
              ...drawn,
              phase: {
                _tag: "HoldingCard",
                playerId: event.playerId,
                card: event.card,
                source: "deck",
              },
            },
      )
    }

    case "DiscardTaken": {
      const top = state.discard[0]
      if (top !== event.card) {
        return bad(`discard top is ${top ?? "(empty)"}, event took ${event.card}`)
      }
      return Either.right({
        ...state,
        discard: state.discard.slice(1),
        phase: {
          _tag: "HoldingCard",
          playerId: event.playerId,
          card: event.card,
          source: "discard",
        },
      })
    }

    case "HeldSwapped": {
      if (state.phase._tag !== "HoldingCard" || state.phase.card !== event.placed) {
        return bad(`phase does not hold ${event.placed}`)
      }
      const ref: SlotRef = { playerId: event.playerId, slotIndex: event.slotIndex }
      if (slotCardOf(state, ref) !== event.discarded) {
        return bad(`slot ${event.slotIndex} does not hold ${event.discarded}`)
      }
      const swapped = withHand(state, event.playerId, (hand) =>
        hand.map((s) =>
          s.slotIndex === event.slotIndex ? { slotIndex: s.slotIndex, card: event.placed } : s,
        ),
      )
      return Either.right({ ...swapped, discard: [event.discarded, ...swapped.discard] })
    }

    case "HeldKept": {
      if (state.phase._tag !== "HoldingCard" || state.phase.card !== event.card) {
        return bad(`phase does not hold ${event.card}`)
      }
      if (
        slotCardOf(state, { playerId: event.playerId, slotIndex: event.slotIndex }) !== undefined
      ) {
        return bad(`slot ${event.slotIndex} is already occupied`)
      }
      return Either.right(
        withHand(state, event.playerId, (hand) => [
          ...hand,
          { slotIndex: event.slotIndex, card: event.card },
        ]),
      )
    }

    case "HeldDiscarded": {
      if (state.phase._tag !== "HoldingCard" || state.phase.card !== event.card) {
        return bad(`phase does not hold ${event.card}`)
      }
      return Either.right({ ...state, discard: [event.card, ...state.discard] })
    }

    case "CardPeeked": {
      if (slotCardOf(state, event.target) !== event.card) {
        return bad(`target slot does not hold ${event.card}`)
      }
      // The Queen's two-step (§1.4): a peek while resolving a Q owes a swap.
      if (state.phase._tag === "ResolvingPower" && rank(state.phase.card) === "Q") {
        return Either.right({
          ...state,
          phase: {
            _tag: "ResolvingQueenSwap",
            playerId: state.phase.playerId,
            card: state.phase.card,
          },
        })
      }
      return Either.right(state)
    }

    case "CardsBlindSwapped": {
      // Card identities are deliberately absent from the payload (§4.4);
      // derive them from the accumulated hands.
      const cardA = slotCardOf(state, event.first)
      const cardB = slotCardOf(state, event.second)
      if (cardA === undefined || cardB === undefined) {
        return bad("a named slot is unoccupied")
      }
      const swappedFirst = withHand(state, event.first.playerId, (hand) =>
        hand.map((s) =>
          s.slotIndex === event.first.slotIndex ? { slotIndex: s.slotIndex, card: cardB } : s,
        ),
      )
      return Either.right(
        withHand(swappedFirst, event.second.playerId, (hand) =>
          hand.map((s) =>
            s.slotIndex === event.second.slotIndex ? { slotIndex: s.slotIndex, card: cardA } : s,
          ),
        ),
      )
    }

    case "PowerDiscarded": {
      if (
        (state.phase._tag !== "ResolvingPower" && state.phase._tag !== "ResolvingQueenSwap") ||
        state.phase.card !== event.card
      ) {
        return bad(`phase is not resolving ${event.card}`)
      }
      return Either.right({ ...state, discard: [event.card, ...state.discard] })
    }

    case "SlamWindowOpened":
      return Either.right({
        ...state,
        phase: {
          _tag: "SlamWindow",
          turnPlayerId: event.turnPlayerId,
          closesAt: event.closesAt,
          rank: event.rank,
        },
      })

    case "SlamSucceeded": {
      if (slotCardOf(state, event.target) !== event.card) {
        return bad(`target slot does not hold ${event.card}`)
      }
      const removed = withHand(state, event.target.playerId, (hand) =>
        hand.filter((s) => s.slotIndex !== event.target.slotIndex),
      )
      return Either.right({ ...removed, discard: [event.card, ...removed.discard] })
    }

    case "SlamFailed": {
      if (slotCardOf(state, event.target) !== event.card) {
        return bad(`target slot does not hold ${event.card}`)
      }
      return Either.right(state)
    }

    case "PenaltyDrawn": {
      const top = state.deck[0]
      if (top !== event.card) {
        return bad(`deck top is ${top ?? "(empty)"}, penalty drew ${event.card}`)
      }
      if (
        slotCardOf(state, { playerId: event.playerId, slotIndex: event.slotIndex }) !== undefined
      ) {
        return bad(`slot ${event.slotIndex} is already occupied`)
      }
      return Either.right(
        withHand({ ...state, deck: state.deck.slice(1) }, event.playerId, (hand) => [
          ...hand,
          { slotIndex: event.slotIndex, card: event.card },
        ]),
      )
    }

    case "CardGivenFromHand": {
      // Identity-less by design (§4.4): the given card is read from the
      // slammer's accumulated hand.
      const given = slotCardOf(state, { playerId: event.slammerId, slotIndex: event.fromSlot })
      if (given === undefined) return bad(`slammer slot ${event.fromSlot} is unoccupied`)
      if (slotCardOf(state, event.to) !== undefined) {
        return bad("target slot is already occupied")
      }
      const taken = withHand(state, event.slammerId, (hand) =>
        hand.filter((s) => s.slotIndex !== event.fromSlot),
      )
      return Either.right(
        withHand(taken, event.to.playerId, (hand) => [
          ...hand,
          { slotIndex: event.to.slotIndex, card: given },
        ]),
      )
    }

    case "CardGivenFromDeck": {
      const top = state.deck[0]
      if (top !== event.card) {
        return bad(`deck top is ${top ?? "(empty)"}, give drew ${event.card}`)
      }
      if (slotCardOf(state, event.to) !== undefined) {
        return bad("target slot is already occupied")
      }
      return Either.right(
        withHand({ ...state, deck: state.deck.slice(1) }, event.to.playerId, (hand) => [
          ...hand,
          { slotIndex: event.to.slotIndex, card: event.card },
        ]),
      )
    }

    case "DeckReshuffled":
      // Pure transcription (ADR-0014): the resulting deck order and advanced
      // prng are copied from the payload; the top discard is retained (§1.7).
      return Either.right({
        ...state,
        deck: event.deck,
        discard: state.discard.length > 0 ? [state.discard[0]!] : [],
        prng: event.prng,
      })

    case "TurnAdvanced":
      return Either.right({
        ...state,
        phase: { _tag: "AwaitingDraw", playerId: event.playerId },
      })

    default:
      return event satisfies never
  }
}

export const foldEvents = (
  events: ReadonlyArray<GameEvent>,
): Either.Either<GameState, FoldError> => {
  const first = events[0]
  if (first === undefined) return Either.left(new EmptyEventLog())
  if (first._tag !== "GameStarted") {
    return Either.left(new MissingGameStarted({ firstTag: first._tag }))
  }

  const initial = initialState(first)
  if (Either.isLeft(initial)) return initial
  let state = initial.right

  for (let index = 1; index < events.length; index++) {
    const event = events[index]!
    if (state.phase._tag === "Ended") {
      return Either.left(
        new InconsistentEvent({
          index,
          tag: event._tag,
          reason: "event after GameEnded ended the stream",
        }),
      )
    }
    const next = applyEvent(state, event, index)
    if (Either.isLeft(next)) return next
    state = next.right
  }
  return Either.right(state)
}
