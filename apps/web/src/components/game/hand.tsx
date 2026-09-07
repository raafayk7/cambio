import type { CardSlug, SlotIndex } from "@cambio/contracts"
import { cn } from "@cambio/ui"

import { slotAnchorId } from "./flight/anchors.js"
import { PlayingCard } from "./playing-card.js"

/**
 * Hand — design-system/components/core/hand.md (r4, CAM-20). Class: Game
 * object.
 *
 * A player's slot grid, ROW-MAJOR (r3, ADR-0036): rows of up to 6 slots —
 * a 4-card deal is one straight line along the bench, 6×2 (12 cards) is
 * the designed-for footprint, a third row is tolerated with compression,
 * and beyond 18 cards the layout is accepted breakage (no client cap or
 * truncation, root plan clause 7). Occupancy arrives as the wire's
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
 *
 * r3 addition (CAM-20, ADR-0036 §5): `rotate` — a side-bench opponent's
 * hand reads rotated along its bench. The grid flows COLUMN-major instead
 * of row-major (a 90°-turned layout, not a transform) and the card visual
 * inside each anchor takes the rotate class; the anchor itself, and every
 * ancestor up to the flight root, stays untransformed (the FLIP layer
 * measures post-transform pixels and would corrupt on a rotated ancestor,
 * same class of bug ADR-0035 records for scale).
 *
 * The anchor (`data-slot-index`) always reserves `card-frame`'s UPRIGHT
 * (5/7) footprint, rotated or not — it's the grid track's real estate,
 * so it stays at the size an upright card of this variant needs. The
 * rotated VISUAL (`PlayingCard`'s `rotated` prop, or the empty-slot
 * span's own class) instead uses `card-frame-rotated` (7/5, design-system
 * creation gate, gate-approved 2026-09-06 — packages/ui/src/styles.css)
 * at the SAME `--card-width`: rotating that box 90° lands its painted
 * footprint width×height-reversed from the anchor's own box, i.e.
 * comfortably inside it in both dimensions (verified on the rendered
 * path at the 12-card case), instead of the near-zero clearance an
 * upright `card-frame` visual left when rotated. The anchor centers the
 * now-smaller visual (`flex items-center justify-center`, rotated only —
 * an upright visual already fills its anchor exactly).
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
  /** Side-bench rotated reading (r3, ADR-0036 §5): `"left"`/`"right"` for
   * an opponent seated on that bench, omitted for `top`/`bottom` benches
   * (and always omitted for the viewer's own hand — decision 2's
   * hang-below exception means the own hand never sits on a side bench).
   * Column-major flow; rotation applies to the card visual only, never
   * the anchor. See the `card-frame-rotated` note above the component
   * doc. */
  rotate?: "left" | "right"
  onSlotClick?: (slot: SlotIndex) => void
  className?: string
}

/** Row width (hand.md r3): the grid never exceeds 6 slots per row — a
 * 4-card deal is one line, 6×2 is the designed-for footprint. Exported for
 * the Call Cambio dock-offset derivation pin (game-screen.test.tsx, review
 * F9): the CTA's 324px offset is (ROW_WIDTH·96 + (ROW_WIDTH−1)·8)/2 + 16. */
export const ROW_WIDTH = 6

/** Every possible row/column count this component ever produces:
 * `Math.max(4, highest + 1)` floors at 4, and rounding up to a full
 * `ROW_WIDTH` multiple once that exceeds one row means the SHORT side of
 * the grid (columns upright, rows when `rotate`d) is always exactly 4, 5,
 * or 6 — an enumerated class map, no arbitrary/computed Tailwind value
 * (frontend-architecture's inline-style rule: this isn't genuinely
 * dynamic, the value space is this small by construction). */
const GRID_COLS_CLASS: Record<4 | 5 | 6, string> = {
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
}
/** Same enumeration, transposed for the `rotate`d (column-major) flow —
 * the row-major layout turned 90° as a LAYOUT (ADR-0036 §5), not a
 * transform: a fixed row count with `grid-flow-col` sends slot indices
 * down the bench instead of across it. `regular:`-prefixed: rotation is a
 * REGULAR-ONLY presentation (table-surface.md r4/game-screen.tsx — compact
 * doesn't render bench placement at all, every opponent group is
 * uniformly oriented there), so the base `GRID_COLS_CLASS` row-major
 * layout stays the compact default even when `rotate` is set;
 * `regular:grid-cols-none` cancels the base grid-template-columns so the
 * `grid-flow-col` + explicit rows can take over at that breakpoint only. */
const GRID_ROWS_CLASS: Record<4 | 5 | 6, string> = {
  4: "regular:grid-cols-none regular:grid-flow-col regular:grid-rows-4",
  5: "regular:grid-cols-none regular:grid-flow-col regular:grid-rows-5",
  6: "regular:grid-cols-none regular:grid-flow-col regular:grid-rows-6",
}

