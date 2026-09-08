# 0028 — Harness changes land on main and propagate by merge-down

- **Status:** accepted
- **Date:** 2026-09-04
- **Task:** CAM-14

## Context

ADR-0008 routes all task work through the current release branch: task
branch → PR into `release-vN` → merge to `development` to deploy. But the
AI harness — AGENTS.md, `.agents/` (skills, commands, hooks, templates,
settings), the CLAUDE.md stub — governs work on **every** branch. If
harness changes flowed like task work, each release branch would carry a
divergent harness copy, and future release branches cut from `development`
would lack changes still waiting in an unmerged release.

In practice, harness edits have already been landing directly on `main` and
merging down since the workflow commands existed; the convention lived only
in session memory. CAM-14 is an entire harness task (the frontend AI
harness), which forces the convention onto the record: silently
contradicting an accepted ADR is exactly what the ADR discipline forbids.

## Decision

**Harness and meta changes commit directly to `main`** — no task branch, no
PR — **and propagate by merge-down**: `main` → `development` → the current
release branch (read from the Linear "Release History" document). The
merge-down is part of the harness change's definition of done, not a
someday step: agent tooling reads the checked-out working tree, so a
release-branch session has none of the harness until the merge reaches it.

Harness scope: AGENTS.md, CLAUDE.md, everything under `.agents/`, the
`.claude/` symlinks, and — for harness-scoped tasks like CAM-14 — their
plan documents and ADRs (which must be visible on `main` where the work
executes).

Guard rail: before editing any file on `main`, **diff it against the
current release branch**. A file that diverged on the release side (e.g.
`.agents/skills/cambio-rules/SKILL.md` after CAM-1) must not be edited on
`main`; make the change on the release side or in a branch-identical file.
Predictable merge-down conflicts in files that legitimately grow on both
sides (`docs/adr/README.md`'s index table) are resolved during the
merge-down.

Everything else is unchanged: task work still follows ADR-0008. This ADR
**amends 0008 with a carve-out** rather than superseding it.

**Alternatives rejected:**

- **Harness changes as normal task work on the release branch** — every
  release carries a divergent harness; new releases cut from `development`
  miss anything not yet merged; the same skill edit lands N times.
- **PR into `main`** — a PR whose author and reviewer are the same person
  adds ceremony without review; `/review` already covers harness tasks.

## Consequences

Every current and future branch inherits harness changes by merge instead
of by copy. Direct-to-main commits stay limited to harness scope — this is
not a license to land application code on `main`. Harness tasks' close-out
grows a mandatory merge-down + fresh-session smoke test on the release
branch. Revisit when CI/CD lands or when more than one person commits to
the repo, at which point PRs into `main` may earn their ceremony.
