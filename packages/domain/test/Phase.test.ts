import { describe, expect, it } from "@effect/vitest"
import { decodePhase, encodePhase, type Phase } from "../src/Phase.js"
import { card, ts, uid } from "./fixtures.js"

const p0 = uid(0)
const p1 = uid(1)

describe("Phase", () => {
  it("round-trips each member of the union", () => {
    const phases: ReadonlyArray<Phase> = [
      { _tag: "AwaitingDraw", playerId: p0 },
      { _tag: "HoldingCard", playerId: p0, card: card("7H"), source: "deck" },
      { _tag: "HoldingCard", playerId: p0, card: card("5C"), source: "discard" },
      { _tag: "ResolvingPower", playerId: p0, card: card("QS") },
      { _tag: "ResolvingQueenSwap", playerId: p0, card: card("QS") },
      { _tag: "SlamWindow", turnPlayerId: p1, closesAt: ts(1_700_000_000_000), rank: "K" },
      { _tag: "Ended", calledBy: p0 },
    ]

    for (const phase of phases) {
      expect(decodePhase(encodePhase(phase))).toStrictEqual(phase)
    }
  })

  it("discriminates on _tag", () => {
    const phase = decodePhase({ _tag: "Ended", calledBy: p0 })
    expect(phase._tag).toBe("Ended")
  })

  it("rejects an unknown tag", () => {
    expect(() => decodePhase({ _tag: "Nope", playerId: p0 })).toThrow()
  })

  it("rejects the deleted provisional ResolvingPower shape (ADR-0010)", () => {
    expect(() =>
      decodePhase({ _tag: "ResolvingPower", playerId: p0, power: "Q", chosen: [] }),
    ).toThrow()
  })
})
