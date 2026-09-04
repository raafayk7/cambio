import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "../lib/utils.js"

/**
 * Panel — design-system/components/core/panel.md (r1). Class: Static.
 *
 * The generic content card. Variants: default (framed), plain (ground
 * only, for grouping without a box), chrome (the suit-chrome ceremonial
 * dress — use sparingly, one per screen). Panels never nest more than two
 * deep; emphasis comes from border and type, never extra shadow.
 */
const panelVariants = cva("relative rounded-md bg-surface-raised p-4", {
  variants: {
    variant: {
      default: "border-frame shadow-raised",
      plain: "",
      chrome: "border-frame shadow-raised",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

export interface PanelProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title">, VariantProps<typeof panelVariants> {
  /** Optional framed header (panel.md): `ui` 600, or the display face for poster-weight panels. */
  title?: React.ReactNode
  titleFace?: "ui" | "display"
}

/** Corner suit marks for the chrome dress: pips only, per-suit color. */
function ChromeFrame() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-1">
      <div className="absolute inset-0 border border-ink-primary/25" />
      <span className="absolute -top-1 -left-1 bg-surface-raised px-1 text-xs leading-none text-ink-primary">
        ♠
      </span>
      <span className="absolute -top-1 -right-1 bg-surface-raised px-1 text-xs leading-none text-accent-suit-red">
        ♥
      </span>
      <span className="absolute -bottom-1 -left-1 bg-surface-raised px-1 text-xs leading-none text-ink-primary">
        ♣
      </span>
      <span className="absolute -right-1 -bottom-1 bg-surface-raised px-1 text-xs leading-none text-accent-suit-red">
        ♦
      </span>
    </div>
  )
}

export function Panel({
  className,
  variant,
  title,
  titleFace = "ui",
  children,
  ...props
}: PanelProps) {
  return (
    <div className={cn(panelVariants({ variant }), className)} {...props}>
      {variant === "chrome" ? <ChromeFrame /> : null}
      {title !== undefined ? (
        <div className="mb-3 border-b border-ink-primary/25 pb-2">
          {titleFace === "display" ? (
            <h2 className="font-display text-xl">{title}</h2>
          ) : (
            <h2 className="font-ui text-lg font-semibold">{title}</h2>
          )}
        </div>
      ) : null}
      {children}
    </div>
  )
}
