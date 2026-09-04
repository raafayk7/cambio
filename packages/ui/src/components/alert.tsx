import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "../lib/utils.js"

/**
 * Alert — design-system/components/core/alert.md (r1).
 * Class: Async/data (support).
 *
 * Inline persistent notice: alerts persist while true; toasts announce
 * moments — pick by duration of truth, not severity. `reconnecting` is
 * the required page-state banner: play stays visibly live behind it (the
 * game does not pause). Info surfaces use the warm role's tan half —
 * terracotta fails small-text contrast (tokens.md §Contrast; recorded in
 * the plan). Only informational alerts are dismissible — an active error
 * stays until resolved.
 */
const alertVariants = cva(
  "flex w-full items-center gap-2 rounded-sm border-2 border-ink-primary px-3 py-2 font-ui text-base font-medium",
  {
    variants: {
      variant: {
        info: "bg-(--tan-paving) text-ink-primary",
        alarm: "bg-accent-alarm-deep text-ink-inverse",
        success: "bg-accent-action text-ink-inverse",
        reconnecting: "bg-(--tan-paving) text-ink-primary",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  },
)

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {
  /** Optional trailing action (ghost button). */
  action?: React.ReactNode
  /** Renders a dismiss ✕ — informational alerts only. */
  onDismiss?: () => void
}

export function Alert({ className, variant, action, onDismiss, children, ...props }: AlertProps) {
  return (
    <div
      role={variant === "alarm" ? "alert" : "status"}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {variant === "alarm" ? (
        <span aria-hidden className="font-semibold">
          !
        </span>
      ) : variant === "success" ? (
        <span aria-hidden className="font-semibold">
          ✓
        </span>
      ) : variant === "reconnecting" ? (
        <span
          aria-hidden
          className="block h-4 w-3 rounded-sm border-interactive card-back-mark animate-card-wobble motion-reduce:animate-pulse-soft"
        />
      ) : null}
      <span className="flex-1">{children}</span>
      {action}
      {onDismiss !== undefined ? (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="cursor-pointer font-semibold transition duration-snap ease-snap focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent-focus focus-visible:outline-solid"
        >
          ✕
        </button>
      ) : null}
    </div>
  )
}
