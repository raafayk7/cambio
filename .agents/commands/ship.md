---
description: Open the PR for a finished task — sweep up final commits, push, create the PR against the release branch, link it to Linear
argument-hint: CAM-xxx [extra instructions…]
---

> **Arguments:** the issue id is `$1` — the first whitespace-delimited token
> of the invocation. Every `$1` below means that id and nothing else. The
> full invocation was “$ARGUMENTS”; anything in it beyond the id is the
> user's accompanying instruction — honor it alongside or after this
> workflow, and never substitute it into ids, file paths, branch names, or
> Linear lookups. (A multi-line invocation once expanded into every id slot
> of this template and produced garbled paths — this rule is the fix.)

Ship task **$1**: turn the finished task branch into a PR against
the current release branch. This command never merges — merging the PR is
the user's decision.

## 1. Preflight

- Confirm the current branch is the task branch for $1 (Linear's
  suggested branch name, e.g. `raafaykazmi/cam-1-…`). If not, find and check
  it out; if it doesn't exist, stop — there is nothing to ship.
- Read `docs/plans/root/$1.md`. If the Outcomes & Retrospective
  section does not show a passing `/review` verdict, warn the user and ask
  before proceeding — shipping unreviewed work should be a deliberate
  choice, not a default.
- Resolve the current release branch from the Linear **["Release
  History"](https://linear.app/raafayk7/document/release-history-932e3ba2f8c1)**
  document (MCP `get_document` id `release-history-932e3ba2f8c1`) and fetch
  it (`git fetch origin <release-branch>`).

## 2. Sweep and gate

- If the working tree has uncommitted changes (typically review fixes),
  commit them on the task branch with a conventional message referencing
  $1. Unrelated-looking changes: ask before including.
- If anything was committed in this step, rerun
  `pnpm turbo build typecheck lint test` — never open a PR from a red gate.
- If the release branch has moved since the task branch was cut, rebase or
  merge it in (prefer merge if the branch was already pushed), resolve, and
  rerun the gate.
- Push the task branch.

## 3. Create the PR

Use `gh pr create` with base = the release branch (never `main` or
`development` — task PRs target the release branch only):

- **Title:** `$1: <task title>` — the identifier prefix is what the
  Linear GitHub integration keys on.
- **Body**, generated from the root plan, not written from scratch:
  functional contract in two or three sentences; milestones completed;
  deviations and notable Decision Log entries; ADRs written or touched;
  links to the plan docs (`docs/plans/root/$1.md` and child plans);
  the review verdict. End the body with:
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

## 4. Link and close out

Opening the PR makes Linear's GitHub integration auto-move the issue to
**In Review** — expected, not an error; the explicit move to Development
Done below overrides it.

The Linear GitHub integration auto-attaches the PR via the branch name and
title; verify the attachment appeared on the issue (MCP `get_issue`), and if
it didn't, attach the PR URL explicitly (`save_issue` with `links`). Post a
Linear comment on $1 with the PR URL and a one-line summary.

**Downstream brief sweep:** fetch the issues $1 blocks or is
related to (MCP `get_issue` with `includeRelations`) and re-read each
description against what this task actually decided, built, or resolved. A
brief whose premises this task consumed — e.g. it promises a decision an
ADR has since made, or references behavior this task changed — misleads the
next `/plan`. For each stale brief: post a comment on that issue stating
what changed and which ADR/plan supersedes it; edit the description itself
only with the user's confirmation.

Leave the issue in **Development Done**. Report to the user: the PR URL,
what the PR contains, and that merging it (and afterwards deleting the task
branch) is their call.
