# CAM-27 — Compact game screen: flex residue leaves growing dead space above the dock at taller viewports

- **Linear:** [CAM-27](https://linear.app/raafayk7/issue/CAM-27/compact-game-screen-flex-residue-leaves-growing-dead-space-above-the)
- **Scope:** frontend
- **Child plans:** [frontend](../frontend/CAM-27.md)
- **ADRs:** [0038](../../adr/0038-compact-table-art-fluid-flex-sizing-not-fixed-token.md) — compact table art sizes fluidly via container-query units, not a fixed pixel token (extends 0035)

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

Today, at compact viewport widths (<720px) taller than 640px — the one
height CAM-21 ever validated — the game screen's table region leaves a
growing band of dead, non-scrolling space between the table and the
own-hand dock, scaling roughly 1:1 with excess height (confirmed at
360×770 and 421×770, ~200px each). After this task, a player on any
compact device, at any height, sees the table itself grow to fill that
space instead — verifiable by opening the game screen in DevTools at
360×640 (unchanged), then dragging the viewport taller (e.g. to 360×900
or 360×1400) and watching the table art grow rather than a gap opening
above the dock.

## Context & orientation

- [apps/web/src/containers/game/game-screen.tsx](../../../apps/web/src/containers/game/game-screen.tsx) —
  the game screen. The compact flex chain: screen wrapper (`max-h-dvh`,
  line ~1089) → stage root (`flex-1 min-h-0`, line ~612) → `table-root`
  (`data-region="table-root"`, `flex-1 min-h-0`, line ~686) →
  `table-scroll` (`data-region="table-scroll"`, `flex-1 min-h-0
overflow-y-auto`, line ~690) → `TableSurface`. `table-scroll` is the
  box that grows past its fixed-size content today.
- [apps/web/src/components/game/table-surface.tsx](../../../apps/web/src/components/game/table-surface.tsx) —
  renders the table. At compact (`viewerSeat="external"`, the game
  screen's docked composition), the painted art block was capped at
  `max-w-(--size-table-art-compact)` = a fixed 158px — the one element
  that actually created the residue. **As shipped** (revised
  mid-implementation, see ADR-0038 and this doc's Surprises): the art is
  now two elements — `data-region="table-art-frame"` (a real flex item,
  `container-type: size`) wrapping `data-region="table-art"` (the actual
  square, sized via `width: min(100%, 100cqh)`) — because a single
  element combining flex-grow with `aspect-square`/`max-width` does not
  stay square once the width ceiling binds (confirmed live, not just
  theoretical).
- [packages/ui/src/styles.css:68-107](../../../packages/ui/src/styles.css) —
  `--size-table-art-compact: 158px`, a bare (non-`@theme`) custom
  property with a long comment documenting its CAM-21/CAM-20 tuning
  history against the 640px reference height. This task turns it from a
  cap into a floor (ADR-0038).
- [apps/web/src/components/game/table-geometry.ts](../../../apps/web/src/components/game/table-geometry.ts) —
  `TABLE_DISC_FRACTION` (0.54) and every other geometry constant here are
  fractions of the art's own box or of the (regular-only) square
  container, not pixel constants — they stay correct at any art size.
  Bench-position math (`BENCH_POSITION_CLASS`) is `regular:`-only and
  inert at compact; untouched by this task.
- Card sizing (`card-lg`/`card-md`/`card-sm`, `packages/ui/src/styles.css:284-307`,
  consumed by `hand.tsx`, `draw-deck.tsx`, `discard-pile.tsx`,
  `held-card.tsx`) is a flat two-step breakpoint jump, decoupled from
  the art's box size (the deck/discard center overlay sizes itself as a
  **percentage of the art's rendered box** via `TABLE_DISC_PCT`, so it
  already tracks a fluid art size automatically — only the fixed-px
  cards resting inside it do not, and this task leaves them fixed by
  decision, see Decision Log).
- [apps/web/src/containers/room/room-screen.tsx](../../../apps/web/src/containers/room/room-screen.tsx) —
  the room screen's table (`viewerSeat="internal"`, default path). Not
  inside any height-bounded flex chain (no `max-h-dvh`, no `flex-1
min-h-0`) — a normal scrollable, width-driven document. Structurally
  incapable of this bug; explicitly out of scope (Decision Log).
- Governing ADRs: [0035](../../adr/0035-compact-fit-token-css-sizing-no-transform-scale-above-flight-root.md)
  (token-driven CSS sizing; `transform: scale()` prohibited above the
  flight-measurement root — confirmed during this task's exploration
  that a real, non-transform size change introduces no FLIP-math
  hazard) and [0036](../../adr/0036-four-player-cap-bench-anchored-table-layout.md)
  (bench-anchored layout, `regular:`-only, inert at compact). This task
  adds [0038](../../adr/0038-compact-table-art-fluid-flex-sizing-not-fixed-token.md).
- Skills: `frontend-architecture` (client-as-projection-renderer — this
  is a pure layout/CSS change, no contract or view-model touched),
  `design-system` (the art size is a documented token; its semantics
  change needs a `table-surface.md`/`tokens.md` revision entry, per
  ADR-0027's "divergence is a defect").
- Not touched: `apps/api`, `packages/domain`, `packages/application`,
  `packages/contracts` — this is a pure `apps/web`/`packages/ui` CSS and
  markup change with no behavior, contract, or game-rule implications.

## Functional contract

1. At the compact breakpoint (<720px), on the game screen's docked
   composition, at the 360×640 reference viewport, the table art never
   renders smaller than 158px (the CAM-21-validated floor) and the layout
   is otherwise structurally unchanged (same regions, same DOM
   containment, no page-level scroll). **Amended during implementation
   (see Decision Log):** the art is NOT pinned to exactly 158px at this
   height — CAM-20's own investigation found ~53–70px of dead space
   already present at 640px under the old fixed cap ("accepted flex
   residue," CAM-21's term), and clause 3 requires that closed too, same
   as any other compact height. 158px is a floor, never an exact value
   this task guarantees at any specific height.
2. At compact viewport heights above the CAM-21 floor, the table art's
   rendered box grows to track the additional available height (does not
   stay pinned at any fixed size), up to the point described in clause 4.
3. At any compact height, no unclaimed dead space appears between the
   table region and the own-hand dock beyond ordinary token-driven gaps
   — the `table-scroll` flex box's rendered content fills the box it
   occupies.
4. Once the art's growth would require its width to exceed the available
   column width (a square asset can only grow as far as the narrower of
   the two dimensions allows), further height growth stops; any
   remaining vertical space is distributed as symmetric margin above and
   below the table content (vertical centering), never as a single gap
   immediately above the dock. **As shipped:** this centering lives on
   the art's own flex-grown frame (`data-region="table-art-frame"`), not
   on `table-scroll` — neither `table-scroll` nor the `TableSurface` root
   ever has leftover space of its own to redistribute, since the frame's
   growth always consumes exactly what they leave; the frame is the one
   element that ends up taller than its own (now width-capped) content.
5. Card sizes — deck, discard pile, held card, and every hand card — are
   unchanged at compact (`card-lg`/`card-md`, existing fixed values) at
   every height; only the table art (and its disc/center-overlay, which
   already scales as a percentage of the art's box) grows.
6. No element from any flight anchor up through `tableRoot` carries a
   `transform`, `scale-*`, or `rotate-*` class or inline style — the
   existing ADR-0035/0036 no-transform sweep in `game-screen.test.tsx`
   passes unmodified.
7. The regular (≥720px) breakpoint's existing fluid table layout
   (`regular:flex-1`/`regular:min-h-0`/`regular:max-w-4xl`, CAM-20 M5) is
   byte-identical to today — the existing "fluid regular table (CAM-20
   M5)" test in `game-screen.test.tsx` passes unmodified.
8. The room screen's compact table (`viewerSeat="internal"`) is
   byte-identical to today — zero diff to `room-screen.tsx` or the
   default `TableSurface` rendering path.
9. `table-geometry.ts`'s bench-position math and `table-geometry.test.ts`
   are unaffected (compact never exercises bench percentages).

### Acceptance criteria

- [x] Clauses 1–9 above hold, verified per the Validation section below.
- [x] `pnpm turbo build typecheck lint test` passes.
- [x] `design-system/components/core/table-surface.md` and
      `design-system/references/tokens.md` carry a new revision entry
      describing the token's cap→floor semantics change (ADR-0027:
      divergence is a defect).

## Plan of work

**M1 — Fluid compact art sizing (ADR-0038).** Replace the compact art's
fixed `max-w-(--size-table-art-compact)` cap with real, container-query-
driven sizing. **As shipped** (revised mid-implementation — a plain
flex-grow + `aspect-square` + `max-width` attempt does not hold a square
once the width ceiling binds, confirmed live, see ADR-0038 and this
doc's Surprises): the art splits into an outer flex-grown frame
(`container-type: size`) and an inner square sized as
`width: min(100%, 100cqh)`, so the browser resolves the height-vs-width
tension with no JS or magic constant. `--size-table-art-compact` changes
from a max-width cap to a `min-width`/`min-height` floor (158px,
preserving the CAM-21 reference as a lower bound — no longer an exact
value guaranteed AT 640px, see the amended clause 1). The frame
vertically centers the square so any leftover past the width ceiling
reads as intentional margin. Card sizes, the room screen, and every
`regular:`-scoped class are untouched.

**M2 — Structural test coverage.** Add a compact-scoped fluid-sizing
assertion mirroring the existing regular "fluid table (CAM-20 M5)" test
(so both breakpoints have an explicit structural pin), and re-confirm
the existing ADR-0035/0036 no-transform sweep still passes untouched
(clause 6) — no new transform/scale/rotate class is introduced anywhere
in this change.

**M3 — Rendered verification.** jsdom cannot measure real layout
(ADR-0030), so this task's actual height-fit claims are verified live
against a dev server, not just unit tests: the two existing reference
viewports (360×640 compact — confirm zero regression and zero page-level
scroll at 2–4 players, same as CAM-21's invariant; 1280×900 regular —
confirm byte-identical), the two heights that reproduced the bug
(360×770 and 421×770 — confirm the dead space is gone), and one stress
case at an extreme aspect ratio (e.g. 360×1400) to confirm the
width-ceiling/vertical-centering fallback from clause 4 behaves as
decided rather than reintroducing an ugly gap.

**M4 — Canon and gate.** Update `table-surface.md` (new revision) and
`tokens.md` to document the cap→floor semantics change; confirm
ADR-0038 and the ADR index are consistent; run the full gate.

## Validation

- Unit/component tests: the new compact fluid-sizing assertion (M2), plus
  the full existing `game-screen.test.tsx` and `table-geometry.test.ts`
  suites passing unmodified (clauses 6, 7, 9).
- Manual rendered passes at the viewports listed in M3, screenshotted or
  measured live (the same discipline ADR-0030/AGENTS.md require for any
  layout claim in this codebase) — this is the only way to actually
  confirm clauses 1–4 and 8, since jsdom has no real layout engine.
- `pnpm turbo build typecheck lint test` green.

## Progress

- [x] 2026-09-07 — plan drafted and approved.
- [x] 2026-09-07 14:20 — M1 implemented: token role change (styles.css),
      `table-scroll` real flex column, `TableSurface` root claims compact
      height, art frame/square split with container-query sizing (revised
      mechanism, see Surprises). Compile checkpoint green (existing 250
      web + 25 ui tests unaffected).
- [x] 2026-09-07 14:45 — M2 implemented: 4 new structural tests in
      `game-screen.test.tsx` (root flex item, `table-scroll` flex column,
      art frame as query container, art square sizing/regular restore),
      plus a no-transform-sweep test for the new frame/square pair. Full
      suite: 91/91 in the two touched test files, 255 web + 25 ui overall.
- [x] 2026-09-07 15:10 — M3 rendered verification, live dev server
      (Postgres + api + web, a real 2-player game): 360×640 (293.5×293.5
      square, was 158×158, zero page scroll — clause 1 amended, see
      Decision Log), 1280×900 (607.125×607.125, byte-identical to
      pre-change code via a stashed A/B comparison), 360×770 and 421×770
      (328×328 and 389×389, symmetric ~47.7px/~17.3px margins, zero page
      scroll — the reported bug's dead space is gone), 360×1400 stress
      case (328×328, symmetric ~362.75px margins). All five: zero
      page-level scroll (`document.documentElement.scrollHeight ===
window.innerHeight`).
- [x] 2026-09-07 15:20 — M4: design-system canon update
      (`table-surface.md` r7, `tokens.md`), ADR-0038 rewritten to reflect
      the corrected mechanism. Full gate green:
      `pnpm turbo build typecheck lint test`, 9/9 tasks, exit 0.

## Decision log

- 2026-09-07 — Room screen (`viewerSeat="internal"`) left untouched —
  user call (CAM-27 interview r2), confirmed by exploration: it has no
  height-bounded flex chain and is structurally incapable of this bug,
  so "the same class of fix" does not apply to it.
- 2026-09-07 — Card sizes (deck, discard, held card, hand) stay fixed at
  compact rather than scaling with the growing table — user call (CAM-27
  interview r2): simpler, no existing precedent for fluid card-size
  tokens, and mirrors that physical cards don't resize with a bigger
  table.
- 2026-09-07 — Compact table art sizes via native flex/aspect-ratio
  layout rather than `clamp()` or JS/`ResizeObserver` measurement, with
  `--size-table-art-compact` becoming a floor instead of a cap, and
  `table-scroll` vertically centering to absorb any residual past the
  width ceiling — promoted to [ADR-0038](../../adr/0038-compact-table-art-fluid-flex-sizing-not-fixed-token.md)
  (user sign-off, CAM-27 interview r3): meets the ADR bar (new pattern,
  real alternatives considered and rejected, deviates from the
  documented fixed-token convention).
- 2026-09-07 — No arbitrary upper height cutoff — user call (CAM-27
  interview r1): the mechanism itself must scale correctly at any
  compact height, not just up to a chosen device ceiling (CAM-21's own
  360×640 pin was a validated floor, not a design constraint to keep
  reproducing at a new number).
- 2026-09-07 (implementation, rendered verification) — Clause 1 amended:
  the art is not pinned to exactly 158px at 360×640 — the live rendered
  pass measured it at ~293px there, because the reference height itself
  already had ~53–70px of the same unclaimed-slack bug (CAM-20's own
  investigation, "accepted flex residue" at the one height CAM-21 ever
  tested) which clauses 2–4 require closing too, same as any other
  compact height. The original clause 1 wording ("renders at 158px, no
  regression") was a planning-time assumption that conflicted with
  clauses 2–4 once actually measured — jsdom couldn't catch this (no
  real layout), only the rendered pass could. User call (implementation
  interview): let the art grow at 640px too rather than special-casing
  that one height to hold the old (buggy) 158px rendering; 158px is now
  purely a floor, never an exact value this task guarantees.
- 2026-09-07 (implementation) — Corrected the sizing mechanism from a
  single flex-grow/`aspect-square`/`max-width` element to a two-element
  frame+square split using CSS container query size units
  (`container-type: size`, `width: min(100%, 100cqh)`) — user sign-off
  (implementation interview): the first mechanism does not hold a square
  once the width ceiling binds (confirmed live, not theoretical).
  ADR-0038 rewritten to describe the corrected mechanism as the actual
  decision, including a real engine quirk found along the way
  (`container-type: size` + Tailwind's `flex-1`, a _percentage_
  flex-basis, nested two flex-grow levels deep, resolves `cqh` to 0 in
  descendants — fixed by using a literal `0px` basis, `grow basis-[0px]`,
  instead).

## Surprises & discoveries

- Exploration found the room screen's compact table is not inside any
  height-bounded flex chain at all (width-driven, normal document flow)
  — the initial framing of "both screens need the same class of fix"
  (interview r1) turned out to rest on an assumption exploration
  disproved; surfaced back to the user in interview r2, which narrowed
  scope to the game screen only.
- A square art element cannot grow to consume arbitrary excess height
  forever — once its width would need to exceed the viewport's own
  width, growth must stop. "Unbounded, zero dead space at any height"
  (interview r1) is therefore satisfied for the realistic device range
  but not for pathological aspect ratios (e.g. 360×3000); the
  width-ceiling/vertical-centering fallback (clause 4, ADR-0038) is the
  agreed answer for that edge, not a gap in the fix.
- **Mechanism failure #1 (caught live, not by jsdom):** the originally
  planned single-element `flex-1` + `aspect-square` + `w-auto` +
  `max-w-full` did not hold a square once the width ceiling bound.
  Measured at 360×770: 328×423.5px, a visibly stretched rectangle, even
  though `getComputedStyle` confirmed every individual class was
  correctly applied (`aspect-ratio: 1 / 1`, `max-width: 100%`). The
  browser resolves a flex item's `flex-grow` main size independently of
  a later cross-axis `max-width` clamp and never re-derives the main
  size backward through `aspect-ratio` once that clamp binds. No plain
  CSS primitive expresses "grow to the smaller of available width or
  height, then stay square" without container query size units — this
  became the corrected mechanism (user sign-off), documented as the
  actual decision in ADR-0038 (the original single-element approach is
  now listed there as a rejected alternative, with evidence).
- **Mechanism failure #2 (caught live, root-caused by isolated
  reproduction):** after splitting into an outer frame
  (`container-type: size`) and an inner square
  (`width: min(100%, 100cqh)`), the square still collapsed to its
  158px floor at 360×770 (should have been 328px). Root-caused by
  building up isolated test cases directly in the browser: a
  `container-type: size` element sized via Tailwind's `flex-1`
  (`flex: 1 1 0%`, a _percentage_ basis) resolves `cqh` queries in its
  descendants to `0` when that element is ITSELF nested inside another
  flex-grow layer (exactly this task's structure — the frame sits inside
  `TableSurface`'s root, itself flex-grown from `table-scroll`) — even
  though the frame's own `getBoundingClientRect()` reports the correct
  height throughout. Reproduced with a synthetic two-level flex-grow
  chain outside this component tree, confirming a genuine, reproducible
  engine behavior rather than a mistake in this file's classes. Fixed by
  using a literal `0px` flex-basis (`grow basis-[0px]`) instead of
  Tailwind's `flex-1` on the frame only — numerically identical, but the
  container then reports its real size to `cqh` queries correctly.
  Neither `table-scroll` nor the `TableSurface` root needed this
  change, since neither of them is itself a `container-type: size`
  element.

## Outcomes & retrospective

_(filled by `/review`)_
