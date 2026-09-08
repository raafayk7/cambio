# 0044 — The /release pipeline: snapshot main, accept ADRs on the release branch, deploy by PR merge, tag, roll the branch

- **Status:** accepted
- **Date:** 2026-09-08
- **Task:** — (harness)

## Context

CAM-32 gave `development` a real deployment pipeline (ADR-0041/0042), so
"a release" is now a concrete act: merging the release branch into
`development` deploys to production. What was still undefined is the
ceremony around that merge — how `main` stays meaningful, when proposed
ADRs become accepted (the index has promised "by human approval when the
release merges into development" since ADR-0009 without a mechanism), what
happens to accumulated task branches, and how the Linear Release History
document rolls over. The user's release design was reviewed in the CAM-32
planning session; this ADR records it and the `/release` command
implements it.

## Decision

`/release` executes, in order:

1. **Snapshot `main` first**: merge `development` into `main` before
   deploying the new release, so `main` always holds the previously
   deployed state — **`main` trails production by exactly one release.**
2. **ADR acceptance by index grep, not ticket traversal**: every ADR whose
   index row on the release branch says `proposed` is presented to the
   user; on explicit consent the statuses flip to `accepted` (files +
   index) in **one docs-only commit made directly on the release branch**
   — a sanctioned exception to ADR-0008's no-direct-commits rule,
   alongside `/plan`'s docs-only commit. This amends ADR-0008. (Index
   grep because an ADR present on the release branch ships with the
   release by definition; tracing tickets→plans would miss harness ADRs
   that arrived by merge-down.)
3. **Deploy = merging the release PR** (`release-vN` → `development`),
   only after the PR's gate check is green **and** the user confirms —
   the merge is the production deploy, never a silent side effect.
4. **Release-day smoke**: the deferred live checks recorded in
   `docs/plans/root/CAM-32.md`'s acceptance criteria (cookie flow, SPA
   page, pg_cron jobs, end-to-end realtime broadcast) plus `/api/health`
   run against production before the release is declared done.
5. **Tag the deploy**: an annotated `vN` tag on the `development` merge
   commit — the crisp "what is deployed right now" pointer (`main` trails
   by design, branch pointers move; tags don't).
6. **Branch hygiene**: task branches fully merged into the release branch
   are deleted (local + origin) after the deploy, minus any the user
   excludes — no accumulation across releases.
7. **Rollover**: create `release-v(N+1)` from `development`, push it, and
   update the Linear "Release History" document (deployed date on vN, new
   current pointer) — that document stays the out-of-repo source of truth
   (ADR-0008).
8. **Linear**: issues in Development Done whose work shipped in this
   release move to **Deployed**.

**Alternatives rejected:**

- **Flip ADRs after the merge, on `development`** — the accepted status
  should ride the release merge itself; flipping afterwards leaves a
  window where production runs code whose ADRs are still "proposed".
- **`main` as the deployed pointer** (merge into main after deploy) — the
  user deliberately chose main-trails-by-one so the stable branch is the
  known-good previous release; the tag covers "what is deployed".
- **Ticket-traversal ADR discovery** — strictly worse than grepping the
  index (misses merge-down harness ADRs; more moving parts).
- **Deleting task branches before the merge** — safe in principle (they
  are merged into the release branch) but pointless risk; after the
  deploy there is no argument left.

## Consequences

- ADR-0008's "never commit to the release branch directly" gains a second
  sanctioned docs-only exception (this ADR **amends 0008**; the index row
  gets the annotation).
- The release ceremony is repeatable by a fresh session with zero context:
  the command reads the Release History document, the ADR index, and
  Linear — no session memory required.
- `main`'s meaning changes from vaguely-stable to precisely "the previous
  release"; anything that assumed main == latest must use the tag or
  `development`.
- Revisit when releases involve more than one person (PR reviews on the
  release PR), or when a hotfix path (patch directly on development?) is
  first needed — this ADR deliberately doesn't define hotfixes.
