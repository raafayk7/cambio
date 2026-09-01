# CAM-12 — Harness: ESLint boundaries — Node builtins bypass the effect-only rule

- **Linear:** [CAM-12](https://linear.app/raafayk7/issue/CAM-12)
- **Scope:** harness/tooling — root plan only, no backend/frontend child plan
  (see Decision Log; same shape as CAM-11, the task this one follows on
  from).
- **Child plans:** none
- **ADRs:** [0017](../../adr/0017-effect-only-external-imports-split-src-test-blocks.md)
  (amended, not superseded) — extends the existing effect-only-external
  mechanism to also cover Node builtins (`eslint-plugin-boundaries` origin
  `"core"`).

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

Today, `import { randomUUID } from "node:crypto"` (or the bare form
`"crypto"`, or any other Node builtin) inside `packages/domain/src`,
`packages/contracts/src`, or `packages/application/src` lints clean, even
though each layer's written rule is "`effect` only" for external imports.
This is because `eslint-plugin-boundaries` classifies Node builtins under a
distinct origin (`"core"`) that the existing effect-only policy — added by
CAM-11 for `origin: "external"` — never inspects. It is the third gap found
in this same enforcement family (CAM-11 closed the first two; this one was
found and probe-verified twice during the CAM-4 review).

After this task: `pnpm turbo lint` fails if `packages/domain/src`,
`packages/contracts/src`, or `packages/application/src` import any Node
builtin, in either specifier form (`node:crypto` or bare `crypto`). `apps/api`
is unaffected (never restricted) and continues importing builtins freely. A
permanent automated test proves the gap stays closed.

Observe it working: temporarily add `import { randomUUID } from
"node:crypto"` (and separately, the bare form `import { randomUUID } from
"crypto"`) into `packages/domain/src` and `packages/application/src`, run
`pnpm turbo lint`, watch each fail with a `boundaries/dependencies` message;
revert both; run `pnpm turbo build typecheck lint test` clean. Separately,
`pnpm --filter @cambio/config test` runs the new regression cases.

## Context & orientation

- **File changed:** [packages/config/eslint.base.js](../../../packages/config/eslint.base.js)
  — the same shared `cambioConfig({layer, ...})` factory CAM-11 touched.
  `EFFECT_ONLY_EXTERNAL_LAYERS` (`domain`, `contracts`, `application`,
  `eslint.base.js:58`) identifies the three layers needing this fix;
  `effectOnlyExternalPolicies` (`eslint.base.js:124-141`, as shipped) now
  holds the ordered external disallow/allow pair plus the new source-less
  `origin: "core"` disallow (`eslint.base.js:135-138`).
- **The bug, precisely** (confirmed by exploration against the installed
  `@boundaries/elements` source, `node_modules/.pnpm/@boundaries+elements@3.1.0.../dist/index.js`):
  `eslint-plugin-boundaries` resolves an import's origin via
  `ORIGINS_MAP = { LOCAL, EXTERNAL, CORE }`. Node builtins — both the
  `node:`-prefixed form and the bare form — are classified `origin: "core"`
  via Node's own `module.builtinModules` (the prefix is stripped before the
  lookup, so `node:crypto` and `crypto` resolve to the _same_ origin). The
  `source` field the plugin reports back is **not** normalized, though: it
  preserves whichever string form appeared in the import, so `node:crypto`
  and `crypto` are the same origin with two different `source` strings. The
  existing effect-only policies match `origin: "external"` exclusively —
  `"core"` never matches — so builtins bypass both the disallow and the
  `effect`-carve-out entirely, landing on the rule's `default: "allow"`.
- **The fix, precisely:** a `disallow: { to: { module: { origin: "core" } } }`
  policy, **with no `source` key**, added to each effect-only layer's
  `effectOnlyExternalPolicies`. `@boundaries/elements`'s selector matcher
  (`isObjectKeyMicromatchMatch`) short-circuits to "matches everything" when
  a selector key (`source`) is absent from the policy object — so omitting
  `source` is what makes one policy catch both specifier forms (and any
  future Node builtin) without enumerating names. This is a materially
  different, and stronger, guarantee than `no-restricted-imports` (already
  used elsewhere in this file to ban `zod`) could give: `no-restricted-imports`
  matches literal specifier strings, so it would need a hand-maintained list
  of every bare builtin name to catch the unprefixed form, and that list
  would silently go stale against builtins added to Node after the list was
  written. The `origin: "core"` policy delegates that enumeration to Node's
  own `module.builtinModules`, permanently.
