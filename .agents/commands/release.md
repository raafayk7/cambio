---
description: Release the current release branch — snapshot main, accept ADRs, merge to development (deploys), smoke-test production, tag, clean branches, roll the release over
argument-hint: "[extra instructions…]"
---

> **Arguments:** `/release` takes no issue id — the entire invocation
> (“$ARGUMENTS”) is the user's accompanying instruction (e.g. branches to
> keep, a release to skip smoke on). Honor it alongside this workflow.

Release the current release branch to production, per ADR-0044. The merge
into `development` **is** the production deploy (ADR-0041/0042) — treat
every step before it as reversible and everything after it as live.

**Resume rule:** every step checks state before acting (an existing merge
into main, an already-flipped ADR, an open release PR, an existing tag). If
a previous `/release` run died partway, rerun the command and it continues;
never redo a completed step.

## 1. Preflight

- **Clean tree required** (`git status --porcelain` empty) — abort and show
  the user what's dirty otherwise.
- Read the Linear **["Release History"](https://linear.app/raafayk7/document/release-history-932e3ba2f8c1)**
  document (MCP `get_document` id `release-history-932e3ba2f8c1`) for the
  current release branch (`release-vN`). Fetch and sync `main`,
  `development`, and `release-vN`.
- Sanity: `.github/workflows/deploy.yml` must exist on `development`
  (CAM-32's pipeline). If it doesn't, stop — there is nothing that deploys.

## 2. Snapshot main

Merge `development` into `main` and push, so `main` records the previously
deployed state before this release changes it (`main` trails production by
one release — ADR-0044). Usually a fast-forward or no-op.

## 3. Build the release manifest

List Linear issues in **Development Done** (team Cambio). For each, verify
its work is actually on `release-vN` (the attached PR merged into the
release branch, or its commits are reachable from it — harness tasks
arrive by merge-down and count too). Issues whose work is NOT on the
branch: flag and exclude. Present the manifest (issue ids + titles) to the
user as part of the step-5 confirmation.

## 4. Accept proposed ADRs

Grep `docs/adr/README.md` **on the release branch** for `proposed` rows —
the index is the authority; do not trace tickets. Present the full list to
the user (AskUserQuestion: accept all / abort; honor any exclusions they
name). On consent: flip each listed ADR file's `Status:` to `accepted` and
update the index rows, as **one docs-only commit directly on the release
branch** (sanctioned by ADR-0044), and push. Touch nothing but ADR files
and the index in this commit.

## 5. Open the release PR and confirm the deploy

- `gh pr create` — base `development`, head `release-vN`, title
  `Release vN`. Body: the manifest, the ADRs accepted, a link to the
  Release History document, and the smoke checklist from step 7. End with
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Wait for the PR's gate check. Red gate: stop, fix via the normal lanes
  (ADR-0043 — never patch `development` directly), re-run.
- On green: confirm with the user (AskUserQuestion) that merging deploys
  to production **now**. This is the point of no return; do not merge
  without an explicit yes from the user in this session.

## 6. Merge and watch the deploy

`gh pr merge --merge` (keep the release branch — it is history, not
clutter). Then watch until all three are done, and show the evidence:

- the `deploy.yml` run on `development`: gate ✓ → migrate ✓ → deploy-api ✓;
- the Render deploy the hook triggered reaches live (`/health` on the
  Render host answers on fresh code — verify freshness, not just 200);
- the Vercel production deployment reaches READY.

A migrate failure here stops everything — the deploy hook will not have
fired (that ordering is the pipeline's contract); surface and fix before
re-running.

## 7. Release-day smoke (production)

Run each against the production origin and record the outputs in a Linear
comment on the Release History document or the release PR. The first four
are the deferred live proofs from `docs/plans/root/CAM-32.md`'s acceptance
criteria — check them off there when they pass:

1. `GET /api/health` through the Vercel proxy → 200 with the api's body.
2. **Cookie flow**: `POST /api/users` through the proxy → `Set-Cookie`
   with `Secure`, `SameSite=Lax`, `HttpOnly`, `Path=/`, no `Domain`; replay
   on `GET /api/me` → the created user.
3. **SPA page**: `GET /` → 200 `text/html` (the shell), and the deployment
   shows zero serverless functions.
4. **pg_cron + migrations**: SQL against prod — `_cambio_migrations`
   matches the deployed branch's `apps/api/migrations/`, and `cron.job`
   lists the three ADR-0025 jobs. If the pg_cron `DO` block skipped
   through the pooler, apply that migration via the Supabase MCP and
   record it (root plan CAM-32, Decision Log fallback).
5. **Realtime broadcast end to end**: drive a real flow (create a lobby,
   join from a second session) and verify a broadcast arrives in the
   browser AND the Render logs show **no** `realtime publish failed`
   warnings — publish failures are silent by design, so the log check is
   the proof.

Any failure: stop, surface to the user, fix via the proper lane. The
release is not done while smoke is red.

## 8. Tag

Annotated tag `vN` on the `development` merge commit
(`git tag -a vN -m "Release vN" <merge-sha> && git push origin vN`). Skip
if the tag already exists (resume).

## 9. Branch hygiene

List task branches (local and `origin/*`) fully merged into `release-vN`,
show the list to the user with any exclusions they named in the
invocation, and on confirmation delete them locally and on origin. Never
delete `main`, `development`, any `release-v*`, or an excluded branch.

## 10. Roll the release over

- Create `release-v(N+1)` from `development` and push it.
- Update the Linear Release History document: mark `release-vN` deployed
  (with date and the `vN` tag), set `release-v(N+1)` as **current — in
  development**, and append the history-table row.

## 11. Linear close-out

Move every manifest issue from **Development Done** to **Deployed**. Post
one summary comment on the Release History document (manifest, tag, smoke
results, new current branch) rather than per-issue noise.

## 12. Report

Tell the user: the production URLs, the manifest, smoke evidence, the tag,
which branches were deleted, and the new current release branch that all
new `/plan` work now bases on.
