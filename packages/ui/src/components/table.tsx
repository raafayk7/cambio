import type * as React from "react"

import { cn } from "../lib/utils.js"
import { Skeleton } from "./loading.js"

/**
 * Table — design-system/components/core/table.md (r1). Class: Async/data.
 * (The play surface is table-surface in apps/web; this is the data table.)
 *
 * Header row in uppercase letter-spaced ui 600 over a 2px bottom rule;
 * body rows separated by the 1px 25% rule. Numeric columns right-aligned
 * in numeral type (tabular, true minus − per voice.md) — numbers never
 * center-align. Wide tables scroll inside this container; the page never
 * scrolls sideways. The Async/data floor states compose: TableSkeletonRow
 * for loading/partial, TableStatusRow to host an EmptyState or Alert.
 */
export function Table({ className, children, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full rounded-md bg-surface-raised", className)} {...props}>
        {children}
      </table>
    </div>
  )
}

export function TableHeaderCell({
  numeric = false,
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b-2 border-ink-primary px-3 py-2 font-ui text-xs font-semibold tracking-wide uppercase",
        numeric ? "text-right" : "text-left",
        className,
      )}
      {...props}
    />
  )
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-ink-primary/25", className)} {...props} />
}

export function TableCell({
  numeric = false,
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        "px-3 py-2 font-ui text-base",
        numeric ? "text-right font-numeral" : "text-left",
        className,
      )}
      {...props}
    />
  )
}

/** Loading/partial rows: skeleton cells matching the column count. */
export function TableSkeletonRow({ columns }: { columns: number }) {
  return (
    <TableRow>
      {Array.from({ length: columns }, (_, index) => (
        <TableCell key={index}>
          <Skeleton className="h-4 w-3/4" />
        </TableCell>
      ))}
    </TableRow>
  )
}

/** Full-width host row for an EmptyState or Alert (empty/error states). */
export function TableStatusRow({
  columns,
  children,
}: {
  columns: number
  children: React.ReactNode
}) {
  return (
    <tr>
      <td colSpan={columns} className="px-3 py-2">
        {children}
      </td>
    </tr>
  )
}
