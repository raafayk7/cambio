/**
 * Seat-arc redistribution (table-surface.md, root plan F4.1): radial
 * positions derive from seat order (array index = seat order on the
 * wire), rotated so the viewer sits bottom-center. The four benches are
 * scenery — seats space evenly for any count 2–5; the visual metaphor
 * never constrains the player count.
 *
 * Pure geometry so it is unit-testable (jsdom measures no layout —
 * ADR-0030): percentages position seat centers inside a square table
 * container; rendering just applies them.
 */
export interface SeatPosition {
  seatIndex: number
  /** Screen-space degrees, normalized [0, 360): 90 = bottom-center. */
  angleDeg: number
  xPct: number
  yPct: number
}

/** Radius of the seat ring, in percent of the container's half-size. */
const RING_RADIUS_PCT = 42

export function seatArc(seatCount: number, viewerSeatIndex: number): ReadonlyArray<SeatPosition> {
  return Array.from({ length: seatCount }, (_, seatIndex) => {
    const step = 360 / seatCount
    const offset = (seatIndex - viewerSeatIndex + seatCount) % seatCount
    const angleDeg = (90 + offset * step) % 360
    const radians = (angleDeg * Math.PI) / 180
    return {
      seatIndex,
      angleDeg,
      xPct: 50 + RING_RADIUS_PCT * Math.cos(radians),
      yPct: 50 + RING_RADIUS_PCT * Math.sin(radians),
    }
  })
}
