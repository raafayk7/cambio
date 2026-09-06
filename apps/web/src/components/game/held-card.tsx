import type { CardSlug } from "@cambio/contracts"
import { cn } from "@cambio/ui"

import { PlayingCard } from "./playing-card.js"

/**
 * HeldCard — design-system/components/core/held-card.md (r1, CAM-18 T2).
 * Class: Game object.
 *
 * The one place on the table a drawn or taken card sits while its holder
 * decides what to do with it (`HoldingCard`/`ResolvingPower`/
 * `ResolvingQueenSwap`). Entitlement is STRUCTURAL, exactly like
 * `PlayingCard` itself: `card` is present only for the holder or when the
 * card came off the public discard pile (`ViewFor.test.ts` holding-card
 * entitlement) — there is no "held but value hidden" prop shape, so an
 * unentitled viewer's spot renders `face="down"` because the field simply
 * isn't there, never because a flag suppressed it.
 */
export interface HeldCardProps {
  /** Present iff the viewer is entitled — the holder, or anyone when the
   * card came off the discard pile. Absent renders a back, structurally. */
  card?: CardSlug
  /** Player-language label (voice.md): "You drew" for the entitled holder,
   * "<Name> is holding" for everyone else. Never a value ("Nadia peeked at
   * slot 2", never what was seen — the same rule applies here). */
  label: string
  className?: string
}

export function HeldCard({ card, label, className }: HeldCardProps) {
  return (
    <div data-flight-anchor="held" className={cn("flex flex-col items-center gap-1", className)}>
      <PlayingCard
        {...(card !== undefined ? { face: "up" as const, card } : { face: "down" as const })}
        size="md"
      />
      <span className="font-ui text-sm text-ink-muted">{label}</span>
    </div>
  )
}