/**
 * Side-bench arc offset (CAM-20 gate fix, finding 3; mechanism revised by
 * the review fix cycle, finding F2): the bench doctrine anchors a side
 * hand to a single point (`BENCH_POSITION_CLASS`), but the painted bench
 * (`table-top.webp`) is a shallow CRESCENT that bulges outward at its
 * vertical middle and tapers at both ends where it meets the corner
 * post — a straight column of rotated cards (the mechanism above) doesn't
 * follow that curve, so the middle cards land on the dark shadow gap
 * between the crescent and the round tabletop disc instead of the bench
 * itself.
 *
 * Measured directly on the rendered asset (2026-09-06, a 4-card hand,
 * regular breakpoint): the crescent's own painted center sits at screen-x
 * ~406-426px depending on row, while the straight column of cards sat at a
 * constant ~463px — a 37-58px undershoot, worst in the middle two rows.
 * Fit to a curve shaped like the crescent itself (screen px, symmetric
 * around the grid's own vertical center, tapering toward both ends): at a
 * fixed card pitch (card-md's 89.6px upright height + the grid's 8px gap,
 * regular), the two measured data points (distance-from-center 48.9px →
 * 57px of outward offset; 146.3px → 40px) fit a line; the 5/6-row tables
 * below come from the same formula. The 6-row (12-card) table was
 * rendered-verified during the review fix cycle; the 5-row table remains
 * formula-generated (documented in design-system/references/tokens.md,
 * "art-registration constants").
 *
 * Applied to the ANCHOR DIV as `position: relative` + a directional
 * offset — NOT to the card visual (the review's F2: an offset on the
 * visual left the painted card up to ~57px away from the flight anchor
 * the FLIP layer measures and highlights, so penalty/give flights landed
 * visibly off the resting card). Relative positioning moves the anchor's
 * border box — and therefore its `getBoundingClientRect`, which is all
 * FLIP reads — WITHOUT disturbing the grid's track layout (the reserved
 * grid cell stays put), and it is not a transform, so ADR-0035/0036's
 * ban (which exists because transforms corrupt FLIP's written-back
 * untransformed pixels) does not apply: anchor and card move together and
 * flights land exactly on the resting card. Values are the TRUE fitted
 * offsets (the previous visual-margin mechanism needed doubled values to
 * defeat the anchor's flex centering; that story is gone with it). Only
 * the FIRST column (`slotIndex < shortSide`, i.e. cards actually adjacent
 * to the bench) gets it — a 13+ card hand's second-and-later columns sit
 * over the round disc, not the bench, and are the pre-existing "tolerated
 * compression" band (root plan clause 7), unaffected by this fix.
 * `regular:`-scoped like every other rotation class here (compact never
 * rotates).
 */
