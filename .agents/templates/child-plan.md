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

## Concrete steps & validation

The exact commands to run at each checkpoint and what output signals
success (test names, expected counts). Include the final gate:
`pnpm turbo build typecheck lint test`.

## Progress

- [ ] YYYY-MM-DD HH:MM — step

## Surprises & notes for the root plan

*(anything the root plan's Decision Log or the reviewer must know)*
