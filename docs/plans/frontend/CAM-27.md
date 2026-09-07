# CAM-27 — Compact game screen: flex residue leaves growing dead space above the dock at taller viewports (frontend)

- **Root plan:** [root/CAM-27.md](../root/CAM-27.md) — the functional
  contract lives there; this document is implementation detail for the
  frontend side (the only side this task touches).

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

This is a pure `apps/web` / `packages/ui` CSS-and-markup change (ADR-0038):
no route, contract, view-model, or use case is touched, so
`frontend-architecture`'s projection-renderer rule is satisfied trivially —
there is no business logic here to accidentally migrate into a container.
`design-system` applies because `--size-table-art-compact` is a documented
token whose role changes (cap → floor); ADR-0027 ("divergence is a defect")
requires the design-system docs to carry that change, not just the code.

Files this side touches, current state as re-read for this plan. **Note
(added at close-out):** the line numbers and code excerpts below are the
PRE-implementation state (what this plan was written against); several
shifted once the fix landed. The Plan of Work section's "As shipped"
notes carry the final, as-built classes and structure — treat those,
and the linked files themselves, as authoritative over the numbers here:

- [apps/web/src/containers/game/game-screen.tsx](../../../apps/web/src/containers/game/game-screen.tsx) —
  the `table-scroll` div, currently line 688-691:
  ```
  <div
    data-region="table-scroll"
    className="w-full flex-1 min-h-0 overflow-y-auto regular:contents"
  >
    <TableSurface ... viewerSeat="external" ... />
  </div>
  ```
  It wraps `table-root`'s scrollable half (line 675-747, `table-root` itself
  is `relative flex w-full flex-1 min-h-0 flex-col items-center gap-2
regular:order-9`). Below `table-root`'s scroll wrapper sits the extracted
  own-seat dock (`shrink-0`, line ~782), untouched by this task.
- [apps/web/src/components/game/table-surface.tsx](../../../apps/web/src/components/game/table-surface.tsx) —
  the root (line 154-192):
  ```
  <div
    data-state={state}
    className={cn(
      "relative flex w-full flex-col items-center",
      viewerSeat === "external" ? "gap-2" : "gap-4",
      "regular:mx-auto regular:aspect-square",
      viewerSeat === "external"
        ? "regular:w-auto regular:flex-1 regular:min-h-0 regular:max-w-4xl"
        : "regular:block regular:max-w-2xl",
      className,
    )}
  >
  ```
  Today this root carries **no unprefixed `flex-1`/`min-h-0`** — those exist
  only under `regular:`. At compact it is a plain block-flow flex column
  that sizes to its own content, which is exactly why the fixed art cap
  below is the only thing pinning its height.
  The art block (line 212-222):
  ```
  <div
    className={cn(
      "relative w-3/4 regular:absolute regular:top-1/2 regular:left-1/2 regular:-translate-x-1/2 regular:-translate-y-1/2",
      viewerSeat === "external" && "max-w-(--size-table-art-compact) regular:max-w-none",
    )}
  >
    <img src={tableArt} alt="" aria-hidden className="block h-auto w-full" />
  ```
  `w-3/4` is **unprefixed and unconditional** — regular relies on this same
  75%-of-square-root value for its own sizing (the art block is
  `regular:absolute`, centered, sized at 75% of the now-square,
  height-driven TableSurface root). There is no existing `regular:w-*`
  override. This is a load-bearing fact for step 4 below.
- [packages/ui/src/styles.css:68-107](../../../packages/ui/src/styles.css) —
  `--size-table-art-compact: 158px`, a bare `:root` custom property (not
  `@theme`, deliberately — exactly one consumer) with a long comment tracing
  its CAM-21 → CAM-20 tuning history against the 640px reference height.
  `--breakpoint-regular: 720px` (line 181) confirms this codebase is
  mobile-first with `regular:` as the up-breakpoint variant
  (`@media (width >= theme(--breakpoint-regular))`, lines 285/291) — there
  is no `compact:` variant; "compact" is simply the bare/unprefixed classes
  already used throughout this file, consistent with the background
  exploration.
- [apps/web/test/game-screen.test.tsx](../../../apps/web/test/game-screen.test.tsx) —
  the `"fluid regular table (CAM-20 M5)"` describe block (line 2136-2158)
  is the pattern to mirror: it locates `TableSurface`'s root via
  `screen.getByText(FRIEND.name).closest("[data-seat-index]")` →
  `.closest("[data-state]")` (routing around `TurnIndicator`'s own
  `[role=status][data-state]` DOM-first match) and asserts specific
  substrings are/aren't present in `className`. The no-transform sweep
  (line 1982-2010, repeated 2114-2130) and the containment test (line
  1925-1955, `"keeps the viewer's own hand anchors outside the scroll
region..."`) must keep passing unmodified — none of this task's classes
  are transform/scale/rotate, and no `data-region` attribute moves.
