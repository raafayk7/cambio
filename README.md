# Cambio

A hidden-information, memory-based card game. Lowest score wins.

**Read [`docs/HANDOFF.md`](docs/HANDOFF.md) before writing any code.** It is the
source of truth for the game rules, the architecture, and the data model, and it
is deliberately not a task list. Decisions live in [`docs/adr/`](docs/adr/)
([`docs/DECISIONS.md`](docs/DECISIONS.md) is the pre-ADR scaffold history). AI
agents start at [`AGENTS.md`](AGENTS.md); skills and workflow commands live in
`.agents/` (symlinked into `.claude/`).

Current state: **scaffold only**. No game logic exists yet, by design.

## Requirements

- Node 22 (`.nvmrc`) — `nvm use`
- pnpm 9
- Docker, with the `desktop-linux` context active (`docker context use desktop-linux`)

## Setup

```bash
nvm use && pnpm install && cp .env.example .env
```

Start Postgres:

```bash
docker compose -f docker/docker-compose.yml up -d
```

Apply migrations (the only one is empty):

```bash
pnpm --filter @cambio/api migrate
```

## Running

```bash
pnpm dev
```

Web on http://localhost:3000, API on http://localhost:3001. The home page is a
smoke test: it renders a shadcn primitive from `@cambio/ui` and shows the result
of a TanStack Query call to the API's `/health`.

Both apps read the single `.env` at the repo root — the API via Node's
`--env-file-if-exists`, Vite via `loadEnv`. There is no per-app `.env` and
nothing needs sourcing into your shell first.

Ports are configurable via `WEB_PORT` and `PORT` in `.env`. The Vite dev server
runs with `strictPort`, so a clash fails loudly instead of silently landing on
the API's port.

Note that Turborepo runs tasks in **strict env mode**: a variable not listed in
`globalPassThroughEnv` (or a task's `env`) is stripped before the task sees it.
Adding a new environment variable means adding it to `turbo.json` and
`.env.example`, or it will silently read as undefined under `pnpm dev`.

## Checks

```bash
pnpm turbo build typecheck lint test
```

`lint` enforces the §3.1 dependency table with `eslint-plugin-boundaries`, and it
fails the build rather than warning. Adding
`import { Phase } from "@cambio/domain"` to anything in `apps/web` is an error,
not a code-review conversation — the domain holds every player's cards, so the
client must not be able to reach it.

## Layout

```
apps/api          Fastify — presentation + infrastructure
apps/web          TanStack Start
packages/domain       pure: entities, ADTs, rules engine, repository ports
packages/application  use cases, infrastructure ports
packages/contracts    wire types shared by api + web
packages/ui           shadcn primitives, shared components, styles
packages/config       shared tsconfig / eslint / prettier bases
```

Who may import what is defined once, as data, at the top of
`packages/config/eslint.base.js`. Change it there.

Add shadcn components from `packages/ui`:

```bash
pnpm dlx shadcn@latest add <component>
```

## Troubleshooting

**`Error: ENOSPC: System limit for number of file watchers reached`** — the dev
servers cannot watch files. This is a machine limit, not a repo problem; editors
consume a lot of it (a single VS Code / Cursor window over a large repo can hold
40k+ watches). Raise it:

```bash
sudo sysctl -w fs.inotify.max_user_watches=524288 fs.inotify.max_user_instances=512
```

Persist it by adding both to `/etc/sysctl.d/99-inotify.conf`.
