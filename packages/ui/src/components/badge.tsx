import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "../lib/utils.js"

/**
 * Badge — design-system/components/core/badge.md (r1). Class: Static.
 *
 * States facts, never actions (anything clickable is a button), and never
 * hidden-state hints (memory fidelity). Ground carries the meaning:
 * attention (accent.focus) · info (the warm role's tan half — terracotta
 * fails small-text contrast, see tokens.md §Contrast) · alarm
 * (accent.alarm-deep) · positive (accent.action). The `count` variant is
 * the numeric pill (deck count, card count): rounded-full, numeral type,
 * raised ground.
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-sm border-interactive px-2 py-1 font-ui text-xs font-semibold tracking-wide uppercase",
  {
    variants: {
      variant: {
        attention: "bg-accent-focus text-ink-primary",
        info: "bg-(--tan-paving) text-ink-primary",
        alarm: "bg-accent-alarm-deep text-ink-inverse",
        positive: "bg-accent-action text-ink-inverse",
        count: "rounded-full bg-surface-raised font-numeral tracking-normal normal-case",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