- [apps/web/test/table-geometry.test.ts](../../../apps/web/test/table-geometry.test.ts) —
  pins `BENCH_INSET_PCT`/`ART_HALF_PCT`/`benchAssignment` math, all
  `regular:`-only in effect; zero changes to `table-geometry.ts`, must stay
  green untouched.
- [design-system/components/core/table-surface.md](../../../design-system/components/core/table-surface.md) —
  frontmatter `version: 6`; revisions list ends at r6 (line 153-172, the
  CAM-20 design-gate fix cycle that raised the token to 158px). This task
  adds r7.
- [design-system/references/tokens.md:100-134](../../../design-system/references/tokens.md) —
  the `--size-table-art-compact` entry (line 122-133) currently documents it
  as "the compact-only max-width cap on the table art ... also the height
  cap." This task rewrites that description to cap→floor and points at r7.
- Not touched, confirmed by this plan's own re-read: `room-screen.tsx`
  (no height-bounded flex chain — structurally incapable of this bug, ADR-
  0038 scope decision), `table-geometry.ts`, `hand.tsx`/`draw-deck.tsx`/
  `discard-pile.tsx`/`held-card.tsx` and the `card-lg`/`card-md`/`card-sm`
  tokens (root plan Decision Log — cards stay fixed), `apps/api`,
  `packages/domain`, `packages/application`, `packages/contracts`.

## Plan of work

Steps are ordered so the repo compiles and the existing suite stays green
after each one; only step 6 (new test) and step 8 (docs) are additive
rather than modifications to shared code.

**1 — Token role change (`packages/ui/src/styles.css:68-107`).** Keep the
value (`158px`) unchanged. Rewrite the comment: preserve the existing
CAM-21/CAM-20 derivation paragraph in full (it is still the basis for why
158px specifically, and the number itself is not being re-measured by this
task), and append a new paragraph stating the semantics change per
ADR-0038 — the token is now a **floor** (`min-width`/`min-height`), applied
only at compact on the docked composition's art block, preserving the
360×640 reference exactly while removing the upper bound that caused
CAM-27. Reference ADR-0038 and CAM-27 by number in the comment, matching
this file's existing convention of citing the task that changed a value.

**2 — `table-scroll` becomes a real flex container at compact
(`game-screen.tsx`, the div at data-region="table-scroll").** Add
unprefixed `flex flex-col` to its className (currently `"w-full flex-1
min-h-0 overflow-y-auto regular:contents"`). Today this element is a plain
block box at compact — nothing beneath it can be "the child that fills its
height" until it is itself a flex container. `regular:contents` already
dissolves this element's own box (and therefore its `display` value)
entirely at regular, so this addition has zero effect at regular — clause 7
holds by construction, not by a compensating override. No `data-region`
attribute moves, so the containment test (line 1925) is unaffected.

**3 — `TableSurface` root claims compact height, external only
(`table-surface.tsx`, root `cn(...)` call, the `viewerSeat === "external"`
ternary).** **As shipped** — the plan's original sketch also added
`justify-center` here, but that turned out to belong on the frame instead
(step 4): the root's `flex-1` always consumes exactly what `table-scroll`
leaves after step 2, so it never has leftover space of its own to center.
The as-built ternary:

```
viewerSeat === "external"
  ? "flex-1 min-h-0 regular:w-auto regular:flex-1 regular:min-h-0 regular:max-w-4xl"
  : "regular:block regular:max-w-2xl",
```

`flex-1 min-h-0` (unprefixed) lets the root claim `table-scroll`'s
available height at compact, mirroring the shape `regular:flex-1
regular:min-h-0` already had at regular. The `"internal"` branch (room
screen) is untouched — clause 8 holds by the same scoping technique
already proven for the regular fluid classes.

**4 — The art becomes a frame + square pair, external only
(`table-surface.tsx`).** **Revised mid-implementation** (see ADR-0038 and
the root plan's Surprises: a single element combining `flex-1` with
`aspect-square`/`max-width` does not hold a square once the width ceiling
binds — confirmed live, not theoretical). As shipped, the single art
`<div>` became two nested elements:

