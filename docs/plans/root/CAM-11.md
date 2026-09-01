# CAM-11 — Harness: close both ESLint boundary gaps (external imports into domain/contracts/application + subpath deny-matching)

- **Linear:** [CAM-11](https://linear.app/raafayk7/issue/CAM-11)
- **Scope:** harness/tooling — root plan only, no backend/frontend child plan (see
  Decision Log). The fix lives entirely in `packages/config/eslint.base.js`, a
  shared dev-tooling package that isn't part of the import-boundary graph
  itself.
- **Child plans:** none
- **ADRs:** [0017](../../adr/0017-effect-only-external-imports-split-src-test-blocks.md)
  — mechanism for the effect-only-external check and the src/test file-block
  split it requires.

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

Today, `pnpm turbo lint` silently passes two import-boundary violations that
AGENTS.md and ADR-0016 claim are impossible:

1. `packages/domain` (and `packages/contracts`, `packages/application`) can
   `import` any npm package — `@effect/sql-pg`, `pg`, anything — even though
   their written rule (§3.1 of the handoff, mirrored in the `architecture`
   skill) is "`effect` only." Only pnpm's strict `node_modules` is preventing
   this today, not lint or CI.
2. `eslint-plugin-boundaries` matches import sources via micromatch, and a
   bare deny-list entry like `"@cambio/domain"` does not match the subpath
   `"@cambio/domain/testing"` (ADR-0016's export). `apps/web` importing that
   subpath today is blocked only by pnpm (no `@cambio/domain` dependency
   declared), not by lint.

After this task: `pnpm turbo lint` fails if `packages/domain/src`,
`packages/contracts/src`, or `packages/application/src` import any npm
package other than `effect` (or a `@cambio/*` package they're already
allowed to import), and fails if any package imports a denied workspace
package via **any** subpath, not just the bare specifier. `test/**` files in
those three packages are unaffected — they keep importing `vitest` /
`@effect/vitest` as before. A permanent automated test in
`packages/config` proves both gaps stay closed; the two illegal-import
probes described in the Linear issue (`@effect/platform` into
`packages/domain/src`, `@cambio/domain/testing` into `apps/web/src`) are used
transiently during implementation to hand-verify `pnpm turbo lint` catches
them, then reverted — they are not part of the shipped diff.

Observe it working: temporarily add either illegal import, run
`pnpm turbo lint`, watch it fail on `boundaries/dependencies`; revert; run
`pnpm turbo build typecheck lint test` clean. Separately,
`pnpm --filter @cambio/config test` runs the new regression suite.

## Context & orientation

- **File to change:** [packages/config/eslint.base.js](../../../packages/config/eslint.base.js)
  — the single shared `cambioConfig({layer, ...})` factory every package's
  `eslint.config.js` calls (six call sites, one per workspace package:
  `packages/{domain,contracts,application,ui}/eslint.config.js`,
  `apps/{api,web}/eslint.config.js` — none of them need to change; they just
  call the factory).
- **Current shape** (already read in full): `WORKSPACE_PACKAGES` (the four
  `@cambio/*` packages), `MAY_IMPORT` (per-layer allowed workspace deps),
  `LAYER_RATIONALE` (per-layer error message). `cambioConfig` derives
  `denied = WORKSPACE_PACKAGES.filter(pkg => !allowed.includes(pkg))` and
  wires a single `boundaries/dependencies` rule with one policy
  (`disallow: {to: {module: {origin: "external", source: denied}}}`) inside
  one combined config block covering `files: ["src/**/*.{ts,tsx}",
"test/**/*.{ts,tsx}"]`. "External" here means "not resolved as this
  package itself" — workspace packages resolve through node_modules symlinks
  so they show up with `origin: "external"` too (`checkAllOrigins: true` is
  already set for this reason — see `eslint.base.js:129-136`).
- **Package.json / build wiring:** `packages/config/package.json` currently
  has no `scripts` key at all (no `test` script) and no `test/` directory —
  `pnpm turbo test` is a no-op there today. `turbo.json`'s `test` task
  (`turbo.json:41-49`) just runs each workspace's own `test` script with
  `dependsOn: ["^build"]`; adding a `test` script to `packages/config` is all
  that's needed to wire it in, no `turbo.json` change required.
  `packages/domain/package.json` is the pattern to follow for adding
  `vitest` as a devDependency and a `"test": "vitest run"` script.
- **Governing skill:** `architecture` (the import table, §"Verifying a
  boundary"). ADR-0016 (why `packages/domain/src/testing/` exists and is
  held to `src/` production-code standards, not `test/` standards — this is
  why the effect-only-external check applies to `src/testing/**` too, since
  it's part of `src/`).
- **No domain/application/contracts/web code changes.** This task does not
  touch game logic, `apps/api`, or `apps/web` source — only the shared lint
  config, `packages/config/package.json`, and a new
  `packages/config/test/` directory.

## Functional contract

1. For `packages/domain`, `packages/contracts`, and `packages/application`:
   any `src/**/*.{ts,tsx}` file importing an external (npm) package other
   than `effect` is a lint error (`boundaries/dependencies`), using each
   layer's existing `LAYER_RATIONALE` message (extended to mention the
   external-only-effect rule) or a new rationale entry — implementer's
   call, consistent with the existing per-layer message style.
2. For those same three packages: any `test/**/*.{ts,tsx}` file's external
   (npm) imports are **unrestricted**, exactly as today (so `vitest` and
   `@effect/vitest` continue to lint clean in `packages/domain/test/`).
3. `packages/ui`, `apps/api`, `apps/web` are unaffected by the
   effect-only-external check — their `MAY_IMPORT` rows don't say "effect
   only," so they keep unrestricted npm access (confirmed during
   exploration: none of their written rules restrict external packages
   today).
4. For every layer's workspace-package deny-list (the existing
   `WORKSPACE_PACKAGES`-derived mechanism), a denied package `@cambio/foo`
   is matched both as the bare specifier `@cambio/foo` **and** any subpath
   `@cambio/foo/**` — so `apps/web` importing `@cambio/domain/testing`
   fails lint exactly like importing `@cambio/domain` does today. This
   applies uniformly to both the `src/**` and `test/**` blocks, for every
   layer (not just the three effect-only layers) — Gap 2 is orthogonal to
   Gap 1 and affects every layer's existing workspace-deny policy.
