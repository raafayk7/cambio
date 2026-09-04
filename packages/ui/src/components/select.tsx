import * as SelectPrimitive from "@radix-ui/react-select"
import type * as React from "react"

import { cn } from "../lib/utils.js"

/**
 * Select — design-system/components/core/select.md (r1). Class: Input.
 *
 * Choose one from a SHORT list (≤ 7 options or rethink the control).
 * Same field body as text-field + trailing chevron; the options panel is
 * panel anatomy at elevation.float, the selected option marked with a
 * leading ♦ pip in accent.action. Built on Radix Select for listbox
 * semantics; the compact-widths native-semantics rule is deferred to
 * CAM-16's real phone forms (recorded in the plan — surfaced, not
 * silently resolved). Always rendered inside a FieldScaffold.
 */
export interface SelectOption {
  value: string
  label: React.ReactNode
}

export interface SelectProps {
  options: ReadonlyArray<SelectOption>
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  placeholder?: React.ReactNode
  disabled?: boolean
  readOnly?: boolean
  id?: string
  className?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean
}

export function Select({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  disabled = false,
  readOnly = false,
  id,
  className,
  ...aria
}: SelectProps) {
  return (
    <SelectPrimitive.Root
      {...(value !== undefined ? { value } : {})}
      {...(defaultValue !== undefined ? { defaultValue } : {})}
      {...(onValueChange !== undefined ? { onValueChange } : {})}
      disabled={disabled || readOnly}
    >
      <SelectPrimitive.Trigger
        {...(id !== undefined ? { id } : {})}
        aria-describedby={aria["aria-describedby"]}
        aria-invalid={aria["aria-invalid"]}
        className={cn(
          "inline-flex items-center justify-between gap-2 rounded-sm border-frame bg-surface-raised px-3 py-2 font-ui text-base text-ink-primary",
          "transition duration-snap ease-snap",
          "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent-focus focus-visible:outline-solid",
          "data-placeholder:text-ink-muted",
          "aria-invalid:border-accent-alarm-deep",
          readOnly
            ? "pointer-events-none border-transparent"
            : "disabled:pointer-events-none disabled:opacity-45",
          className,
        )}
      >
        <SelectPrimitive.Value {...(placeholder !== undefined ? { placeholder } : {})} />
        <SelectPrimitive.Icon aria-hidden className={cn(readOnly && "invisible")}>
          <svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden>
            <path d="M1 1.5 L6 6.5 L11 1.5" stroke="currentColor" strokeWidth="2" />
          </svg>
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="min-w-(--radix-select-trigger-width) rounded-md border-frame bg-surface-raised p-1 shadow-float"
        >
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 font-ui text-base text-ink-primary outline-none select-none data-highlighted:bg-accent-focus"
              >
                <span aria-hidden className="inline-flex w-3 justify-center text-accent-action">
                  <SelectPrimitive.ItemIndicator>♦</SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
