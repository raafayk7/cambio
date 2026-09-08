import type { CardSlug } from "@cambio/contracts"
import { cn } from "@cambio/ui"

import { PlayingCard } from "./playing-card.js"

/**
 * DiscardPile — design-system/components/core/discard-pile.md (r2, CAM-18).
 * Class: Game object.
 *
 * The face-up pile slams match against. Everything here was publicly
 * played — face-up rendering leaks nothing; the top card is the only
 * always-public card in the game. Under-card edges are decorative
 * history at thrown angles — the pile is NOT browsable (memory fidelity
 * applies to discards too). `empty` (every game's opening state per
 * ADR-0039, and reachable again mid-game by a zero-card keep — canon r3)
 * reads as "nothing to act on", never as loading; no slam window
 * exists then (ADR-0012). Takeability is server logic — the component
 * renders only what the view grants.
 *
 * r2 (CAM-18 T1/T2/CH1): `onClick` (the take affordance — accessible-button
 * wrap, same precedent as `Hand`/`DrawDeck`; a non-power top only, per T1 —
 * the caller decides, this just renders what it's given), `receiving`
 * (a discarded/slammed card is mid-flight and about to settle as the new
 * top — the settle treatment reuses `leavingPlay`'s arrival look), and
 * `data-flight-anchor="discard"`.
 */
export interface DiscardPileProps {
  /** The public top card; absent = empty pile. */
  top?: CardSlug
  /** How many under-card edges peek out (0–2, decorative). */
  underCount?: number
  /** Slam window open: the top card carries the alarm frame the
   * slam-eligible backs echo — this is the rank being matched. */
  slamTarget?: boolean
  /** The take affordance (T1: non-power top only) — omit entirely when
   * taking isn't legal right now; the pile then renders as static. */
  onClick?: () => void
  /** A card is arriving `leaving-play` and about to settle as the new top
   * (CH1) — the pile echoes the incoming settle while the flight lands. */
  receiving?: boolean
  className?: string
}

export function DiscardPile({
  top,
  underCount = 0,
  slamTarget = false,
  onClick,
  receiving = false,
  className,
}: DiscardPileProps) {
  if (top === undefined) {
    return (
      <div data-flight-anchor="discard" data-state="empty" className={cn("w-fit", className)}>
        <span
          aria-hidden
          className="block border-2 border-dashed border-ink-inverse/55 card-frame card-md"
        />
      </div>
    )
  }

  const pile = (
    <div className="relative w-fit">
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
      <PlayingCard
        face="up"
        card={top}
        size="md"
        leavingPlay={receiving}
        slamEligible={slamTarget}
        className="relative"
      />
    </div>
  )

  return (
    <div
      data-flight-anchor="discard"
      data-state={receiving ? "receiving" : slamTarget ? "slam-target" : "populated"}
      className={cn("relative w-fit", className)}
    >
      {onClick !== undefined ? (
        <button
          type="button"
          aria-label="Take the top discard"
          onClick={onClick}
          className="block cursor-pointer rounded-sm focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent-focus focus-visible:outline-solid"
        >
          {pile}
        </button>
      ) : (
        pile
      )}
    </div>
  )
}