- **No conflict with the existing external policy pair.** A given import's
  `origin` is either `"external"` or `"core"`, never both, so the new core
  policy and the existing external disallow/allow pair never compete over
  the same import — no ordering constraint between them. It goes in the same
  `src/**/*.{ts,tsx}` block (per the existing mutually-exclusive src/test
  split from ADR-0017) and carries no `allow` counterpart: no builtin is
  ever legitimate in these three layers' `src/**`, unlike `effect` among
  externals.
- **Confirmed no existing violation:** exploration grepped
  `packages/domain/src`, `packages/contracts/src`, `packages/application/src`
  for `node:` imports and common bare builtin names (`crypto`, `fs`, `path`,
  `url`, `os`, `util`, `stream`, `events`, `buffer`, `assert`) — zero hits.
- **Governing skills:** `architecture` (the import table; note its own text
  already names this exact gap as the reason "enforcement claims must be
  probe-verified when written" — this task is what closes that specific
  claim). `adr` (amending a still-`proposed` ADR in place vs. writing a new
  one — see Decision Log).
- **Explicitly out of scope** (confirmed with the user during the interview):
  `Date.now()`/`new Date()` calls in `packages/application` — a global
  reference, not an import, invisible to `boundaries/dependencies` or
  `no-restricted-imports`; only `no-restricted-syntax` could catch it, a
  different rule family. Stays review-enforced; not part of this task.
- **No domain/application/contracts/web runtime code changes.** Only
  `packages/config/eslint.base.js`, `packages/config/test/eslint.base.test.ts`,
  and `docs/adr/0017-*.md` (already amended during planning — see below)
  change.

## Functional contract

1. For `packages/domain`, `packages/contracts`, and `packages/application`:
   any `src/**/*.{ts,tsx}` file importing a Node builtin module — in either
   the `node:`-prefixed form (e.g. `node:crypto`) or the bare form (e.g.
   `crypto`) — is a lint error (`boundaries/dependencies`), using each
   layer's existing `LAYER_RATIONALE` message (reused, not duplicated —
   matching CAM-11's precedent).
2. For those same three packages: `test/**/*.{ts,tsx}` files' builtin
   imports remain **unrestricted** (unchanged from today — the existing
   src/test split already scopes the effect-only policies to `src/**` only;
   this task's new policy goes in the same `src/**` block and inherits that
   scoping without further work).
3. `packages/ui`, `apps/api`, `apps/web` are unaffected — none of their
   written import rules restrict externals, and this task does not touch
   their config blocks.
4. `packages/config` gains regression test coverage (shipped in
   `packages/config/test/eslint.base.test.ts:75-115`, a new "Gap 3" describe
   block) that:
   - asserts a `node:crypto` import in a simulated `src/*.ts` file produces
     a `boundaries/dependencies` error, for each of `domain`, `contracts`,
     `application`;
   - asserts the bare-form equivalent (`crypto`) produces the same error, in
     `domain` (the mechanism is origin-based and identical across specifier
     forms and layers, so full 3×2 coverage was not needed to pin the
     behavior — implementer's call, per the plan's note on not
     over-specifying test cases);
   - asserts a builtin import in `domain/test/*.ts` produces **no** error
     (proving the src/test split still holds for the new policy).
5. `Date.now()`/`new Date()` in `packages/application` is unchanged by this
   task — no `no-restricted-syntax` rule is added. (Explicitly deferred; see
   Context.)
6. `pnpm turbo build typecheck lint test` passes repo-wide with no other
   package's lint output changed.

### Acceptance criteria

- [x] `packages/config/eslint.base.js` adds a source-less
      `disallow: { to: { module: { origin: "core" } } }` policy to
      `effectOnlyExternalPolicies` (or an equivalent per-layer mechanism that
      achieves Functional Contract clause 1 without enumerating builtin
      names), reusing the existing `LAYER_RATIONALE` messages.
- [x] Manual verification performed and reverted: both `node:crypto` and
      bare `crypto` imports added to `packages/domain/src` (and at least one
      of `contracts`/`application`) each make `pnpm turbo lint` fail with a
      `boundaries/dependencies` message; both reverted before commit
      (`git status --porcelain` clean on those files at close-out).
- [x] `packages/config/test/eslint.base.test.ts` gains a new "Gap 3" (or
      similarly named) describe block per Functional Contract clause 4,
      passing under `pnpm --filter @cambio/config test`.
- [x] `pnpm turbo build typecheck lint test` passes clean repo-wide.
- [x] ADR-0017 accurately reflects the as-shipped mechanism — it was amended
      during planning (see Decision Log); implementer confirms no deviation,
      or updates it if the as-built mechanism differs from what's documented.

## Plan of work

Single milestone — small, self-contained tooling fix, no parallelizable
lanes, no contracts/schema dependency. The mechanism, exact policy shape,
and rationale are already fully specified above from exploration — this is
narrower than CAM-11 was (no new structural concept like the src/test
split; it slots one more policy into a structure CAM-11 already built).

