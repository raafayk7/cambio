import * as React from "react"

import { cn } from "@cambio/ui"

/**
 * DrawDeck — design-system/components/core/draw-deck.md (r4, CAM-29).
 * Class: Game object.
 *
 * The face-down stock: a 2–3 offset stack of card backs. Deck count is
 * public state (the wire sends deckCount only — order never reaches a
 * client) but stays non-visual (CAM-29): the count no longer sits in a
 * badge over the tappable stack, only in the accessible name/description
 * (`low`, count ≤ 5, keeps marking `data-state` for callers that render
 * reshuffle tension visually elsewhere).
 *
 * r2 (CAM-18 T1/T2): `onClick` (the draw affordance — accessible-button
 * wrap, following Hand's internal slot-button precedent: no handler or a
 * disabled deck stays a static, non-interactive stack), the `reshuffling`/
 * `draw` choreography states (occupancy-independent — they render for the
 * duration of their flight regardless of `count`'s populated/low/empty
 * split), and `data-flight-anchor="deck"` so a flight can find it.
 *
 * r3 (CAM-26 C4): `slamWindow` — a phase overlay (not a `state` member;
 * mirrors `DiscardPile.slamTarget`) so it composes with an in-flight
 * choreography state instead of forcing a false either/or. Presentational
 * only: no button, no copy — the deck was the one silent participant while
 * a slam window was open (root plan), so this only makes that state
 * visible, using the same alarm-frame idiom as `PlayingCard`'s
 * `slamEligible` and the discard's `slamTarget` echo of it.
 *
 * r4 (CAM-29): the visual count badge covered too much of the tappable
 * surface on compact and wasn't needed — sighted players read the stack
 * height/reshuffle-alarm framing instead. The count stays available to
 * screen readers: on the interactive stack it rides `aria-describedby`
 * (button `aria-label` stays "Draw a card" so it keeps naming the action,
 * not the state); on the static stack (no `onClick`) it's the `role="img"`
 * wrapper's `aria-label` directly, since there's no action name to protect.
 */
export interface DrawDeckProps {
  count: number
  /** The draw affordance (T1: `DrawFromDeck` iff `deckCount > 0` — ADR-0040
   * made the reshuffle eager, so a resting deck-empty state is never
   * reshufflable and the old `|| discard.length > 1` fuel disjunction is
   * gone) — omit entirely when drawing isn't legal right now; the deck then
   * renders as a static, non-interactive stack. */
  onClick?: () => void
  /** `draw`: the top card is mid-flight to the holder (CH1) — `reshuffling`:
   * the discard-minus-top is mid-flight into the deck (CH2, step 13). Both
   * are choreography states, independent of the populated/low/empty count
   * split above. */
  state?: "reshuffling" | "draw"
  /** The slam window is open (CAM-26 C4): a quiet alarm frame + soft pulse
   * on the stack, independent of the populated/low/empty split and of
   * `count` (a window can be open over an empty deck). A choreography
   * `state`, if present, still wins on `data-state` — mirrors
   * `DiscardPile`'s `receiving`-over-`slamTarget` precedence. */
  slamWindow?: boolean
  className?: string
}

export function DrawDeck({ count, onClick, state, slamWindow = false, className }: DrawDeckProps) {
  const low = count <= 5
  const layers = Math.min(3, Math.max(1, count))
  const countLabel = `${count} cards in the draw deck`
  const countLabelId = React.useId()

  const stack =
    count === 0 ? (
      <span
        aria-hidden
        className={cn(
          "block border-2 border-dashed border-ink-inverse/55 card-frame card-md",
          (state === "draw" || state === "reshuffling") && "animate-pulse-soft",
        )}
      />
    ) : (
      <div
        className={cn(
          "relative card-frame card-md",
          (state === "draw" || state === "reshuffling") && "animate-pulse-soft",
        )}
      >
        {Array.from({ length: layers }, (_, layer) => (
          <span
            key={layer}
            aria-hidden
            className={cn(
              "absolute inset-0 border-interactive card-frame card-back-mark shadow-raised",
              layer === 1 && "translate-x-1 translate-y-1",
              layer === 2 && "translate-x-2 translate-y-2",
            )}
          />
        ))}
      </div>
    )

  return (
    <div
      data-flight-anchor="deck"
      data-state={
        state ?? (slamWindow ? "slam-window" : count === 0 ? "empty" : low ? "low" : "populated")
      }
      className={cn("relative w-fit", className)}
    >
      {slamWindow ? (
        // Same alarm-frame idiom as `PlayingCard`'s `slamEligible` overlay
        // (`playing-card.tsx`) and the discard's `slamTarget` echo of it —
        // deck and discard pulse as one system while the window is open.
        // A sibling of `stack`, not nested inside it: `inset-0` on this
        // `relative w-fit` parent lands on the stack's own footprint
        // (card-md) regardless of the populated/empty branch above.
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 card-frame card-md border-2 border-accent-alarm animate-pulse-soft"
        />
      ) : null}
      {onClick !== undefined ? (
        <button
          type="button"
          aria-label="Draw a card"
          aria-describedby={countLabelId}
          onClick={onClick}
          className="block cursor-pointer rounded-sm focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent-focus focus-visible:outline-solid"
        >
          {stack}
          <span id={countLabelId} className="sr-only">
            {countLabel}
          </span>
        </button>
      ) : (
        <div role="img" aria-label={countLabel}>
          {stack}
        </div>
      )}
    </div>
  )
}
