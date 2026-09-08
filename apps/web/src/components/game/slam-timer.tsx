import type { Timestamp } from "@cambio/contracts"
import { cn } from "@cambio/ui"
import * as React from "react"

/**
 * SlamTimer — design-system/components/core/slam-timer.md (r3).
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
  /**
   * CAM-26 C1: fired exactly once per window when local time passes
   * `closesAt` plus `SLAM_EXPIRY_SKEW_GRACE_MS` — a stale window is one of
   * four ADR-0037 recovery layers, none load-bearing alone. Behavior only,
   * not a visual state (no slam-timer.md revision — see the frontend
   * child plan's Decisions).
   */
  onExpire?: () => void
  className?: string
}

/**
 * ADR-0037 layer 4: no server-clock offset exists anywhere in `apps/web` or
 * `contracts`, so this compares `closesAt` to raw `Date.now()`. The grace
 * absorbs small clock skew; a client whose clock runs slow simply never
 * fires — the server's own timer, a poke from any other client's refetch,
 * and the close broadcast all cover that side.
 */
const SLAM_EXPIRY_SKEW_GRACE_MS = 500

export function SlamTimer({
  window: slamWindow,
  resolving = false,
  onExpire,
  className,
}: SlamTimerProps) {
  const [remaining, setRemaining] = React.useState<number>(() =>
    slamWindow === undefined
      ? 0
      : Math.max(0, Math.min(slamWindow.durationMs, slamWindow.closesAt - Date.now())),
  )

  // Read via a ref (component re-renders every 50ms) so the effect below
  // never re-subscribes on a new callback identity — same pattern as
  // `use-game.ts`'s `handleRoomEventRef`.
  const onExpireRef = React.useRef(onExpire)
  onExpireRef.current = onExpire

  // Fire-once guard, keyed on the window's own `closesAt`: a genuinely new
  // window (different `closesAt`) compares unequal and re-arms on its own,
  // with no separate "have I fired" boolean to reset.
  const firedForRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (slamWindow === undefined || resolving) return
    const update = () => {
      setRemaining(Math.max(0, Math.min(slamWindow.durationMs, slamWindow.closesAt - Date.now())))
      if (
        firedForRef.current !== slamWindow.closesAt &&
        slamWindow.closesAt + SLAM_EXPIRY_SKEW_GRACE_MS <= Date.now()
      ) {
        firedForRef.current = slamWindow.closesAt
        onExpireRef.current?.()
      }
    }
    update()
    const handle = window.setInterval(update, 50)
    return () => window.clearInterval(handle)
  }, [slamWindow?.closesAt, slamWindow?.durationMs, resolving])

  if (slamWindow === undefined) return null

  const closed = remaining <= 0
  // Guard the zero-duration edge: NaN% is dropped by CSS and the fill
  // would default to full width (probe-backed, review finding R9c).
  const pct = slamWindow.durationMs > 0 ? (remaining / slamWindow.durationMs) * 100 : 0

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
        className="h-2 w-full overflow-hidden rounded-sm border-interactive bg-surface-raised"
      >
        <div className="h-full bg-accent-alarm" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
