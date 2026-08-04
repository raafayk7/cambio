import { Schema } from "effect"
import { CardSlug, PowerKind, Rank } from "./Card.js"
import { SlotIndex, Timestamp, UserId } from "./Ids.js"

/**
 * Turn phase (§4.2). TYPES ONLY — no transitions, no legality.
 *
 * A turn is not atomic and the drawn card must have a home, so the game carries
 * a phase. Legal moves are a function of `(phase, playerId, gameState)`, and
 * there must be exactly one place in the codebase that answers "is this move
 * legal right now" — that place is the rules engine, built in a later task.
 * Do not add transition functions here.
 */

/**
 * A reference to one card by the slot it occupies.
 *
 * PROVISIONAL. §4.2 names a `TargetSelection` for the J/Q powers but never
 * defines it, and §9 leaves the targeting rules for empty hands undecided.
 * This shape is the minimum needed to make the union compile and is expected
 * to be redesigned when the rules engine is built. Do not build on it.
 */
export const CardRef = Schema.Struct({
  playerId: UserId,
  slotIndex: SlotIndex,
})
export type CardRef = typeof CardRef.Type

/** PROVISIONAL — see {@link CardRef}. */
export const TargetSelection = Schema.Array(CardRef)
export type TargetSelection = typeof TargetSelection.Type

/**
 * Where a held card came from. This matters: a card taken from the discard
 * *must* be swapped, a card drawn from the deck may be discarded (§4.2).
 * Same phase shape, different legal move set.
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
})

export const ResolvingPower = Schema.TaggedStruct("ResolvingPower", {
  playerId: UserId,
  power: PowerKind,
  chosen: TargetSelection,
})

export const SlamWindow = Schema.TaggedStruct("SlamWindow", {
  closesAt: Timestamp,
  rank: Rank,
})

export const Ended = Schema.TaggedStruct("Ended", {
  calledBy: UserId,
})

export const Phase = Schema.Union(AwaitingDraw, HoldingCard, ResolvingPower, SlamWindow, Ended)
export type Phase = typeof Phase.Type

export type AwaitingDraw = typeof AwaitingDraw.Type
export type HoldingCard = typeof HoldingCard.Type
export type ResolvingPower = typeof ResolvingPower.Type
export type SlamWindow = typeof SlamWindow.Type
export type Ended = typeof Ended.Type

export const decodePhase = Schema.decodeUnknownSync(Phase)
export const encodePhase = Schema.encodeSync(Phase)
