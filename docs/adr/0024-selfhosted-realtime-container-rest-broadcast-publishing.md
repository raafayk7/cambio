# 0024 — Self-hosted Realtime container in local compose; publishing via the REST broadcast endpoint

- **Status:** proposed (accepted at the release-v0 → development merge, upon human approval)
- **Date:** 2026-09-01
- **Task:** CAM-6

## Context

The publisher adapter for `RealtimePublisherPort` must be developed and
tested locally, but local dev runs only Postgres in Docker — Supabase
Realtime exists only in the deployed Supabase project. Choices were needed
for (a) how the API process sends broadcasts, and (b) how the real wire is
exercised before deploy. Research against the supabase/realtime repo and
self-host docs established that the bare `supabase/realtime` container runs
fully offline — no cloud account or API key; the only credential is a JWT we
sign ourselves with a locally chosen secret — and exposes the same REST
broadcast endpoint the cloud routes through Kong.

## Decision

1. **Publish via the REST broadcast endpoint, wrapped in a thin Effect
   `fetch` client** — `POST /api/broadcast` with a self-signed HS256 JWT
   (claims `role` + `exp`, signed with the tenant's `API_JWT_SECRET`), body
   `{messages: [{topic, event, payload}]}`. Stateless, retryable, batchable,
   and adds **no SDK dependency** to `apps/api`.

   _Rejected — `supabase-js`/`realtime-js` `channel().send()`:_ drags
   websocket join/heartbeat lifecycle into a server that only publishes,
   and falls back to the same HTTP endpoint anyway when unsubscribed.

2. **A `supabase/realtime` service joins `docker/docker-compose.yml`**,
   pointed at the existing Postgres container, pinned to the version the
   supabase/supabase self-host compose pins, seeded single-tenant via
   `SEED_SELF_HOST=true` (tenant `realtime-dev`, `jwt_secret` =
   `API_JWT_SECRET`). Its Ecto bookkeeping is confined to a pre-created
   `_realtime` schema (`DB_AFTER_CONNECT_QUERY: 'SET search_path TO
_realtime'`); tenant migrations add schema `realtime`. Both schema names
   are reserved; app migrations stay in `public`. The container becomes part
   of the required dev environment: its integration suite **hard-fails**
   when it is down, same as the Postgres-backed suites — the gate never
   silently shrinks.

   _Rejected — Supabase CLI local stack:_ ~6 containers including a second
   Postgres alongside ours; redundant and confusing when only Broadcast is
   needed.

   _Rejected — stub-only testing, first real wire at deploy:_ defers
   integration risk to the worst moment.

3. **Broadcast mode only remains a hard rule** (HANDOFF §5). The container
   enables no Postgres Changes replication to clients; it exists solely as
   a broadcast relay the API posts into.

## Consequences

- New env in `.env`/`.env.example`/`turbo.json`: the realtime URL, the JWT
  secret, and the derived publisher token config. All self-generated; no
  supabase.com involvement locally.
- Docker compose grows a second service with key-length constraints
  (`DB_ENC_KEY` 16 chars, `SECRET_KEY_BASE` 64 chars) and a
  subdomain-addressed URL (`realtime-dev.localhost:4000` — the tenant is
  resolved from the Host's first label; bare `localhost` 404s).
- The deployed environment differs only in URL and secret — the publish
  path (REST + JWT) is identical against hosted Supabase.
- CI without the container cannot run the realtime integration suite; the
  suite lives with the other infra-dependent api tests, which already
  require Docker.