- **Outer, `data-region="table-art-frame"`**: `viewerSeat === "external"`
  gets `"flex grow basis-[0px] min-h-0 w-full items-center justify-center
[container-type:size] regular:contents"`; `"internal"` gets `"contents"`
  unconditionally. `grow basis-[0px]` (NOT Tailwind's `flex-1`, which is
  `flex: 1 1 0%`) is load-bearing: a `container-type: size` element sized
  via a _percentage_ flex-basis, nested two flex-grow levels deep (this
  frame inside the root above, itself flex-grown from `table-scroll`),
  resolves `cqh` queries in its descendants to `0` in this browser —
  confirmed by isolated reproduction outside this component tree, not a
  guess. A literal `0px` basis does not have this problem. `items-center
justify-center` center the inner square once it renders shorter than
  the frame's own flex-grown height (clause 4's symmetric-margin
  requirement) — the frame is the one element that ends up taller than
  its content, so centering has to live here, not on `table-scroll` or
  the root.
- **Inner, `data-region="table-art"`** (the img, center overlay, and
  game-over scrim all moved inside this element): `viewerSeat ===
"external"` gets `"aspect-square w-[min(100%,100cqh)]
min-w-(--size-table-art-compact) min-h-(--size-table-art-compact)
regular:aspect-auto regular:w-3/4 regular:min-w-0 regular:min-h-auto"`;
  `"internal"` keeps `"w-3/4"` unconditionally, unchanged from before this
  task. `width: min(100%, 100cqh)` is the actual "biggest square that fits
  the frame" expression — never wider than the frame (`100%`), never
  taller than the frame's resolved height (`100cqh`, a container-query
  unit read off the outer frame) — with `aspect-square` deriving whichever
  dimension `min()` didn't pick. The token floor
  (`min-w`/`min-h-(--size-table-art-compact)`) preserves the CAM-21
  reference as a lower bound (clause 1, amended — no longer an exact value
  guaranteed AT 360×640, see the root plan's Decision Log).
- **The companion check this plan flagged before implementation held**:
  the square's base class had no `regular:w-*` twin before this task,
  so regular silently depended on the same unprefixed value being
  repurposed for compact — `regular:w-3/4` above is that required twin,
  landed in the same edit, confirmed byte-identical to pre-change
  rendering via a live A/B comparison (git stash) at 1280×900.
- Every other pre-existing `regular:*` position class on the square
  (`regular:absolute regular:top-1/2 regular:left-1/2
regular:-translate-x-1/2 regular:-translate-y-1/2`) is unchanged.

**5 — Compile checkpoint.** After steps 1-4:
`pnpm turbo build typecheck lint test --filter @cambio/ui --filter @cambio/web`
(package names confirmed from `packages/ui/package.json` /
`apps/web/package.json`) — confirms the repo still builds/typechecks/lints
and the **existing** suite (no new test yet) is still green before adding
new coverage, isolating any regression to steps 1-4 rather than conflating
it with the new test in step 6.

**6 — Structural test coverage (M2).** **As shipped** in
`apps/web/test/game-screen.test.tsx`: a new `describe("fluid compact
table (CAM-27 M2)", ...)` block, immediately after `"fluid regular table
(CAM-20 M5)"`, with five tests — the root carries unprefixed
`flex-1`/`min-h-0` (and explicitly does NOT carry `justify-center`,
guarding against the centering job drifting back onto the wrong
element); `table-scroll` is a real `flex`/`flex-col` container;
`data-region="table-art-frame"` carries `grow`/`basis-[0px]`/`min-h-0`/
`[container-type:size]`/`regular:contents` and NOT `flex-1` (guarding
against the `cqh`-breaking regression this task found and fixed);
`data-region="table-art"` no longer carries the old
`max-w-(--size-table-art-compact)` cap, carries the new
`min-w`/`min-h-(--size-table-art-compact)` floor and
`aspect-square`/`w-[min(100%,100cqh)]`, and restores
`regular:w-3/4`/`regular:aspect-auto` at regular; and a no-transform
sweep walking up from the new `table-art` element confirms no
`scale`/`rotate`/`transform-[` class or inline `style.transform`
anywhere in its ancestor chain. The pre-existing no-transform sweep
tests, the own-hand containment test, and the "fluid regular table"
test all re-run unmodified alongside these — 91/91 across
`game-screen.test.tsx` and `table-geometry.test.ts` — confirming clauses
6, 7, and 9.

**7 — Rendered verification (M3).** Not unit-testable (ADR-0030 — jsdom
computes no real layout). Start the dev server per AGENTS.md's
freshness discipline (fetch a recently-changed module through the server
before trusting anything it renders; restart if stale), then check each
viewport below against the game screen's docked composition
(`viewerSeat="external"`), 2-4 players:

| Viewport          | Measured (live dev server, real 2-player game, via `getBoundingClientRect`)                                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 360×640           | Art 293.5×293.5px (**not** 158px — clause 1 amended mid-implementation, see root plan Decision Log: the pre-existing baseline residue closes too); zero page-level scroll.                                       |
| 1280×900          | Art 607.125×607.125px at the same top/left as pre-change code, confirmed via a live A/B comparison (`git stash` the implementation diff, reload, measure, `git stash pop`, reload, re-measure) — byte-identical. |
| 360×770           | Art 328×328px (square, at the width ceiling), symmetric margins 47.75px/47.77px above/below; zero page-level scroll. The originally reported ~200px dead band is gone.                                           |
| 421×770           | Art 389×389px, symmetric margins 17.25px/17.27px; zero page-level scroll. Confirms the fix isn't width-specific.                                                                                                 |
| 360×1400 (stress) | Art 328×328px (hit the width ceiling, stopped growing); leftover distributed as symmetric margins 362.75px/362.77px above/below — not a gap pinned above the dock; zero page-level scroll.                       |

Every viewport: `document.documentElement.scrollHeight === window.innerHeight`
(zero page-level scroll, the CAM-21 invariant). Full detail and the two
mechanism corrections found during this pass (a single flex+aspect-ratio
element does not hold a square once the width ceiling binds; a
`container-type: size` element sized via a percentage flex-basis
resolves `cqh` to 0 when nested two flex-grow levels deep) are in the
root plan's Surprises section and ADR-0038.

**8 — Canon update (M4).** **As shipped:** `design-system/components/core/table-surface.md`
frontmatter `version` bumped to `7`; an `r7` entry appended to the
Revisions section (after r6) describing the frame+square/container-query
mechanism (revised from the plan's original flex/aspect-ratio sketch —
see this doc's Plan of Work step 4) and the measured results at all five
verification viewports; the Anatomy section's "Compact art cap" bullet
rewritten to "Compact art sizing" (cap → floor, fluid). Updated
`design-system/references/tokens.md`'s `--size-table-art-compact` entry
to describe the floor role and point at r7. `table-surface.tsx`'s own
header comment bumped from citing r6 to r7 (ADR-0027 "divergence is a
defect" — the component's own doc-citation, not just the design-system
files, has to track the current revision). ADR-0038 rewritten to
describe the corrected (frame+square, container-query) mechanism as the
actual decision, with the original single-element flex/aspect-ratio
attempt moved to "alternatives considered, rejected — confirmed live,
not theoretical." **ADR status stays `proposed`**, not `accepted` — per
the `adr` skill, a proposed ADR only becomes accepted by explicit human
approval when its release branch merges into `development`, never at
implementation close; only the ADR index's title wording needed a
touch-up to match the corrected mechanism. Full gate run after: `pnpm turbo build typecheck lint test`.

## Concrete steps & validation

1. `pnpm turbo build typecheck lint test --filter @cambio/ui --filter @cambio/web`
   after steps 1-4 (Plan of work) — expect the **existing** suite count,
   zero new failures, zero new lint/typecheck errors.
2. After step 6, re-run the same command (or bare `vitest run
apps/web/test/game-screen.test.tsx` and `apps/web/test/table-geometry.test.ts`
   while iterating) — expect the new describe block's test(s) passing, plus
   every pre-existing test in both files still green, including by name:
   the no-transform sweep tests and the "keeps the viewer's own hand
   anchors..." containment test.
3. Manual rendered pass per step 7's table, at a freshly-restarted dev
   server (verify freshness per AGENTS.md before trusting any measurement).
4. Final gate before close-out: `pnpm turbo build typecheck lint test`
   (bare, never piped — a PreToolUse hook enforces this) — must exit 0.
5. Grep the diff for `--size-table-art-compact` consumers to confirm only
   `table-surface.tsx`'s art block reads it (per styles.css's own comment,
   "exactly one consumer") — if implementation revealed a second consumer,
   surface it in Surprises rather than silently promoting the token to a
   `@theme` role.

## Contract coverage

| Clause                                                                                                                                                                                 | Test (file + name)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | What is asserted                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. At 360×640, the table art never renders smaller than the 158px floor, and the layout is structurally unchanged (amended mid-implementation — see root plan Decision Log).           | Manual rendered pass (live dev server, real 2-player game) — jsdom cannot measure real pixel sizes (ADR-0030)                                                                                                                                                                                                                                                                                                                                                                                                                       | At 360×640: art renders 293.5×293.5px (not 158px — clause amended mid-implementation, see Decision Log); docScrollHeight === innerHeight (zero page-level scroll)                                                                                                                                                     |
| 2. At compact heights above 640px, the art's rendered box grows to track additional height, up to clause 4's limit.                                                                    | Manual rendered pass, 360×770 / 421×770 / 360×1400                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Art grows with height: 328×328 (360×770), 389×389 (421×770), 328×328 capped at the width ceiling (360×1400) — up from 158×158 at every one of these under the old fixed cap                                                                                                                                           |
| 3. At any compact height, no unclaimed dead space appears between the table region and the dock; `table-scroll`'s content fills the box it occupies.                                   | Manual rendered pass, all 5 viewports; game-screen.test.tsx > fluid compact table (CAM-27 M2) > makes TableSurface's root a real flex item, at compact (flex-1, min-h-0)                                                                                                                                                                                                                                                                                                                                                            | document.documentElement.scrollHeight === window.innerHeight at 360×640, 1280×900, 360×770, 421×770, and 360×1400; root carries unprefixed flex-1/min-h-0                                                                                                                                                             |
| 4. Once art growth would exceed available width, growth stops and remaining space is symmetric margin, never a gap above the dock.                                                     | Manual rendered pass, 360×770 / 421×770 / 360×1400; game-screen.test.tsx > fluid compact table (CAM-27 M2) > frames the table art as a size query container at compact, dissolved everywhere else (CAM-27, revised)                                                                                                                                                                                                                                                                                                                 | Symmetric margins measured: 47.75px/47.77px above/below at 360×770, 17.25px/17.27px at 421×770, 362.75px/362.77px at 360×1400 (all within rounding); frame carries flex/items-center/justify-center                                                                                                                   |
| 5. Card sizes (deck, discard, held card, hand) are unchanged at compact at every height.                                                                                               | No new test — verified by absence of diff to hand.tsx, draw-deck.tsx, discard-pile.tsx, held-card.tsx, and the card-lg/card-md/card-sm tokens; existing suites for those files re-run unmodified as a regression guard                                                                                                                                                                                                                                                                                                              | Zero diff to every card-size-consuming file or token in the final changeset                                                                                                                                                                                                                                           |
| 6. No flight anchor up through `tableRoot` carries a `transform`/`scale-*`/`rotate-*` class or inline style; the existing no-transform sweep passes unmodified.                        | game-screen.test.tsx > compact docked composition (CAM-21) > carries no scale-or-rotate transform class from every flight anchor up through the root's ancestors (ADR-0035, widened to rotation by ADR-0036 §5); > side-bench rotation (CAM-20) > still carries no scale-or-rotate transform above any flight anchor with a rotated hand on the table (ADR-0035/0036 §5); > fluid compact table (CAM-27 M2) > still carries no scale-or-rotate transform above the table art now that it sizes via container query units (ADR-0035) | No scale-/rotate-/transform-[ class or non-empty inline style.transform anywhere from a flight anchor, or the new art frame/square, up through tableRoot                                                                                                                                                              |
| 7. The regular (≥720px) fluid table layout is byte-identical to today; the existing "fluid regular table (CAM-20 M5)" test passes unmodified.                                          | game-screen.test.tsx > fluid regular table (CAM-20 M5) > sizes the table square from height at regular...; > fluid compact table (CAM-27 M2) > grows the table art...(regular-restore assertions); manual live A/B rendered comparison at 1280×900 via git stash                                                                                                                                                                                                                                                                    | Regular-scoped classes (regular:flex-1/regular:min-h-0/regular:max-w-4xl on the root; regular:w-3/4/regular:aspect-auto on the square) unchanged; live-measured art rect at 1280×900 identical before and after this diff (607.125×607.125 at the same top/left)                                                      |
| 8. The room screen's compact table (`viewerSeat="internal"`) is visually and functionally unaffected; zero diff to `room-screen.tsx` itself (amended at review — see Asserted column). | No new test — verified by reading the diff directly; existing room-screen test suite re-run unmodified as a regression guard                                                                                                                                                                                                                                                                                                                                                                                                        | room-screen.tsx has zero diff. Amended at review: the shared TableSurface JSX does gain one new always-present wrapper node (table-art-frame) on the internal path too, rendered display:contents there — zero visual/layout impact (ADR-0038 Consequences), but not a byte-identical source diff to that shared path |
| 9. `table-geometry.ts`'s bench-position math and `table-geometry.test.ts` are unaffected.                                                                                              | table-geometry.test.ts (full suite)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | All 9 pre-existing assertions pass unmodified; zero diff to table-geometry.ts                                                                                                                                                                                                                                         |

## Progress

- [x] 2026-09-07 14:20 — Steps 1-4 implemented (token comment/role,
      `table-scroll` flex column, `TableSurface` root, art frame+square
      split with the corrected container-query mechanism). Compile
      checkpoint (step 5): `pnpm turbo build typecheck lint test --filter
@cambio/ui --filter @cambio/web`, existing suite unaffected.
- [x] 2026-09-07 14:45 — Step 6: 5 new tests added to `game-screen.test.tsx`
      (`describe("fluid compact table (CAM-27 M2)", ...)`). 91/91 across
      `game-screen.test.tsx` + `table-geometry.test.ts`.
- [x] 2026-09-07 15:10 — Step 7: rendered verification at all 5 viewports,
      live dev server (Postgres + api + web, a real 2-player game).
      Results in the step 7 table above. Two mechanism corrections found
      and fixed along the way — see Surprises below and ADR-0038.
- [x] 2026-09-07 15:20 — Step 8: canon updated (`table-surface.md` r7,
      `tokens.md`, `table-surface.tsx` header comment), ADR-0038 rewritten.
      Full gate: `pnpm turbo build typecheck lint test`, 9/9 tasks, exit 0.
- [x] 2026-09-08 — Review fix cycle: coverage table rows 6 and 8 corrected
      (row 6's quoted test-title citation updated after the rename below;
      row 8's "zero diff" claim amended to note the shared TableSurface
      JSX gains one new always-present `display:contents` wrapper node on
      the internal path). `game-screen.test.tsx`'s renamed test
      ("...now that it sizes via container query units") re-verified
      green. Full detail in the root plan's Outcomes & Retrospective.

## Surprises & notes for the root plan

- The art block's unprefixed `w-3/4` had no explicit `regular:w-*` twin
  before this task — confirmed true against the live file, and the
  required `regular:w-3/4` companion edit landed in the same commit as
  the compact fluid-sizing change (step 4), verified byte-identical to
  pre-change regular rendering via a live A/B comparison (`git stash`).
- `table-scroll` did need to become a real flex container (step 2) — the
  live file confirmed it was a plain block box (no `flex` class),
  exactly as this plan predicted; not a no-op.
- **Mechanism correction #1:** the plan's original single-element
  `flex-1` + `aspect-square` + `w-auto` + `max-w-full` sketch (step 4)
  does not hold a square once the width ceiling binds. Measured live at
  360×770: 328×423.5px, a stretched rectangle, despite every individual
  class computing correctly in isolation. Corrected to a two-element
  frame (flex-grown, `container-type: size`) + square
  (`width: min(100%, 100cqh)`) split — the standard CSS answer for
  "grow to the smaller of available width or height, then stay square."
  User sign-off obtained before implementing the correction (see root
  plan Decision Log); ADR-0038 rewritten to document this as the actual
  decision, with the original attempt moved to rejected alternatives.
- **Mechanism correction #2:** after the frame/square split, the square
  still collapsed to its 158px floor at 360×770 instead of growing to
  328px. Root-caused by building isolated reproductions directly in the
  browser (not by reasoning about the spec): a `container-type: size`
  element sized via Tailwind's `flex-1` (`flex: 1 1 0%`, a _percentage_
  basis), nested two flex-grow levels deep, resolves `cqh` queries in
  its descendants to `0` — confirmed with a synthetic test tree outside
  this component, so it is a genuine, reproducible browser behavior.
  Fixed with a literal `0px` basis (`grow basis-[0px]`) on the frame
  only; `table-scroll` and the `TableSurface` root keep the ordinary
  `flex-1`/`min-h-0` idiom, since neither is itself a
  `container-type: size` element.
- Root plan clause 1 was amended mid-implementation (not by this side,
  but affecting this side's Contract coverage row 1): at 360×640 the art
  now renders at 293.5×293.5px, not 158px, because the reference height
  itself already had ~53-70px of the same unclaimed-slack bug under the
  old fixed cap. See root plan Decision Log for the full reasoning and
  user sign-off.
