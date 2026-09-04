import { Divider } from "@cambio/ui"
import type * as React from "react"

/**
 * Gallery scaffolding (dev-only, mounted by /dev/components): one Section
 * per component, one StateCard per required MVS state. Pseudo-class
 * states (hover/focus/active) are live — interact to see them; the cards
 * label everything else explicitly.
 */
export function Section({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-xl">{title}</h2>
        {note !== undefined ? <p className="mt-1 text-sm text-ink-muted">{note}</p> : null}
      </div>
      <div className="flex flex-wrap items-start gap-5">{children}</div>
      <Divider weight="row" />
    </section>
  )
}

export function StateCard({
  label,
  wide = false,
  children,
}: {
  label: string
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={wide ? "flex w-full flex-col gap-2" : "flex flex-col gap-2"}>
      <span className="font-ui text-xs font-semibold tracking-wide text-ink-muted uppercase">
        {label}
      </span>
      <div>{children}</div>
    </div>
  )
}
