import { cn } from "@cambio/ui"

/**
 * Seat — design-system/components/core/seat.md (r1). Class: Game object.
 *
 * A player at the table: identity + PUBLIC status only — name, card
 * count, connection, turn status. Never hand values, never
 * score-in-progress (scores exist only at reveal). The `own` variant is
 * positionally distinct (bottom) but visually unprivileged — your
 * advantage is your memory, not your UI. Avatar grounds cycle palette
 * primitives by seat index and never collide adjacent seats.
 */
export type SeatState = "default" | "active-turn" | "acting" | "disconnected" | "left"

/** Palette cycle for avatar discs: primitives only (seat.md) — 5 entries,
 * longer than the 4-player cap (ADR-0036) needs, so it never wraps in
 * practice; the cycle itself is seat.md canon and stays this length. */
const AVATAR_CYCLE = [
  { ground: "var(--green-table)", ink: "text-ink-inverse" },
  { ground: "var(--terracotta)", ink: "text-ink-inverse" },
  { ground: "var(--olive)", ink: "text-ink-inverse" },
  { ground: "var(--brick-deep)", ink: "text-ink-inverse" },
  { ground: "var(--mustard)", ink: "text-ink-primary" },
] as const

export function seatAvatarColor(seatIndex: number) {
  return AVATAR_CYCLE[seatIndex % AVATAR_CYCLE.length]!
}

export interface SeatProps {
  name: string
  seatIndex: number
  cardCount?: number
  state?: SeatState
  own?: boolean
  className?: string
}

export function Seat({
  name,
  seatIndex,
  cardCount,
  state = "default",
  own = false,
  className,
}: SeatProps) {
  const avatar = seatAvatarColor(seatIndex)

  return (
    <div
      data-state={state}
      data-own={own ? "true" : undefined}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border-interactive bg-surface-raised py-1 pr-3 pl-1 shadow-raised",
        state === "active-turn" && "outline-3 outline-offset-2 outline-accent-focus outline-solid",
        state === "acting" && "animate-pulse-soft",
        state === "disconnected" && "border-dashed opacity-55",
        state === "left" && "opacity-45",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-5 items-center justify-center rounded-full border border-ink-primary font-ui text-sm font-semibold",
          avatar.ink,
        )}
        style={{ backgroundColor: avatar.ground }}
      >
        {name.charAt(0)}
      </span>
      <span className="font-ui text-base font-semibold text-ink-primary">{name}</span>
      {state === "disconnected" ? (
        <span className="font-ui text-sm text-ink-muted">reconnecting…</span>
      ) : state !== "left" && cardCount !== undefined ? (
        <span className="font-numeral text-sm text-ink-muted">{cardCount}</span>
      ) : null}
    </div>
  )
}
