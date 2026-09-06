# CAM-24 — Harden score-sheet/slam-timer test timeouts against CPU-load flakiness (frontend)

- **Root plan:** [root/CAM-24.md](../root/CAM-24.md) — the functional
  contract lives there; this document is implementation detail for one side.

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

Two files, both currently byte-for-byte identical (per the root plan's
exploration) and neither carrying a `testTimeout` override today, so both
run at vitest's 5000ms default:

- `apps/web/vitest.config.ts`
- `packages/ui/vitest.config.ts`

Both configs are jsdom + `@testing-library/react` per
[ADR-0030](../../adr/0030-testing-library-jsdom-component-tests.md).
`packages/ui`'s jsdom setup is actively exercised by 6 live `*.test.tsx`
files (`field-scaffold.test.tsx`, `alert.test.tsx`, `toast.test.tsx`,
`modal.test.tsx`, `smoke.test.tsx`, `app-shell.test.tsx`), so it is a live
config, not dead weight, and equally exposed to the failure mode even
though it hasn't been observed flaking.

Precedent to match, already in the repo:

- `apps/api/vitest.config.ts:6-7` — `testTimeout: 30_000` preceded by a
  one-line comment naming DB round-trips as the slow mechanism.
- `packages/domain/vitest.config.ts:6-9` — same value, a 3-line comment
  naming the CAM-2 whole-game simulation suite.

The convention this task follows: a short comment (1-3 lines) immediately
above `testTimeout: 30_000,` that names the _specific_ mechanism needing
the extra time. For this task the mechanism is CPU contention during a
full-monorepo gate run (`pnpm turbo ... --force` building/testing all 7
packages concurrently), which starves otherwise-fast jsdom renders (well
under 1s in isolation) of CPU past the 5000ms default — not a generic
"flaky test" excuse, and not a claim that any test itself is slow.

No shared/base vitest config exists in the repo to extend instead
(`@cambio/config` only exports tsconfig/eslint/prettier bases) — each of
the 6 `vitest.config.ts` files independently calls `defineConfig({...})`.
Per-package duplication of `testTimeout` here matches how every other
option in these files is already handled; extracting a shared base is out
of scope for this task.

Relevant skill: `frontend-architecture` — confirms `apps/web`/`packages/ui`
carry their own jsdom vitest suites since ADR-0030/CAM-15 and are run
through turbo like every other package; this task changes no import
boundary, no layering, and no component logic, so the rest of that skill
(projection rendering, pages/containers/components, token rules) doesn't
apply here beyond that confirmation.

## Plan of work

One step, two files, no ordering dependency between them (neither imports
the other; nothing else in the repo reads either file). Add an identical
`testTimeout: 30_000` line to the `test` object in each, appended after the
existing `setupFiles` key, with the CPU-contention comment immediately
above it. No other key changes in either file.

**`apps/web/vitest.config.ts`** — final content:

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Component tests per ADR-0030: testing-library on jsdom.
    environment: "jsdom",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    setupFiles: ["test/setup.ts"],
    // These jsdom renders finish in well under 1s in isolation, but a full
    // monorepo gate run (`pnpm turbo ... --force` building/testing all 7
    // packages concurrently) starves them of CPU past the 5s default.
    testTimeout: 30_000,
  },
})
```

**`packages/ui/vitest.config.ts`** — identical final content (same body,
same comment — the two packages share the exact failure mode).

This is a fully-determined, advisory-only code sketch per the plan
template: the diff above is expected to be applied verbatim, but if
`/implement` finds either file has drifted from what's quoted in
"Facts already gathered" by the time it runs, the two rules to preserve
are (1) `testTimeout: 30_000` with a same-style comment naming CPU
contention, appended without disturbing `environment`/`include`/
`setupFiles`, and (2) byte-identical bodies between the two files, since
that symmetry is what the root plan's functional contract and decision
log both call for.

## Concrete steps & validation

1. Edit `apps/web/vitest.config.ts` and `packages/ui/vitest.config.ts` per
   the content above.
2. Spot-check: `git diff apps/web/vitest.config.ts packages/ui/vitest.config.ts`
   — expect exactly a 4-line addition in each (comment + `testTimeout` line),
   nothing else changed, and the two diffs identical apart from the file
   path header.
3. Confirm no test file changed:
   `git status --porcelain -- '**/*.test.ts' '**/*.test.tsx'` — expect empty
   output.
4. Run the full gate: `pnpm turbo build typecheck lint test` (bare, not
   piped — see AGENTS.md's "Never pipe the gate"). Expect a clean exit
   status 0; `apps/web` and `packages/ui` test tasks should report their
   existing pass counts unchanged (no test added, none removed).
5. Because the original failure was probabilistic (CPU contention under a
   forced concurrent `--force` run), this single clean gate run cannot
   prove the flake is gone — that's expected per the root plan's Validation
   section, not a gap to chase here.

## Contract coverage

_(maintained by `/implement`, verified by `/review`; see root plan's
Acceptance criteria for the full list this table maps to. This task adds
no new tests, so every row is a config edit verified by gate + manual
inspection, not a unit test — per the template's rule against inventing
test rows.)_

| Clause                                                                   | Test (file + name) | What is asserted                                                                              |
| ------------------------------------------------------------------------ | ------------------ | --------------------------------------------------------------------------------------------- |
| `apps/web/vitest.config.ts` sets `testTimeout: 30_000` with a comment    | none               | Config edit, no test — verified by gate passing and manual file inspection (step 2 above).    |
| `packages/ui/vitest.config.ts` sets `testTimeout: 30_000` with a comment | none               | Config edit, no test — verified by gate passing and manual file inspection (step 2 above).    |
| No `.test.ts`/`.test.tsx` file anywhere is modified                      | none               | Verified by `git status --porcelain` scoped to test globs (step 3 above), not by a test.      |
| `pnpm turbo build typecheck lint test` passes                            | none               | Verified by running the gate bare and checking its exit status (step 4 above), not by a test. |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [ ] YYYY-MM-DD HH:MM — step

## Surprises & notes for the root plan

_(anything the root plan's Decision Log or the reviewer must know)_
