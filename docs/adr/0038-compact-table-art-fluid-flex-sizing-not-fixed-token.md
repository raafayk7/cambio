# 0038 — Compact table art sizes fluidly via container-query units, not a fixed pixel token

- **Status:** proposed
- **Date:** 2026-09-07
- **Task:** CAM-27

## Context

CAM-21 fit the compact (<720px) game screen to one validated viewport
(360×640) by giving the middle table region a flex chain
(`table-root` → `table-scroll`, both `flex-1 min-h-0`) and capping the
painted table art's box at a fixed pixel token,
`--size-table-art-compact: 158px` (`packages/ui/src/styles.css`),
hand-tuned against that one height's fold budget (deck+discard
clearance around the disc, opponent wrap, own-hand dock).

That fixed cap does not grow with the viewport. At any compact height
above 640px, `table-scroll`'s `flex-1` box keeps growing to fill the
screen wrapper's `max-h-dvh` bound, but the art inside it stays pinned
at 158px — the surplus renders as a non-scrolling, visually dead band
between the table and the own-hand dock, scaling roughly 1:1 with
excess height (CAM-27; first observed as a CAM-20 investigation
byproduct, confirmed byte-identical to `release-v0`, not a regression).

ADR-0035 already established the governing philosophy for this region
("real CSS sizes driven by tokens", `transform: scale()` prohibited on
any ancestor of the flight-measurement root) and confirmed that a real
(non-transform) size change to an element inside `tableRoot` introduces
no FLIP-math hazard — `getBoundingClientRect` reports the new true box
correctly regardless of what pixel value it currently holds. What 0035
left unresolved is _how_ a token-driven size should behave across the
open-ended range of compact heights above 640px; a single fixed pixel
value cannot.

A repo-wide sweep (CAM-27 exploration) found no existing precedent for
continuous, non-breakpoint-stepped real-CSS sizing anywhere in this
codebase: no `clamp()`/`min()`/`max()` used as a sizing function, no
container queries, no `ResizeObserver`- or `useLayoutEffect`-based
measurement hooks. `card-lg`/`card-md`/`card-sm` and every other
compact/regular size in this area are a flat two-step jump at the
`regular` breakpoint, not a continuous function of height.

**Revised mid-implementation.** The first mechanism attempted — a
single element carrying `flex-1` (to claim available height) plus
`aspect-square`/`w-auto`/`max-width: 100%` (to derive width from that
height, capped at the column) — does **not** hold a 1:1 square once the
width ceiling binds. Confirmed live: at 360×770 it rendered a visibly
stretched 328×423.5px rectangle, not a square, even though every
class's computed style was individually correct in isolation
(`aspect-ratio: 1 / 1`, `max-width: 100%`). The browser resolves a flex
item's main-axis size via `flex-grow` independently of its cross-axis
`max-width` clamp, and never re-runs the aspect-ratio derivation
backwards to shrink the already-resolved main size once the cross axis
gets capped. Plain CSS has no built-in "grow to the smaller of
available width or height, then stay square" primitive without
container query **size** units — the standard modern answer to
precisely this problem, and still real declarative CSS with no JS
measurement and no `clamp()` magic number, so it fits this ADR's intent
even though it wasn't the first mechanism proposed (user sign-off,
CAM-27 implementation interview, on the corrected direction).

## Decision

The compact table art's box is split into two elements and sized via
container query units, not a fixed token or flex-grow's own cross-axis
clamping:

- An **outer frame** becomes the real flex item: it claims whatever
  height `table-scroll` has available (`grow`, full width) and is
  marked a **size query container** (`container-type: size`).
  `display: contents` everywhere else (the room screen's `"internal"`
  path always; the docked composition at `regular`) dissolves it
  entirely — zero DOM/layout impact, the same idiom `table-scroll`
  already uses for its own `regular:contents`.
- An **inner square** (the actual art, disc overlay, and game-over
  scrim) sizes itself as `width: min(100%, 100cqh)` — never wider than
  the frame's own width, never taller (via the `100cqh` container-query
  height unit) than the frame's resolved height — with `aspect-ratio: 1`
  deriving the matching dimension. This is a plain width-then-
  aspect-ratio derivation with no flex-grow involved, so it holds
  regardless of which axis binds.
- The outer frame also centers the inner square (`flex`,
  `items-center`, `justify-content: center`) for the case where the
  square renders shorter than the frame's own flex-grown height (the
  width ceiling bound first) — turning the leftover into symmetric
  margin above and below, never a gap pinned above the dock. Neither
  `table-scroll` nor the `TableSurface` root above ever has leftover
  space of its own to redistribute (the frame's `grow` always consumes
  exactly what they leave), so centering has to live on the frame,
  where the leftover space actually appears.
- `--size-table-art-compact`'s value becomes a **floor** (`min-width`/
  `min-height: 158px` on the inner square), not a cap — preserving
  CAM-21's 360×640 reference as a lower bound. It is no longer an exact
  value this task guarantees AT 360×640 specifically: CAM-20's own
  investigation found ~53–70px of this same unclaimed-slack bug already
  present at 640px under the old fixed cap ("accepted flex residue"),
  which this fix closes there too (confirmed live: 293.5×293.5px at
  360×640, up from the old 158×158px, zero page-level scroll either
  way) — user call, CAM-27 implementation interview.
