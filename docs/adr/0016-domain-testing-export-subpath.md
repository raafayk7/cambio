# 0016 — The simulation harness ships from domain via a "./testing" export subpath

- **Status:** proposed
- **Date:** 2026-08-31
- **Task:** CAM-3

## Context

CAM-2's simulation harness (driver, candidate enumeration, policies,
invariant checkers) lives in `packages/domain/test/sim/` — deliberately
outside the built surface: `tsconfig.build.json` compiles `src/` only and
`package.json` exports only `"."`. CAM-3's integration tests live in
`apps/api/test/` and must drive thousands of randomized games against
Postgres to prove event-log reconstruction, which means reusing the harness
from another workspace package. Nothing can import it today.

Ways to bridge that:

1. **Export subpath** — move the harness modules into
   `packages/domain/src/testing/` and add a `"./testing"` entry to domain's
   `exports`; consumers import `@cambio/domain/testing`.
2. **Relative cross-package import** — `apps/api/test/` reaches into
   `../../packages/domain/test/sim/` directly. Works under vitest, but
   bypasses the built `dist`, breaks `rootDir`, and is invisible to the
   ESLint boundary rules.
3. **Relocate the DB tests into `packages/domain/test/`** — the tests would
   import `@effect/sql-pg` from inside domain, violating §3.1's
   "domain imports `effect` only". Worse, ESLint would not catch it: the
   boundary config derives deny-lists only from `@cambio/*` workspace
   packages (`packages/config/eslint.base.js`), so the violation would live
   silently.
4. **Duplicate a thin driver in `apps/api/test/`** — guaranteed drift from
   the real harness.

## Decision

We use the export subpath: the reusable harness modules move to
`packages/domain/src/testing/`, exported as `@cambio/domain/testing`.
Domain's own test files keep importing them (now relatively from `src/`);
`apps/api` tests import the subpath like any workspace dependency.

The harness already satisfies domain's purity and import rules (`effect`
only, fully deterministic), so moving it under `src/` changes no rule —
it only makes the code part of the built package.

Rejected: relative imports (invisible to lint, breaks the package
boundary), relocating tests into domain (a real §3.1 violation with no CI
guard), duplication (drift).

## Consequences

- Test-support code is part of domain's published surface. That is
  deliberate, not an accident to clean up: the subpath exists so server-side
  tests (CAM-3's round-trips, CAM-5's use-case tests, the future bot's
  training loops) share one driver. `apps/web` still cannot reach it — the
  ESLint boundary already bans all of `@cambio/domain` there.
- The harness is now held to `src/` standards: it compiles under
  `tsconfig.build.json`, is linted as production code, and its exports are
  API surface — breaking changes to it are breaking changes.
- The main `"."` barrel does **not** re-export testing helpers; simulation
  machinery stays out of the default import path.
