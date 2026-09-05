/**
 * Table geometry — the ONE radius source (table-surface.md r2, root plan
 * G1). Every placement on the table (seats, hands, and — via the
 * `flight/anchors.ts` registry built on top of this module — future flight
 * endpoints) derives from the same painted-art anatomy instead of each
 * guessing its own container percent.
 *
 * The prior module (`seat-arc.ts`, now folded in here) carried a
 * self-contradicting comment: "radius of the seat ring, in percent of the
 * container's half-size" next to `RING_RADIUS_PCT = 42`. 42 was never a
 * percent of the half-size — it was 42% of the container's full WIDTH
 * (equivalently 84% of the half-width), a plain reading error that nobody
 * caught because nothing else in the file cross-checked it against the
 * painted asset. `table-surface.tsx` renders that asset at `w-3/4` of the
 * square container, so the painted table's own half-width is a known,
 * derivable quantity — 37.5% of the container's width — and every ring
 * below is stated relative to THAT edge, not to a bare container percent
 * invented in isolation.
 *
 * Pure geometry so it stays unit-testable (jsdom measures no layout —
 * ADR-0030): percentages position points inside a square container;
 * rendering just applies them.
 */

/** The painted table art's width, as a fraction of the square container
 * (table-surface.tsx: `w-3/4`). Spec-carried alongside `TABLE_DISC_FRACTION`
 * below — both describe the same asset, measured at CAM-17's art revision. */
export const TABLE_ART_WIDTH_FRACTION = 3 / 4

/** The tabletop disc's width as a fraction of the ART's width (not the
 * container's) — measured from the asset's alpha channel (table-surface.md
 * r2). Center content and the game-over scrim size to the disc. */
export const TABLE_DISC_FRACTION = 0.54

/** Half the art's width, as a percent of the (square) container's width —
 * the one honest number the old comment got wrong. Every ring below is
 * stated as an offset from this edge. */
export const ART_HALF_PCT = TABLE_ART_WIDTH_FRACTION * 50

/** Seats sit just outside the painted table's edge — a small named gap,
 * not flush against it, so the bench art still reads underneath them. */
export const SEAT_RING_GAP_PCT = 4

/** The seat ring's radius: the art's edge plus the gap above. Seats
 * previously sat at a flat 42% invented independently of the art; now they
 * are pinned to it by construction. */
export const SEAT_RING_RADIUS_PCT = ART_HALF_PCT + SEAT_RING_GAP_PCT

/** Hands sit inside the art's edge, overlapping the tabletop rim toward
 * the center — a named inset, so a hand never reads as sitting on the
 * bench rather than at the table. */
export const HAND_RING_INSET_PCT = 12

/** The hand ring's radius: strictly inside the art's edge, strictly inside
 * the seat ring — hands live between the seat and the table's center. */
export const HAND_RING_RADIUS_PCT = ART_HALF_PCT - HAND_RING_INSET_PCT

/** A point on one of the table's radial rings. */
export interface RadialPosition {
  seatIndex: number
  /** Screen-space degrees, normalized [0, 360): 90 = bottom-center. */
  angleDeg: number
  xPct: number
  yPct: number
}

/** Kept as the seat-arc-era name — every prior call site (table-surface.tsx,
 * its tests) reads `SeatPosition`. */
export type SeatPosition = RadialPosition
export type HandPosition = RadialPosition

/**
 * Radial positions derive from seat order (array index = seat order on the
 * wire), rotated so the viewer sits bottom-center. The four benches are
 * scenery — seats space evenly for any count 2–5; the visual metaphor
 * never constrains the player count (table-surface.md, root plan F4.1).
 */
function ringPositions(
  seatCount: number,
  viewerSeatIndex: number,
  radiusPct: number,
): ReadonlyArray<RadialPosition> {
  const step = 360 / seatCount
  return Array.from({ length: seatCount }, (_, seatIndex) => {
    const offset = (seatIndex - viewerSeatIndex + seatCount) % seatCount
    const angleDeg = (90 + offset * step) % 360
    const radians = (angleDeg * Math.PI) / 180
    return {
      seatIndex,
      angleDeg,
      xPct: 50 + radiusPct * Math.cos(radians),
      yPct: 50 + radiusPct * Math.sin(radians),
    }
  })
}

/** The side of a ring point that faces the table center — the direction a
 * seat's content (its hand, its growth) should extend. Derived from the
 * dominant axis of the vector toward (50, 50), so it is exact for the
 * compass seats and stable for the diagonal ones. */
export type InwardSide = "top" | "bottom" | "left" | "right"

export function inwardSide(position: RadialPosition): InwardSide {
  const dx = 50 - position.xPct
  const dy = 50 - position.yPct
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? "top" : "bottom"
  return dx < 0 ? "left" : "right"
}

/** Seat centers, on the seat ring (just outside the painted table). */
export function seatArc(seatCount: number, viewerSeatIndex: number): ReadonlyArray<SeatPosition> {
  return ringPositions(seatCount, viewerSeatIndex, SEAT_RING_RADIUS_PCT)
}

/** Hand centers, on the hand ring (between each seat and the table
 * center) — same angles as `seatArc` for the same inputs, one shared
 * source, so a hand always lines up with its own seat. */
export function handArc(seatCount: number, viewerSeatIndex: number): ReadonlyArray<HandPosition> {
  return ringPositions(seatCount, viewerSeatIndex, HAND_RING_RADIUS_PCT)
}
