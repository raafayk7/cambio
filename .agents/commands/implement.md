---
description: Implement a planned Linear task from its plan documents, keeping them updated as living docs
argument-hint: CAM-xxx [extra instructions…]
---

> **Arguments:** the issue id is `$1` — the first whitespace-delimited token
> of the invocation. Every `$1` below means that id and nothing else. The
> full invocation was “$ARGUMENTS”; anything in it beyond the id is the
> user's accompanying instruction — honor it alongside or after this
> workflow, and never substitute it into ids, file paths, branch names, or
> Linear lookups. (A multi-line invocation once expanded into every id slot
> of this template and produced garbled paths — this rule is the fix.)

Implement task **$1** from its plans. The plans are the authority —
this command executes them, it does not re-plan.

## 1. Load

Read `docs/plans/root/$1.md` and every child plan that exists for
$1, plus any ADRs the root plan lists. Fetch the Linear issue for
late-breaking comments. If no root plan exists, stop: tell the user to run
`/plan $1` first.

**Branch setup:** find the current release branch in the Linear **["Release
History"](https://linear.app/raafayk7/document/release-history-932e3ba2f8c1)**
document (MCP `get_document` id `release-history-932e3ba2f8c1`), sync it (`git checkout <release-branch>
&& git pull`), then create or check out the task branch — the issue's
suggested git branch name from Linear (`gitBranchName`, e.g.
`raafaykazmi/cam-1-…`) — off the release branch. All implementation commits
land on the task branch; the release branch is the PR target, never
committed to directly. If resuming and the task branch already exists,
continue on it — and if Progress shows earlier partial work, verify the repo
actually matches the checked-off state before continuing (run the listed
validation commands); trust the repo over the checkboxes.

Move the Linear issue to In Progress.

## 2. Execute

Follow the root plan's milestone order. Rules of engagement:

- **Lanes:** if both backend and frontend child plans exist, implement the
  shared `contracts` changes first (per the root plan), then run one
  subagent per lane in parallel, each given its child plan and told which
  skills govern its layers (`architecture` always; backend:
  `effect-domain-modeling`, `application-layer`,
  `infrastructure-persistence`; frontend: `frontend-architecture`,
  `design-system`, `ai-tells`; both sides: `hidden-information`,
  `cambio-rules` as applicable). Single-lane tasks: implement directly, same
  skill discipline.
- **TDD where the plan says so** — domain work is always test-first
  (HANDOFF §12): failing test, implementation, green, then refactor.
- **Living documents:** after each milestone (not at the end), update the
  plan files — check off Progress with timestamps, append Decision Log
  entries for every non-obvious choice, record Surprises with evidence.
  Subagents update their child plan; you consolidate anything root-worthy.
- **Deviations:** small tactical deviations from a child plan are fine if
  logged. If the _functional contract_ or an ADR turns out wrong, stop and
  ask the user — do not silently reshape the task. HANDOFF §9 open rules:
  never resolve them yourself, even under time pressure.

## 3. Gate

Run `pnpm turbo build typecheck lint test` and every validation command the
plans specify. Fix what fails; a milestone isn't done while the gate is red.
Then walk the root plan's acceptance criteria one by one and check each off
only if it demonstrably holds.

## 4. Close out

**Reconcile the plan docs with the as-built code.** Any API sketches,
signatures, or module-layout tables the plans stated before code existed
must now either match reality or be replaced with links to the real files —
a Surprises entry noting a deviation does not excuse a stale table two
sections above it. `/review` grades against the plans, and stale sketches
burn review findings on documentation drift. Two mechanical checks are part of
this step: cite tests by file + test name, never line number (names are
stable; line refs rot); and grep every plan doc for `:<digits>` references
to files this task's diff touched — a refactor in the same diff silently
invalidates them (it happened twice, CAM-4 and CAM-7).

Update the root plan's Progress to reflect completion, commit the work on
the task branch (conventional messages, referencing $1), and push
it. Do not merge into the release branch — that happens via PR after
review. Post a Linear comment on $1 (what shipped, deviations,
anything for review to focus on). The issue stays in **In Progress** —
`/review` moves it forward on a passing verdict. Report to the user: what
was built, gate results verbatim if anything is non-obvious, and suggest
`/review $1` as the next step.
