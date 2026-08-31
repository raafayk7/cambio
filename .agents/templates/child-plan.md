# CAM-xxx — Task title (backend | frontend)

- **Root plan:** [root/CAM-xxx.md](../root/CAM-xxx.md) — the functional
  contract lives there; this document is implementation detail for one side.

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

The files and modules this side touches, their current state, and the layer
rules that apply (name the skills: e.g. effect-domain-modeling,
infrastructure-persistence).

## Plan of work

Ordered, file-level prose: for each step, which files are created/edited,
what goes in them, and which existing code is the pattern to follow. Steps
sized so each leaves the repo compiling and tests green (TDD for domain
work: test first, then implementation).

Code sketches here (signatures, DDL, export lists) are **advisory** — they
orient the implementer and are expected to drift; the Contract coverage
table and any module-layout table are the artifacts that must match
as-built code at close-out. Prefer constraints, test intents, and
patterns-to-follow over predicted code.

## Concrete steps & validation

The exact commands to run at each checkpoint and what output signals
success (test names, expected counts). Include the final gate:
`pnpm turbo build typecheck lint test`.

## Contract coverage

_(maintained by `/implement`, verified by `/review`: one row per root-plan
contract clause this side owns — the test that pins it, or why none can.
Each row must also say **what is asserted**, in one phrase — a test whose
title cites a clause but whose body doesn't assert it is the failure mode
this column exists to catch. **At plan time, fill only the Clause column
plus a planned-approach note**; test file, name, and assertion phrase are
written by `/implement` when the test actually lands. A plan-time row that
invents a test title and assertion is an overclaim waiting to become a
review finding.)_

| Clause | Test (file + name) | What is asserted |
| ------ | ------------------ | ---------------- |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [ ] YYYY-MM-DD HH:MM — step

## Surprises & notes for the root plan

_(anything the root plan's Decision Log or the reviewer must know)_
