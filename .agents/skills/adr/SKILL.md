---
name: adr
description: How to write, number, and supersede Architecture Decision Records in docs/adr/. Use this whenever a significant technical decision is made or changed — choosing a library or pattern, resolving a HANDOFF §9 open question, deviating from an existing convention — and during planning when deciding whether a task needs an ADR at all. Also use it when a proposed change contradicts an existing ADR.
---

# Architecture Decision Records

ADRs live in `docs/adr/`, one file per decision, named
`NNNN-kebab-case-title.md` (zero-padded, next free number). They exist so
decisions don't get re-litigated from scratch and so future agents don't
"helpfully" undo something deliberate. `docs/DECISIONS.md` is the pre-ADR
history; everything after it goes here.

## Does this decision need an ADR?

Write one when the decision:

- selects between real alternatives (library, pattern, protocol, schema
  approach) where the road not taken might tempt someone later;
- resolves one of HANDOFF §9's open questions (these ALWAYS get an ADR,
  after asking the user — never resolve them unilaterally);
- deviates from an existing convention, ADR, or the handoff;
- is expensive to reverse, or its rationale won't be obvious from the code.

Skip it for: choices fully determined by existing rules (the import table,
an existing ADR), trivially reversible naming/formatting calls, and anything
the code itself makes obvious. A plan's Decision Log handles small
task-scoped calls; promote an entry to an ADR only if it meets the bar
above.

## Template (MADR-lite)

```markdown
# NNNN — Title stating the decision, not the topic

- **Status:** accepted | proposed | superseded by [NNNN](NNNN-x.md)
- **Date:** YYYY-MM-DD
- **Task:** CAM-xxx (if applicable)

## Context

What forces are at play; what problem demanded a decision. Written so a
reader with zero session context understands why this came up.

## Decision

What was decided, stated actively ("We use X for Y"). Include the concrete
alternatives considered and, in a sentence each, why they lost.

## Consequences

What becomes easier, what becomes harder, what we've committed to
maintaining, and what would trigger revisiting this.
```

Title decisions, not topics: "Plain SQL migrations with a hand-rolled
runner", not "Migrations".

## Lifecycle

- New ADRs written during development (by `/plan`, `/implement`, or any
  session) start as **proposed**, even when the user confirmed the decision
  live. A proposed ADR is **binding within its release** — implementation
  and review treat it as the ruling — but it graduates to **accepted** only
  by explicit human approval when its release branch merges into
  `development`. (Pre-development ADRs 0001–0008 were accepted directly;
  that path is closed.)
- **Never edit an accepted ADR's Decision section.** To change course, write
  a new ADR that states the new decision and marks the old one
  `superseded by NNNN`. History is the point.
- If implementation reveals an accepted ADR is wrong, stop and surface it —
  don't quietly diverge.
- When a change you're making contradicts an existing ADR, that's a signal
  to stop, not to route around it.

## The index

`docs/adr/README.md` is the one-glance index — a table of number, linked
title, status, date, and task. Read it FIRST when you need to know what
decisions exist; only open individual ADRs you actually need. Every ADR
write, supersession, or status change updates the index **in the same
commit** — an ADR that isn't in the index doesn't exist as far as future
sessions are concerned.
