import type * as React from "react"

import { cn } from "../lib/utils.js"

/**
 * Divider — design-system/components/core/divider.md (r1). Class: Static.
 *
 * Prefer whitespace first — a divider is for when the spacing scale alone
 * can't separate (dense lists, tables). Weights: `section` (2px ink) and
 * `row` (1px at 25% — the spec's `--rule` value). The `ornament` variant
 * is the border-chrome language at line scale: centered suit marks
 * flanked by rules — ceremonial surfaces only.
 */
export interface DividerProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "plain" | "ornament"
  weight?: "section" | "row"
}

export function Divider({
  className,
  variant = "plain",
  weight = "section",
  ...props
}: DividerProps) {
  const rule =
    weight === "section" ? "border-t-2 border-ink-primary" : "border-t border-ink-primary/25"

  if (variant === "ornament") {
    return (
      <div
        role="separator"
        className={cn("flex items-center gap-3 text-sm leading-none", className)}
        {...props}
      >
        <span className={cn("flex-1", rule)} />
        <span aria-hidden className="text-ink-primary">
          ♠
        </span>
        <span aria-hidden className="text-accent-suit-red">
          ♥
        </span>
        <span aria-hidden className="text-accent-suit-red">
          ♦
        </span>
        <span aria-hidden className="text-ink-primary">
          ♣
        </span>
        <span className={cn("flex-1", rule)} />
      </div>
    )
  }

  return <div role="separator" className={cn(rule, className)} {...props} />
}
