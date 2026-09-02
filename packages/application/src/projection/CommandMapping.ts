import type * as Contracts from "@cambio/contracts"
import { type Command, SlotIndex, type SlotRef as DomainSlotRef, UserId } from "@cambio/domain"
import { Schema } from "effect"

/**
 * Wire command → domain command (root plan C1.5): the wire carries no issuer,
 * so the session user is injected as `playerId` here — the single place a
 * client-supplied payload becomes an engine command. Target `SlotRef`s are
 * data (who is being peeked/slammed), not identity, and pass through.
 *
 * Pure and total over the nine wire variants; a tenth variant fails to
 * compile at the `satisfies never`.
 */

const toSlotIndex = Schema.decodeUnknownSync(SlotIndex)
const toUserId = Schema.decodeUnknownSync(UserId)

const toSlotRef = (ref: Contracts.SlotRef): DomainSlotRef => ({
  playerId: toUserId(ref.playerId),
  slotIndex: toSlotIndex(ref.slotIndex),
})

export const toDomainCommand = (userId: UserId, wire: Contracts.WireCommand): Command => {
  switch (wire._tag) {
    case "CallCambio":
    case "TakeDiscard":
    case "DrawFromDeck":
    case "DiscardHeld":
    case "KeepHeld":
      return { _tag: wire._tag, playerId: userId }
    case "SwapHeld":
      return { _tag: "SwapHeld", playerId: userId, slotIndex: toSlotIndex(wire.slotIndex) }
    case "PowerPeek":
      return { _tag: "PowerPeek", playerId: userId, target: toSlotRef(wire.target) }
    case "PowerSwap":
      return {
        _tag: "PowerSwap",
        playerId: userId,
        first: toSlotRef(wire.first),
        second: toSlotRef(wire.second),
      }
    case "Slam":
      return {
        _tag: "Slam",
        playerId: userId,
        target: toSlotRef(wire.target),
        giveSlot: wire.giveSlot === null ? null : toSlotIndex(wire.giveSlot),
      }
    default:
      return wire satisfies never
  }
}