1. **Add the core-origin policy.** In `packages/config/eslint.base.js`, add
   the source-less `origin: "core"` disallow policy to each effect-only
   layer's policy set (see Context for the exact shape and why `source`
   must be omitted). Reuse `LAYER_RATIONALE[layer]` for the message.
2. **Manual verify-then-revert**, per the issue and the `architecture`
   skill: add `node:crypto` and bare `crypto` imports to
   `packages/domain/src` and `packages/application/src`; confirm
   `pnpm turbo lint` fails on each with `boundaries/dependencies`; revert
   all four probes before continuing.
3. **Extend the regression suite.** Add the new describe block to
   `packages/config/test/eslint.base.test.ts`, following the existing
   per-layer `cases` loop pattern (see `eslint.base.test.ts:33-73`) and the
   `lintErrors`/`packageDir` helpers already defined there — no new
   test-tooling dependency.
4. **Full gate.** Run `pnpm turbo build typecheck lint test` from repo
   root; expect clean (exploration confirmed no existing file in the repo
   imports a Node builtin from `packages/{domain,contracts,application}/src/`
   today, so no fallout is expected).
5. **Confirm ADR-0017** matches the as-shipped mechanism. It was amended
   during planning to state the Gap 3 decision in advance (see Decision
   Log) — if implementation needs to deviate from what's written there
   (e.g. a different policy shape than the source-less `origin: "core"`
   disallow), update the ADR's Decision/Consequences text in the same
   commit as the code, per the `adr` skill.

## Validation

- `pnpm --filter @cambio/config test` — the extended regression suite;
  expect the existing 8 assertions plus the new Gap 3 cases to pass.
- `pnpm turbo lint` — full repo, expect clean (no new failures on existing
  code).
- `pnpm turbo build typecheck test` — full repo, expect clean (no runtime
  behavior change anywhere; only `packages/config` and its own test change).
- Manual verify-then-revert of both builtin-import probes (both specifier
  forms) in at least two of the three effect-only layers — the
  acceptance-tested behavior the automated suite then pins permanently.

## Progress

_(updated continuously; append new entries at the BOTTOM — newest last;
timestamp each entry)_

- [x] 2026-09-01 — plan written; ADR-0017 amended during planning; user
      signed off
- [x] 2026-09-01 — task branch
      `raafaykazmi/cam-12-harness-eslint-boundaries-node-builtins-bypass-the-effect`
      created off `release-v0`; issue moved to In Progress
- [x] 2026-09-01 — source-less `origin: "core"` disallow policy added to
      `effectOnlyExternalPolicies` in `packages/config/eslint.base.js`
      (`eslint.base.js:135-138`), one per effect-only layer, reusing
      `LAYER_RATIONALE`
- [x] 2026-09-01 — manual verify-then-revert performed: `node:crypto` and
      bare `crypto` probes added to `packages/domain/src` and
      `packages/application/src` each failed `pnpm --filter <pkg> lint`
      with a `boundaries/dependencies` error (2 errors per package, one per
      specifier form) as expected; all four probes removed,
      `git status --porcelain` confirmed clean before continuing
- [x] 2026-09-01 — regression suite extended: new "Gap 3" describe block
      added to `packages/config/test/eslint.base.test.ts:75-115` (5 new
      assertions: 3 layers × `node:crypto`, 1 bare-`crypto` in domain, 1
      domain/test negative case); `pnpm --filter @cambio/config test` green
      on first run (13/13, up from 8/8)
- [x] 2026-09-01 — full gate green: `pnpm turbo build typecheck lint test`
      — 22/22 tasks passed repo-wide (one `pnpm format` pass needed first,
      for prettier formatting on the newly-written/edited files — no
      substantive fallout in any other package)

## Decision log

- 2026-09-01 — **Both builtin specifier forms in scope** (`node:crypto` and
  bare `crypto`), not just the `node:`-prefixed form the issue's literal
  probe used — either is a legitimate way to reach the same builtin, and
  eslint-plugin-boundaries classifies both under the same `origin: "core"`
  (confirmed by exploration), so restricting only one form would leave an
  identical silent hole open — the exact failure pattern this whole issue
  family exists to close. Confirmed with the user during the interview
  round.
- 2026-09-01 — **`Date.now()`/`new Date()` in `packages/application` stays
  out of scope**, deferred as a possible future follow-up rather than
  bundled here — it's a different rule family
  (`no-restricted-syntax` vs. an import-origin policy) and a different code
  pattern (a global call, not an import), and CAM-12 is otherwise a clean,
  narrow lint fix. Confirmed with the user during the interview round.
