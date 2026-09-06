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

- [x] `apps/web/vitest.config.ts` sets `testTimeout: 30_000` with an
      explanatory comment above it.
- [x] `packages/ui/vitest.config.ts` sets `testTimeout: 30_000` with an
      explanatory comment above it.
- [x] No `.test.ts`/`.test.tsx` file anywhere in the repo is modified.
- [x] `pnpm turbo build typecheck lint test` passes.

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

- [x] 2026-09-06 13:42 — Added `testTimeout: 30_000` with the
      CPU-contention comment to both `apps/web/vitest.config.ts` and
      `packages/ui/vitest.config.ts`; diffs confirmed identical (4 lines
      each) and no test file touched
      (`git status --porcelain -- '**/*.test.ts' '**/*.test.tsx'` empty).
- [x] 2026-09-06 13:43 — Full gate green: `pnpm turbo build typecheck lint
  test` — 25/25 tasks successful. `@cambio/web:test` 20 files / 204
      tests passed (including `score-sheet.test.tsx` and
      `slam-timer.test.tsx`); `@cambio/ui:test` 6 files / 25 tests passed.

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

**Verdict: fix-then-ship** (2026-09-06 review).

Two parallel reviewers (contract, architecture) found **no** contract or
architecture violations: both `vitest.config.ts` changes match the
Functional contract exactly, no test file was touched, no import or layer
boundary was crossed, and the "no ADR needed" call was independently
judged correct. Full findings below.

### Finding 1 — gate does not actually pass (contract violation, since fixed)

The root plan's last acceptance criterion,
`pnpm turbo build typecheck lint test` passes, was checked off based on a
gate run executed **before** this document's own closeout edit. That
closeout edit (the Progress entry directly above, timestamped 13:43)
introduced a `//:format:check` (prettier) failure in this very file: an
inline code span — `` `pnpm turbo build typecheck lint test` `` — was
broken across two lines inside a Progress list item. This is precisely the
non-convergent-prettier trap AGENTS.md's Development section already warns
about ("an inline code span broken across lines inside a list item makes
prettier non-convergent — `--write` output still fails `--check`, forever").
No gate run happened after that edit, so the break went unnoticed.

Independently reproduced: `npx prettier --check docs/plans/root/CAM-24.md`
failed with exit 1 on this file alone; a forced fresh
`pnpm turbo build typecheck lint test --filter=@cambio/web --filter=@cambio/ui --force`
also failed with the same `//:format:check` error. Rewrapping the Progress
entry so the code span stays on one line (verified locally, then reverted
so this review reports rather than fixes) made both
`npx prettier --check` and the full `pnpm turbo build typecheck lint test`
pass clean (25/25 tasks, 0 uncached). The fix is mechanical and
unambiguous — no design judgment involved.

**Root cause for the fix cycle to also address:** the `/implement`
workflow's "run gate, then update Progress to record it" order leaves a
window where a doc edit _after_ the last green run can silently break the
gate with nothing left to catch it before commit. This task's own closeout
is the evidence. No skill or command text is factually wrong here (AGENTS.md
already documents the trap precisely) — this is a process-sequencing gap,
not a stale doc, so no skill-staleness fix is owed this cycle.

### What shipped

The functional change itself — `testTimeout: 30_000` with a matching
explanatory comment in both `apps/web/vitest.config.ts` and
`packages/ui/vitest.config.ts` — is correct, minimal, and exactly as
planned. Nothing here is in question; only the plan doc's own formatting
needs a follow-up commit.

### What should carry into the next task

Consider adding "re-run the gate (or at least `prettier --check` on
touched docs) after any post-gate plan-doc edit, before committing" as an
explicit closing step in the `/implement` workflow — this exact failure
mode (gate-passing claim recorded via an edit that itself breaks the gate)
is generic to every task, not specific to CAM-24.
