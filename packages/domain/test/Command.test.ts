import { describe, expect, it } from "@effect/vitest"
import { type Command, decodeCommand, encodeCommand } from "../src/Command.js"
import { card, slot, uid } from "./fixtures.js"

const p0 = uid(0)
const p1 = uid(1)

describe("Command", () => {
  it("round-trips each member of the union", () => {
    const commands: ReadonlyArray<Command> = [
      { _tag: "CallCambio", playerId: p0 },
      { _tag: "TakeDiscard", playerId: p0 },
      { _tag: "DrawFromDeck", playerId: p0 },
      { _tag: "SwapHeld", playerId: p0, slotIndex: slot(2) },
      { _tag: "DiscardHeld", playerId: p0 },
      { _tag: "KeepHeld", playerId: p0 },
      { _tag: "PowerPeek", playerId: p0, target: { playerId: p1, slotIndex: slot(0) } },
      {
        _tag: "PowerSwap",
        playerId: p0,
        first: { playerId: p0, slotIndex: slot(1) },
        second: { playerId: p1, slotIndex: slot(3) },
      },
      {
        _tag: "Slam",
        playerId: p1,
        target: { playerId: p0, slotIndex: slot(0) },
        giveSlot: slot(2),
      },
      { _tag: "Slam", playerId: p1, target: { playerId: p1, slotIndex: slot(0) }, giveSlot: null },
      { _tag: "CloseSlamWindow" },
    ]

    for (const command of commands) {
      expect(decodeCommand(encodeCommand(command))).toStrictEqual(command)
    }
  })

  it("rejects an unknown tag", () => {
    expect(() => decodeCommand({ _tag: "Cheat", playerId: p0, card: card("KD") })).toThrow()
  })
})
