import { cn } from "@cambio/ui"
import type * as React from "react"

import tableArt from "../../assets/table-top.webp"
import { benchAssignment, type Bench, TABLE_DISC_FRACTION } from "./table-geometry.js"

/**
 * TableSurface — design-system/components/core/table-surface.md (r7).
 * Class: Game object.
 *
 * The top-down khoka table: the moodboard's own painted asset (a
 * regeneration of docs/design/moodboard/lums-illustrated/image7.jpg —
 * weathered planked tabletop, umbrella hole, four CURVED benches
 * hugging the table, cast shadows baked into the alpha; CAM-17 art
 * revision). The art is static SCENERY — always four benches — but as of
 * ADR-0036 the metaphor is load-bearing: the game caps at 2–4 players and
 * every seat anchors to one of the four benches (`benchAssignment`,
 * table-geometry.ts), the viewer always bottom. `BENCH_POSITION_CLASS` /
 * `BENCH_ANCHOR_CLASS` below place and orient each bench as a static
 * class map — no radial/polar placement remains in the rendered output.
 * Below the `regular` breakpoint the arrangement compresses: opponents
 * wrap along the top in a flat row, the viewer's seat docks at the bottom
 * (F4.2). Ground, not HUD — it displays no derived game facts.
 *
 * TABLE_DISC_PCT is the tabletop disc's measured share of the asset's
 * width, read from `table-geometry.ts` — spec-carried geometry, measured
 * from the alpha channel: the center overlay and scrim size to the disc,
 * not the asset.
 */
const TABLE_DISC_PCT = `${TABLE_DISC_FRACTION * 100}%`
export interface TableSurfaceProps {
  /** Seat nodes ordered by seat index (wire order). */
  seats: ReadonlyArray<React.ReactNode>
  viewerSeatIndex: number
  /** Table center: draw-deck + discard-pile (+ slam-timer when open). */
  center?: React.ReactNode
  state?: "seating" | "in-game" | "game-over"
  /**
   * How a seat node hangs on its bench anchor (table-surface.md r3, r5).
   * `center` (default, the room screen's pre-game view): the node is
   * centered on the anchor — right for a lone seat pill. `edge` (the game
   * screen): the node's outboard edge sits at the anchor and the node grows
   * INWARD toward the table center — required once hands hang off seats,
   * because a centered seat+hand group escapes the container into the
   * chrome above it (CAM-18 gate finding: the group's overshoot occluded
   * the turn indicator and the Call Cambio control).
   */
  seatAnchor?: "center" | "edge"
  /**
   * Whether the viewer's own seat renders inside this component (CAM-21).
   * `"internal"` (default) is the room screen's pre-game view — every seat,
   * own included, renders here. `"external"` selects the game screen's
   * DOCKED COMPOSITION: the viewer's own hand lives in the screen's bottom
   * dock, so this component skips it (while still deriving every position
   * from the full `seats.length`) and the screen renders it itself, reusing
   * the same geometry. The compact fold-fit values ride this same switch
   * (review F1): the art max-width cap and the tightened root gap exist to
   * close the docked composition's fold budget and apply ONLY under
   * `"external"` — the default path (the room screen) keeps the uncapped
   * `w-3/4` art and `gap-4`, byte-for-byte its pre-CAM-21 rendering.
   */
  viewerSeat?: "internal" | "external"
  className?: string
}

// ---- Bench anchoring (ADR-0036, decision 2): static class maps, not
// inline ring percentages — a bench's on-screen spot never depends on
// seat count, only on WHICH seat occupies it (benchAssignment above
// decides that part). Exported so the game screen's extracted own-seat
// wrapper (decision 3) reuses the same `bottom` POSITION entry instead of
// reproducing a geometry call. Its TRANSLATE deliberately diverges from
// `BENCH_ANCHOR_CLASS.bottom` by the gate-fix 4px nudge (review F10f) —
// scoped to the dock only, documented and pinned at game-screen.tsx /
// game-screen.test.tsx; the shared constant stays un-nudged for
// TableSurface's own internal seatWrapper (room screen). -------------------

