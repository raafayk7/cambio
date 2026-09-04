import type { CardSlug } from "@cambio/contracts"
import { cn } from "@cambio/ui"

import { PlayingCard } from "./playing-card.js"

/**
 * DiscardPile — design-system/components/core/discard-pile.md (r1).
 * Class: Game object.
 *
 * The face-up pile slams match against. Everything here was publicly
 * played — face-up rendering leaks nothing; the top card is the only
 * always-public card in the game. Under-card edges are decorative
 * history at thrown angles — the pile is NOT browsable (memory fidelity
 * applies to discards too). `empty` (a zero-card keep took the last
 * card) reads as "nothing to act on", never as loading; no slam window
 * exists then (ADR-0012). Takeability is server logic — the component
 * renders only what the view grants.
 */
export interface DiscardPileProps {
  /** The public top card; absent = empty pile. */
  top?: CardSlug
  /** How many under-card edges peek out (0–2, decorative). */
  underCount?: number
  /** Slam window open: the top card carries the alarm frame the
   * slam-eligible backs echo — this is the rank being matched. */
  slamTarget?: boolean
  className?: string
}

export function DiscardPile({
  top,
  underCount = 0,
  slamTarget = false,
  className,
}: DiscardPileProps) {
  if (top === undefined) {
    return (
      <div data-state="empty" className={cn("w-fit", className)}>
        <span
          aria-hidden
          className="block border-2 border-dashed border-ink-inverse/55 card-frame card-md"
        />
      </div>
    )
  }

  return (
    <div
      data-state={slamTarget ? "slam-target" : "populated"}
      className={cn("relative w-fit", className)}
    >
      {underCount >= 1 ? (
        <span
          aria-hidden
          className="absolute inset-0 -rotate-6 border-interactive card-frame card-md card-back-mark"
        />
      ) : null}
      {underCount >= 2 ? (
        <span
          aria-hidden
          className="absolute inset-0 rotate-8 border-interactive card-frame card-md card-back-mark"
        />
      ) : null}
      <PlayingCard face="up" card={top} size="md" slamEligible={slamTarget} className="relative" />
    </div>
  )
}
