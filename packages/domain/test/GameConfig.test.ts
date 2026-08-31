import { describe, expect, it } from "@effect/vitest"
import { decodeGameConfig, encodeGameConfig } from "../src/GameConfig.js"

describe("GameConfig", () => {
  it("round-trips a config", () => {
    const config = decodeGameConfig({ slamWindowMs: 4000 })
    expect(decodeGameConfig(encodeGameConfig(config))).toStrictEqual(config)
  })

  it("rejects zero, negative, and non-integer durations (ADR-0011)", () => {
    for (const bad of [0, -1, 1.5, "4000", null]) {
      expect(() => decodeGameConfig({ slamWindowMs: bad })).toThrow()
    }
  })
})