/** Each bench's fixed spot on the square container: top/bottom center the
 * anchor horizontally at `BENCH_INSET_PCT` from the respective edge;
 * left/right do the same vertically. `8.5%`/`91.5%` are `50 ∓
 * BENCH_INSET_PCT` (41.5, table-geometry.ts) — literal, not computed,
 * because Tailwind's build-time scanner needs the arbitrary-value class
 * text to appear verbatim in source; `table-geometry.test.ts` asserts these
 * class strings contain `50 ∓ BENCH_INSET_PCT` verbatim, so an
 * art-proportion change fails the suite instead of silently stranding the
 * literals (review F4 — the previous wording here claimed that guard while
 * the test only pinned the constant against its own definition). */
export const BENCH_POSITION_CLASS: Record<Bench, string> = {
  top: "regular:top-[8.5%] regular:left-1/2",
  bottom: "regular:top-[91.5%] regular:left-1/2",
  left: "regular:top-1/2 regular:left-[8.5%]",
  right: "regular:top-1/2 regular:left-[91.5%]",
}

/** Edge-anchor translate per PHYSICAL bench: the group's outboard edge
 * stays at the bench anchor, growth goes inward toward the table center —
 * for every bench EXCEPT the viewer's own (bottom). The bottom bench keeps
 * the fully centered translate: its dock hangs below the table with the
 * hand over the near bench (the hands-over-benches read the gate judged a
 * controlled break), because a full own-size hand grown inward would lie
 * across the tabletop and occlude the deck and discard. */
export const BENCH_ANCHOR_CLASS: Record<Bench, string> = {
  top: "regular:-translate-x-1/2",
  bottom: "regular:-translate-x-1/2 regular:-translate-y-1/2",
  left: "regular:-translate-y-1/2",
  right: "regular:-translate-x-full regular:-translate-y-1/2",
}

/** `seatAnchor="center"` translate — the room screen's pre-game view,
 * where every bench (any seat count) centers its lone seat pill on the
 * anchor point regardless of which physical bench it's on. */
const CENTER_ANCHOR_CLASS = "regular:-translate-x-1/2 regular:-translate-y-1/2"

