import { describe, expect, it } from "@effect/vitest"
import { type Command } from "@cambio/domain"
import { slot, uid } from "@cambio/domain/testing"
import { decodeWireCommandEither, type WireCommand } from "@cambio/contracts"
import { Either } from "effect"
import { toDomainCommand } from "../src/projection/CommandMapping.js"

/**
 * C1.5's injection point: wire commands carry no issuer; the mapping injects
 * the session user as the domain `playerId` for all nine variants, keeping
 * payload data intact. Exhaustiveness over the wire union is compile-time
 * (`satisfies never` in the implementation).
 */

const me = uid(7)
const other = uid(2)

const wire = (input: unknown): WireCommand => {
  const decoded = decodeWireCommandEither(input)
  if (Either.isLeft(decoded)) throw new Error("fixture failed to decode")
  return decoded.right
}

describe("toDomainCommand", () => {
  it("injects the session user on every bare variant", () => {
    for (const tag of [
      "CallCambio",
      "TakeDiscard",
      "DrawFromDeck",
      "DiscardHeld",
      "KeepHeld",
    ] as const) {
      const command = toDomainCommand(me, wire({ _tag: tag }))
      expect(command).toEqual({ _tag: tag, playerId: me })
    }
  })

  it("SwapHeld keeps the slot and gains the issuer", () => {
    const command = toDomainCommand(me, wire({ _tag: "SwapHeld", slotIndex: 2 }))
    expect(command).toEqual({ _tag: "SwapHeld", playerId: me, slotIndex: slot(2) })
  })

  it("PowerPeek keeps the target — target identity is data, not issuer", () => {
    const command = toDomainCommand(
      me,
      wire({ _tag: "PowerPeek", target: { playerId: other, slotIndex: 1 } }),
    )
    expect(command).toEqual({
      _tag: "PowerPeek",
      playerId: me,
      target: { playerId: other, slotIndex: slot(1) },
    })
  })

  it("PowerSwap keeps both slot refs", () => {
    const command = toDomainCommand(
      me,
      wire({
        _tag: "PowerSwap",
        first: { playerId: me, slotIndex: 0 },
        second: { playerId: other, slotIndex: 3 },
      }),
    )
    expect(command).toEqual({
      _tag: "PowerSwap",
      playerId: me,
      first: { playerId: me, slotIndex: slot(0) },
      second: { playerId: other, slotIndex: slot(3) },
    })
  })

  it("Slam keeps target and giveSlot, null included", () => {
    const withGive = toDomainCommand(
      me,
      wire({ _tag: "Slam", target: { playerId: other, slotIndex: 1 }, giveSlot: 0 }),
    )
    expect(withGive).toEqual({
      _tag: "Slam",
      playerId: me,
      target: { playerId: other, slotIndex: slot(1) },
      giveSlot: slot(0),
    })

    const withoutGive = toDomainCommand(
      me,
      wire({ _tag: "Slam", target: { playerId: me, slotIndex: 1 }, giveSlot: null }),
    )
    expect(withoutGive).toEqual({
      _tag: "Slam",
      playerId: me,
      target: { playerId: me, slotIndex: slot(1) },
      giveSlot: null,
    })
  })

  it("a spoofed playerId key on the wire is dead weight — decode drops it, mapping injects the session user", () => {
    const decoded = decodeWireCommandEither({ _tag: "DrawFromDeck", playerId: other })
    expect(Either.isRight(decoded)).toBe(true)
    if (Either.isRight(decoded)) {
      const command: Command = toDomainCommand(me, decoded.right)
      expect(command).toEqual({ _tag: "DrawFromDeck", playerId: me })
    }
  })
})
