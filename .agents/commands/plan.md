---
description: Plan a Linear task — interview, explore code, decide ADRs, write root + child plans
argument-hint: CAM-xxx
---

Plan the task **$ARGUMENTS** end to end. The output is a set of plan
documents the `/implement` command can execute without this session's
context. Do not write any implementation code.

## 1. Pull the brief

Fetch issue $ARGUMENTS from Linear (MCP `get_issue` — team "Cambio").
Read its description, comments, and linked issues, and move the issue to
**Planning**. Read `AGENTS.md`, and the HANDOFF/ADR sections the task
plausibly touches. If plan files for
$ARGUMENTS already exist in `docs/plans/`, stop and ask whether to revise or
restart.

## 2. Classify and interview

Decide whether the task is backend, frontend, or fullstack (this determines
which child plans exist).

Then interview the user with AskUserQuestion — the goal is to surface every
decision the brief leaves open *before* exploration: scope boundaries,
behavior ambiguities, quality bar, anything touching HANDOFF §9 open rules.
Ask in batches; keep going until you cannot phrase another question whose
answer would change the plan. Do not pad with questions you can answer from
the repo or the handoff.

## 3. Explore

Launch one read-only Explore subagent per affected side (backend and/or
frontend), in parallel, each told: the task brief, what to map (files that
will change, patterns to follow, existing tests, anything contradicting the
brief), and to report file:line references. While they run, re-read the
governing skills for the layers involved.

If exploration surfaces new ambiguity, ask the user another round.

## 4. ADRs

Apply the `adr` skill's bar to every decision the task forces. For each that
meets it: propose the decision and alternatives to the user, get their call,
then write the ADR in `docs/adr/` (next free number, status accepted).
Task-scoped calls that don't meet the bar go in the plan's Decision Log
instead. If the task contradicts an existing ADR, surface that now.

## 5. Write the plans

- **Root plan** — `docs/plans/root/$ARGUMENTS.md` from
  `.agents/templates/root-plan.md`. You write this one yourself; the
  Functional Contract section is the task's spec and must be testable
  statements, not vibes. Sequence the Plan of Work so `contracts` schemas
  freeze before any parallel frontend/backend work.
- **Child plans** — `docs/plans/backend/$ARGUMENTS.md` and/or
  `docs/plans/frontend/$ARGUMENTS.md` from
  `.agents/templates/child-plan.md`, one per affected side. Delegate each to
  a subagent that receives the root plan, the relevant explorer report, and
  the instruction to follow the layer skills. Review what comes back against
  the root plan — you own coherence between the documents.

Single-side tasks get root + that one child plan only.

## 6. Close out

Post a Linear comment on $ARGUMENTS summarizing the plan (contract in two
sentences, milestones, ADRs written); the issue stays in **Planning** until
`/implement` picks it up. Present the root plan to the user for sign-off; do
not start implementation.
