import { cn } from "@cambio/ui"
import type * as React from "react"

import { seatArc } from "./seat-arc.js"

/**
 * TableSurface — design-system/components/core/table-surface.md (r1).
 * Class: Game object.
 *
 * The top-down khoka table: round green tabletop with a green-deep rim
 * on the checkered paving (the shell's scene ground), four benches as
 * SCENERY — always four, never a constraint; 2–5 seats place radially by
 * seat order via seatArc, the viewer rotated to bottom-center (F4.1).
 * Below the `regular` breakpoint the radial arrangement compresses:
 * opponents arc along the top, the viewer's seat docks at the bottom
 * (F4.2). Ground, not HUD — it displays no derived game facts.
 */
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
      {/* Benches: scenery, always four, regular+ only. */}
      <div aria-hidden className="hidden regular:block">
        <span className="absolute top-1/6 left-1/2 h-2 w-1/3 -translate-x-1/2 rounded-full bg-(--green-deep)" />
        <span className="absolute bottom-1/6 left-1/2 h-2 w-1/3 -translate-x-1/2 rounded-full bg-(--green-deep)" />
        <span className="absolute top-1/2 left-1/6 h-1/3 w-2 -translate-y-1/2 rounded-full bg-(--green-deep)" />
        <span className="absolute top-1/2 right-1/6 h-1/3 w-2 -translate-y-1/2 rounded-full bg-(--green-deep)" />
      </div>

      <div className="flex flex-wrap justify-center gap-2 regular:contents">
        {opponentOrder.map(seatWrapper)}
      </div>

      {/* The tabletop: rim via padded green-deep ring, float shadow. */}
      <div className="relative w-2/3 rounded-full bg-(--green-deep) p-2 shadow-float regular:absolute regular:top-1/2 regular:left-1/2 regular:w-1/2 regular:-translate-x-1/2 regular:-translate-y-1/2">
        <div className="flex aspect-square items-center justify-center rounded-full bg-surface-table">
          {center}
        </div>
        {state === "game-over" ? (
          <div className="absolute inset-0 rounded-full bg-(--green-deep)/55" />
        ) : null}
      </div>

      {seats.length > 0 ? seatWrapper(viewerSeatIndex) : null}
    </div>
  )
}
