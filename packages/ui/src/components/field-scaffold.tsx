import * as React from "react"

import { cn } from "../lib/utils.js"

/**
 * FieldScaffold — design-system/components/core/field-scaffold.md (r1).
 * Class: Input (wrapper).
 *
 * The canonical wrapper for every input: label + helper + error, so form
 * anatomy is never re-litigated — no bare fields anywhere. The wrapped
 * field gets real htmlFor/id wiring, aria-describedby pointing at the
 * helper or error, and aria-invalid when an error is present (the field's
 * own error border keys off aria-invalid). Required is the word
 * "required", never an asterisk. Error copy per voice.md: what went
 * wrong, then how to fix — never blame, never apologize.
 */
export interface FieldScaffoldProps {
  label: React.ReactNode
  required?: boolean
  /** Small helper line under the field; replaced by `error` when present. */
  helper?: React.ReactNode
  error?: React.ReactNode
  /** Dims label + helper to 45% (the field manages its own disabled look). */
  disabled?: boolean
  /** read-only state (field-scaffold.md): label + value text ONLY — the
   * wrapped field, helper, and error are not rendered. */
  readOnlyValue?: React.ReactNode
  className?: string
  children: React.ReactElement<{ id?: string }>
}

export function FieldScaffold({
  label,
  required = false,
  helper,
  error,
  disabled = false,
  readOnlyValue,
  className,
  children,
}: FieldScaffoldProps) {
  const generatedId = React.useId()

  if (readOnlyValue !== undefined) {
    return (
      <div className={cn("flex flex-col gap-1", className)}>
        <span className="font-ui font-semibold text-ink-primary">{label}</span>
        <p className="font-ui text-base text-ink-primary">{readOnlyValue}</p>
      </div>
    )
  }
  const child = React.Children.only(children)
  const fieldId = child.props.id ?? generatedId
  const messageId = `${fieldId}-message`
  const hasError = error !== undefined && error !== null && error !== false
  const hasMessage = hasError || (helper !== undefined && helper !== null)

  const field = React.cloneElement(child, {
    id: fieldId,
    ...(hasMessage ? { "aria-describedby": messageId } : {}),
    ...(hasError ? { "aria-invalid": true } : {}),
  } as Partial<{ id: string }>)

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label
        htmlFor={fieldId}
        className={cn("font-ui font-semibold text-ink-primary", disabled && "opacity-45")}
      >
        {label}
        {required ? <span className="font-normal text-ink-muted"> required</span> : null}
      </label>
      {field}
      {hasError ? (
        <p id={messageId} className="text-sm text-accent-alarm-deep">
          {error}
        </p>
      ) : helper !== undefined && helper !== null ? (
        <p id={messageId} className={cn("text-sm text-ink-muted", disabled && "opacity-45")}>
          {helper}
        </p>
      ) : null}
    </div>
  )
}
