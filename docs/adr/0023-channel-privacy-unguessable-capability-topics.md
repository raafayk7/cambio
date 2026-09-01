# 0023 — Realtime channel privacy via unguessable capability topics, not Realtime Authorization

- **Status:** proposed (accepted at the release-v0 → development merge, upon human approval)
- **Date:** 2026-09-01
- **Task:** CAM-6

## Context

HANDOFF §5's channel topology — a room channel for public events, a
per-player channel for private payloads — needs an answer to "what stops
another player from subscribing to my channel?" Supabase Realtime Broadcast
channels are joinable by topic name unless guarded. The platform's answer,
Realtime Authorization, means private channels with RLS policies on
`realtime.messages` evaluated against the subscriber's JWT claims — which
would require the API to mint per-user Supabase-compatible JWTs (bridging
our HMAC-cookie identity, ADR-0018), database roles for the claims to map
to, and RLS policies expressing per-game membership. All of that works
without GoTrue, but it is a second auth system to build and keep correct.

## Decision

**Channel topics are capabilities: each contains a random secret, and
knowing the topic is the authorization.** The API mints a per-game,
per-audience secret when the game/lobby is created or joined:

- room topic: `game:{gameId}:{roomSecret}` — issued to every participant;
- per-player topic: `game:{gameId}:player:{userId}:{playerSecret}` — issued
  only to that player.

Secrets are generated server-side (crypto-strength, via the id/seed
infrastructure), delivered to each entitled player over the authenticated
HTTP surface (session-guarded responses), and never appear in any payload
another player receives. Channels stay in Broadcast "public" mode; the
unguessable topic is the guard — the same trust model as a capability URL.
Subscribing clients still present the shared self-signed realtime JWT
(anon-role), which gates access to the Realtime service as a whole, not to
individual topics.

_Rejected — Realtime Authorization (RLS on `realtime.messages`):_ correct
and platform-blessed, but pulls per-user JWT minting, database roles, and
policy code into a task whose risk budget is already spent on the viewFor
projection. Revisit if secrets ever need revocation mid-game.

_Rejected — no guard (predictable topics):_ any participant could subscribe
to another player's private channel; devtools wins every game.

## Consequences

- Topic construction and secret issuance live in the publisher adapter and
  the contracts responses; adversarial tests must assert one player's
  response never contains another player's `playerSecret`.
- Secrets are static for the life of a game — leaking one leaks that
  channel until the game ends. Acceptable for anonymous casual play;
  Realtime Authorization is the upgrade path and this ADR is what it would
  supersede.
- The browser needs only the public realtime URL and the shared anon JWT
  plus its topics — no Supabase account coupling in the frontend.
