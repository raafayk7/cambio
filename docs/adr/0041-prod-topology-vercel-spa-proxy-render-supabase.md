# 0041 — Production topology: static SPA on Vercel proxying `/api` to one Render instance, Supabase for Postgres + Realtime

- **Status:** accepted
- **Date:** 2026-09-08
- **Task:** CAM-32

## Context

CAM-32 ends the "deployment target once CI/CD exists" era: v0 needs real
hosting. Three architectural facts constrain the choice:

1. **The api is a stateful single-instance actor** (ADR-0020, HANDOFF §6):
   one fiber per room, in-memory command queue, cached state, slam-close
   timer fibers. Serverless platforms (Vercel Functions, Supabase Edge
   Functions) are stateless and scale to N instances — two commands for one
   room could land on different instances, breaking server-authoritative
   ordering and triggering the exact `VersionConflict` anomaly ADR-0020
   treats as a bug signal. The api needs a long-running single instance.
2. **The session cookie is the identity** (ADR-0018). A web app on
   `*.vercel.app` calling an api on `*.onrender.com` is cross-site;
   Safari (and increasingly Chrome) block third-party cookies, which would
   silently break auth on iOS. Web and api must share a site in the
   browser's eyes.
3. **The web app is SSR-shaped but does zero SSR**: `ssr: true` with no
   route loaders, no server functions, all data fetching in client-side
   `useQuery` (`apps/web/src/services/api.ts` is the single HTTP choke
   point). Nothing needs a server render.

Separately, Supabase's legacy JWT-secret auth model (which ADR-0032's
self-minted anon JWT and ADR-0024's self-signed broadcast JWT lean on)
stops working at the end of 2026; new projects default to publishable
(`sb_publishable_…`) and secret (`sb_secret_…`) API keys.

## Decision

**Web:** `apps/web` deploys to **Vercel** as a **static SPA** (TanStack
Start SPA mode/prerender — no server runtime). Production branch is
`development`.

**API:** `apps/api` deploys to **Render** as a single **free-tier** web
service initially. Free-tier spin-down is accepted: the architecture was
explicitly designed to survive it (absolute `closesAt` timestamps, rooms
reconstructible by folding `game_events` — HANDOFF §6). Upgrading to an
always-on paid instance is a dashboard change, not a code change.

**Single origin via proxy:** Vercel rewrites `/api/:path*` to the Render
host, **stripping the `/api` prefix** (api routes live at root:
`/health`, `/lobbies`, …). The browser sees one origin, so the ADR-0018
cookie is first-party with `Secure` + `SameSite=Lax`. The client needs no
code change beyond `VITE_API_URL=/api` at build time. Realtime is
unaffected — the browser connects directly to Supabase.

**Data + Realtime:** one **Supabase free-tier** project carries Postgres
and cloud Realtime. Prod realtime authenticates with the **new API keys**:
the browser passes the publishable key where the self-minted anon JWT went
(amending ADR-0032 for deployed environments), and the api's REST
broadcast authenticates with the secret key via an `apikey` header the
transport must learn to send (amending ADR-0024's "the deployed
environment differs only in URL and secret" — it also differs in path
shape, `/realtime/v1` prefix, and auth headers). The local self-hosted
container and its self-minted HS256 JWTs stay exactly as they are.

**Alternatives rejected:**

- **API on Vercel/Supabase (serverless)** — incompatible with the
  single-instance actor model; would force Redis + horizontal-scaling
  rearchitecture HANDOFF §8 explicitly defers.
- **Custom domain for same-site cookies** — works (subdomains are
  same-site) and reads nicer, but costs money and DNS/cert wiring for the
  same cookie outcome the free rewrite gives. Deferred, not rejected
  forever; the proxy makes a later domain purely additive.
- **`SameSite=None` cross-site cookies** — blocked by Safari ITP
  regardless of attributes; not a real option.
- **Full SSR via the Vercel/nitro adapter** — keeps a capability the app
  doesn't use, at the cost of a runtime, cold starts, and a bigger deploy
  surface.
- **Legacy Supabase JWT secret in prod** — minimal code delta but
  guaranteed rework in ~4 months when legacy keys shut off.
- **Render paid / Fly.io / Railway** — deliberately deferred; free tier
  first, upgrade when spin-down UX hurts.

## Consequences

- The api must send an `apikey` header on broadcast and accept
  cloud-shaped realtime URLs; env vars for realtime split into a
  local-JWT flavor and a cloud-key flavor.
- Anything that would hit the Render host directly (bypassing the proxy)
  is cross-site and unauthenticated by design; the api's CORS single
  origin (`WEB_ORIGIN`) stays the Vercel origin.
- Free tiers bring operational caveats we accept for v0: Render
  spin-down cold starts, Supabase pausing after ~7 idle days (the
  always-on connection pool and ADR-0025's pg_cron jobs make this
  unlikely while the game has any traffic).
- Revisit when: spin-down UX hurts (pay Render), a custom domain is
  bought (drop the proxy or keep it), or the api needs >1 instance
  (that's the Redis conversation, not a hosting tweak).
