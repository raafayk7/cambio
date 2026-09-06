import type { CardSlug, SlotIndex } from "@cambio/contracts"
import { cn } from "@cambio/ui"

import { slotAnchorId } from "./flight/anchors.js"
import { PlayingCard } from "./playing-card.js"

/**
 * Hand — design-system/components/core/hand.md (r2, CAM-18). Class: Game
 * object.
 *
 * A player's slot grid, rows of 2. Occupancy arrives as the wire's
 * occupancy-only slot indices (ViewPlayer.hand) — holes stay holes:
 * vacancies render dashed outlines at exactly their indices, indices are
 * stable, cards never re-flow to fill gaps (F3.7). Faces render only for
 * slots handed an entitled CardSlug; opponents' hands are always backs.
 * No "cards you know" affordance anywhere (memory fidelity).
 *
 * r2 additions (CAM-18 T2/T3): `selectedSlots` (targeting/in-progress
 * picks), `emptySlotsClickable` (the give-target case), and a
 * `data-flight-anchor` on every slot (occupied or not) via `playerId` +
 * `slotAnchorId` so flights and the future give-target lookup share one
 * anchor scheme with the deck and discard pile.
 */
export interface HandFace {
  slotIndex: SlotIndex
  card: CardSlug
  peeking?: boolean
}

export interface HandProps {
  variant: "own" | "opponent"
  /** The seat this hand belongs to — the anchor-id prefix (CAM-18 G2/T2):
   * every slot, occupied or not, exposes `data-flight-anchor`
   * `slotAnchorId(playerId, slotIndex)` so a flight can travel to/from it
   * and (step 13) a give-target can be found the same way. */
  playerId: string
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
  /** Occupied slots to render `selected` (CAM-18 T3): the in-progress pick
   * for a J/Q swap or the slot a power is currently targeting. Same visual
   * language as keyboard focus (playing-card.md state 4). */
  selectedSlots?: ReadonlyArray<SlotIndex>
  /** Makes EMPTY slots clickable too (CAM-18 step 13's give-target case) —
   * occupied slots are clickable whenever `onSlotClick` is given regardless
   * of this flag; this only widens clickability to vacancies. */
  emptySlotsClickable?: boolean
  onSlotClick?: (slot: SlotIndex) => void
  className?: string
}

export function Hand({
  variant,
  playerId,
  slots,
  faces = [],
  slamWindow = false,
  awaitingGiveSlot,
  inFlightSlot,
  leaving,
  inert = false,
  selectedSlots = [],
  emptySlotsClickable = false,
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
  const selected = new Set<number>(selectedSlots)
  const faceBySlot = new Map(faces.map((face) => [face.slotIndex, face]))
  const interactive = onSlotClick !== undefined && !inert
  const cardSize = variant === "own" ? "lg" : "md"

  return (
    <div data-variant={variant} className={cn("grid w-fit grid-cols-2 gap-2", className)}>
      {Array.from({ length: slotCount }, (_, slotIndex) => {
        const isOccupied = occupied.has(slotIndex)
        const face = faceBySlot.get(slotIndex)
        const awaiting = awaitingGiveSlot === slotIndex
        const anchor = slotAnchorId(playerId, slotIndex)
        // Even-rounding grid padding beyond every real signal is NOT a
        // vacancy — a dashed outline there would announce an empty slot
        // that never held a card (CAM-18 gate finding). It renders as an
        // invisible spacer that only keeps the grid rhythm.
        const isFiller = slotIndex > highest

        if (isFiller) {
          return (
            <span
              key={slotIndex}
              aria-hidden
              className={cn(
                "invisible block card-frame",
                variant === "own" ? "card-lg" : "card-md",
              )}
            />
          )
        }

        if (inFlightSlot === slotIndex) {
          return (
            <div
              key={slotIndex}
              data-slot-index={slotIndex}
              data-occupied="true"
              data-flight-anchor={anchor}
            >
              <PlayingCard face="down" size={cardSize} inFlight />
            </div>
          )
        }
        if (leaving?.slotIndex === slotIndex) {
          return (
            <div
              key={slotIndex}
              data-slot-index={slotIndex}
              data-occupied="true"
              data-flight-anchor={anchor}
            >
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
            selected={selected.has(slotIndex)}
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

        // Occupied slots are clickable whenever a handler exists; empty
        // slots only opt in via `emptySlotsClickable` (step 13's give
        // target) — checking `onSlotClick` directly here (not just the
        // `interactive` flag) is what lets TypeScript narrow it non-null
        // inside the branch below.
        const slotClickable = isOccupied || emptySlotsClickable

        return (
          <div
            key={slotIndex}
            data-slot-index={slotIndex}
            data-occupied={isOccupied}
            data-flight-anchor={anchor}
          >
            {interactive && slotClickable && onSlotClick ? (
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