const SIDE_BENCH_ARC_CLASS: Record<"left" | "right", Record<4 | 5 | 6, ReadonlyArray<string>>> = {
  // Left bench: outward is toward smaller x — negative `left` offset.
  left: {
    4: [
      "regular:relative regular:-left-[40px]",
      "regular:relative regular:-left-[57px]",
      "regular:relative regular:-left-[57px]",
      "regular:relative regular:-left-[40px]",
    ],
    5: [
      "regular:relative regular:-left-[32px]",
      "regular:relative regular:-left-[48px]",
      "regular:relative regular:-left-[65px]",
      "regular:relative regular:-left-[48px]",
      "regular:relative regular:-left-[32px]",
    ],
    6: [
      "regular:relative regular:-left-[23px]",
      "regular:relative regular:-left-[40px]",
      "regular:relative regular:-left-[57px]",
      "regular:relative regular:-left-[57px]",
      "regular:relative regular:-left-[40px]",
      "regular:relative regular:-left-[23px]",
    ],
  },
  // Right bench: the mirror image — outward is toward larger x, positive
  // `left` offset, same magnitudes.
  right: {
    4: [
      "regular:relative regular:left-[40px]",
      "regular:relative regular:left-[57px]",
      "regular:relative regular:left-[57px]",
      "regular:relative regular:left-[40px]",
    ],
    5: [
      "regular:relative regular:left-[32px]",
      "regular:relative regular:left-[48px]",
      "regular:relative regular:left-[65px]",
      "regular:relative regular:left-[48px]",
      "regular:relative regular:left-[32px]",
    ],
    6: [
      "regular:relative regular:left-[23px]",
      "regular:relative regular:left-[40px]",
      "regular:relative regular:left-[57px]",
      "regular:relative regular:left-[57px]",
      "regular:relative regular:left-[40px]",
      "regular:relative regular:left-[23px]",
    ],
  },
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
  rotate,
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
  // hand.md r3 / ADR-0036 decision 4: floor at 4 (one row), never round up
  // to a fuller row while still inside one — the 4-card deal stays a
  // straight line of 4, not padded to 6. Only once the real signal
  // outgrows one row does the grid pad up to a full ROW_WIDTH multiple
  // (invisible filler cells beyond `highest`, same "one mark, one
  // meaning" rule r2 already established for the old even-rounding).
  const rawCount = Math.max(4, highest + 1)
  const slotCount = rawCount <= ROW_WIDTH ? rawCount : Math.ceil(rawCount / ROW_WIDTH) * ROW_WIDTH
  // rawCount <= ROW_WIDTH ? rawCount : ROW_WIDTH is always one of 4/5/6 —
  // see the GRID_COLS_CLASS/GRID_ROWS_CLASS comment above.
  const shortSide = Math.min(slotCount, ROW_WIDTH) as 4 | 5 | 6
  const occupied = new Set<number>(slots)
  const selected = new Set<number>(selectedSlots)
  const faceBySlot = new Map(faces.map((face) => [face.slotIndex, face]))
  const interactive = onSlotClick !== undefined && !inert
  const cardSize = variant === "own" ? "lg" : "md"
  // r3/ADR-0036 §5: the rotate class lives on the card VISUAL (below the
  // slot's flight anchor), never on the anchor div itself or anything
  // above it — the FLIP layer measures post-transform pixels, so a
  // rotated ancestor of an anchor would corrupt every flight the same way
  // ADR-0035 already forbids for scale. `regular:`-prefixed for the same
  // reason as GRID_ROWS_CLASS above: rotation is regular-only, so compact
  // renders every card upright regardless of `rotate` (M6 rendered-pass
  // finding — the unprefixed form leaked a 3-column rotated grid into the
  // compact fold and broke it outright at 3–4 players; caught by the
  // rendered path, not jsdom, exactly as ADR-0030 predicts).
  const cardRotateClass =
    rotate === "left" ? "regular:-rotate-90" : rotate === "right" ? "regular:rotate-90" : undefined
  const rotated = rotate !== undefined
  // Same `regular:`-only scope as `cardRotateClass` above — compact never
  // renders bench placement, so it keeps the upright `card-frame` even
  // when `rotate` is set (card-frame-rotated, packages/ui/src/styles.css).
  const frameClass = rotated ? "card-frame regular:card-frame-rotated" : "card-frame"
  const sizeClass = variant === "own" ? "card-lg" : "card-md"
  // The FLIGHT ANCHOR (data-slot-index) always reserves the UPRIGHT
  // card-frame footprint — same size whether or not this hand is
  // rotated — so a rotated card's `card-frame-rotated` visual (smaller in
  // both dimensions, since it fits width×height reversed inside the same
  // --card-width) lands centered inside a comfortably larger box instead
  // of a same-size one, which is what produced the near-zero clearance
  // the upright `card-frame` placeholder had. Centering only matters once
  // rotated (upright cards already fill their own anchor exactly).
  const anchorClass = cn("card-frame", sizeClass, rotated && "flex items-center justify-center")

  return (
    <div
      data-variant={variant}
      className={cn(
        // CAM-20 gate fix (compact, finding 4): the intra-hand gap used to
        // be the same 8px (`gap-2`) as the compact opponents row's
        // INTER-seat gap (table-surface.tsx), so a 4+4-card pair of
        // opponent hands read as one uniform 8-card strip with nothing
        // marking which cards belong to whom — a real legibility problem
        // in a hidden-information memory game. Tightened to 4px
        // (`gap-1`) at compact only; the freed width is spent on a wider
        // inter-seat gap instead (table-surface.tsx). Regular is
        // unaffected (`regular:gap-2`, unchanged).
        "grid w-fit gap-1 regular:gap-2",
        GRID_COLS_CLASS[shortSide],
        rotate !== undefined && GRID_ROWS_CLASS[shortSide],
        className,
      )}
    >
      {Array.from({ length: slotCount }, (_, slotIndex) => {
        const isOccupied = occupied.has(slotIndex)
        const face = faceBySlot.get(slotIndex)
        const awaiting = awaitingGiveSlot === slotIndex
        const anchor = slotAnchorId(playerId, slotIndex)
        // CAM-20 gate fix (finding 3), review fix cycle (F2): only the
        // first column (the one physically adjacent to the bench) follows
        // the crescent's arc, and the offset rides the ANCHOR div so the
        // flight anchor and the painted card move together — see
        // SIDE_BENCH_ARC_CLASS above.
        const sideBenchArcClass =
          rotate !== undefined && slotIndex < shortSide
            ? SIDE_BENCH_ARC_CLASS[rotate][shortSide][slotIndex]
            : undefined
        const visualClass = cn(cardRotateClass) || undefined
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
              className={cn("invisible block", anchorClass, sideBenchArcClass)}
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
              className={cn(anchorClass, sideBenchArcClass)}
            >
              <PlayingCard
                face="down"
                size={cardSize}
                inFlight
                rotated={rotated}
                {...(visualClass !== undefined ? { className: visualClass } : {})}
              />
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
              className={cn(anchorClass, sideBenchArcClass)}
            >
              <PlayingCard
                face="up"
                card={leaving.card}
                size={cardSize}
                leavingPlay
                rotated={rotated}
                {...(visualClass !== undefined ? { className: visualClass } : {})}
              />
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
            rotated={rotated}
            {...(visualClass !== undefined ? { className: visualClass } : {})}
          />
        ) : (
          <span
            aria-hidden
            className={cn(
              "block border-2 border-dashed border-ink-inverse/55",
              frameClass,
              variant === "own" ? "card-lg" : "card-md",
              visualClass,
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
            className={cn(anchorClass, sideBenchArcClass)}
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
