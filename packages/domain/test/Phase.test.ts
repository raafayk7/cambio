import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { decodeCardSlug } from "../src/Card.js"
import { Timestamp, UserId } from "../src/Ids.js"
import { decodePhase, encodePhase, type Phase } from "../src/Phase.js"

/**
 * These exist to prove the Effect + Schema + branded-type toolchain works end
 * to end (§10), not to assert anything about the rules. There are no
 * transitions here on purpose.
 */

const userId = Schema.decodeUnknownSync(UserId)("6f1b3a02-8f1e-4f3a-9d21-0f7c5a2b1e44")

describe("Phase", () => {
  it("round-trips each member of the union", () => {
    const phases: ReadonlyArray<Phase> = [
      { _tag: "AwaitingDraw", playerId: userId },
      { _tag: "HoldingCard", playerId: userId, card: decodeCardSlug("7H"), source: "deck" },
      { _tag: "ResolvingPower", playerId: userId, power: "Q", chosen: [] },
      {
        _tag: "SlamWindow",
        closesAt: Schema.decodeUnknownSync(Timestamp)(1_700_000_000_000),
        rank: "K",
      },
      { _tag: "Ended", calledBy: userId },
    ]

    for (const phase of phases) {
      expect(decodePhase(encodePhase(phase))).toStrictEqual(phase)
    }
  })

  it("discriminates on _tag", () => {
    const phase = decodePhase({ _tag: "Ended", calledBy: userId })
    expect(phase._tag).toBe("Ended")
  })

  it("rejects an unknown tag", () => {
    expect(() => decodePhase({ _tag: "Nope", playerId: userId })).toThrow()
  })
})
