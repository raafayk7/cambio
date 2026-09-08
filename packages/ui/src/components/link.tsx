import { Slot } from "@radix-ui/react-slot"
import type * as React from "react"

import { cn } from "../lib/utils.js"

/**
 * Link — design-system/components/core/link.md (r1). Class: Interactive.
 *
 * Links navigate; buttons act — an in-game action is never a link.
 * Underline always on (links are underlined, buttons are boxed; no third
 * thing). Hover/active darken to green-deep — a deliberately theme-fixed
 * primitive bind (CAM-15 Decision Log). Disabled is aria-disabled:
 * ink.muted, no underline. Use `asChild` to wrap a router link.
 */
export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  asChild?: boolean
}

export function Link({ className, asChild = false, ...props }: LinkProps) {
  const Comp = asChild ? Slot : "a"
  return (
    <Comp
      className={cn(
        // py-1/-my-1: a ≥24px hit area (WCAG 2.5.8) without disturbing the
        // inline line box — the bare text box measures only 16px.
        "inline-block py-1 -my-1 font-ui font-medium text-accent-action underline underline-offset-2",
        "transition duration-snap ease-snap",
        "hover:text-(--green-deep) active:text-(--green-deep)",
        "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent-focus focus-visible:outline-solid",
        "aria-disabled:pointer-events-none aria-disabled:text-ink-muted aria-disabled:no-underline",
        className,
      )}
      {...props}
    />
  )
}
