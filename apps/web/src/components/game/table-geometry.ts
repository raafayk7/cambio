/**
 * Table geometry — the bench doctrine (ADR-0036; table-surface.md v5).
 * Every placement on the table (seats, hands, and — via the
 * `flight/anchors.ts` registry built on top of this module — flight
 * endpoints) derives from the same painted-art anatomy instead of each
 * guessing its own container percent.
 *
 * This module used to be a count-agnostic polar engine (`ringPositions`,
 * `seatArc`, `handArc`, `inwardSide`) that spaced seats evenly around the
 * table for any count 2–5. ADR-0036 replaced that doctrine: the game caps
 * at 2–4 players and seats anchor to the table's four painted benches —
 * viewer always bottom, opponents assigned to top/left/right in seat-arc
 * sweep order. Benches are a fixed assignment (this module), placed on
 * screen by a small static class map (`table-surface.tsx`, decision 2) —
 * no angle math, no per-seat-count radius. `handArc`/`HAND_RING_RADIUS_PCT`
 * had no production consumer even before this task and retire with the
 * rest of the polar engine.
 *
 * Pure geometry so it stays unit-testable (jsdom measures no layout —
 * ADR-0030): this module states relationships and assignments; rendering
 * (table-surface.tsx) applies them.
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
 * the anchor for every bench offset below. */
export const ART_HALF_PCT = TABLE_ART_WIDTH_FRACTION * 50

/** Bench anchors sit just outside the painted table's edge — a small named
 * gap, not flush against it, so the bench art still reads underneath them. */
export const SEAT_RING_GAP_PCT = 4

/** How far a bench anchor sits outside the painted table's edge, as a
 * percent of the (square) container's width/height — the art's half-width
 * plus the named gap above. Spec-carried from the pre-ADR-0036 seat ring's
 * radius: benches are now fixed compass points instead of seat-count-
 * dependent angles, so this single number places all four (top/bottom at
 * `50 ∓ BENCH_INSET_PCT`, left/right the same on the other axis). */
export const BENCH_INSET_PCT = ART_HALF_PCT + SEAT_RING_GAP_PCT

/** The four painted benches a seat can anchor to. Doubles as the
 * hand-growth direction vocabulary (a hand grows INWARD from its own
 * bench, toward the table center — table-surface.tsx / game-screen.tsx). */
export type Bench = "bottom" | "top" | "left" | "right"

/**
 * Opponent benches, in seat-arc sweep order (left → top → right), keyed by
 * seat count. Index 0 is the seat immediately after the viewer; the
 * viewer's own seat is always "bottom" and isn't listed here. Root plan
 * clause 5 / decision 1. 0 and 1 have no opponents (an empty lobby of one,
 * or a solo pre-game view) — an entry exists so `benchAssignment` never
 * needs to special-case them.
 */
const OPPONENT_BENCH_ORDER: Readonly<Record<number, ReadonlyArray<Bench>>> = {
  0: [],
  1: [],
  2: ["top"],
  3: ["left", "right"],
  4: ["left", "top", "right"],
}

/**
 * Assigns every seat a bench: the viewer's own seat is always "bottom";
 * opponents take the next bench in `OPPONENT_BENCH_ORDER` starting from the
 * seat immediately after the viewer (seat-arc order), wrapping around the
 * table. Replaces the polar `ringPositions` engine (ADR-0036) — benches are
 * a fixed assignment, not an angle computed from seat count.
 *
 * Seat counts outside the documented doctrine (anything but 0–4) throw
 * rather than guess: the domain caps games at 2–4 (ADR-0036), so this is
 * unreachable in production once that cap lands, and a real need to seat
 * more players is a rules question (stop-and-ask, HANDOFF directive 1),
 * never a silent 5th placement.
 */
export function benchAssignment(seatCount: number, viewerSeatIndex: number): ReadonlyArray<Bench> {
  const order = OPPONENT_BENCH_ORDER[seatCount]
  if (order === undefined) {
    throw new Error(
      `benchAssignment: no bench doctrine for ${seatCount} players — the domain caps games ` +
        "at 2–4 (ADR-0036); seating more is a rules question, not a layout guess.",
    )
  }
  const benches = new Array<Bench>(seatCount)
  if (seatCount > 0) benches[viewerSeatIndex] = "bottom"
  for (let step = 0; step < order.length; step++) {
    const seatIndex = (viewerSeatIndex + step + 1) % seatCount
    benches[seatIndex] = order[step]!
  }
  return benches
}