- 2026-09-01 — **ADR-0017 amended in place, not superseded** — it is still
  `proposed` (release-v0 has not merged to `development`), and this
  amendment closes an unstated gap in the original mechanism rather than
  reversing a shipped decision. Confirmed with the user during the
  interview round; amendment made during planning (see the ADR's own
  `**Amended:**` line and expanded Context/Decision/Consequences).
- 2026-09-01 — **Mechanism: a source-less `origin: "core"` disallow policy**,
  not `no-restricted-imports`/`no-restricted-syntax` enumerating builtin
  names — resolved by exploration, not a user preference call: omitting the
  policy's `source` key makes `@boundaries/elements`'s matcher treat it as
  "matches everything" for that origin, so one policy catches both
  specifier forms and any future Node builtin via Node's own
  `module.builtinModules`, with no name list to keep in sync. This is
  strictly stronger than an enumerated `no-restricted-imports` list (which
  would need explicit bare-builtin names and could go stale). Not asked as
  a user decision because the technical facts left no genuine trade-off —
  see the ADR's expanded Rejected section for the full reasoning.
- 2026-09-01 — **Root plan only, no backend/frontend child plan** — same
  reasoning as CAM-11: the fix lives entirely in `packages/config`, a shared
  dev-tooling package outside the `apps/api`/`apps/web` import-boundary
  graph itself; the transient verification probes touch `packages/domain/src`
  and `packages/application/src` but are reverted, not shipped. Not
  re-confirmed with the user as a separate question since it directly
  follows CAM-11's already-established precedent for this exact family of
  task.

## Surprises & discoveries

None. Exploration's findings (origin `"core"` classification, the
source-less-selector matching behavior, no existing violations in the repo)
all held exactly as predicted during implementation. The only non-code
surprise was a `pnpm format` pass being needed before the gate went green —
prettier reformatted quote style/wrapping on the files just written/edited
(`eslint.base.js`, `eslint.base.test.ts`, the ADR, the ADR index, this plan);
not a logic issue, just a formatting pass this repo enforces in CI.

## Outcomes & retrospective

**Verdict: ship.** `/review` ran a contract reviewer and an architecture
reviewer in parallel against `git diff release-v0...HEAD`, plus an
independent gate run. No findings from either reviewer; no fixes required.

- **Independent gate:** `pnpm turbo build typecheck lint test` — 22/22
  tasks green, re-run fresh during review (21 cached, `@cambio/config:test`
  and format:check re-verified). `pnpm --filter @cambio/config test` — 13/13
  passed, independently re-run.
- **Contract review:** all 6 Functional Contract clauses and all 5
  Acceptance Criteria verdicted **satisfied**, checked against actual code
  (not plan prose) — including an independent read of the installed
  `@boundaries/elements@3.1.0` source to confirm the source-less-selector
  "matches everything" claim and the no-normalization-of-`node:`-prefix
  claim both hold as documented. No scope creep — diff limited to
  `packages/config/eslint.base.js`, `packages/config/test/eslint.base.test.ts`,
  the pre-planned ADR-0017 amendment, and mechanical prettier-driven
  reformatting in `docs/adr/README.md`. All of the plan's own file:line
  citations checked and found accurate (no stale references). One
  documented, reasoned coverage narrowing noted as a non-issue: the
  bare-specifier form is tested only in `domain`, not `contracts`/
  `application` — accepted because the matching mechanism is
  layer-parameterized identically (only the rationale message differs).
- **Architecture review:** no violations. Confirmed the new policy is
  appended to the *same* `effectOnlyExternalPolicies` array rather than a
  second overlapping `boundaries/dependencies` block (avoiding the exact
  silent-discard footgun ADR-0017 itself warns about); confirmed the
  src/test mutual-exclusivity split is still intact (the core-origin policy
  only reaches the `src/**` block); confirmed ADR-0017's status is still
  `proposed`, making the in-place amendment legitimate per the `adr`
  skill's lifecycle rule; confirmed `docs/adr/README.md`'s index was updated
  in the same commit as the ADR body. Confirmed the architecture skill's
  own "enforcement claims must be probe-verified" rule was honored: the
  manual verify-then-revert is logged in Progress, and the claim is now
  backed by a permanent regression test, not left as unverified prose.
- **What shipped:** exactly what the plan and the ADR amendment specified,
  with the one implementer's-call item (partial bare-form test coverage)
  already logged and independently judged reasonable by the contract
  reviewer.
- **Carries into future tasks:** the effect-only-external policy set per
  layer is now a policy *triple* (external disallow, external `effect`
  allow, core disallow) rather than a pair — any future edit to these
  `src/**` blocks must account for all three, not just the external pair,
  or risks reopening a fourth silent gap of the same shape. This is already
  recorded in ADR-0017's Consequences section.
