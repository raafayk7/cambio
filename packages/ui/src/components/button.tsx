import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "../lib/utils.js"

/**
 * Button — design-system/components/core/button.md (r1).
 *
 * Variants: primary / secondary / ghost / icon / danger. `icon` is square
 * and icon-only: it REQUIRES an accessible label (aria-label). `danger`
 * uses accent.alarm-deep, the small-label alarm surface per tokens.md's
 * contrast rule; a display-face large-label danger button (the Slam
 * composition) may override to accent.alarm at the use site.
 *
 * One primary per surface; the active "sit-down" press (press-raised) is
 * the signature — never replace it with an opacity flash.
 */
const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-sm border-frame px-5 py-2 font-ui text-base font-semibold shadow-raised transition duration-snap ease-snap press-raised focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent-focus focus-visible:outline-solid disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "ground-action text-ink-inverse",
        secondary: "ground-raised text-ink-primary",
        ghost: "ground-ghost text-ink-primary shadow-none",
        icon: "ground-raised p-2 text-ink-primary",
        danger: "ground-alarm-deep text-ink-inverse",
      },
    },
    defaultVariants: {
      variant: "primary",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export function Button({ className, variant, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button"
  return <Comp className={cn(buttonVariants({ variant, className }))} {...props} />
}

export { buttonVariants }
