---
description: Implement a planned Linear task from its plan documents, keeping them updated as living docs
argument-hint: CAM-xxx
---

Implement task **$ARGUMENTS** from its plans. The plans are the authority —
this command executes them, it does not re-plan.

## 1. Load

Read `docs/plans/root/$ARGUMENTS.md` and every child plan that exists for
$ARGUMENTS, plus any ADRs the root plan lists. Fetch the Linear issue for
late-breaking comments. If no root plan exists, stop: tell the user to run
`/plan $ARGUMENTS` first. If Progress shows earlier partial work, verify the
repo actually matches the checked-off state before continuing (run the
listed validation commands); trust the repo over the checkboxes.

Move the Linear issue to In Progress.

## 2. Execute

Follow the root plan's milestone order. Rules of engagement:

- **Lanes:** if both backend and frontend child plans exist, implement the
  shared `contracts` changes first (per the root plan), then run one
  subagent per lane in parallel, each given its child plan and told which
  skills govern its layers (`architecture` always; `effect-domain-modeling`,
  `application-layer`, `infrastructure-persistence`, `hidden-information`,
  `cambio-rules` as applicable). Single-lane tasks: implement directly, same
  skill discipline.
- **TDD where the plan says so** — domain work is always test-first
  (HANDOFF §12): failing test, implementation, green, then refactor.
- **Living documents:** after each milestone (not at the end), update the
  plan files — check off Progress with timestamps, append Decision Log
  entries for every non-obvious choice, record Surprises with evidence.
  Subagents update their child plan; you consolidate anything root-worthy.
- **Deviations:** small tactical deviations from a child plan are fine if
  logged. If the *functional contract* or an ADR turns out wrong, stop and
  ask the user — do not silently reshape the task. HANDOFF §9 open rules:
  never resolve them yourself, even under time pressure.

## 3. Gate

Run `pnpm turbo build typecheck lint test` and every validation command the
plans specify. Fix what fails; a milestone isn't done while the gate is red.
Then walk the root plan's acceptance criteria one by one and check each off
only if it demonstrably holds.

## 4. Close out

Update the root plan's Progress to reflect completion and post a Linear
comment on $ARGUMENTS (what shipped, deviations, anything for review to
focus on). The issue stays in **In Progress** — `/review` moves it forward
on a passing verdict. Report to the user: what was built, gate
results verbatim if anything is non-obvious, and suggest `/review
$ARGUMENTS` as the next step. Do not commit unless the user asks.
