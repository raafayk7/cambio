# CAM-25 — Harden testing-library async-utility timeouts against CPU-load flakiness too (frontend)

- **Root plan:** [root/CAM-25.md](../root/CAM-25.md) — the functional
  contract lives there; this document is implementation detail for one side.

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

Two files, both currently byte-for-byte identical (per the root plan's
exploration), 9 lines each, neither calling `configure()` today:

```ts
import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

// Vitest globals are off repo-wide, so testing-library cannot register its
// own cleanup — do it explicitly.
afterEach(() => {
  cleanup()
})
```

- `apps/web/test/setup.ts`
- `packages/ui/test/setup.ts`

Both configs are jsdom + `@testing-library/react` per
[ADR-0030](../../adr/0030-testing-library-jsdom-component-tests.md), and both
are referenced as `setupFiles: ["test/setup.ts"]` from their respective
`vitest.config.ts` — the files CAM-24 already hardened with
`testTimeout: 30_000`. This task hardens a different, independent timeout
mechanism that lives inside these `setup.ts` files instead.

Facts confirmed during this session's exploration:

- Both packages pin `@testing-library/react@16.3.3`
  (`apps/web/package.json:27`, `packages/ui/package.json:31`), transitively
  resolving `@testing-library/dom@10.4.1`.
- `@testing-library/react` re-exports `configure` and the `Config` type
  (which includes `asyncUtilTimeout: number`) unchanged from
  `@testing-library/dom` — confirmed via
  `node_modules/.pnpm/@testing-library+dom@10.4.1/node_modules/@testing-library/dom/types/config.d.ts`
  and `@testing-library/react`'s own `types/index.d.ts`
  (`export * from '@testing-library/dom'` plus a redeclare that only adds
  `reactStrictMode`).
- `@testing-library/react`'s `dist/pure.js` calls
  `configure({ unstable_advanceTimersWrapper, asyncWrapper })` at
  module-load time — a partial merge that never touches `asyncUtilTimeout`,
  so it will not clobber a later `configure({ asyncUtilTimeout: 10_000 })`
  call added in `setup.ts`.
- Async query call sites, all currently with zero per-call `{ timeout: N }`
  overrides (so all are affected by the global default today, and all will
  pick up the new `10_000` value): heaviest user
  `apps/web/test/game-screen.test.tsx` (~90+ call sites), plus
  `apps/web/test/room-screen.test.tsx`, `apps/web/test/lobby-screen.test.tsx`,
  `apps/web/test/score-sheet.test.tsx`, `packages/ui/test/modal.test.tsx`
  (lines 21, 33, 44, 60, all `waitFor`).
- No shared vitest base or setup file exists to extend instead — each of the
  6 `vitest.config.ts` files independently calls `defineConfig({...})`; only
  `apps/web` and `packages/ui` declare `setupFiles: ["test/setup.ts"]`.
- No ESLint import-boundary rule restricts what `test/setup.ts` may import
  in either package (`web`/`ui` layers aren't in
  `EFFECT_ONLY_EXTERNAL_LAYERS`, and the only applicable rule is the
  workspace-package boundary, which says nothing about npm packages like
  `@testing-library/react`).

Relevant skill: `frontend-architecture` — confirms `apps/web`/`packages/ui`
carry their own jsdom vitest suites since ADR-0030/CAM-15 and are run
through turbo like every other package; this task changes no import
boundary, no layering, and no component logic (it touches only test-harness
wiring), so the rest of that skill (projection rendering,
pages/containers/components, token rules) doesn't apply here beyond that
confirmation.

## Plan of work

One step, two files, no ordering dependency between them (neither imports
the other; nothing else in the repo reads either file). Add a
`configure({ asyncUtilTimeout: 10_000 })` call to each, importing `configure`
alongside the existing `cleanup` import from `@testing-library/react`, with
an explanatory comment (1-3 lines) immediately above the call — matching the
comment convention CAM-24 established above `testTimeout: 30_000,` in the
sibling `vitest.config.ts` files, but adapted: this comment must name CPU
contention **and** explicitly note that `asyncUtilTimeout` is a separate
mechanism from vitest's own `testTimeout` (which CAM-24 already raised), so
a future reader doesn't assume CAM-24 covered this too. No other line in
either file changes.

**`apps/web/test/setup.ts`** — final content:

