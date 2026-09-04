import { cn } from "@cambio/ui"
import type * as React from "react"

/**
 * TurnIndicator — design-system/components/core/turn-indicator.md (r1).
 * Class: Game object.
 *
 * Whose turn, what phase — the single textual source of phase truth
 * (seats echo it with the active-turn ring). Copy is supplied by the
 * caller in player language and canonical terminology (voice.md):
 * public events only, never card values, never engine internals. One
 * indicator per screen; it docks to a fixed position and never floats
 * over cards. `slam-window` pairs with the slam-timer, never replaces
 * it.
 */
export interface TurnIndicatorProps {
  state: "your-turn" | "other-turn" | "slam-window" | "game-over"
  children: React.ReactNode
  className?: string
}

export function TurnIndicator({ state, children, className }: TurnIndicatorProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-state={state}
      className={cn(
        "inline-flex items-center gap-2 rounded-sm border-frame bg-surface-raised px-3 py-2 shadow-raised",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full",
          state === "slam-window"
            ? "bg-accent-alarm"
            : state === "other-turn"
              ? "bg-ink-muted"
              : "bg-accent-focus",
        )}
      />
      <span
        className={cn(
          "font-ui text-base font-semibold",
          state === "other-turn" ? "text-ink-muted" : "text-ink-primary",
        )}
      >
        {children}
      </span>
    </div>
  )
}
