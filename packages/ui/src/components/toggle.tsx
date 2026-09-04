import type * as React from "react"

import { cn } from "../lib/utils.js"

/**
 * Toggle — design-system/components/core/toggle.md (r1). Class: Input.
 *
 * Boolean setting. Track is a 2px-border pill (surface.raised off,
 * accent.action on); the knob is a solid ink disc sliding at
 * duration.snap/ease.snap. The label (via FieldScaffold or an external
 * label) states the thing controlled, never the current value. Optimistic
 * flip + toast-on-failure is container behavior, not this component's.
 * `error` (setting failed to save) tints the track accent.alarm-deep
 * until the consumer clears it.
 */
export interface ToggleProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange"
> {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
  readOnly?: boolean
  error?: boolean
}

export function Toggle({
  checked,
  onCheckedChange,
  disabled = false,
  readOnly = false,
  error = false,
  className,
  ...props
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-readonly={readOnly || undefined}
      disabled={disabled}
      onClick={readOnly ? undefined : () => onCheckedChange?.(!checked)}
      className={cn(
        "group inline-flex w-fit cursor-pointer items-center rounded-full border-frame p-1",
        "transition duration-snap ease-snap",
        error ? "bg-accent-alarm-deep" : checked ? "bg-accent-action" : "bg-surface-raised",
        "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent-focus focus-visible:outline-solid",
        "disabled:pointer-events-none disabled:opacity-45",
        readOnly && "pointer-events-none",
        className,
      )}
      {...props}
    >
      <span className="block w-6">
        <span
          className={cn(
            "block size-4 rounded-full bg-ink-primary transition duration-snap ease-snap",
            checked && "translate-x-4",
          )}
        />
      </span>
    </button>
  )
}
