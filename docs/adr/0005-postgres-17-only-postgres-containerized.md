# 0005 — Postgres 17, and only Postgres is containerized

- **Status:** accepted
- **Date:** 2026-08-30 (decided during Task 1, the scaffold; recorded here on ADR migration)

## Context

Local dev needs a database matching production (Supabase). The question was
which major version to pin and whether to containerize the apps too. No
Redis: in-memory room state + Postgres suffices for a single instance
(HANDOFF §6).

## Decision

`docker/docker-compose.yml` runs `postgres:17-alpine` (matching the Supabase
project's major version — if Supabase upgrades, bump this in lockstep) on
host port **5433** so it never fights a locally installed Postgres.
`apps/api` and `apps/web` run natively, not in containers; there are no
Dockerfiles.

## Consequences

`docker compose up -d` is the only container step in dev. Native dev avoids
Docker Desktop's VM file-watch limits on Linux (which are typically _lower_
than the host's — raise host inotify limits instead, see README). Revisit
build/containerization only when Render deployment forces a choice. Redis is
added only if the API ever scales horizontally.
