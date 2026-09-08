# 0017 — Effect-only external imports via ordered boundaries/dependencies policies, split by src/test file blocks

- **Status:** accepted
- **Date:** 2026-09-01
- **Task:** CAM-11; amended by CAM-12
- **Amended:** 2026-09-01 (CAM-12) — extended the Decision to also cover Node
  builtin imports (`eslint-plugin-boundaries` origin `"core"`), a third gap
  in the same mechanism found during the CAM-4 review. The original
  mechanism for npm-package externals is unchanged; this amendment adds a
  parallel policy for builtins. Amended in place rather than superseded
  because the ADR was still `proposed` (release-v0 has not merged to
  `development`) and this closes an unstated gap in the original decision
  rather than reversing it.

## Context

Gap 1 (CAM-11) requires restricting non-workspace (npm) imports in
`packages/domain`, `packages/contracts`, and `packages/application` to
`effect` only — but only under `src/`, since each layer's `test/**` files
legitimately import `vitest`/`@effect/vitest`, which are neither workspace
packages nor `effect`.

**Gap 3 (CAM-12, found during the CAM-4 review):** `eslint-plugin-boundaries`
does not classify every non-workspace import as `origin: "external"`. Node
builtins (`node:crypto`, or the bare form `crypto`) are classified under a
distinct origin, `"core"` (`@boundaries/elements`'s `ORIGINS_MAP.CORE`,
resolved via Node's own `module.builtinModules`). Both the `node:`-prefixed
and bare forms resolve to the same origin — `@boundaries/elements` strips the
`node:` prefix before checking `builtinModules`, but does not normalize the
`source` field it reports back, so the two forms are the same origin with
different `source` strings. The external-only disallow/allow pair added for
Gap 1 matches `origin: "external"` exclusively, so it never inspects `"core"`
imports at all — `import { randomUUID } from "node:crypto"` (or bare
`"crypto"`) into `packages/domain/src` (or `contracts`/`application`) lints
clean, silently bypassing the effect-only rule.

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

**Gap 3 (builtins, CAM-12):** each effect-only layer's `src/**/*.{ts,tsx}`
block gains a third policy in its ordered set: `disallow: { to: { module: {
origin: "core" } } }`, with **no `source` key at all**. Omitting `source`
matters — `@boundaries/elements` only short-circuits a selector key to "match
everything" when the key is absent; supplying `source: ["crypto"]` (or any
enumerated list) would match only the exact strings written in the source
code and miss the other specifier form (`node:crypto` vs bare `crypto`
resolve to the same `origin: "core"` but different, unnormalized `source`
strings — see Context). A source-less `origin: "core"` disallow catches every
Node builtin, in either specifier form, present or future, with one policy
per layer — no enumeration to keep in sync with Node's builtin list. This
policy is independent of the existing external disallow/allow pair (a given
import's origin is either `"external"` or `"core"`, never both, so the two
policy pairs never compete for the same import) and needs no ordering
relative to them. It carries no `allow` counterpart — no builtin is ever
permitted in these three layers' `src/**`, unlike `effect` among externals.
`test/**` is unaffected, per the existing src/test split.

A `no-restricted-imports` (or `no-restricted-syntax`) alternative was
considered and rejected for Gap 3 specifically — see Rejected below.

Rejected:

- **`no-restricted-imports` enumerating builtin names, for Gap 3** — already
  used elsewhere in `cambioConfig` (banning `zod`), but it matches literal
  specifier strings/globs with no builtin-awareness: a `patterns: ["node:*"]`
  entry only catches the prefixed form, and the bare form (`crypto`, `fs`,
  `path`, …) would need an explicit, hand-maintained list that silently goes
  stale against Node builtins added after the list is written
  (`node:sqlite`, `diagnostics_channel`, etc.). The `origin: "core"` policy
  delegates that list to Node's own `module.builtinModules`, which is
  strictly stronger and needs no maintenance.

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
- **(CAM-12)** The effect-only-external policy pair per layer becomes a
  policy _triple_ (external disallow, external `effect` allow, core
  disallow) — anyone touching these `src/**` blocks again must account for
  all three, not just the external pair, or a fourth silent gap of the same
  shape becomes possible. The regression suite gains a third "Gap" describe
  block (builtins, both specifier forms) alongside the existing two,
  following the same per-layer `cases` loop pattern.
- **(CAM-12)** `Date.now()`/`new Date()` in `packages/application` remains
  explicitly out of scope: it is a global reference, not an import, and
  `boundaries/dependencies` (or `no-restricted-imports`) cannot see it at
  all — only `no-restricted-syntax` could, a different rule family. Left
  review-enforced for now; a future task may add `no-restricted-syntax` if
  this proves insufficient in practice.