5. `packages/config` gains a permanent automated regression test (new
   `packages/config/test/` directory, `vitest` devDependency, `"test":
"vitest run"` script) that:
   - asserts an `@effect/sql-pg` (or similar non-`effect` external) import
     in a simulated `packages/domain/src/*.ts` file produces a
     `boundaries/dependencies` lint error under `cambioConfig({layer:
"domain"})`;
   - asserts the same import in a simulated `packages/domain/test/*.ts`
     file produces **no** such error (proving the src/test split didn't
     over-restrict);
   - asserts a `@cambio/domain/testing` subpath import produces a
     `boundaries/dependencies` lint error under `cambioConfig({layer:
"web"})` (Gap 2);
   - covers `contracts` and `application` for the effect-only check too
     (at minimum one positive case each), not just `domain`.
6. `pnpm turbo build typecheck lint test` passes repo-wide with no other
   package's lint output changed (i.e., no false positives introduced for
   legitimate existing imports across the whole repo — this is checked by
   simply running the full gate, since every existing file must still lint
   clean).

### Acceptance criteria

- [x] `packages/config/eslint.base.js` implements both fixes per ADR-0017's
      mechanism (ordered `disallow`-then-`allow` policies, split into
      mutually-exclusive `src/**` / `test/**` file blocks for `domain`,
      `contracts`, `application`; `[pkg, \`${pkg}/**\`]` deny patterns for
      every layer).
- [x] Manual verification performed and reverted: an `@effect/platform`
      import added to `packages/domain/src` makes `pnpm turbo lint` fail;
      an `import ... from "@cambio/domain/testing"` added to `apps/web/src`
      makes `pnpm turbo lint` fail; both reverted before commit (`git diff`
      clean on those files at close-out).
- [x] `packages/config` has a new automated test suite covering the six
      cases in Functional Contract clause 5, passing under
      `pnpm --filter @cambio/config test`.
- [x] `pnpm turbo build typecheck lint test` passes clean repo-wide.
- [x] ADR-0017 accurately reflects the as-shipped mechanism (update it if
      implementation deviates — see the `adr` skill: never let an ADR drift
      from the code it documents without updating it). No deviation: the
      mechanism shipped exactly as proposed.

