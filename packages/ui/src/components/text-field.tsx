import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "../lib/utils.js"

/**
 * TextField — design-system/components/core/text-field.md (r1).
 * Class: Input.
 *
 * Always rendered inside a FieldScaffold (label/helper/error live there);
 * the error border keys off the aria-invalid the scaffold injects, so
 * error styling never relies on color alone — the scaffold's message
 * carries the meaning. Placeholders are examples ("e.g. KHOKA"), never
 * instructions. The `code` variant is room-code entry: numeral spacing,
 * uppercase, centered, larger.
 *
 * Spec note (recorded in the plan): the hover state's "border darkens" is
 * a no-op today — the resting border is already ink.primary.
 */
const textFieldVariants = cva(
  "rounded-sm border-frame bg-surface-raised px-3 py-2 font-ui text-base text-ink-primary caret-accent-action transition duration-snap ease-snap selection:bg-accent-action selection:text-ink-inverse placeholder:text-ink-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent-focus focus-visible:outline-solid disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-accent-alarm-deep read-only:border-transparent",
  {
    variants: {
      variant: {
        default: "",
        code: "text-center font-numeral text-lg tracking-wide uppercase",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export interface TextFieldProps
  extends React.InputHTMLAttributes<HTMLInputElement>, VariantProps<typeof textFieldVariants> {}

export function TextField({ className, variant, ...props }: TextFieldProps) {
  return <input className={cn(textFieldVariants({ variant }), className)} {...props} />
}
