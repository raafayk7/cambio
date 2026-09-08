import { Slot } from "@radix-ui/react-slot"
import * as React from "react"

import { cn } from "../lib/utils.js"
import { Skeleton } from "./loading.js"

/**
 * List — design-system/components/core/list.md (r1). Class: Async/data.
 *
 * Vertical collection (rooms in the lobby, players in a room). Rows on
 * surface.raised separated by the 1px 25% rule; the Async/data floor is
 * carried by `state`: loading renders 3 skeleton rows, empty/error render
 * the nodes the caller supplies (an EmptyState / an Alert — first-use and
 * no-results copy stay distinct per voice.md), partial appends a trailing
 * skeleton row. Interactive rows (ListRow interactive/asChild) take the
 * Interactive floor.
 */
export interface ListProps extends React.HTMLAttributes<HTMLUListElement> {
  state?: "populated" | "loading" | "empty" | "error" | "partial"
  /** Rendered for `empty` — an EmptyState with surface-appropriate copy. */
  empty?: React.ReactNode
  /** Rendered for `error` — an Alert with a retry action. */
  error?: React.ReactNode
  skeletonRows?: number
}

function SkeletonRow() {
  return (
    <li className="px-3 py-3">
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="mt-1 h-3 w-1/4" />
    </li>
  )
}

export function List({
  state = "populated",
  empty,
  error,
  skeletonRows = 3,
  className,
  children,
  ...props
}: ListProps) {
  if (state === "empty") return <>{empty}</>
  if (state === "error") return <>{error}</>

  return (
    <ul
      className={cn("divide-y divide-ink-primary/25 rounded-md bg-surface-raised", className)}
      {...props}
    >
      {state === "loading"
        ? Array.from({ length: skeletonRows }, (_, index) => <SkeletonRow key={index} />)
        : children}
      {state === "partial" ? <SkeletonRow /> : null}
    </ul>
  )
}

export interface ListRowProps extends React.LiHTMLAttributes<HTMLLIElement> {
  /** Interactive rows: hover ground shift + focus ring on the row. */
  interactive?: boolean
  /** Secondary line in ink.muted. */
  meta?: React.ReactNode
}

export function ListRow({
  interactive = false,
  meta,
  className,
  children,
  ...props
}: ListRowProps) {
  return (
    <li
      {...(interactive ? { tabIndex: 0 } : {})}
      className={cn(
        "px-3 py-3 font-ui text-base font-medium text-ink-primary",
        interactive &&
          "cursor-pointer transition duration-snap ease-snap ground-raised focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-accent-focus focus-visible:outline-solid",
        className,
      )}
      {...props}
    >
      {children}
      {meta !== undefined ? (
        <div className="mt-1 text-sm font-normal text-ink-muted">{meta}</div>
      ) : null}
    </li>
  )
}

/** Row content that wraps a router link: <ListRow><ListRowLink asChild>… */
export function ListRowLink({
  asChild = false,
  className,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "a"
  return <Comp className={cn("block outline-none", className)} {...props} />
}
