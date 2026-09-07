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

Files this side touches, current state as re-read for this plan:

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
- [packages/ui/src/styles.css:68-95](../../../packages/ui/src/styles.css) —
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

**1 — Token role change (`packages/ui/src/styles.css:68-95`).** Keep the
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

**3 — `TableSurface` root stretches and vertically centers, external only
(`table-surface.tsx`, root `cn(...)` call, the `viewerSeat === "external"`
ternary already at line 187-189).** Extend that same ternary — the exact
scope boundary the regular fluid classes already use — to also carry
unprefixed `flex-1 min-h-0 justify-center`:

- `flex-1 min-h-0`: now that `table-scroll` (step 2) is a real flex column,
  this lets the root actually claim its available height instead of
  sizing to content, mirroring the shape of `regular:flex-1 regular:min-h-0`
  one line below but scoped to compact.
- `justify-center`: the root's unconditional `items-center` (line 163) only
  centers the flex column's cross axis (horizontal); nothing today governs
  the main axis (vertical). Once `flex-1` makes the root taller than its
  content (opponent row + gap + art block), `justify-center` is what turns
  the leftover into symmetric top/bottom margin instead of the default
  flex-start pack-at-top — this is clause 4's vertical-centering
  requirement, and it belongs here (not on `table-scroll`) because
  `table-scroll`'s only child already fills it fully via `flex-1`, so
  `justify-content` on `table-scroll` itself would have nothing left to
  distribute.
- The `viewerSeat === "internal"` branch (room screen) is untouched by
  this ternary edit — clause 8 holds by the same scoping technique already
  proven for the regular fluid classes.

Advisory sketch only (confirm exact tokens against the live file at
implement time — this is not the artifact `/review` checks):

```
viewerSeat === "external"
  ? "flex-1 min-h-0 justify-center regular:w-auto regular:flex-1 regular:min-h-0 regular:max-w-4xl"
  : "regular:block regular:max-w-2xl",
```

**4 — The art block itself grows via aspect-ratio, external only
(`table-surface.tsx`, the art `<div>` at line 212-222).** Replace the fixed
cap with flex-driven, aspect-locked sizing:

- Drop `max-w-(--size-table-art-compact)` (the fixed cap that causes the
  bug).
- Add, unprefixed and external-only: flex growth (`flex-1 min-h-0`) so it
  can consume the root's now-real available height; `aspect-square` +
  `w-auto` so the browser derives width from the flex-resolved height
  (mirroring the root's own `regular:aspect-square`/`regular:w-auto`
  pattern, just applied one level down because at compact the square block
  is this art div, not the whole root); `max-w-full` as the width ceiling
  (ADR-0038 clause 4 — once width would need to exceed the column, growth
  stops); the token applied as `min-w-(--size-table-art-compact)
min-h-(--size-table-art-compact)` — its new floor role (clause 1, exactly
  158px at the 360×640 reference).
- **Required companion check, load-bearing** (identified during this
  planning pass, re-verify against the live file before editing): the
  element's current unprefixed base class is `w-3/4`, with **no existing
  `regular:w-*` override** — regular's own sizing today implicitly depends
  on that same unprefixed value (the art block is `regular:absolute`,
  sized to 75% of the height-driven square root). If the unprefixed
  `w-3/4` is replaced by `w-auto` for the compact fix, an explicit
  `regular:w-3/4` twin must be added in the **same** edit, or regular's
  rendered width silently changes — no existing test would catch this,
  since the "fluid regular table" test (line 2136) only inspects the
  root's className, never this nested art div's. This is exactly the kind
  of shared-unprefixed-value hazard clause 7 exists to guard against.
- Every other existing `regular:*` class on this element
  (`regular:absolute regular:top-1/2 regular:left-1/2
regular:-translate-x-1/2 regular:-translate-y-1/2 regular:max-w-none`)
  stays as-is, plus the `regular:w-3/4` twin from the point above.

**5 — Compile checkpoint.** After steps 1-4:
`pnpm turbo build typecheck lint test --filter @cambio/ui --filter @cambio/web`
(package names confirmed from `packages/ui/package.json` /
`apps/web/package.json`) — confirms the repo still builds/typechecks/lints
and the **existing** suite (no new test yet) is still green before adding
new coverage, isolating any regression to steps 1-4 rather than conflating
it with the new test in step 6.

