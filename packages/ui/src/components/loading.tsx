import * as React from "react"

import { cn } from "../lib/utils.js"

/**
 * Loading — design-system/components/core/loading.md (r1).
 * Class: Async/data (support).
 *
 * Two shapes: the spinner (a card back rotating flat at a calm 1.2s loop —
 * the game's own object, never a generic ring) and the skeleton
 * (tan-paving at 40% blocks matching the real layout — never generic
 * bars). Anything under 300ms shows nothing; reduced motion swaps the
 * rotation for a fade pulse. Captions use the flavor register
 * ("shuffling…").
 */
export interface LoadingProps extends React.HTMLAttributes<HTMLDivElement> {
  caption?: React.ReactNode
  /** No-flash rule: nothing renders before this many ms (spec: 300). */
  delayMs?: number
}

export function Loading({ caption, delayMs = 300, className, ...props }: LoadingProps) {
  const [visible, setVisible] = React.useState(delayMs <= 0)

  React.useEffect(() => {
    if (delayMs <= 0) return
    const handle = window.setTimeout(() => setVisible(true), delayMs)
    return () => window.clearTimeout(handle)
  }, [delayMs])

  if (!visible) return null

  return (
    <div
      role="status"
      className={cn("flex flex-col items-center gap-2 py-4", className)}
      {...props}
    >
      <span
        aria-hidden
        className="block h-7 w-6 rounded-sm border-interactive card-back-mark animate-card-wobble motion-reduce:animate-pulse-soft"
      />
      {caption !== undefined ? (
        <span className="font-ui text-sm text-ink-muted">{caption}</span>
      ) : (
        <span className="sr-only">Loading</span>
      )}
    </div>
  )
}

/**
 * Skeleton block (loading.md): size it to the content it precedes.
 * tan-paving at 40%, radius.sm, subtle opacity pulse — no shimmer sweep.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("rounded-sm bg-(--tan-paving)/40 animate-pulse-soft", className)}
      {...props}
    />
  )
}
