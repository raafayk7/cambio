import { cn } from "@cambio/ui"
import type { CardSlug } from "@cambio/contracts"

/**
 * PlayingCard — design-system/components/core/playing-card.md (r1).
 * Class: Game object. The atom of the game.
 *
 * ENTITLEMENT IS STRUCTURAL (root plan F3.3): the face-down variant has
 * no card field at all — mirroring the wire, where an unentitled payload
 * simply lacks the value (ADR-0021). There is no "face-down but value
 * present" prop shape, and rendering is a pure function of props, so a
 * card whose peek ended is indistinguishable from one never peeked
 * (memory fidelity, F3.4).
 *
 * The seven-state floor: face-down · face-up · peeking · selected ·
 * slam-eligible · in-flight · leaving-play — each designed, none an
 * animation accident. All motion: ease.snap, the two durations only;
 * reduced motion collapses the flip to a cross-fade (the highlight on
 * origin/destination slots is the moving container's job).
 */
type FaceProps =
  { face: "down" } | { face: "up"; card: CardSlug } | { face: "peeking"; card: CardSlug }

export type PlayingCardProps = FaceProps & {
  /** lg = own hand · md = opponents/piles · sm = score-sheet mini. */
  size?: "lg" | "md" | "sm"
  selected?: boolean
  /** Slam window open: pulsing alarm edge. Public on backs; the discard
   * pile reuses it as the slam-target frame on its face-up top. */
  slamEligible?: boolean
  inFlight?: boolean
  leavingPlay?: boolean
  className?: string
}

const SUIT_GLYPHS = { S: "♠", H: "♥", D: "♦", C: "♣" } as const
type Suit = keyof typeof SUIT_GLYPHS

function splitSlug(card: CardSlug): { rank: string; suit: Suit } {
  const rank = card.slice(0, -1)
  const suit = card.slice(-1) as Suit
  return { rank: rank === "T" ? "10" : rank, suit }
}

export function PlayingCard(props: PlayingCardProps) {
  const {
    size = "md",
    selected = false,
    slamEligible = false,
    inFlight = false,
    leavingPlay = false,
    className,
  } = props
  const showFace = props.face !== "down"
  const parsed = props.face === "down" ? undefined : splitSlug(props.card)
  const sizeClass = size === "lg" ? "card-lg" : size === "sm" ? "card-sm" : "card-md"

  return (
    <div
      data-face={props.face}
      data-selected={selected ? "true" : undefined}
      data-slam-eligible={slamEligible ? "true" : undefined}
      data-in-flight={inFlight ? "true" : undefined}
      data-leaving-play={leavingPlay ? "true" : undefined}
      className={cn(
        // motion-reduce: state transitions jump — the lifted/rotated state
        // itself survives, only the movement goes (tokens.md §Motion).
        "card-frame relative transition duration-snap ease-snap perspective-normal motion-reduce:transition-none",
        sizeClass,
        // selected: lift + accent.focus ring — same visual language as
        // keyboard focus (playing-card.md state 4; review finding R3a).
        selected &&
          "z-10 -translate-y-1 outline-3 outline-offset-2 outline-accent-focus outline-solid",
        (inFlight || leavingPlay) && "z-20 duration-track",
        leavingPlay && "rotate-6",
        className,
      )}
    >
      <div
        className={cn(
          // Reduced motion: the 3D flip collapses to a cross-fade
          // (playing-card.md; review finding R2) — the flipper never
          // rotates and the two faces swap by opacity instead.
          "relative size-full transition-transform duration-snap ease-snap transform-3d motion-reduce:transition-none motion-reduce:transform-none",
          showFace && "rotate-y-180",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 border-interactive card-frame card-back-mark backface-hidden",
            "motion-reduce:transition-opacity motion-reduce:duration-snap motion-reduce:ease-snap",
            showFace ? "motion-reduce:opacity-0" : "motion-reduce:opacity-100",
            selected || inFlight || leavingPlay ? "shadow-float" : "shadow-raised",
          )}
        />
        <span
          className={cn(
            "absolute inset-0 rotate-y-180 border-interactive card-frame bg-surface-raised backface-hidden",
            "motion-reduce:transition-opacity motion-reduce:duration-snap motion-reduce:ease-snap motion-reduce:transform-none",
            showFace ? "motion-reduce:opacity-100" : "motion-reduce:opacity-0",
            selected || inFlight || leavingPlay ? "shadow-float" : "shadow-raised",
          )}
        >
          {parsed !== undefined ? (
            <>
              <span className="absolute top-1 left-1 font-display card-rank text-ink-primary">
                {parsed.rank}
              </span>
              <span
                className={cn(
                  "absolute right-1 bottom-1 card-pip leading-none",
                  parsed.suit === "H" || parsed.suit === "D"
                    ? "text-accent-suit-red"
                    : "text-ink-primary",
                )}
              >
                {SUIT_GLYPHS[parsed.suit]}
              </span>
            </>
          ) : null}
        </span>
        {slamEligible ? (
          <span
            aria-hidden
            className="absolute inset-0 border-2 border-accent-alarm card-frame animate-pulse-soft"
          />
        ) : null}
      </div>
    </div>
  )
}