- **A real, reproducible engine quirk, found and fixed during
  implementation:** a `container-type: size` element whose own size
  comes from Tailwind's `flex-1` (`flex: 1 1 0%` — a _percentage_
  flex-basis), nested two flex-grow levels deep (this frame inside the
  `TableSurface` root, itself flex-grown from `table-scroll`), resolves
  `cqh` queries in its descendants to `0` — even though the frame's own
  `getBoundingClientRect()` reports the correct, fully-resolved height.
  Reproduced in isolation outside this component tree, so it is a
  genuine browser behavior, not a class-application mistake. Swapping
  the frame's flex-basis from `0%` to a literal `0px`
  (`grow basis-[0px]` instead of `flex-1`) — numerically identical,
  different CSS value _type_ — makes the container correctly report its
  real size to `cqh` queries. Scoped to this one element only;
  `table-scroll` and the `TableSurface` root keep the ordinary
  `flex-1`/`min-h-0` idiom unchanged, since neither of them is itself a
  `container-type: size` element.
- Card sizes (`card-lg`/`card-md`/`card-sm`, and therefore `DrawDeck`/
  `DiscardPile`/`HeldCard`/`Hand`) are explicitly **not** part of this
  mechanism and stay pinned at their existing fixed compact values — only
  the table art (and the disc/center-overlay that already sizes itself
  as a percentage of the art's own rendered box, `TABLE_DISC_PCT`) grows.
  User call (CAM-27 interview): simpler, no new fluid card-size token
  work, and mirrors that a bigger table doesn't make physical playing
  cards bigger.
- Scope: the game screen's docked composition (`viewerSeat="external"`)
  only. The room screen's pre-game table (`viewerSeat="internal"`) is
  not inside any height-bounded flex chain — it is a normal scrollable,
  width-driven document — and is structurally incapable of this bug, so
  it is explicitly left untouched (user call, CAM-27 interview).

Alternatives considered:

- **A single element combining `flex-1` + `aspect-square` + `w-auto` +
  `max-width: 100%`** — rejected: does not stay square once the width
  ceiling binds (see Context above) — confirmed live, not a theoretical
  concern.
- **CSS `clamp()` interpolating between a min and max px value** —
  rejected: requires a hand-tuned magic maximum, which either
  reintroduces a cap (contradicting the "any height, no cutoff" bar this
  task was given) or has to be set implausibly high; also duplicates
  work the layout engine already computes for free from the real
  available space.
- **JS/`ResizeObserver`-measured sizing** — rejected: no precedent
  anywhere in this codebase; adds real indirection for something
  declarative CSS already solves. `game-screen.tsx`'s own
  Call-Cambio-dock-offset comment already ruled out this approach for a
  similarly-shaped problem, citing the same "no measurement hook exists,
  `window.matchMedia` isn't polyfilled in jsdom" reasoning.
- **Bump the fixed token to a larger fixed pixel value** — rejected:
  does not scale continuously; only moves the height threshold at which
  the exact same bug reappears.
- **Let the middle region scroll instead of filling** — rejected: 0035
  already rejected scrolling as the compact game screen's default-state
  answer (it survives only as below-floor overflow degradation); reusing
  it here would trade a visible dead gap for an invisible one behind a
  non-obvious scroll affordance — the same symptom, better hidden.

## Consequences

- Easier: any future compact-height edge case in this region is handled
  by the same container-query mechanism with zero new magic constants;
  the 158px token's only remaining job is documenting and enforcing the
  CAM-21 floor, which is easier to reason about than a cap that silently
  stops being correct past one height.
- Harder: this is the first container-query mechanism in the codebase —
  the next person to reach for `clamp()`, a plain flex-grow +
  aspect-ratio attempt, or a similar technique elsewhere should know
  this precedent, its `cqh`-on-flex-item pitfall, and the
  `grow basis-[0px]` workaround exist here first, rather than
  re-discovering the engine quirk from scratch. Introducing a size query
  container also means one extra wrapping DOM element
  (`data-region="table-art-frame"`) around the art on the docked
  composition, dissolved to zero impact everywhere else via
  `display: contents`.
- Committed to: the disc/deck/discard/hand proportions look different at
  very tall compact viewports than at 640px (a visibly larger table
  against fixed-size cards) — an accepted, deliberate tradeoff, not a
  latent bug; the width-ceiling/centering behavior described above is
  the intended fallback for viewports where the art can't grow further.
  The 640px reference viewport itself now renders a bigger table than
  before this task (293.5px vs. the old 158px) — a deliberate
  consequence of closing the same class of bug there too, not a
  regression.
- Revisit if: card sizes are ever asked to scale in tandem with the
  table art (would need a new fluid card-size mechanism, none exists
  today), if the room screen's compact table is ever reported as having
  its own space-distribution problem (it uses a fundamentally different,
  non-height-bounded layout and was explicitly out of this decision's
  scope), or if a future browser update changes the `cqh`-on-percentage-
  flex-basis behavior this ADR works around (re-test before removing the
  `basis-[0px]` workaround).
