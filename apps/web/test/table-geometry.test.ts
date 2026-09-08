import { describe, expect, it } from "vitest"

import {
  ART_HALF_PCT,
  BENCH_INSET_PCT,
  benchAssignment,
  SEAT_RING_GAP_PCT,
} from "../src/components/game/table-geometry.js"
import { BENCH_POSITION_CLASS } from "../src/components/game/table-surface.js"

/**
 * table-surface.md v6 + root plan clause 5, ADR-0036: seats anchor to the
 * four painted benches instead of spacing radially. Migrated from the old
 * seat-arc/ringPositions suite (retired with the polar engine) — these
 * pins cover the bench ASSIGNMENT (which seat gets which bench); the fixed
 * on-screen placement of each bench is a static class map in
 * table-surface.tsx, not geometry this module computes per seat count.
 */
describe("table-geometry", () => {
  it("derives the bench inset from the art's half-width plus the named gap", () => {
    expect(BENCH_INSET_PCT).toBe(ART_HALF_PCT + SEAT_RING_GAP_PCT)
  })

  it("keeps table-surface's hardcoded bench-inset class literals in lockstep with the derived constant (review F4 — the derivation identity above alone cannot catch an art-proportion change)", () => {
    const near = `[${50 - BENCH_INSET_PCT}%]`
    const far = `[${50 + BENCH_INSET_PCT}%]`
    expect(BENCH_POSITION_CLASS.top).toContain(`top-${near}`)
    expect(BENCH_POSITION_CLASS.bottom).toContain(`top-${far}`)
    expect(BENCH_POSITION_CLASS.left).toContain(`left-${near}`)
    expect(BENCH_POSITION_CLASS.right).toContain(`left-${far}`)
  })

  describe("benchAssignment", () => {
    it("puts the viewer's own seat on the bottom bench, for every seat count and every viewer index", () => {
      for (let count = 2; count <= 4; count++) {
        for (let viewer = 0; viewer < count; viewer++) {
          expect(benchAssignment(count, viewer)[viewer]).toBe("bottom")
        }
      }
    })

    it("2 players: the lone opponent takes the top bench", () => {
      expect(benchAssignment(2, 0)).toEqual(["bottom", "top"])
      expect(benchAssignment(2, 1)).toEqual(["top", "bottom"])
    })

    it("3 players: opponents split left + right, sweeping from the seat after the viewer", () => {
      expect(benchAssignment(3, 0)).toEqual(["bottom", "left", "right"])
      expect(benchAssignment(3, 1)).toEqual(["right", "bottom", "left"])
      expect(benchAssignment(3, 2)).toEqual(["left", "right", "bottom"])
    })

    it("4 players: opponents sweep left → top → right from the seat after the viewer", () => {
      expect(benchAssignment(4, 0)).toEqual(["bottom", "left", "top", "right"])
      expect(benchAssignment(4, 1)).toEqual(["right", "bottom", "left", "top"])
      expect(benchAssignment(4, 2)).toEqual(["top", "right", "bottom", "left"])
      expect(benchAssignment(4, 3)).toEqual(["left", "top", "right", "bottom"])
    })

    it("every seat gets exactly one bench, with no duplicates, for every supported count", () => {
      for (let count = 2; count <= 4; count++) {
        for (let viewer = 0; viewer < count; viewer++) {
          const benches = benchAssignment(count, viewer)
          expect(benches).toHaveLength(count)
          expect(new Set(benches).size).toBe(count)
        }
      }
    })

    it("a solo lobby (count 1) seats only the viewer, no opponent bench", () => {
      expect(benchAssignment(1, 0)).toEqual(["bottom"])
    })

    it("degrades honestly for an out-of-range count instead of inventing a 5th placement", () => {
      expect(() => benchAssignment(5, 0)).toThrow(/2–4/)
    })
  })
})
