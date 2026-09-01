import { Schema } from "effect"
import { SlotIndex, SlotRef } from "./GamePrimitives.js"

/**
 * The wire command union: what `POST /games/:gameId/commands` accepts (CAM-6).
 *
 * Exactly the nine player-issued engine commands. Two things are absent **by
 * construction**, not by validation:
 *
 *   - No variant carries a `playerId` issuer field. The session user is the
 *     issuer, always — the server injects it when mapping to the domain
 *     command, so a client cannot act as another player (root plan C1.5).
 *     `SlotRef.playerId` on peek/swap/slam *targets* remains: targeting
 *     another player's slot is data, not identity.
 *   - No `CloseSlamWindow`. It is issuer-less and server-internal — the room
 *     actor lazy-closes expired windows itself (root plan C1.4).
 */

export const CallCambio = Schema.TaggedStruct("CallCambio", {})
export const TakeDiscard = Schema.TaggedStruct("TakeDiscard", {})
export const DrawFromDeck = Schema.TaggedStruct("DrawFromDeck", {})
export const DiscardHeld = Schema.TaggedStruct("DiscardHeld", {})
export const KeepHeld = Schema.TaggedStruct("KeepHeld", {})

export const SwapHeld = Schema.TaggedStruct("SwapHeld", {
  slotIndex: SlotIndex,
})

export const PowerPeek = Schema.TaggedStruct("PowerPeek", {
  target: SlotRef,
})

export const PowerSwap = Schema.TaggedStruct("PowerSwap", {
  first: SlotRef,
  second: SlotRef,
})

export const Slam = Schema.TaggedStruct("Slam", {
  target: SlotRef,
  giveSlot: Schema.NullOr(SlotIndex),
})

export const WireCommand = Schema.Union(
  CallCambio,
  TakeDiscard,
  DrawFromDeck,
  SwapHeld,
  DiscardHeld,
  KeepHeld,
  PowerPeek,
  PowerSwap,
  Slam,
)
export type WireCommand = typeof WireCommand.Type

export const decodeWireCommandEither = Schema.decodeUnknownEither(WireCommand)
export const encodeWireCommand = Schema.encodeSync(WireCommand)
