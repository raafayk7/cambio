import type * as React from "react"

import { cn } from "../lib/utils.js"

/**
 * EmptyState — design-system/components/core/empty-state.md (r1).
 * Class: Async/data (support).
 *
 * Nothing here — designed, not blank. The two states are distinct BY
 * CONTRACT (page floor) and may never merge: `first-use` (no data has
 * ever existed — onboarding energy + a primary action) vs `no-results`
 * (a filter matched nothing — "no matches" + how to clear, never the
 * first-use CTA). Copy register per surface (voice.md): lobby gets
 * flavor lowercase, functional surfaces sentence case.
 */
export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  state: "first-use" | "no-results"
  /** Small flat illustration slot; defaults to the suit marks. No mascots. */
  illustration?: React.ReactNode
  /** The one action: primary for first-use, a clear/reset for no-results. */
  action?: React.ReactNode
}

function SuitMarks() {
  return (
    <div aria-hidden className="flex gap-2 text-lg leading-none">
      <span className="text-ink-primary">♠</span>
      <span className="text-accent-suit-red">♥</span>
      <span className="text-accent-suit-red">♦</span>
      <span className="text-ink-primary">♣</span>
    </div>
  )
}

export function EmptyState({
  state,
  illustration,
  action,
  className,
  children,
  ...props
}: EmptyStateProps) {
  return (
    <div
      data-state={state}
      className={cn("flex flex-col items-center gap-3 py-5 text-center", className)}
      {...props}
    >
      {illustration ?? <SuitMarks />}
      <p className="font-ui text-base text-ink-primary">{children}</p>
      {action}
    </div>
  )
}
