import { Schema } from "effect"
import { CardSlug, isPowerRank, Rank, rank } from "./Card.js"
import { Timestamp, UserId } from "./Ids.js"

/**
 * Turn phase (§4.2). Types only — transitions live in `Engine.ts` and
 * legality in `Legality.ts`; there is exactly one place that answers "is
 * this move legal right now" and it is not here. Do not add transition
 * functions to this module.
 */

/**
 * Where a held card came from. This matters: a card taken from the discard
 * *must* be swapped (or kept, at zero cards — ADR-0009), a card drawn from
 * the deck may also be discarded (§4.2). Same phase shape, different legal
 * move set.
 */
export const HeldCardSource = Schema.Literal("deck", "discard")
export type HeldCardSource = typeof HeldCardSource.Type

export const AwaitingDraw = Schema.TaggedStruct("AwaitingDraw", {
  playerId: UserId,
})

export const HoldingCard = Schema.TaggedStruct("HoldingCard", {
  playerId: UserId,
  card: CardSlug,
  source: HeldCardSource,
}).pipe(
  Schema.filter(
    (holding) =>
      !isPowerRank(rank(holding.card)) ||
      "a power-rank card must be resolved through ResolvingPower, never held (§1.3)",
  ),
)

/**
 * A drawn power card awaiting its (first) target command. The power kind is
 * derived via `rank(card)` rather than stored (§4.1); targets arrive on the
 * resolving command and resolve immediately (ADR-0010). The card slug is
 * carried because the power card must reach the discard pile after
 * resolution (§1.3c).
 */
export const ResolvingPower = Schema.TaggedStruct("ResolvingPower", {
  playerId: UserId,
  card: CardSlug,
})

/**
 * The Queen's step two (§1.4): peek done, blind-swap pair still owed. A
 * distinct case so matches stay exhaustive and step one cannot be replayed.
 */
export const ResolvingQueenSwap = Schema.TaggedStruct("ResolvingQueenSwap", {
  playerId: UserId,
  card: CardSlug,
})

/**
 * `closesAt` is fixed when the window opens and never moves (ADR-0011);
 * commands arriving later compute "already closed" from the clock (§6).
 * `turnPlayerId` is whose turn just resolved, so closing the window can
 * advance to seat `(seat + 1) % n` (§1.6).
 */
export const SlamWindow = Schema.TaggedStruct("SlamWindow", {
  turnPlayerId: UserId,
  closesAt: Timestamp,
  rank: Rank,
})

export const Ended = Schema.TaggedStruct("Ended", {
  calledBy: UserId,
})

export const Phase = Schema.Union(
  AwaitingDraw,
  HoldingCard,
  ResolvingPower,
  ResolvingQueenSwap,
  SlamWindow,
  Ended,
)
export type Phase = typeof Phase.Type

export type AwaitingDraw = typeof AwaitingDraw.Type
export type HoldingCard = typeof HoldingCard.Type
export type ResolvingPower = typeof ResolvingPower.Type
export type ResolvingQueenSwap = typeof ResolvingQueenSwap.Type
export type SlamWindow = typeof SlamWindow.Type
export type Ended = typeof Ended.Type

export const decodePhase = Schema.decodeUnknownSync(Phase)
export const encodePhase = Schema.encodeSync(Phase)
