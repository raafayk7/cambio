import { cn } from "@cambio/ui"
import type * as React from "react"

import tableArt from "../../assets/table-top.webp"
import { inwardSide, seatArc, TABLE_DISC_FRACTION } from "./table-geometry.js"

/**
 * TableSurface — design-system/components/core/table-surface.md (r2).
 * Class: Game object.
 *
 * The top-down khoka table: the moodboard's own painted asset (a
 * regeneration of docs/design/moodboard/lums-illustrated/image7.jpg —
 * weathered planked tabletop, umbrella hole, four CURVED benches
 * hugging the table, cast shadows baked into the alpha; CAM-17 art
 * revision). The art is static SCENERY — always four benches, never a
 * constraint; the center content, the game-over scrim, and the 2–5
 * seats stay programmatic on top, seats placed radially by seat order
 * via seatArc with the viewer rotated to bottom-center (F4.1). Below
 * the `regular` breakpoint the radial arrangement compresses: opponents
 * arc along the top, the viewer's seat docks at the bottom (F4.2).
 * Ground, not HUD — it displays no derived game facts.
 *
 * TABLE_DISC_PCT is the tabletop disc's measured share of the asset's
 * width, read from `table-geometry.ts` (the one radius source, G1) —
 * spec-carried geometry, measured from the alpha channel: the center
 * overlay and scrim size to the disc, not the asset.
 */
const TABLE_DISC_PCT = `${TABLE_DISC_FRACTION * 100}%`
export interface TableSurfaceProps {
  /** Seat nodes ordered by seat index (wire order). */
  seats: ReadonlyArray<React.ReactNode>
  viewerSeatIndex: number
  /** Table center: draw-deck + discard-pile (+ slam-timer when open). */
  center?: React.ReactNode
  state?: "seating" | "in-game" | "game-over"
  /**
   * How a seat node hangs on its ring point (table-surface.md r3).
   * `center` (default, the room screen's pre-game view): the node is
   * centered on the point — right for a lone seat pill. `edge` (the game
   * screen): the node's outboard edge sits at the point and the node grows
   * INWARD toward the table center — required once hands hang off seats,
   * because a centered seat+hand group escapes the container into the
   * chrome above it (CAM-18 gate finding: the group's overshoot occluded
   * the turn indicator and the Call Cambio control).
   */
  seatAnchor?: "center" | "edge"
  /**
   * Whether the viewer's own seat renders inside this component (CAM-21).
   * `"internal"` (default) is the room screen's pre-game view — every seat,
   * own included, renders here. `"external"` is the game screen's docked
   * composition: the viewer's own hand lives in the screen's bottom dock,
   * so this component skips it (while still deriving every position from
   * the full `seats.length`) and the screen renders it itself, reusing the
   * same geometry.
   */
  viewerSeat?: "internal" | "external"
  className?: string
}

/** Edge-anchor translate per the side of the point that faces the table
 * center: the group's outboard edge stays at the ring point, growth goes
 * inward — for every seat EXCEPT the viewer's own. The bottom (viewer)
 * seat keeps the centered anchor: its dock hangs below the table with the
 * hand over the near bench (the hands-over-benches read the gate judged a
 * controlled break), because a full own-size hand grown inward would lie
 * across the tabletop and occlude the deck and discard. */
const EDGE_ANCHOR_CLASS: Record<ReturnType<typeof inwardSide>, string> = {
  bottom: "regular:-translate-x-1/2",
  top: "regular:-translate-x-1/2 regular:-translate-y-1/2",
  right: "regular:-translate-y-1/2",
  left: "regular:-translate-x-full regular:-translate-y-1/2",
}

