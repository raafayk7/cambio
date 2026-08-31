# CAM-xxx — Task title

- **Linear:** [CAM-xxx](https://linear.app/raafayk7/issue/CAM-xxx)
- **Scope:** backend | frontend | fullstack
- **Child plans:** [backend](../backend/CAM-xxx.md) · [frontend](../frontend/CAM-xxx.md) _(delete lines that don't apply)_
- **ADRs:** NNNN _(or "none needed", with one line saying why)_

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

What the user can do after this task that they couldn't before, and how to
observe it working (a command to run, a screen to look at). Two or three
sentences.

## Context & orientation

Current state of the relevant code, assuming no prior knowledge: which
packages/files matter, what exists vs. what's missing, pointers to the
HANDOFF sections and ADRs that govern this task.

## Functional contract

The spec. What the system must do when this task is done — behaviors,
inputs/outputs, edge cases, error cases. Written as testable statements.
This is the primary thing `/review` diffs the implementation against.

### Acceptance criteria

- [ ] Concrete, checkable criteria, including the quality gate:
      `pnpm turbo build typecheck lint test` passes.

## Plan of work

Prose, milestone by milestone: what gets built in what order and why that
order (e.g. contracts frozen first so lanes can parallelize). File-level
detail belongs in the child plans; this section is the map, not the streets.

## Validation

How to verify the work beyond the acceptance criteria: what tests are added
and what they prove, what to run, what output to expect.

## Progress

_(updated continuously; append new entries at the BOTTOM — newest last;
timestamp each entry)_

- [ ] YYYY-MM-DD HH:MM — step description

## Decision log

_(every non-obvious choice made during planning or implementation: what was
decided, why, what was rejected. Promote to an ADR if it meets the adr
skill's bar.)_

- YYYY-MM-DD — decision — rationale

## Surprises & discoveries

_(anything found mid-implementation that the plan didn't predict — wrong
assumptions, upstream bugs, better approaches. Evidence included.)_

## Outcomes & retrospective

_(filled at the end, typically by `/review`: what shipped, what was cut,
what should carry into the next task.)_