```ts
import "@testing-library/jest-dom/vitest"
import { cleanup, configure } from "@testing-library/react"
import { afterEach } from "vitest"

// Vitest globals are off repo-wide, so testing-library cannot register its
// own cleanup — do it explicitly.
afterEach(() => {
  cleanup()
})

// testing-library's async queries (findBy*/waitFor) carry their own
// internal timeout, separate from vitest's testTimeout (raised in
// vitest.config.ts per CAM-24) — raise it too so the same CPU-contention
// flakiness under a full-monorepo gate run doesn't starve these queries
// past their much shorter 1000ms default.
configure({ asyncUtilTimeout: 10_000 })
```

**`packages/ui/test/setup.ts`** — identical final content (same body, same
comment — the two packages share the exact failure mode, matching CAM-24's
both-packages precedent).

This is an advisory-only code sketch per the plan template: it orients the
implementer but is not itself the artifact reconciled at close-out. If
`/implement` finds either file has drifted from what's quoted in "Context &
orientation" by the time it runs, the rules to preserve are (1) `configure`
imported from `@testing-library/react` alongside the existing `cleanup`
import, (2) the `configure({ asyncUtilTimeout: 10_000 })` call placed after
the `afterEach` block with a comment naming CPU contention and explicitly
distinguishing this from vitest's `testTimeout`, (3) the existing
`afterEach(() => cleanup())` block and `@testing-library/jest-dom/vitest`
import left exactly as they are, and (4) byte-identical bodies between the
two files, since that symmetry is what the root plan's functional contract
and decision log both call for.

## Concrete steps & validation

1. Edit `apps/web/test/setup.ts` and `packages/ui/test/setup.ts` per the
   content above.
2. Spot-check: `git diff apps/web/test/setup.ts packages/ui/test/setup.ts` —
   expect a small, identical addition in each (the `configure` import change
   plus the comment + call block), nothing else changed, and the two diffs
   identical apart from the file path header.
3. Confirm no test file or `vitest.config.ts` changed:
   `git status --porcelain -- '**/*.test.ts' '**/*.test.tsx' '**/vitest.config.ts'`
   — expect empty output.
4. Run the full gate: `pnpm turbo build typecheck lint test` (bare, not
   piped — see AGENTS.md's "Never pipe the gate"). Expect a clean exit
   status 0; `apps/web` and `packages/ui` test tasks should report their
   existing pass counts unchanged (no test added, none removed).
5. Because the originating failure was probabilistic (CPU contention under
   a forced concurrent `--force` run), this single clean gate run cannot
   prove the flake is gone — that's expected per the root plan's Validation
   section, not a gap to chase here.

## Contract coverage

_(maintained by `/implement`, verified by `/review`; see root plan's
Acceptance criteria for the full list this table maps to. This task adds
no new tests, so every row is a config edit verified by gate + manual
inspection, not a unit test — per the template's rule against inventing
test rows.)_

| Clause                                                                                                               | Test (file + name) | What is asserted                                                                                 |
| -------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------ |
| `apps/web/test/setup.ts` calls `configure({ asyncUtilTimeout: 10_000 })` with a comment                              | none               | Config edit, no test — verified by gate passing and manual file inspection (step 2 above).       |
| `packages/ui/test/setup.ts` calls the identical `configure({ asyncUtilTimeout: 10_000 })` with an equivalent comment | none               | Config edit, no test — verified by gate passing and manual file inspection (step 2 above).       |
| No `.test.ts`/`.test.tsx` file anywhere is modified                                                                  | none               | Verified by `git status --porcelain` scoped to test globs (step 3 above), not by a test.         |
| Neither `vitest.config.ts` file is modified                                                                          | none               | Verified by `git status --porcelain` scoped to `vitest.config.ts` (step 3 above), not by a test. |
| `pnpm turbo build typecheck lint test` passes                                                                        | none               | Verified by running the gate bare and checking its exit status (step 4 above), not by a test.    |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [x] 2026-09-06 14:55 — Both files edited exactly as sketched in "Plan of
      work" above (verbatim, no drift from the quoted current state).
      Steps 1-3 of "Concrete steps & validation" run: diffs identical
      (7-line addition each — `configure` added to the existing `cleanup`
      import, plus the comment + call block), the two files confirmed
      still byte-identical to each other, `git status --porcelain` scoped
      to test globs and `vitest.config.ts` empty.
- [x] 2026-09-06 14:56 — Step 4: full gate green —
      `pnpm turbo build typecheck lint test`, 25/25 tasks successful.
      `@cambio/web:test` 20 files / 204 tests passed (pass count unchanged
      from CAM-24's last recorded run); `@cambio/ui:test` 6 files / 25 tests
      passed (pass count unchanged). No test added, none removed, per the
      contract.

## Surprises & notes for the root plan

_(anything the root plan's Decision Log or the reviewer must know)_
