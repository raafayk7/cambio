import { cn } from "@cambio/ui"
import type * as React from "react"

import tableArt from "../../assets/table-top.webp"
import { seatArc, TABLE_DISC_FRACTION } from "./table-geometry.js"

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
  className?: string
}

export function TableSurface({
  seats,
  viewerSeatIndex,
  center,
  state = "in-game",
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
        className="regular:absolute regular:-translate-x-1/2 regular:-translate-y-1/2"
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
        "flex w-full flex-col items-center gap-4",
        "regular:relative regular:mx-auto regular:block regular:aspect-square regular:max-w-2xl",
        className,
      )}
    >
      <div className="flex flex-wrap justify-center gap-2 regular:contents">
        {opponentOrder.map(seatWrapper)}
      </div>

      {/* The painted table + benches (shadows baked into the asset);
          center content and scrim overlay the tabletop disc only. */}
      <div className="relative w-3/4 regular:absolute regular:top-1/2 regular:left-1/2 regular:-translate-x-1/2 regular:-translate-y-1/2">
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

      {seats.length > 0 ? seatWrapper(viewerSeatIndex) : null}
    </div>
  )
}