**6 — Structural test coverage (M2).** In
`apps/web/test/game-screen.test.tsx`, add a new `describe` block
immediately after `"fluid regular table (CAM-20 M5)"` (line 2136-2158),
following its exact pattern (same DOM-lookup technique via
`screen.getByText(FRIEND.name).closest("[data-seat-index]")` →
`.closest("[data-state]")`, same `gameBootstrap()`/`channelsReady`
scaffolding) to assert the compact-side classes landed in step 3: the root
`className` contains `flex-1`, `min-h-0`, and `justify-center`
(unprefixed), and does not contain a leftover unprefixed sizing class from
before the change. A second assertion (either the same test or a sibling
one, whichever reads more naturally once the actual classes are known)
should check the art block itself no longer carries
`max-w-(--size-table-art-compact)` and instead carries the min-width/
min-height floor plus `max-w-full`/`aspect-square` — locate it via
`document.querySelector('[data-region="table-scroll"]')` and a class-list
walk, or by adding a `data-region` marker to the art div if none exists
today (check the live file — if there is no existing hook for this div,
prefer adding one over a fragile `querySelector` on Tailwind classes,
matching this codebase's own `data-region` convention rather than
inventing a new lookup style).
Then re-run the full `game-screen.test.tsx` and `table-geometry.test.ts`
suites (not just the new test) to confirm the ADR-0035/0036 no-transform
sweep (line 1982, 2114), the containment test (line 1925), and every
`table-geometry.test.ts` assertion still pass unmodified — this is the
concrete confirmation for clauses 6 and 9.

**7 — Rendered verification (M3).** Not unit-testable (ADR-0030 — jsdom
computes no real layout). Start the dev server per AGENTS.md's
freshness discipline (fetch a recently-changed module through the server
before trusting anything it renders; restart if stale), then check each
viewport below against the game screen's docked composition
(`viewerSeat="external"`), 2-4 players:

