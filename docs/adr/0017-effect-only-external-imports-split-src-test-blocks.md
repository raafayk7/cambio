# 0017 — Effect-only external imports via ordered boundaries/dependencies policies, split by src/test file blocks

- **Status:** proposed
- **Date:** 2026-09-01
- **Task:** CAM-11

## Context

Gap 1 (CAM-11) requires restricting non-workspace (npm) imports in
`packages/domain`, `packages/contracts`, and `packages/application` to
`effect` only — but only under `src/`, since each layer's `test/**` files
legitimately import `vitest`/`@effect/vitest`, which are neither workspace
packages nor `effect`.

`eslint-plugin-boundaries`'s `boundaries/dependencies` rule evaluates its
`policies` array with **last-write-wins** semantics (confirmed in
`Dependencies.js`): the last policy object that matches determines the
outcome, and `disallow` beats `allow` _within_ a single policy but not
across policies. Critically, ESLint's flat-config merge behavior means that
if two config blocks both declare `boundaries/dependencies` for overlapping
`files` globs, the **second block's rule options fully replace the
first's** — they do not merge. A naive "add a second block for `src/**`
with the new effect-only policies" would silently discard the existing
workspace-deny policies for every `src/` file.

The plugin also ships a `boundaries/external` rule, but it is deprecated —
its own handler shims into `boundaries/dependencies` internally.

## Decision

We use `boundaries/dependencies` exclusively (never the deprecated
`boundaries/external`). For each layer needing the effect-only-external
check (`domain`, `contracts`, `application`), `cambioConfig` is
restructured to emit two **mutually-exclusive** file blocks instead of one
combined `src/**+test/**` block:

- `files: ["src/**/*.{ts,tsx}"]` — carries the full policy set: the
  existing workspace-deny policy, plus two new ordered policies (`disallow`
  all `external` origin sources except `@cambio/**`, then `allow` `external`
  source `effect` — order matters, since the allow must come _after_ the
  disallow to win under last-write-wins).
- `files: ["test/**/*.{ts,tsx}"]` — carries only the existing workspace-deny
  policy, unchanged.

`boundaries/elements` settings are declared once and rely on ESLint's
flat-config deep-merge for `settings` (confirmed distinct from the rules
replace-behavior), so no duplication is needed there.

Gap 2 (subpath matching) is fixed orthogonally: every workspace-package
deny pattern becomes `[pkg, \`${pkg}/**\`]` instead of a bare package name,
applied uniformly across both blocks.

Rejected:

- **`boundaries/external`** — deprecated, shims into `boundaries/dependencies`
  anyway; using it directly would just add an extra migration warning for no
  benefit.
- **A single combined block with `from.file` category selectors**
  (`boundaries/files` settings) to distinguish src/test within one policy
  array — works, but requires an extra settings concept for no real benefit
  over two plain file globs.
- **`@typescript-eslint/rule-tester`** for the regression test — not
  installed anywhere in this repo and would add a new test-tooling
  dependency purely for a config-level check. `eslint`'s own programmatic
  `ESLint#lintText` (already a `packages/config` devDependency) exercises
  the actual composed flat config end-to-end against small fixture strings,
  which is a closer match to what's being verified.

## Consequences

- `cambioConfig` gains an external-effect-only-layers constant (e.g.
  `EFFECT_ONLY_EXTERNAL_LAYERS = ["domain", "contracts", "application"]`)
  and internal logic to build the two-block shape only for layers that need
  it; `ui`/`api`/`web` keep their current single combined block (no
  external restriction) since none of their written import rules mention
  "effect only."
- The src/test split is now load-bearing: anyone adding a third
  `boundaries/dependencies`-touching rule to one of these layers **must**
  preserve the mutually-exclusive globs, not reintroduce an overlapping
  block — doing so would silently drop policies rather than error.
- `packages/config` gains its first automated test suite (`vitest` added as
  a devDependency, a `test` script wired into `pnpm turbo test`), asserting
  both gaps stay closed via `ESLint#lintText` against fixture imports.
