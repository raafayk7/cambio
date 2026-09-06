# CAM-24 — Harden score-sheet/slam-timer test timeouts against CPU-load flakiness

- **Linear:** [CAM-24](https://linear.app/raafayk7/issue/CAM-24/harden-score-sheetslam-timer-test-timeouts-against-cpu-load-flakiness)
- **Scope:** frontend
- **Child plans:** [frontend](../frontend/CAM-24.md)
- **ADRs:** none needed — the decision (raise `testTimeout` to match the
  existing `apps/api` / `packages/domain` convention) is fully determined
  by that existing precedent, per the `adr` skill's "skip" bar. Logged in
  the Decision Log below instead.

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

After this task, a forced full-monorepo gate run
(`pnpm turbo build typecheck lint test --force`, all 7 packages building
and testing concurrently) no longer intermittently reds `apps/web` or
`packages/ui` suites with `Test timed out in 5000ms` for reasons unrelated
to whatever change triggered the run. Observable by inspecting
`apps/web/vitest.config.ts` and `packages/ui/vitest.config.ts` for a
`testTimeout: 30_000` override, and by the full gate passing.

## Context & orientation

Discovered during CAM-22's `/review` (2026-09-06): a forced fresh full-repo
gate caused `apps/web/test/score-sheet.test.tsx`
("orders rows by total ascending — card count is irrelevant") and
`apps/web/test/slam-timer.test.tsx`
("drains linearly from the config-fed window toward closesAt") to fail with
`Test timed out in 5000ms`. Both passed in isolation immediately after
(196ms and 584ms respectively), and the full `apps/web` suite (193 tests)
was green in a subsequent isolated run — this is confirmed
CPU-contention-induced flakiness under heavy parallel build/test load, not
a logic regression, and unrelated to CAM-22's diff (neither flagged file
was touched by it).

Current state of the six `vitest.config.ts` files in the repo (none extend
a shared base — `@cambio/config` only exports tsconfig/eslint/prettier
bases, confirmed by exploration):

- `apps/api/vitest.config.ts:6-7` and `packages/domain/vitest.config.ts:6-9`
  already override `testTimeout: 30_000`, each with a short comment naming
  the specific slow mechanism (DB round-trips; whole-game simulations).
- `apps/web/vitest.config.ts` and `packages/ui/vitest.config.ts` are
  byte-for-byte identical today (both jsdom + `@testing-library/react`
  per [ADR-0030](../../adr/0030-testing-library-jsdom-component-tests.md),
  proposed, task CAM-15) and carry **no** `testTimeout` override — they run
  at vitest's 5000ms default. `packages/ui`'s jsdom setup is actively
  exercised by 6 live `*.test.tsx` files (not dead config), so it is
  equally exposed to the same failure mode even though it hasn't been
  observed flaking yet.
- No other package in the repo uses jsdom/testing-library, so no other
  suite is exposed to this specific failure mode.

Interview decisions that scope this task (see Decision Log): fix both
`apps/web` and `packages/ui` (not `apps/web` alone), set the value to
`30_000` to match existing precedent (not a smaller contention-only
margin), and treat this as a config-only fix — no test-implementation
audit for real-timer sensitivity, since neither flagged test's failure
signature points to one (the score-sheet test is a plain synchronous
render with no `waitFor`; the slam-timer suite already runs under
`vi.useFakeTimers()` throughout).

## Functional contract

- `apps/web/vitest.config.ts`'s `test` object gains `testTimeout: 30_000`,
  immediately preceded by a comment (1-3 lines, matching the
  `apps/api`/`packages/domain` convention) naming the CPU-contention cause
  — not a generic "flaky test" excuse.
- `packages/ui/vitest.config.ts`'s `test` object gains the identical
  `testTimeout: 30_000` with an equivalent comment.
- No other keys in either config change (`environment`, `include`,
  `setupFiles` stay as they are).
- No test file content changes anywhere — `score-sheet.test.tsx`,
  `slam-timer.test.tsx`, and every other `apps/web`/`packages/ui` test file
  are untouched.
- `pnpm turbo build typecheck lint test` passes after the change.

### Acceptance criteria

- [ ] `apps/web/vitest.config.ts` sets `testTimeout: 30_000` with an
      explanatory comment above it.
- [ ] `packages/ui/vitest.config.ts` sets `testTimeout: 30_000` with an
      explanatory comment above it.
- [ ] No `.test.ts`/`.test.tsx` file anywhere in the repo is modified.
- [ ] `pnpm turbo build typecheck lint test` passes.

## Plan of work

One milestone, two files, no ordering dependency and nothing to freeze
first — this task touches neither `contracts` nor any code path shared
with backend work. Edit both `vitest.config.ts` files together, matching
the exact comment style already established in `apps/api` and
`packages/domain`, then run the full gate once to confirm nothing broke.

## Validation

No new tests are added — this is meta-configuration for the test harness
itself, not user-observable behavior, so there is nothing to write a test
against. Validation is: (1) `pnpm turbo build typecheck lint test` passes
clean, (2) both files visually confirmed to carry the override and
comment, (3) no test file diff beyond the two config files. Because the
original failure was probabilistic (CPU contention under a forced
concurrent `--force` run), a single clean gate run afterward cannot prove
the flake is gone — that is expected and not a gap in this task's closeout.

## Progress

_(updated continuously; append new entries at the BOTTOM — newest last;
timestamp each entry)_

- [ ] YYYY-MM-DD HH:MM — step description

## Decision log

- 2026-09-06 — Fix both `apps/web` and `packages/ui`, not just `apps/web`
  alone — user's call during planning interview. Both packages share
  identical jsdom + testing-library config and are equally exposed to the
  same CPU-contention failure mode; `packages/ui` just hasn't been observed
  flaking yet. Scoping to only the package where flake was already seen
  would leave a known-equivalent gap.
- 2026-09-06 — `testTimeout: 30_000`, matching the existing
  `apps/api`/`packages/domain` precedent, rather than a smaller
  contention-only margin (e.g. 10_000) — user's call during planning
  interview. Keeps one timeout convention across the repo instead of
  introducing a second number whose rationale (contention vs.
  inherently-slow suites) would need to be remembered and re-explained.
- 2026-09-06 — Config-only fix; no test-implementation audit for
  real-timer sensitivity, even though the originating issue raised that as
  a thing "worth investigating" — user's call during planning interview.
  Neither flagged test's failure signature points to a real-timer bug: the
  score-sheet test is a plain synchronous render with no `waitFor`, and the
  slam-timer suite already runs entirely under `vi.useFakeTimers()`. An
  audit with no expected finding would be process for its own sake.

## Surprises & discoveries

_(anything found mid-implementation that the plan didn't predict — wrong
assumptions, upstream bugs, better approaches. Evidence included.)_

## Outcomes & retrospective

_(filled at the end, typically by `/review`: what shipped, what was cut,
what should carry into the next task.)_