export function TableSurface({
  seats,
  viewerSeatIndex,
  center,
  state = "in-game",
  seatAnchor = "center",
  viewerSeat = "internal",
  className,
}: TableSurfaceProps) {
  const positions = seatArc(seats.length, viewerSeatIndex)
  // Compact flow order: opponents (arc order after the viewer) → table →
  // own seat. At regular+ everything is absolutely positioned instead.
  const opponentOrder = Array.from(
    { length: Math.max(0, seats.length - 1) },
    (_, step) => (viewerSeatIndex + step + 1) % seats.length,
  )

  const seatWrapper = (seatIndex: number) => {
    const position = positions[seatIndex]
    return (
      <div
        key={seatIndex}
        data-seat-index={seatIndex}
        // Hazard 1 (CAM-18 root plan): opponent wrappers sit earlier in DOM
        // order than the art container below, which is ALSO
        // `regular:absolute` — with both at the implicit z-index:auto,
        // paint order falls back to DOM order and the art (later) occludes
        // them. An explicit z-index wins over `auto` regardless of DOM
        // order, so it applies uniformly to opponent AND own wrappers
        // (own already happened to paint on top by DOM order alone).
        className={cn(
          "regular:absolute regular:z-10",
          seatAnchor === "edge" && position !== undefined
            ? EDGE_ANCHOR_CLASS[inwardSide(position)]
            : "regular:-translate-x-1/2 regular:-translate-y-1/2",
        )}
        style={{ left: `${position?.xPct ?? 50}%`, top: `${position?.yPct ?? 50}%` }}
      >
        {seats[seatIndex]}
      </div>
    )
  }

  return (
    <div
      data-state={state}
      className={cn(
        // Unconditionally relative (CAM-21, was `regular:relative`): the
        // compact docked composition needs this as a positioned ancestor
        // too, so the game-over full-region rest below scopes to the
        // surface at every breakpoint instead of escaping to whatever
        // positioned ancestor is next up the tree.
        // `gap-2` (compact-only in effect: regular absolutely-positions
        // every child, so flow gap never applies there) — tightened at
        // the M5 rendered pass alongside the art cap and card scale
        // (root plan Surprises: the fold budget was short at 160/64/gap-4).
        "relative flex w-full flex-col items-center gap-2",
        "regular:mx-auto regular:block regular:aspect-square regular:max-w-2xl",
        className,
      )}
    >
      <div className="flex flex-wrap justify-center gap-2 regular:contents">
        {opponentOrder.map(seatWrapper)}
      </div>

      {/* The painted table + benches (shadows baked into the asset);
          center content and scrim overlay the tabletop disc only. */}
      <div
        // CAM-21: compact caps the art at a token max-width (the asset is
        // square, so this is also the height cap — root plan fold budget);
        // regular cancels the cap and keeps today's w-3/4-of-aspect-square
        // sizing untouched (clause 10).
        className="relative w-3/4 max-w-(--size-table-art-compact) regular:max-w-none regular:absolute regular:top-1/2 regular:left-1/2 regular:-translate-x-1/2 regular:-translate-y-1/2"
      >
        <img src={tableArt} alt="" aria-hidden className="block h-auto w-full" />
        <div
          className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
          // TABLE_DISC_PCT is spec-carried geometry from table-geometry.ts
          // (measured from the asset's alpha channel), not an arbitrary
          // value — a genuinely dynamic-looking style, documented per the
          // CAM-17 inline-style advisory.
          style={{ width: TABLE_DISC_PCT, aspectRatio: "1" }}
        >
          {center}
        </div>
        {state === "game-over" ? (
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--green-deep)/55"
            // Same spec-carried disc size as the center overlay above —
            // the scrim covers exactly the tabletop, not the whole asset.
            style={{ width: TABLE_DISC_PCT, aspectRatio: "1" }}
          />
        ) : null}
      </div>

      {seats.length > 0 && viewerSeat === "internal" ? seatWrapper(viewerSeatIndex) : null}

      {state === "game-over" ? (
        // The full-region rest (table-surface.md r3): the disc scrim above
        // dims only the tabletop, which the score sheet then covers almost
        // entirely — so the whole surface (art, hands, seats, all z-10)
        // takes the green-deep rest too. z-20 sits above the seat layer
        // and below the screen-level score overlay (z-30).
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 bg-(--green-deep)/35"
        />
      ) : null}
    </div>
  )
}
