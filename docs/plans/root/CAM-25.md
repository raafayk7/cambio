# CAM-25 — Harden testing-library async-utility timeouts against CPU-load flakiness too

- **Linear:** [CAM-25](https://linear.app/raafayk7/issue/CAM-25/harden-testing-library-async-utility-timeouts-against-cpu-load)
- **Scope:** frontend
- **Child plans:** [frontend](../frontend/CAM-25.md)
- **ADRs:** none needed — the decision (raise `@testing-library/dom`'s
  `asyncUtilTimeout` via a global `configure()` call in `test/setup.ts`) is
  a config-value tweak with a direct in-repo precedent
  ([CAM-24](../root/CAM-24.md) made an analogous call for `testTimeout` and
  explicitly skipped an ADR); logged in the Decision Log below instead.

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

After this task, `findByLabelText`/`findByText`/`findByRole`/`waitFor` and
every other `@testing-library/dom` async query in `apps/web` and
`packages/ui` test suites survive the same CPU-contention conditions
[CAM-24](../root/CAM-24.md) hardened vitest's own `testTimeout` against,
instead of failing under their own separate, much shorter default budget.
Observable by inspecting `apps/web/test/setup.ts` and
`packages/ui/test/setup.ts` for a `configure({ asyncUtilTimeout: 10_000 })`
call, and by the full gate passing.

## Context & orientation

Discovered during [CAM-24](../root/CAM-24.md)'s `/review` fix cycle
(2026-09-06): a forced fresh
`pnpm turbo build typecheck lint test --filter=@cambio/web --filter=@cambio/ui --force`
run transiently failed `apps/web/test/lobby-screen.test.tsx` — "lobby
identity (W2, L1) > renders the name form for an unauthenticated visitor
(401 from /me)" — with `TestingLibraryElementError: Unable to find a label
with the text of: Your name` from a `findByLabelText` call. Re-running that
file in isolation immediately after passed 10/10 in 1308ms, and a second
forced fresh full-package run passed clean — the same class of
CPU-contention flake CAM-24 targeted, but a **different mechanism**: see
[CAM-24's root plan, Surprises & discoveries](../root/CAM-24.md#surprises--discoveries)
for the original writeup.

**The gap CAM-24 didn't cover:** CAM-24 raised vitest's own `testTimeout` to
`30_000` in `apps/web/vitest.config.ts` and `packages/ui/vitest.config.ts`.
But `findByLabelText`/`waitFor`/every other async query from
`@testing-library/dom` carries its **own independent** internal timeout —
default 1000ms, configurable globally via `configure({ asyncUtilTimeout: N })`
(exported from both `@testing-library/dom` and re-exported by
`@testing-library/react`). Raising vitest's `testTimeout` does nothing for
this separate mechanism.

Facts confirmed during exploration (full detail in the frontend child
plan's Context & orientation):

- `apps/web/test/setup.ts` and `packages/ui/test/setup.ts` are
  byte-identical today (9 lines): they import
  `@testing-library/jest-dom/vitest`, import `cleanup` from
  `@testing-library/react`, and register `afterEach(() => cleanup())`. Per
  [ADR-0030](../../adr/0030-testing-library-jsdom-component-tests.md) both
  packages share the same jsdom + testing-library setup.
- Both packages pin `@testing-library/react@16.3.3` (transitively
  `@testing-library/dom@10.4.1`). `@testing-library/react` re-exports
  `configure` and its `Config` type (which includes `asyncUtilTimeout`)
  unchanged from `@testing-library/dom`; `@testing-library/react`'s own
  module-load-time `configure()` call only touches
  `unstable_advanceTimersWrapper`/`asyncWrapper`, never `asyncUtilTimeout`,
  so a later `configure({ asyncUtilTimeout: 10_000 })` in `setup.ts` is not
  clobbered.
- Every `findBy*`/`waitFor` call site in both packages' test suites
  (heaviest users: `apps/web/test/game-screen.test.tsx`,
  `apps/web/test/room-screen.test.tsx`, `apps/web/test/lobby-screen.test.tsx`,
  `apps/web/test/score-sheet.test.tsx`, `packages/ui/test/modal.test.tsx`)
  currently passes no per-call `{ timeout: N }` option, so all of them
  presently rely on — and will all be affected by raising — the library
  global.
- No shared vitest base exists in the repo (`@cambio/config` only exports
  tsconfig/eslint/prettier bases; all six `vitest.config.ts` files
  independently call `defineConfig({...})`), and no ESLint import-boundary
  rule restricts what `test/setup.ts` may import in either package.

Interview decisions that scope this task (see Decision Log): raise the
value to `10_000` (not CAM-24's `30_000` verbatim — a deliberately separate
number, staying below the 30_000 `testTimeout` ceiling so a genuine hang
still reports a clear testing-library error rather than a generic vitest
timeout), apply it to both `apps/web` and `packages/ui` (matching CAM-24's
both-packages precedent), and treat this as config-only — no audit of the
five call-site files for real-timer sensitivity, matching CAM-24's
"worth investigating" note being explicitly deferred rather than absorbed.

## Functional contract

- `apps/web/test/setup.ts` calls `configure({ asyncUtilTimeout: 10_000 })`
  (imported from `@testing-library/react`, alongside the existing
  `cleanup` import), immediately preceded by a comment (1-3 lines) naming
  the CPU-contention cause and explicitly distinguishing this from vitest's
  `testTimeout` — not a generic "flaky test" excuse.
- `packages/ui/test/setup.ts` gains the identical
  `configure({ asyncUtilTimeout: 10_000 })` call with an equivalent
  comment.
- No other behavior in either `setup.ts` changes — the existing
  `afterEach(() => cleanup())` block and the `@testing-library/jest-dom/vitest`
  import stay exactly as they are.
- No test file content changes anywhere — `lobby-screen.test.tsx` and every
  other `apps/web`/`packages/ui` test file are untouched; no per-call
  `{ timeout: N }` overrides are added to any individual `findBy*`/`waitFor`
  call.
- No change to either `vitest.config.ts` (this task is scoped to the
  testing-library-level timeout, not vitest's `testTimeout`, which CAM-24
  already covers).
- `pnpm turbo build typecheck lint test` passes after the change.

### Acceptance criteria

- [x] `apps/web/test/setup.ts` calls `configure({ asyncUtilTimeout: 10_000 })`
      with an explanatory comment above it.
- [x] `packages/ui/test/setup.ts` calls the identical
      `configure({ asyncUtilTimeout: 10_000 })` with an equivalent comment.
- [x] No `.test.ts`/`.test.tsx` file anywhere in the repo is modified.
- [x] Neither `vitest.config.ts` file is modified.
- [x] `pnpm turbo build typecheck lint test` passes.

## Plan of work

One milestone, two files, no ordering dependency and nothing to freeze
first — this task touches neither `contracts` nor any code path shared
with backend work. Edit both `test/setup.ts` files together, matching the
comment convention CAM-24 established in the sibling `vitest.config.ts`
files, then run the full gate once to confirm nothing broke.

## Validation

No new tests are added — this is meta-configuration for the test harness
itself, not user-observable behavior, so there is nothing to write a test
against. Validation is: (1) `pnpm turbo build typecheck lint test` passes
clean, (2) both files visually confirmed to carry the `configure()` call
and comment, (3) no test file or `vitest.config.ts` diff beyond the two
`setup.ts` files. Because the originating failure was probabilistic (CPU
contention under a forced concurrent `--force` run), a single clean gate
run afterward cannot prove the flake is gone — that is expected and not a
gap in this task's closeout, same as CAM-24's Validation section notes.

## Progress

_(updated continuously; append new entries at the BOTTOM — newest last;
timestamp each entry)_

- [x] 2026-09-06 14:55 — Added `configure({ asyncUtilTimeout: 10_000 })`
      with the CPU-contention comment to both `apps/web/test/setup.ts` and
      `packages/ui/test/setup.ts`, exactly as sketched in the frontend child
      plan; diffs confirmed identical (7-line addition each) and both files
      confirmed still byte-identical to each other after the edit. No test
      file or `vitest.config.ts` touched
      (`git status --porcelain -- '**/*.test.ts' '**/*.test.tsx' '**/vitest.config.ts'`
      empty).
- [x] 2026-09-06 14:56 — Full gate green:
      `pnpm turbo build typecheck lint test` — 25/25 tasks successful.
      `@cambio/web:test` 20 files / 204 tests passed; `@cambio/ui:test` 6
      files / 25 tests passed. All acceptance criteria checked off above.

## Decision log

- 2026-09-06 — `asyncUtilTimeout: 10_000`, not CAM-24's `30_000` copied
  blindly — user's call during planning interview. This is a genuinely
  separate decision (a different config knob guarding a different failure
  mode): 10_000 is 10x the library default (comfortably enough headroom for
  CPU contention) while staying below the 30_000 `testTimeout` ceiling, so
  a genuine hang still surfaces a clear testing-library "unable to find
  element" error instead of racing vitest's own timeout to a less
  informative message.
- 2026-09-06 — Fix both `apps/web` and `packages/ui`, not just `apps/web`
  alone — user's call during planning interview. Matches CAM-24's
  precedent: both packages' `test/setup.ts` are byte-identical today and
  equally exposed to the same testing-library-internal-timeout mechanism,
  even though only `apps/web` has been observed flaking on it so far.
- 2026-09-06 — Config-only fix; no audit of the five files using
  `findBy*`/`waitFor` for real-timer sensitivity — user's call during
  planning interview, matching CAM-24's identical call on the same
  "worth investigating" note in the originating issue text. Raising the
  global default is the complete fix for a CPU-contention timeout; an
  audit with no specific target would be process for its own sake.
- 2026-09-06 — No ADR — this is a config-value tweak with direct
  precedent (CAM-24's analogous `testTimeout` decision also skipped an
  ADR), not a new pattern, library choice, or HANDOFF §9 resolution.

## Surprises & discoveries

_(anything found mid-implementation that the plan didn't predict — wrong
assumptions, upstream bugs, better approaches. Evidence included.)_

## Outcomes & retrospective

_(filled at the end, typically by `/review`: what shipped, what was cut,
what should carry into the next task.)_
