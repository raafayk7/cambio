# 0043 — Deployment config joins the ADR-0028 main carve-out; app-code fixes stay on the release flow

- **Status:** accepted
- **Date:** 2026-09-08
- **Task:** CAM-32

## Context

ADR-0028 lets harness/meta files land directly on `main` and propagate by
merge-down, because they govern every branch and would otherwise diverge
per release. CI/CD files have the same shape: the PR-gate workflow must
exist on every branch PRs target, and `vercel.json` must be on
`development` for production deploys — but release-v0 won't merge into
`development` until /release day, and CAM-32's definition of done includes
a live end-to-end deploy _now_.

At the same time, CAM-32 needs genuine application-code changes (realtime
cloud auth in the api's publisher, the web SPA build mode, the
`VITE_API_URL` fallback), and ADR-0028 is explicit that the carve-out "is
not a license to land application code on main."

## Decision

**The ADR-0028 carve-out extends to deployment configuration**: the
`.github/` directory and root-level deploy config files (`vercel.json`,
and any future `render.yaml`-style descriptor). These land on `main` —
no task branch, no PR — and propagate by merge-down
(`main` → `development` → current release branch), same definition of
done as harness changes.

**Application code keeps the ADR-0008 flow**: CAM-32's api/web code
changes ride the normal task branch → PR into `release-v0`, and go live
when the release merges into `development`. This is coherent because each
branch's gate exercises that branch's own code and compose file, and the
deploy-now smoke test only needs what `development` already contains (the
scaffold's `/health`).

CAM-32 is therefore a **split-landing task**: config commits on `main`,
code commits on the task branch. Its plan docs and ADRs follow the normal
release flow (they are release-bound, unlike a pure harness task's).

**Alternatives rejected:**

- **Everything via the release flow** — no CI on PRs and no deploy target
  wiring until after the first release; makes "prove the pipeline before
  /release day" impossible.
- **Everything on main** — directly violates ADR-0028's application-code
  exclusion and would put untested game code on the stable branch.

## Consequences

- ADR-0028's guard rail applies to the new scope: before editing a
  deployment-config file on `main`, diff it against the current release
  branch.
- Dashboard-side configuration (Render service settings, Vercel project
  settings, GitHub secrets) lives outside git entirely; the root plan's
  environment inventory is its system of record.
- This amends ADR-0028 (extends its scope); it does not supersede it.
