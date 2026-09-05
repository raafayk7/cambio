import { describe, expect, it } from "vitest"

import {
  ART_HALF_PCT,
  HAND_RING_RADIUS_PCT,
  handArc,
  SEAT_RING_RADIUS_PCT,
  seatArc,
} from "../src/components/game/table-geometry.js"

/**
 * table-surface.md + root plan G1, migrated from seat-arc.test.ts: one
 * radius source, derived from the painted art's own edge rather than a
 * bare container percent invented in isolation. Numeric pins are stated
 * against the derived constants, not restated magic numbers — the final
 * visual radius is tuned against the rendered table later (ADR-0030); this
 * suite pins the RELATIONSHIPS the derivation must hold.
 */
describe("table-geometry", () => {
  it("derives the hand ring strictly inside the art's edge, strictly inside the seat ring", () => {
    // hands overlap the tabletop rim toward center; seats sit just outside
    // the painted table — both are offsets from the same art-half radius.
    expect(HAND_RING_RADIUS_PCT).toBeLessThan(ART_HALF_PCT)
    expect(ART_HALF_PCT).toBeLessThan(SEAT_RING_RADIUS_PCT)
  })

  it("seatArc returns one position per seat, ordered by seat index, for 2–5 players", () => {
    for (let count = 2; count <= 5; count++) {
      const positions = seatArc(count, 0)
      expect(positions).toHaveLength(count)
      expect(positions.map((position) => position.seatIndex)).toEqual(
        Array.from({ length: count }, (_, index) => index),
      )
    }
  })

  it("handArc returns one position per seat, ordered by seat index, for 2–5 players", () => {
    for (let count = 2; count <= 5; count++) {
      const positions = handArc(count, 0)
      expect(positions).toHaveLength(count)
      expect(positions.map((position) => position.seatIndex)).toEqual(
        Array.from({ length: count }, (_, index) => index),
      )
    }
  })

  it("puts the viewer's seat and hand bottom-center regardless of seat index", () => {
    for (let count = 2; count <= 5; count++) {
      for (let viewer = 0; viewer < count; viewer++) {
        const ownSeat = seatArc(count, viewer)[viewer]
        const ownHand = handArc(count, viewer)[viewer]
        expect(ownSeat?.xPct).toBeCloseTo(50)
        expect(ownSeat?.yPct).toBeCloseTo(50 + SEAT_RING_RADIUS_PCT)
        expect(ownHand?.xPct).toBeCloseTo(50)
        expect(ownHand?.yPct).toBeCloseTo(50 + HAND_RING_RADIUS_PCT)
      }
    }
  })

  it("hand positions share the seat's angle at every step — same source, smaller radius", () => {
    for (let count = 2; count <= 5; count++) {
      for (let viewer = 0; viewer < count; viewer++) {
        const seats = seatArc(count, viewer)
        const hands = handArc(count, viewer)
        for (let seatIndex = 0; seatIndex < count; seatIndex++) {
          expect(hands[seatIndex]?.angleDeg).toBeCloseTo(seats[seatIndex]?.angleDeg ?? NaN)
        }
      }
    }
  })

  it("spaces seats evenly: heads-up puts the opponent top-center", () => {
    const positions = seatArc(2, 0)
    expect(positions[1]?.xPct).toBeCloseTo(50)
    expect(positions[1]?.yPct).toBeCloseTo(50 - SEAT_RING_RADIUS_PCT)
  })

  it("four players sit at the compass points, rotated for the viewer", () => {
    const positions = seatArc(4, 2)
    // Seat 2 is the viewer → bottom; 3 → left; 0 → top; 1 → right.
    expect(positions[2]?.xPct).toBeCloseTo(50)
    expect(positions[2]?.yPct).toBeCloseTo(50 + SEAT_RING_RADIUS_PCT)
    expect(positions[3]?.xPct).toBeCloseTo(50 - SEAT_RING_RADIUS_PCT)
    expect(positions[3]?.yPct).toBeCloseTo(50)
    expect(positions[0]?.xPct).toBeCloseTo(50)
    expect(positions[0]?.yPct).toBeCloseTo(50 - SEAT_RING_RADIUS_PCT)
    expect(positions[1]?.xPct).toBeCloseTo(50 + SEAT_RING_RADIUS_PCT)
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
