# 0032 — Browser realtime via @supabase/realtime-js with a static build-time anon JWT

- **Status:** proposed
- **Date:** 2026-09-05
- **Task:** CAM-17

## Context

CAM-17 wires the first client screens to Supabase Realtime. The browser
must open a websocket to the self-hosted Realtime container
(ADR-0024) and subscribe to the capability topics the API grants it
(ADR-0023). Two things were unplumbed:

1. **The client library.** `apps/web` has no realtime dependency; the
   only subscriber code in the repo is the API's integration test, which
   uses `@supabase/realtime-js` directly
   (`apps/api/test/RealtimeIntegration.test.ts`).
2. **The anon JWT.** The Realtime service requires an HS256 JWT signed
   with `REALTIME_JWT_SECRET` to accept a socket connection. ADR-0023
   already establishes that this token gates the **service only** — it
   is deliberately not the authorization mechanism; unguessable
   capability topics are. ADR-0023 anticipated that "the browser needs
   only the public realtime URL and the shared anon JWT plus its
   topics", but no delivery mechanism existed.

`.env.example` and `turbo.json` expose only `VITE_API_URL` to the web
build; Turborepo strict env mode strips any undeclared variable.

## Decision

**We add `@supabase/realtime-js` (not the full `supabase-js`) as a
runtime dependency of `apps/web`, and deliver the realtime URL and anon
JWT as static build-time environment variables:**

- `VITE_REALTIME_URL` — the websocket endpoint (locally
  `ws://realtime-dev.localhost:4000/socket`; the tenant is resolved from
  the hostname's first label, so bare `localhost` does not work).
- `VITE_REALTIME_ANON_JWT` — a long-lived HS256 JWT
  `{ role: "anon", exp }` signed with `REALTIME_JWT_SECRET`, minted once
  per environment by an operator (a helper script may reuse the API's
  existing `realtime-jwt` signing logic; minting is an ops step, never a
  runtime call from the web app).

Both variables are added to `.env.example` and declared in
`@cambio/web#build`'s `env` array in `turbo.json` (hashed), and passed
through for `dev`.

Shipping the token in the bundle is by design: it is public, grants
access to nothing but the socket handshake, and the signing secret
cannot be derived from it. Topic capability strings remain the only
authorization, delivered per-player by the API (ADR-0023).

Alternatives considered:

- **API-minted short-lived JWT** (e.g. `GET /realtime/token` for
  authenticated sessions): rotatable without rebuild and keeps the token
  out of the bundle, but adds an endpoint, client refresh logic on
  expiry, and a failure mode on reconnect — machinery defending a token
  that ADR-0023 already declares non-secret. Lost on complexity for zero
  security gain in v0.
- **Full `supabase-js`**: brings database/auth/storage clients the
  browser must never use (hidden-information hard prohibition on
  anon-key DB access). The narrow `@supabase/realtime-js` dependency
  makes the prohibition structural.
- **Raw Phoenix websocket client**: avoids the dependency but re-derives
  the channel protocol the integration test already proves through
  `@supabase/realtime-js`.

## Consequences

- The web app can subscribe to room and per-player topics with the same
  client the integration test pins; connection behavior is testable
  against the real container.
- Token rotation requires re-minting and redeploying the web bundle.
  Acceptable for a single self-hosted tenant; the trigger for revisiting
  (an API-minted token endpoint superseding this ADR) is deploying to an
  environment where rotation without rebuild matters or the Realtime
  tenant is shared.
- Two new env variables become part of the web build contract; forgetting
  the `turbo.json` declaration silently strips them, so the plan pins
  them with a test or an explicit checklist step.
- `packages/ui` stays realtime-free; the dependency lives in `apps/web`
  only, consistent with the layering (`ui` has zero app knowledge).
