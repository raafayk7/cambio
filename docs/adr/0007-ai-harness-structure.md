# 0007 — AI harness: AGENTS.md + .agents/ as source of truth, Linear for tasks, plan/implement/review workflow

- **Status:** accepted
- **Date:** 2026-08-30
- **Task:** the Task 2 harness session (HANDOFF §11); amended by CAM-14
- **Amended:** 2026-09-04 (CAM-14) — the "frontend-specific skills are
  deliberately deferred" consequence is discharged: the design system
  landed (CAM-13) and the frontend harness followed
  ([0029](0029-design-tooling-vendored-first-party.md)). The skill roster
  now also includes `frontend-architecture`, `design-system`, `ai-tells`,
  the dissolved design-gate family, `impeccable`, and the vendored
  animation set (see `.agents/skills/VENDORED.md`); the structure also
  carries `.agents/agents/` + `.agents/scripts/` with a `.claude/agents`
  symlink, and a `/ship` command exists alongside plan/implement/review.
  The Decision's structure is otherwise unchanged.

## Context

The repo is built primarily by AI agents and needs a harness: architecture
rules in enforceable form, a task workflow, and a decision record. Choices
considered: CLAUDE.md vs AGENTS.md as the root instruction file; where
skills/commands live; adr-kit vs a lightweight ADR skill; a separate spec
document vs spec-in-plan; Linear vs GitHub Projects vs an in-repo backlog
for tasks.

## Decision

- **AGENTS.md is the root instruction file** (agent-agnostic); `CLAUDE.md`
  is a stub that imports it. Skills and commands live in **`.agents/`**
  (portable `SKILL.md` / command markdown) with `.claude/skills` and
  `.claude/commands` as symlinks into it.
- **Skills:** `architecture`, `effect-domain-modeling`, `cambio-rules`,
  `application-layer`, `infrastructure-persistence`, `hidden-information`,
  `adr` — encoding HANDOFF §1, §3–§7.
- **ADRs are a lightweight in-repo skill** (MADR-lite in `docs/adr/`), not
  adr-kit: adr-kit's enforcement features overlap with the ESLint boundary
  rules and the skills themselves, and it would add a Python dependency.
  Revisit if decision-drift pain appears at scale.
- **Tasks live in Linear** (personal workspace `raafayk7`, team **Cambio**,
  identifiers `CAM-xxx`), accessed via the Linear MCP. Free tier suffices;
  a custom Kanban tool was rejected as a project-inside-the-project, and
  GitHub Projects as a weaker brief-editing experience.
- **Workflow commands** `/plan`, `/implement`, `/review` take the Linear
  identifier as argument. Plans are ExecPlan-inspired living documents in
  `docs/plans/{root,frontend,backend}/CAM-xxx.md`. **No separate spec
  document** — the root plan's Functional Contract section is the spec.

## Consequences

One source of truth for agent instructions that any agent runtime can read;
Claude Code discovers everything through symlinks. Plan documents are
greppable next to the code and named by task. Frontend-specific skills are
deliberately deferred until the design system lands. If a second agent
runtime is adopted, it points at `.agents/` and AGENTS.md without
restructuring.
