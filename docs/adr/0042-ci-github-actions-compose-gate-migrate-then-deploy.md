# 0042 — CI/CD: GitHub Actions runs the compose-backed full gate; development pushes go gate → migrate → deploy hook

- **Status:** proposed
- **Date:** 2026-09-08
- **Task:** CAM-32

## Context

The gate is `pnpm turbo build typecheck lint test`, and AGENTS.md is
emphatic that it never shrinks and never gets piped. Two suites make CI
non-trivial: the api integration tests need Postgres (env-overridable
`TEST_DATABASE_URL`, admin rights to `CREATE DATABASE`, a database named
`cambio`), and `RealtimeIntegration.test.ts` hard-fails without the
self-hosted Realtime container at `realtime-dev.localhost:4000` — a
hostname bare GitHub runners can't even resolve (glibc doesn't map
`*.localhost`).

On the deploy side: migrations must run against Supabase prod before the
api restarts on new code, but Render free instances don't support
pre-deploy commands, and the migrate script runs via `tsx` — a
devDependency, dead in any pruned install. Deploys must also be ordered
after a green gate, which Render's own push-triggered auto-deploy cannot
guarantee.

## Decision

**One workflow, two triggers, in `.github/workflows/`:**

**PR gate** (`pull_request`, every target branch): checkout → Node 22
(`.nvmrc`) + pnpm 9 (corepack) → `pnpm install --frozen-lockfile` → append
`127.0.0.1 realtime-dev.localhost` to `/etc/hosts` →
`docker compose -f docker/docker-compose.yml up -d --wait` → run the gate
**bare** (no pipes; exit code is the verdict). Reusing the dev compose
file keeps CI byte-identical to the documented dev environment, ports and
all (`TEST_DATABASE_URL` fallback `localhost:5433` just works), and each
branch's gate runs that branch's own compose definition — old branches
stay self-consistent. Turbo caching via `actions/cache` on `.turbo` is an
optimization, never a substitute for running the gate.

**Deploy** (`push` to `development`): the same gate job, then a migrate
job, then deploy triggers — strictly ordered:

1. **Migrate:** `pnpm --filter @cambio/api migrate` with `DATABASE_URL`
   set from a GitHub secret holding the Supabase **session-mode pooler**
   connection string as the `postgres` role — pooler because GitHub
   runners are IPv4-only while Supabase direct connections are IPv6-first;
   session mode because `0004_data_lifecycle` installs pg_cron and
   schedules jobs (implementation verifies the pg_cron `DO` block through
   the pooler; fallback is applying that migration via the Supabase MCP).
   `tsx` exists here thanks to the workflow's full install. The runner is
   idempotent, so re-runs are no-ops.
2. **Deploy api:** Render auto-deploy is **off**; the workflow calls the
   Render deploy hook (GitHub secret) only after migrate succeeds. New
   code never boots against an unmigrated schema.
3. **Deploy web:** Vercel's git integration handles it independently
   (production branch `development`); the static SPA has no schema
   coupling, so it need not wait on migrate.

**Alternatives rejected:**

- **Purpose-built CI services instead of the compose file** (GH service
  containers for Postgres + Realtime) — duplicates the dev environment
  definition in a second dialect that will drift; the compose file is
  already the tested truth, and Docker is preinstalled on runners.
- **Making the realtime test URL env-driven / skippable** — shrinks the
  gate; explicitly forbidden.
- **Migrations from Render (preDeploy or at boot)** — free tier has no
  preDeploy; boot-time migration couples cold starts (frequent, on free
  tier) to schema work and needs `tsx` in a prod install.
- **Render auto-deploy on push** — races the migration and ignores the
  gate.
- **Turbo remote cache (Vercel)** — deferred; `actions/cache` is enough
  and adds no account coupling.

## Consequences

- CI reuses `docker/docker-compose.yml` verbatim; compose changes are
  automatically CI changes — one definition to maintain.
- The deploy path owns two GitHub secrets (prod `DATABASE_URL`, Render
  deploy hook) and the Render/Vercel dashboards own the runtime env vars;
  the root plan carries the full inventory.
- Vercel previews and per-PR deploys stay disabled/out of scope (CAM-32
  ticket); revisit alongside a custom domain.
- A failed migrate blocks the api deploy but not the Vercel one — the
  static SPA against an old api is the already-supported "stale client"
  case (`games.version` guards).