| Viewport          | What to look for                                                                                                                                                                                                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 360×640           | Zero regression from today: table art renders at 158px, zero page-level scroll (the CAM-21 invariant), composition visually unchanged.                                                                                                                                                                                     |
| 1280×900          | Regular is byte-identical to pre-change — same table position/size, no visual diff.                                                                                                                                                                                                                                        |
| 360×770           | The dead band previously observed here (~200px) is gone; the table art has visibly grown to fill the space instead.                                                                                                                                                                                                        |
| 421×770           | Same check as 360×770, confirming the fix isn't width-specific.                                                                                                                                                                                                                                                            |
| 360×1400 (stress) | The art has hit its width ceiling (`max-w-full`) and stopped growing; the remaining vertical space in `table-scroll` reads as **symmetric** margin above and below the table content, not a single gap pinned above the dock (clause 4's fallback) — confirm this looks like a deliberate layout choice, not a broken one. |

Record actual measurements/screenshots in the Progress log below as they're
taken (this is the only evidence clauses 1-4 and 8 have, per the root
plan's Validation section).

**8 — Canon update (M4).** Update
`design-system/components/core/table-surface.md`: bump frontmatter
`version` to `7` and append an `r7` entry to the Revisions section (after
r6, line 172) in that section's established voice — describe the cap→floor
semantics change, cite ADR-0038 and CAM-27, and note the value itself
(158px) is unchanged, only its CSS role. Update
`design-system/references/tokens.md`'s `--size-table-art-compact` entry
(line 122-133): replace "the compact-only max-width cap ... also the
height cap" with the floor description, and update the cross-reference
from "see table-surface.md r6" to "r7". Then confirm ADR-0038's status
(currently `proposed`, line 3) and the ADR index
(`docs/adr/README.md`) are consistent with this task landing — flip to
`accepted` if this repo's ADR convention expects that at implementation
close (check the `adr` skill / a recently-accepted ADR's status field
for the convention actually followed here before editing). Run the full
gate: `pnpm turbo build typecheck lint test`.

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

| Clause                                                                                                                                                          | Test (file + name)                                                                                                                                                                                                                                                                                                                                                                                          | What is asserted |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1. At 360×640, table art renders at 158px and the composition is unchanged from today.                                                                          | Verified by manual rendered pass (step 7, 360×640 row) — jsdom cannot measure real pixel sizes (ADR-0030), so no unit test can assert this directly; the structural test in step 6 only pins class names, not resolved geometry.                                                                                                                                                                            | —                |
| 2. At compact heights above 640px, the art's rendered box grows to track additional height, up to clause 4's limit.                                             | Verified by manual rendered pass (step 7, 360×770 / 421×770 rows) — real layout, not unit-testable.                                                                                                                                                                                                                                                                                                         | —                |
| 3. At any compact height, no unclaimed dead space appears between the table region and the dock; `table-scroll`'s content fills the box it occupies.            | Primarily manual rendered pass (step 7); partially corroborated by the structural test in step 6 confirming `flex-1`/`min-h-0` classes actually landed on the root (a necessary but not sufficient condition — the class being present doesn't prove the rendered gap is gone).                                                                                                                             | —                |
| 4. Once art growth would exceed available width, growth stops and remaining space is symmetric margin, never a gap above the dock.                              | Verified by manual rendered pass (step 7, 360×1400 stress row) — the "symmetric" claim is a real-layout judgment call no unit test can make; the structural test in step 6 pins that `justify-center` and `max-w-full` classes exist, which is the mechanism but not proof of the visual outcome.                                                                                                           | —                |
| 5. Card sizes (deck, discard, held card, hand) are unchanged at compact at every height.                                                                        | Verified by absence of change: no diff touches `hand.tsx`, `draw-deck.tsx`, `discard-pile.tsx`, `held-card.tsx`, or the `card-lg`/`card-md`/`card-sm` tokens. Existing tests for these components (untouched by this task) continue to pass as an implicit regression guard; no new test is needed since nothing here changes.                                                                              | —                |
| 6. No flight anchor up through `tableRoot` carries a `transform`/`scale-*`/`rotate-*` class or inline style; the existing no-transform sweep passes unmodified. | The pre-existing ADR-0035/0036 no-transform sweep in `game-screen.test.tsx` (line 1982 and its side-bench-rotation sibling at line 2114) re-run unmodified per step 6's validation — none of steps 2-4's new classes (`flex`, `flex-col`, `flex-1`, `min-h-0`, `justify-center`, `aspect-square`, `w-auto`, `max-w-full`, `min-w-(...)`, `min-h-(...)`) match the sweep's scale/rotate/transform- patterns. | —                |
| 7. The regular (≥720px) fluid table layout is byte-identical to today; the existing "fluid regular table (CAM-20 M5)" test passes unmodified.                   | The pre-existing test at `game-screen.test.tsx` line 2136 re-run unmodified per step 6's validation, plus the step 4 companion check (adding an explicit `regular:w-3/4` twin if the unprefixed base class changes) specifically to prevent a silent regular regression this particular existing test does not cover (it only inspects the root's className, not the nested art div's).                     | —                |
| 8. The room screen's compact table (`viewerSeat="internal"`) is byte-identical to today; zero diff to `room-screen.tsx` or the default `TableSurface` path.     | Verified by the diff itself touching only the `viewerSeat === "external"` branches in `table-surface.tsx` plus `game-screen.tsx`/`styles.css`/docs — `room-screen.tsx` is not in the changed-files list. Existing `room-screen.test.tsx` (unmodified) re-run as a regression guard.                                                                                                                         | —                |
| 9. `table-geometry.ts`'s bench-position math and `table-geometry.test.ts` are unaffected.                                                                       | The pre-existing `table-geometry.test.ts` suite re-run unmodified per step 6's validation — zero diff to `table-geometry.ts` itself.                                                                                                                                                                                                                                                                        | —                |

## Progress

- [ ] YYYY-MM-DD HH:MM — step

## Surprises & notes for the root plan

- The art block's current unprefixed `w-3/4` has no explicit `regular:w-*`
  twin — regular's own sizing today silently depends on the same
  unprefixed value this task must change for compact. Flagged in Plan of
  work step 4 as a required companion edit; if `/implement` finds this
  assumption wrong (e.g. a `regular:w-*` override already exists by the
  time this lands, or the live structure otherwise differs from this
  read), update this note and the step rather than silently diverging.
- `table-scroll` needing to become a real flex container (step 2) is not
  called out explicitly in ADR-0038's Decision section, which frames the
  fix mostly in terms of the art block and the root's own sizing. It
  follows necessarily from `table-scroll` being a plain block box today
  (no `flex` class) — a `flex-1` on a non-flex-item child of a block
  parent has no effect. If `/implement`'s read of the live file finds
  `table-scroll` already flex by the time this lands, this step becomes a
  no-op confirmation rather than a real edit; note that in Progress either
  way.
