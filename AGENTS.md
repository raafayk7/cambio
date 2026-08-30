# AGENTS.md — Cambio

Cambio is a hidden-information, memory-based multiplayer card game (lowest score
wins), built as a pnpm/Turborepo monorepo: Fastify + Effect backend, TanStack
Start frontend, Postgres, Supabase Realtime.

This file is the entry point for every AI agent working in this repo.
`CLAUDE.md` is a stub that points here; tool-specific config under `.claude/` is
symlinked from `.agents/`, which is the source of truth for skills and commands.

## Sources of truth

- **[docs/HANDOFF.md](docs/HANDOFF.md)** — canonical game rules (§1),
  architecture (§3–§6), data model (§4), build order (§12). When anything
  conflicts with a habit or template you'd normally reach for, the handoff wins.
- **[docs/adr/](docs/adr/)** — architecture decision records. Check them before
  re-litigating a decision; supersede, don't silently contradict.
- **[docs/DECISIONS.md](docs/DECISIONS.md)** — scaffold-era decisions, now
  migrated to ADRs; kept for history.

Three standing directives from the handoff:

1. **Do not invent game rules.** Every rule is in HANDOFF §1 (also extracted
   into the `cambio-rules` skill). Rules were playtested in person; guesses and
   priors from other Cambio variants will be wrong. If a situation isn't
   covered, stop and ask.
2. **Do not silently resolve open decisions** (HANDOFF §9: zero-card slammer,
   J/Q vs empty hand, slam window duration, temp-user auth). Ask.
3. **No thrown exceptions across layer boundaries; no Zod anywhere.** The
   backend is Effect end to end.

## Architecture

Clean Architecture with strictly enforced import boundaries — see the
`architecture` skill for the full decision procedure. The one-table summary
(ESLint fails CI on violations):

| Package | May import |
| --- | --- |
| `packages/domain` | `effect` only |
| `packages/application` | `domain`, `contracts`, `effect` |
| `packages/contracts` | `effect` only |
| `apps/api` | `application`, `domain`, `contracts` |
| `apps/web` | `contracts`, `ui` — **never** `domain` or `application` |

Repository ports live in `domain`; infrastructure ports live in
`packages/application/src/ports/`; implementations of both live in
`apps/api/src/infra/`. The domain performs no I/O — no DB, no clock, no
randomness (seeds and ports instead).

## Skills

Layer-specific rules live in skills under `.agents/skills/` (portable
`SKILL.md`, symlinked to `.claude/skills/`):

- `architecture` — where does a new file go; the import table as a procedure
- `effect-domain-modeling` — branded types, Schema, TaggedStruct/TaggedEnum,
  typed errors, purity rules
- `cambio-rules` — HANDOFF §1 extracted; the anti-prior guard
- `application-layer` — use cases, ports, command queue per room
- `infrastructure-persistence` — @effect/sql-pg, migrations, soft delete,
  event log
- `hidden-information` — the `viewFor` projection rule and realtime channel
  discipline (security-critical)
- `adr` — when and how to write an ADR

## Workflow

Tasks live in **Linear** (personal workspace, team **Cambio**, issues
`CAM-xxx`), accessed via the Linear MCP. The workflow commands take the issue
identifier as their argument:

- `/plan CAM-xxx` — interview, explore, decide ADRs, produce plan documents
- `/implement CAM-xxx` — execute the plan, keeping it updated as a living doc
- `/review CAM-xxx` — review implementation against plan and architecture

Plan documents are named after the issue and live in `docs/plans/`:
`root/CAM-xxx.md` (the functional contract + milestone plan),
`backend/CAM-xxx.md` and `frontend/CAM-xxx.md` (implementation detail, only for
sides the task touches). Templates: `.agents/templates/`.

## Development

Node 22 (nvm) and pnpm 9. Postgres runs in Docker on host port **5433**.

```bash
docker compose -f docker/docker-compose.yml up -d   # start Postgres
pnpm install
pnpm --filter @cambio/api migrate                   # apply SQL migrations
pnpm dev                                            # api :3001, web :3100
pnpm turbo build typecheck lint test                # the full gate
```

Environment lives in `.env` at the repo root (copy from `.env.example`). Tests
are vitest + `@effect/vitest`; domain work is test-first (HANDOFF §12).

If the API or integration tests can't reach Postgres (`ECONNREFUSED` on
localhost:5433), the container is simply off — run the `docker compose up -d`
line above and retry. Data persists across restarts in the `cambio-pgdata`
volume, so starting it is always safe. Migrations are idempotent; re-run
`pnpm --filter @cambio/api migrate` after starting if in doubt.

## Frontend note

The backend comes first. Frontend skills are deliberately deferred until the
design system is decided — until then `apps/web` stays at scaffold level, and
its only architectural rule is the import boundary above (it sees `contracts`
and `ui`, never the domain).
