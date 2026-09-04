import type { Timestamp } from "@cambio/contracts"
import { cn } from "@cambio/ui"
import * as React from "react"

/**
 * SlamTimer — design-system/components/core/slam-timer.md (r1).
 * Class: Game object.
 *
 * The slam window made visible: "SLAM!" (one of the two shout moments,
 * voice.md) over a bar draining LINEARLY toward a fixed close — closesAt
 * never resets on slam attempts (ADR-0011): no refills, no extensions.
 * Duration is game config (slamWindowMs), never a design constant.
 * Hidden when no window exists — including the empty-pile case
 * (ADR-0012), where the server never opens one. `resolving` pauses the
 * bar visually while a slam's public reveal plays; resuming lands on the
 * true remaining time.
 */
export interface SlamTimerProps {
  window?: { closesAt: Timestamp; durationMs: number }
  resolving?: boolean
  className?: string
}

export function SlamTimer({ window: slamWindow, resolving = false, className }: SlamTimerProps) {
  const [remaining, setRemaining] = React.useState<number>(() =>
    slamWindow === undefined
      ? 0
      : Math.max(0, Math.min(slamWindow.durationMs, slamWindow.closesAt - Date.now())),
  )

  React.useEffect(() => {
    if (slamWindow === undefined || resolving) return
    const update = () =>
      setRemaining(Math.max(0, Math.min(slamWindow.durationMs, slamWindow.closesAt - Date.now())))
    update()
    const handle = window.setInterval(update, 50)
    return () => window.clearInterval(handle)
  }, [slamWindow?.closesAt, slamWindow?.durationMs, resolving])

  if (slamWindow === undefined) return null

  const closed = remaining <= 0
  const pct = (remaining / slamWindow.durationMs) * 100

  return (
    <div
      data-state={closed ? "closed" : resolving ? "resolving" : "open"}
      className={cn(
        "flex w-fit flex-col items-center gap-2 transition duration-snap ease-snap",
        closed && "scale-96 opacity-0",
        className,
      )}
    >
      <span className="rounded-sm border-frame bg-accent-alarm px-3 py-1 font-display text-2xl text-ink-inverse text-shadow-poster">
        SLAM!
      </span>
      <div
        role="progressbar"
        aria-label="Slam window"
        aria-valuemin={0}
        aria-valuemax={slamWindow.durationMs}
        aria-valuenow={Math.round(remaining)}
        className="h-2 w-full min-w-32 overflow-hidden rounded-sm border-interactive bg-surface-raised"
      >
        <div className="h-full bg-accent-alarm" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