## Plan of work

Single milestone — this is a small, self-contained tooling fix with no
parallelizable lanes and no contracts/schema dependency.

1. **Restructure `packages/config/eslint.base.js`.**
   - Add a constant listing which layers get the effect-only-external check
     (`domain`, `contracts`, `application`) and what their external
     allow-list is (`["effect"]` for all three, per the current import
     table — `application`'s workspace allow-list, `["@cambio/domain",
"@cambio/contracts"]`, is unaffected by this; it's a separate,
     existing mechanism).
   - Change the workspace deny-pattern derivation so every denied package
     name `pkg` becomes the pair `[pkg, \`${pkg}/**\`]`(flattened into the`source` array), for **every** layer — this is Gap 2 and applies
     regardless of whether a layer also gets the effect-only-external
     check.
   - For the three effect-only layers, replace the single combined
     `files: ["src/**/*.{ts,tsx}", "test/**/*.{ts,tsx}"]` config block with
     two blocks:
     - `files: ["src/**/*.{ts,tsx}"]`: existing workspace-deny policy, plus
       two new policies in this order — (a) `disallow` `{module: {origin:
"external", source: ["!@cambio/**"]}}`, (b) `allow` `{module:
{origin: "external", source: ["effect"]}}`. Order matters
       (last-write-wins per ADR-0017) — (b) must come after (a).
     - `files: ["test/**/*.{ts,tsx}"]`: the existing workspace-deny policy
       only, unchanged from today.
     - `boundaries/elements` settings can stay declared once (ESLint
       flat-config deep-merges `settings`, confirmed during exploration) —
       don't duplicate unless it turns out clearer to.
   - `ui`, `api`, `web` keep their current single combined block — no
     restructuring needed for those three.
   - Update `LAYER_RATIONALE` (or add a parallel rationale for the new
     policies) so lint failures explain _why_, matching the existing
     per-layer message style.
2. **Manual verification (per the issue and the architecture skill).**
   Temporarily add the two illegal imports described in the issue, confirm
   `pnpm turbo lint` fails on each with a `boundaries/dependencies` message,
   revert both. Do this after step 1 and before step 3, so the automated
   test in step 3 is validated against a mechanism already known to work.
3. **Add the regression test to `packages/config`.**
   - Add `vitest` as a devDependency (pin to the version already used
     elsewhere in the monorepo — check `packages/domain/package.json`'s
     `vitest` version at implementation time) and `"test": "vitest run"` to
     `packages/config/package.json`.
   - New `packages/config/test/` directory. Use `eslint`'s programmatic
     `ESLint` class (`new ESLint({overrideConfig: cambioConfig({layer:
...}), ...})` and `.lintText(source, {filePath})`) to feed small
     inline fixture strings through the real composed config, setting
     `filePath` to a path under the relevant package's `src/` or `test/`
     (e.g. `packages/domain/src/probe.ts`) so the `boundaries/elements`
     folder-pattern matching resolves correctly. Assert on
     `results[0].messages` containing a `ruleId: "boundaries/dependencies"`
     entry for the six cases in Functional Contract clause 5.
   - No new test-tooling dependency beyond `vitest` (already used
     elsewhere in the repo) — `@typescript-eslint/rule-tester` is
     deliberately not introduced (ADR-0017's rejected alternatives).
4. **Full gate.** Run `pnpm turbo build typecheck lint test` from repo
   root; fix any unexpected fallout (there shouldn't be any, since no
   existing file in the repo imports a non-`effect` external package from
   `packages/{domain,contracts,application}/src/`, and no existing file
   imports a `@cambio/*` subpath from a denied context — both confirmed
   during exploration via repo-wide grep).
5. **Reconcile ADR-0017** if the implementation needed to deviate from the
   proposed mechanism (e.g. a different rationale-message shape, a
   different fixture-path convention) — update the ADR's Decision/Consequences
   text in the same commit as the code, per the `adr` skill.

## Validation

- `pnpm --filter @cambio/config test` — the new regression suite; expect
  all six assertions (three effect-only-external cases: domain positive,
  domain-test negative, plus at least one each for contracts/application;
  and the subpath case) to pass.
- `pnpm turbo lint` — full repo, expect clean (no new failures on existing
  code).
- `pnpm turbo build typecheck test` — full repo, expect clean (no behavior
  change to any runtime code, since only `packages/config` and
  `packages/config`'s own new test changed).
- Manual verify-then-revert of both illegal-import probes (step 2 above) —
  this is the acceptance-tested behavior the automated suite then pins
  permanently.

## Progress

_(updated continuously; append new entries at the BOTTOM — newest last;
timestamp each entry)_

- [x] 2026-09-01 — plan written and signed off
- [x] 2026-09-01 — `packages/config/eslint.base.js` restructured: `EFFECT_ONLY_EXTERNAL_LAYERS`
      constant added, workspace deny patterns changed to `[pkg, pkg/**]`,
      `domain`/`contracts`/`application` split into mutually-exclusive
      `src/**` and `test/**` config blocks per ADR-0017
- [x] 2026-09-01 — manual verify-then-revert performed: `@effect/platform`
      import in `packages/domain/src` and `@cambio/domain/testing` import
      in `apps/web/src` both failed `pnpm --filter <pkg> lint` with a
      `boundaries/dependencies` error as expected; both probes removed,
      `git status --porcelain` confirmed clean before continuing
- [x] 2026-09-01 — regression suite added at `packages/config/test/eslint.base.test.ts`
      (8 tests via `eslint`'s programmatic `ESLint#lintText`), `vitest`
      devDependency + `"test": "vitest run"` script added to
      `packages/config/package.json`; `pnpm --filter @cambio/config test`
      green on first run
- [x] 2026-09-01 — full gate green: `pnpm turbo build typecheck lint test`
      — 21/21 tasks passed repo-wide, no fallout in any other package

## Decision log

- 2026-09-01 — **Root plan only, no backend/frontend child plan** — the fix
  lives entirely in `packages/config`, a shared dev-tooling package that
  isn't a node in the `apps/api` / `apps/web` import-boundary graph itself;
  the transient verification imports touch `packages/domain/src` and
  `apps/web/src` but are reverted probes, not shipped implementation detail
  warranting a child plan. Confirmed with the user during the interview
  round.
- 2026-09-01 — **Gap 1 generalized to `domain`, `contracts`, and
  `application`**, not scoped to `domain` alone as the issue's literal text
  suggests — all three layers' written import rule (§3.1) is effectively
  "effect only" for external packages, and fixing only `domain` would leave
  the identical silent hole open for the other two. Confirmed with the
  user during the interview round.
- 2026-09-01 — **Effect-only-external check scoped to `src/**` only, not
  `test/**`** — `packages/domain/test/**/*.ts` already legitimately imports
  `vitest` and `@effect/vitest`; restricting `test/**` too would break the
  existing test suite immediately. Matches ADR-0016's framing that `src/`
  (including the `testing/` export subpath) is held to production-code
  standards while `test/` is not. Confirmed with the user during the
  interview round; mechanism promoted to [ADR-0017](../../adr/0017-effect-only-external-imports-split-src-test-blocks.md)
  because the src/test split requires a specific, non-obvious config
  structure (mutually-exclusive file blocks) that a future edit could
  easily collapse back into a bug.
- 2026-09-01 — **Add a permanent automated regression test**, not just the
  manual verify-then-revert procedure the issue and the architecture skill
  already describe — CAM-11 exists specifically because these two holes
  went unnoticed silently; a manual-only check doesn't prevent a future
  edit from reopening either gap. Confirmed with the user during the
  interview round.
- 2026-09-01 — **Reused the existing per-layer `LAYER_RATIONALE` message for
  the new effect-only-external `disallow` policy, rather than writing a new
  rationale entry** — the existing text for `domain` ("may import `effect`
  only"), `contracts` (same), and `application` ("may import `domain`,
  `contracts` and `effect` only") already states the external-import rule
  precisely; a second, near-duplicate message would drift from the first
  over time. Functional contract clause 1 left this as the implementer's
  call.

## Surprises & discoveries

None — the exploration's findings (last-write-wins `boundaries/dependencies`
semantics, the `!@cambio/**` / `effect` policy ordering, `ESLint#lintText`
resolving `boundaries/elements` correctly via `cwd`) all held exactly as
predicted. Both manual verification probes and all 8 regression-test
assertions passed on the first run; no rework was needed.

## Outcomes & retrospective

_(filled at the end, typically by `/review`)_
