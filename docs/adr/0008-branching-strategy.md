# 0008 — Branch hierarchy: main → development → release-vN → task branches, tracked in Linear

- **Status:** accepted
- **Date:** 2026-08-31
- **Amended:** 2026-09-04 (CAM-14) — [0028](0028-harness-changes-land-on-main.md)
  carves out harness/meta changes, which commit directly to `main` and
  propagate by merge-down. Task work is unchanged; the Decision below is
  otherwise intact.

## Context

With the harness and backlog in place, work is about to happen as reviewed
units. The repo needed a branching model, and the workflow commands need a
deterministic answer to "which branch do I base work on" that survives
release rollovers without depending on session memory.

## Decision

- Default branch renamed `master` → `main` (locally and on GitHub); `main`
  is the stable branch.
- `development`, cut from `main`, is the deployment branch once CI/CD
  exists.
- **Release branches** (`release-vN`, cut from `development`) are the base
  of all work and the target of all task PRs; they merge into `development`
  to deploy. The first is `release-v0` ("Release V0").
- Task branches are cut from the current release branch per Linear issue,
  using Linear's suggested branch name (`raafaykazmi/cam-N-…`).
- The pointer to the **current** release lives in the Linear document
  ["Release History"](https://linear.app/raafayk7/document/release-history-932e3ba2f8c1),
  not in the repo — an in-repo pointer would itself differ across branches
  and go stale on rollover. `/plan` aborts on a dirty tree, syncs the
  release branch from that document, and commits its planning outputs;
  `/implement` works on the task branch; `/review` diffs task branch
  against release branch.

## Consequences

Agents always resolve their base branch from one branch-independent source.
The release branch history stays clean (docs-only commits from planning,
merges from PRs). Rolling a release means: create `release-v(N+1)` off
`development`, update the Linear document, nothing in-repo to touch. Linear's
native Releases feature remains an upgrade path if issue↔release tracking is
wanted later.
