import { describe, expect, it } from "vitest"

import { seatArc } from "../src/components/game/seat-arc.js"

/**
 * table-surface.md + root plan F4.1 — seat-arc redistribution, test-first:
 * radial positions derive from seat order, rotated so the viewer sits
 * bottom-center; benches are scenery and never constrain 2–5 players.
 */
describe("seatArc", () => {
  it("returns one position per seat, ordered by seat index, for 2–5 players", () => {
    for (let count = 2; count <= 5; count++) {
      const positions = seatArc(count, 0)
      expect(positions).toHaveLength(count)
      expect(positions.map((position) => position.seatIndex)).toEqual(
        Array.from({ length: count }, (_, index) => index),
      )
    }
  })

  it("puts the viewer bottom-center regardless of their seat index", () => {
    for (let count = 2; count <= 5; count++) {
      for (let viewer = 0; viewer < count; viewer++) {
        const positions = seatArc(count, viewer)
        const own = positions[viewer]
        expect(own?.xPct).toBeCloseTo(50)
        expect(own?.yPct).toBeCloseTo(92)
      }
    }
  })

  it("spaces seats evenly: heads-up puts the opponent top-center", () => {
    const positions = seatArc(2, 0)
    expect(positions[1]?.xPct).toBeCloseTo(50)
    expect(positions[1]?.yPct).toBeCloseTo(8)
  })

  it("four players sit at the compass points, rotated for the viewer", () => {
    const positions = seatArc(4, 2)
    // Seat 2 is the viewer → bottom; 3 → left; 0 → top; 1 → right.
    expect(positions[2]?.xPct).toBeCloseTo(50)
    expect(positions[2]?.yPct).toBeCloseTo(92)
    expect(positions[3]?.xPct).toBeCloseTo(8)
    expect(positions[3]?.yPct).toBeCloseTo(50)
    expect(positions[0]?.xPct).toBeCloseTo(50)
    expect(positions[0]?.yPct).toBeCloseTo(8)
    expect(positions[1]?.xPct).toBeCloseTo(92)
    expect(positions[1]?.yPct).toBeCloseTo(50)
  })

  it("five players spread at 72° steps with no collisions", () => {
    const positions = seatArc(5, 0)
    const distinct = new Set(
      positions.map((position) => `${position.xPct.toFixed(1)},${position.yPct.toFixed(1)}`),
    )
    expect(distinct.size).toBe(5)
    for (let index = 0; index < 5; index++) {
      const gap = (positions[(index + 1) % 5]!.angleDeg - positions[index]!.angleDeg + 360) % 360
      expect(gap).toBeCloseTo(72)
    }
  })
})
