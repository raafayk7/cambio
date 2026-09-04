import type { CardSlug, SlotIndex } from "@cambio/contracts"
import { cn } from "@cambio/ui"

import { PlayingCard } from "./playing-card.js"

/**
 * Hand — design-system/components/core/hand.md (r1). Class: Game object.
 *
 * A player's slot grid, rows of 2. Occupancy arrives as the wire's
 * occupancy-only slot indices (ViewPlayer.hand) — holes stay holes:
 * vacancies render dashed outlines at exactly their indices, indices are
 * stable, cards never re-flow to fill gaps (F3.7). Faces render only for
 * slots handed an entitled CardSlug; opponents' hands are always backs.
 * No "cards you know" affordance anywhere (memory fidelity).
 */
export interface HandFace {
  slotIndex: SlotIndex
  card: CardSlug
  peeking?: boolean
}

export interface HandProps {
  variant: "own" | "opponent"
  /** Occupied slot indices, as sent by the wire. */
  slots: ReadonlyArray<SlotIndex>
  /** Entitled faces only (a live peek, a public reveal). */
  faces?: ReadonlyArray<HandFace>
  /** Slam window open: every face-down card pulses (eligibility is public). */
  slamWindow?: boolean
  /** Slot vacated by a correct slam, awaiting the slammer's give. */
  awaitingGiveSlot?: SlotIndex
  /** `growing` (hand.md): a penalty/give card arriving in-flight into this
   * slot — renders a face-down card in flight (unseen by everyone,
   * ADR-0022). */
  inFlightSlot?: SlotIndex
  /** `shrinking` (hand.md): a slammed card leaving play from this slot —
   * every slam publicly reveals the card, so it departs face-up. */
  leaving?: { slotIndex: SlotIndex; card: CardSlug }
  /** Not interactable — no hover affordance (not your turn, no window). */
  inert?: boolean
  onSlotClick?: (slot: SlotIndex) => void
  className?: string
}

export function Hand({
  variant,
  slots,
  faces = [],
  slamWindow = false,
  awaitingGiveSlot,
  inFlightSlot,
  leaving,
  inert = false,
  onSlotClick,
  className,
}: HandProps) {
  const highest = Math.max(
    3,
    ...slots,
    ...(awaitingGiveSlot !== undefined ? [awaitingGiveSlot] : []),
    ...(inFlightSlot !== undefined ? [inFlightSlot] : []),
    ...(leaving !== undefined ? [leaving.slotIndex] : []),
  )
  const slotCount = Math.ceil((highest + 1) / 2) * 2
  const occupied = new Set<number>(slots)
  const faceBySlot = new Map(faces.map((face) => [face.slotIndex, face]))
  const interactive = onSlotClick !== undefined && !inert
  const cardSize = variant === "own" ? "lg" : "md"

  return (
    <div data-variant={variant} className={cn("grid w-fit grid-cols-2 gap-2", className)}>
      {Array.from({ length: slotCount }, (_, slotIndex) => {
        const isOccupied = occupied.has(slotIndex)
        const face = faceBySlot.get(slotIndex)
        const awaiting = awaitingGiveSlot === slotIndex

        if (inFlightSlot === slotIndex) {
          return (
            <div key={slotIndex} data-slot-index={slotIndex} data-occupied="true">
              <PlayingCard face="down" size={cardSize} inFlight />
            </div>
          )
        }
        if (leaving?.slotIndex === slotIndex) {
          return (
            <div key={slotIndex} data-slot-index={slotIndex} data-occupied="true">
              <PlayingCard face="up" card={leaving.card} size={cardSize} leavingPlay />
            </div>
          )
        }

        const card = isOccupied ? (
          <PlayingCard
            {...(face !== undefined
              ? {
                  face: face.peeking === true ? ("peeking" as const) : ("up" as const),
                  card: face.card,
                }
              : { face: "down" as const })}
            size={cardSize}
            slamEligible={slamWindow && face === undefined}
          />
        ) : (
          <span
            aria-hidden
            className={cn(
              "block border-2 border-dashed border-ink-inverse/55 card-frame",
              variant === "own" ? "card-lg" : "card-md",
              awaiting && "outline-3 outline-offset-2 outline-accent-focus outline-solid",
            )}
          />
        )

        return (
          <div key={slotIndex} data-slot-index={slotIndex} data-occupied={isOccupied}>
            {interactive && isOccupied ? (
              <button
                type="button"
                aria-label={`Slot ${slotIndex + 1}`}
                onClick={() => onSlotClick(slotIndex)}
                className="block cursor-pointer rounded-sm focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent-focus focus-visible:outline-solid"
              >
                {card}
              </button>
            ) : (
              card
            )}
          </div>
        )
      })}
    </div>
  )
}