export function TableSurface({
  seats,
  viewerSeatIndex,
  center,
  state = "in-game",
  seatAnchor = "center",
  viewerSeat = "internal",
  className,
}: TableSurfaceProps) {
  const benches = benchAssignment(seats.length, viewerSeatIndex)
  // Compact flow order: opponents (arc order after the viewer) → table →
  // own seat. At regular+ everything is absolutely positioned instead.
  const opponentOrder = Array.from(
    { length: Math.max(0, seats.length - 1) },
    (_, step) => (viewerSeatIndex + step + 1) % seats.length,
  )

  const seatWrapper = (seatIndex: number) => {
    const bench = benches[seatIndex] ?? "bottom"
    return (
      <div
        key={seatIndex}
        data-seat-index={seatIndex}
        // Hazard 1 (CAM-18 root plan): opponent wrappers sit earlier in DOM
        // order than the art container below, which is ALSO
        // `regular:absolute` — with both at the implicit z-index:auto,
        // paint order falls back to DOM order and the art (later) occludes
        // them. An explicit z-index wins over `auto` regardless of DOM
        // order, so it applies uniformly to opponent AND own wrappers
        // (own already happened to paint on top by DOM order alone).
        className={cn(
          "regular:absolute regular:z-10",
          BENCH_POSITION_CLASS[bench],
          seatAnchor === "edge" ? BENCH_ANCHOR_CLASS[bench] : CENTER_ANCHOR_CLASS,
        )}
      >
        {seats[seatIndex]}
      </div>
    )
  }

  return (
    <div
      data-state={state}
      className={cn(
        // Unconditionally relative (CAM-21, was `regular:relative`): the
        // compact docked composition needs this as a positioned ancestor
        // too, so the game-over full-region rest below scopes to the
        // surface at every breakpoint instead of escaping to whatever
        // positioned ancestor is next up the tree.
        "relative flex w-full flex-col items-center",
        // The tightened gap belongs to the DOCKED composition only (review
        // F1): it was minted at the M5 rendered pass to close the game
        // screen's fold budget (root plan Surprises: short at 160/64/gap-4)
        // and must not reach the room screen, whose default path keeps the
        // pre-CAM-21 gap-4. Compact-only in effect either way — regular
        // absolutely-positions every child, so flow gap never applies there.
        viewerSeat === "external" ? "gap-2" : "gap-4",
        "regular:mx-auto regular:aspect-square",
        // Fluid table (ADR-0036 decision 6, clause 9 at regular; CAM-27/
        // ADR-0038 extends the same idea to COMPACT), scoped to the
        // DOCKED composition only — the room screen's default `"internal"`
        // path keeps the pre-CAM-20 WIDTH-driven sizing (`w-full` inherited
        // from the unprefixed class above, capped `max-w-2xl`) byte-for-
        // byte (the CAM-21 review-F1 scope-guard lesson). `"external"`
        // instead makes this root a flex item of its parent (`table-scroll`,
        // game-screen.tsx, itself a real flex column since CAM-27) and lets
        // HEIGHT drive it: unprefixed `flex-1 min-h-0` claims whatever
        // vertical space the bounded stage leaves after the pinned
        // chrome/dock at COMPACT too (was regular-only before CAM-27) —
        // the art FRAME below (not this root) is what actually turns the
        // remainder, after the in-flow opponent row above it, into a
        // square; this root has no leftover space of its own to
        // redistribute (the frame's `grow` always consumes exactly what's
        // left), so it carries no `justify-center` of its own — that job
        // belongs to the frame, which centers the square within ITS OWN
        // box once the square's width ceiling binds (ADR-0038 clause 4).
        // At REGULAR, `w-auto`/`max-w-4xl` (an enumerated scale step, not
        // a new token) still do the same job `flex-1`/`min-h-0` do at
        // compact, one level up: CSS transfers the clamp back through
        // `aspect-ratio` when it binds, so the square respects whichever
        // axis is smaller. No `transform: scale` enters the chain
        // (ADR-0035); this is real CSS sizing only.
        viewerSeat === "external"
          ? "flex-1 min-h-0 regular:w-auto regular:flex-1 regular:min-h-0 regular:max-w-4xl"
          : "regular:block regular:max-w-2xl",
        className,
      )}
    >
      <div
        // CAM-20 gate fix (compact, finding 4): the horizontal gap BETWEEN
        // opponent seat groups used to match the gap INSIDE each hand
        // (`gap-2`, hand.tsx), so two adjacent 4-card hands read as one
        // continuous 8-card strip. Widened to `gap-x-5` (24px) — the
        // now-tightened hand width (`gap-1`, 4×32+3×4=140px) plus this
        // gap fits two opponent groups in 304px, under the 328px compact
        // content width (360px viewport minus the shell's px-4 padding) —
        // `gap-y` is untouched (`gap-2`/8px) since the CAM-21 wrapped
        // (2+1) compact layout's vertical fold budget was never the
        // problem this finding names. Regular is unaffected either way
        // (`regular:contents` dissolves this row there).
        className="flex flex-wrap justify-center gap-x-5 gap-y-2 regular:contents"
      >
        {opponentOrder.map(seatWrapper)}
      </div>

      {/* The painted table + benches (shadows baked into the asset);
          center content and scrim overlay the tabletop disc only.
          CAM-27/ADR-0038 (revised mid-implementation — see the plan's
          Decision Log and Surprises): split into an OUTER frame + an
          INNER square. A single element carrying `flex-1` (main-axis
          growth) AND `aspect-square`/`max-width` (cross-axis cap) does
          NOT stay square once the width ceiling binds — confirmed live
          (360×770 rendered 328×423.5px, visibly stretched) — because
          flex-grow resolves the main size independently and is never
          corrected back down by a later cross-axis clamp. Plain CSS has
          no "grow to the smaller of available width or height" primitive
          without container query SIZE units, so the OUTER frame becomes
          a size query container and the INNER square reads its resolved
          box back via `cqh` — real declarative CSS, still no JS
          measurement, still no clamp() magic number. */}
      <div
        data-region="table-art-frame"
        // OUTER: at compact/external, a real flex item that claims
        // table-root's available height and full available width,
        // marked `[container-type:size]` so the INNER square below can
        // query it. `display:contents` everywhere else (internal always;
        // external at regular) dissolves this wrapper entirely — zero
        // DOM/layout impact, matching `table-scroll`'s own
        // `regular:contents` idiom. Must NOT default to `contents` for
        // the external/compact case — that would remove it from
        // flex-item participation and defeat the growth — so the two
        // branches are fully separate class lists, not a shared base
        // plus an override.
        //
        // `grow basis-[0px]` (NOT Tailwind's `flex-1`, which is
        // `flex: 1 1 0%`) — a real, reproducible engine quirk (confirmed
        // live, CAM-27 rendered pass): a `container-type: size` element
        // whose own size comes from a PERCENTAGE (`0%`) flex-basis,
        // nested two flex-grow levels deep (this frame inside
        // TableSurface's root, itself flex-grown from `table-scroll`),
        // resolves `cqh` queries in its descendants to 0 — even though
        // the frame's own `getBoundingClientRect()` reports the correct,
        // fully-resolved height. Swapping the basis from `0%` to a
        // literal `0px` (identical numeric result, different value type)
        // makes the container correctly report its real size to `cqh`
        // queries. Scoped to this ONE element — `table-scroll` and the
        // `TableSurface` root above keep the ordinary `flex-1`/`min-h-0`
        // idiom unchanged, since neither of them is itself a
        // `container-type: size` element.
        //
        // `flex items-center justify-center`: the frame itself, not its
        // parent, is what centers the square once the square's OWN width
        // ceiling binds and it renders smaller than the frame's full
        // height (ADR-0038 clause 4) — the square is a plain block child
        // here, and `table-scroll`/the `TableSurface` root above never
        // have any leftover space of their own to redistribute (the
        // frame's `grow` always consumes exactly what they leave), so
        // centering has to live on the one element that actually ends up
        // taller than its own content.
        className={
          viewerSeat === "external"
            ? "flex grow basis-[0px] min-h-0 w-full items-center justify-center [container-type:size] regular:contents"
            : "contents"
        }
      >
        <div
          data-region="table-art"
          // INNER: the actual square. At compact/external,
          // `w-[min(100%,100cqh)]` is the true "biggest square that fits
          // the OUTER frame" — 100% never exceeds the frame's own width,
          // 100cqh never exceeds its resolved height (read via container
          // query units off the OUTER frame), and `aspect-square` derives
          // height from whichever of the two `min()` picked — a plain
          // width-then-aspect-ratio derivation, no flex-grow involved, so
          // the square holds regardless of which dimension binds.
          // `min-w`/`min-h` at the token floor preserve the CAM-21
          // 360×640 reference (158px — now a floor, not a cap, and no
          // longer a value this task guarantees exactly AT 640px, see the
          // root plan's amended clause 1). Regular restores today's
          // `w-3/4`-of-square-root sizing byte-for-byte (clause 7). The
          // default (room screen, `"internal"`) path takes no cap or
          // fluid sizing at all (review F1 — clause 9), keeping its
          // unconditional `w-3/4`.
          className={cn(
            "relative regular:absolute regular:top-1/2 regular:left-1/2 regular:-translate-x-1/2 regular:-translate-y-1/2",
            viewerSeat === "external"
              ? "aspect-square w-[min(100%,100cqh)] min-w-(--size-table-art-compact) min-h-(--size-table-art-compact) regular:aspect-auto regular:w-3/4 regular:min-w-0 regular:min-h-auto"
              : "w-3/4",
          )}
        >
          <img src={tableArt} alt="" aria-hidden className="block h-auto w-full" />
          <div
            className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
            // TABLE_DISC_PCT is spec-carried geometry from table-geometry.ts
            // (measured from the asset's alpha channel), not an arbitrary
            // value — a genuinely dynamic-looking style, documented per the
            // CAM-17 inline-style advisory.
            style={{ width: TABLE_DISC_PCT, aspectRatio: "1" }}
          >
            {center}
          </div>
          {state === "game-over" ? (
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--green-deep)/55"
              // Same spec-carried disc size as the center overlay above —
              // the scrim covers exactly the tabletop, not the whole asset.
              style={{ width: TABLE_DISC_PCT, aspectRatio: "1" }}
            />
          ) : null}
        </div>
      </div>

      {seats.length > 0 && viewerSeat === "internal" ? seatWrapper(viewerSeatIndex) : null}

      {state === "game-over" ? (
        // The full-region rest (table-surface.md r3): the disc scrim above
        // dims only the tabletop, which the score sheet then covers almost
        // entirely — so the whole surface (art, hands, seats, all z-10)
        // takes the green-deep rest too. z-20 sits above the seat layer
        // and below the screen-level score overlay (z-30).
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 bg-(--green-deep)/35"
        />
      ) : null}
    </div>
  )
}
