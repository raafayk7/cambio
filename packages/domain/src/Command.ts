import { Schema } from "effect"
import { SlotRef } from "./GameState.js"
import { SlotIndex, UserId } from "./Ids.js"

/**
 * The command ADT: every input the rules engine accepts (§12). Imperative
 * verbs; every player-issued case carries its issuer. Legality lives solely
 * in `Legality.ts` — these shapes validate structure, never rules.
 */

/** Ends the game immediately — no final round, no caller bonus (§1.3a). */
export const CallCambio = Schema.TaggedStruct("CallCambio", {
  playerId: UserId,
})

/** Take the (non-power) top discard into held state (§1.3b). */
export const TakeDiscard = Schema.TaggedStruct("TakeDiscard", {
  playerId: UserId,
})

/** Draw the top deck card into held state (§1.3c). */
export const DrawFromDeck = Schema.TaggedStruct("DrawFromDeck", {
  playerId: UserId,
})

/** Place the held card into a named occupied own slot; displaced card to discard. */
export const SwapHeld = Schema.TaggedStruct("SwapHeld", {
  playerId: UserId,
  slotIndex: SlotIndex,
})

/** Discard the held card directly — deck-source non-power only (§1.3c). */
export const DiscardHeld = Schema.TaggedStruct("DiscardHeld", {
  playerId: UserId,
})

/** Zero-card keep into the lowest free slot (§1.6, ADR-0009). */
export const KeepHeld = Schema.TaggedStruct("KeepHeld", {
  playerId: UserId,
})

/** Resolves 7/8 (own slot), 9/10 (other's slot), and the Queen's step one (§1.4). */
export const PowerPeek = Schema.TaggedStruct("PowerPeek", {
  playerId: UserId,
  target: SlotRef,
})

/** Resolves the Jack, and the Queen's step two: blind-swap two occupied slots (§1.4, ADR-0010). */
export const PowerSwap = Schema.TaggedStruct("PowerSwap", {
  playerId: UserId,
  first: SlotRef,
  second: SlotRef,
})

/**
 * Slam a face-down card as matching the top discard's rank (§1.5). The
 * give-slot choice rides along up front: required (an occupied own slot) when
 * slamming an opponent's card with a non-empty hand; must be `null` otherwise
 * — own-card slams and zero-card draw-then-give (ADR-0009).
 */
export const Slam = Schema.TaggedStruct("Slam", {
  playerId: UserId,
  target: SlotRef,
  giveSlot: Schema.NullOr(SlotIndex),
})

/**
 * The explicit window close (ADR-0011): fired by the application layer's
 * timer on the happy path, or lazily before a late command after a sleep
 * (§6). No issuer — legal for anyone once `now >= closesAt`.
 */
export const CloseSlamWindow = Schema.TaggedStruct("CloseSlamWindow", {})

export const Command = Schema.Union(
  CallCambio,
  TakeDiscard,
  DrawFromDeck,
  SwapHeld,
  DiscardHeld,
  KeepHeld,
  PowerPeek,
  PowerSwap,
  Slam,
  CloseSlamWindow,
)
export type Command = typeof Command.Type

export type CallCambio = typeof CallCambio.Type
export type TakeDiscard = typeof TakeDiscard.Type
export type DrawFromDeck = typeof DrawFromDeck.Type
export type SwapHeld = typeof SwapHeld.Type
export type DiscardHeld = typeof DiscardHeld.Type
export type KeepHeld = typeof KeepHeld.Type
export type PowerPeek = typeof PowerPeek.Type
export type PowerSwap = typeof PowerSwap.Type
export type Slam = typeof Slam.Type
export type CloseSlamWindow = typeof CloseSlamWindow.Type

export const decodeCommand = Schema.decodeUnknownSync(Command)
export const encodeCommand = Schema.encodeSync(Command)
