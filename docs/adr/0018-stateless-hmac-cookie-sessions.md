# 0018 — Temporary-user sessions: stateless HMAC-signed cookie, 7-day sliding lifetime, cookie is the identity

- **Status:** proposed (accepted at the release-v0 → development merge, upon human approval)
- **Date:** 2026-09-01
- **Task:** CAM-4

## Context

HANDOFF §9.5 left temporary-user auth deliberately undecided: "presumably a
signed cookie or JWT carrying a random `user_id`, no password. Session
lifetime and rejoin behaviour unspecified." CAM-3 shipped the §4.3 `users`
table (`user_id` uuid PK, `user_name`, soft-delete columns) and a minimal
`UserRepository` port, so CAM-4 must decide the session mechanism, its
lifetime, and what "rejoin with the same identity" means, then build it.

Constraints shaping the choice: a single API instance with no Redis (§6),
users are disposable guests with no passwords or recovery expectations (§8
non-goals), the §7 lifecycle cron soft-deletes stale users weekly, and the
ESLint boundaries (ADR-0017) forbid `node:crypto` outside `apps/api` — so
whatever signs tokens must sit behind an application port.

All calls below were put to the user with alternatives during planning.

## Decision

1. **Stateless HMAC-signed cookie.** The session is an httpOnly cookie whose
   value is a signed payload of `{ userId, expiresAt }` — HMAC-SHA256 with a
   server secret (`SESSION_SECRET`, required at boot like `DATABASE_URL`).
   Verification is signature check (constant-time compare) + expiry check +
   `UserRepository.findById`; no sessions table exists.

   _Rejected — server-side sessions table:_ revocable and observable, but
   adds a table, repository, migration, and §7 cron cleanup for guests whose
   entire account is disposable; revocation has no use case without accounts.

   _Rejected — JWT in an `Authorization` header:_ client-managed storage
   (localStorage) is XSS-exposed, and the frontend must thread the token
   manually; an httpOnly cookie rides every request for free with
   `credentials: true` CORS already configured.

2. **The signer is an application port.** `SessionSignerPort` lives in
   `packages/application/src/ports/`; the adapter in `apps/api/src/infra/`
   hand-rolls `node:crypto` `createHmac` + `timingSafeEqual`. The
   `@fastify/cookie` plugin is used for cookie parsing/serialization only —
   its own signing mode is not used, because the token format (payload +
   expiry) is ours and the port keeps use cases testable with a stub signer.

3. **7-day sliding lifetime, config-driven.** Expiry is refreshed on
   authenticated activity, so active players never expire mid-game. The TTL
   is configuration (`AppConfig`), not a literal — same posture as the §9.4
   slam window (ADR-0011). Seven days aligns with the §7 weekly soft-delete
   cadence for stale users.

   _Rejected — fixed 24h lifetime:_ a multi-day game break or long lobby
   loses identity for no benefit. _Rejected — 30 days:_ outlives the §7
   cleanup cadence, creating cookies that reference soft-deleted users as
   the steady state.

4. **The cookie is the identity.** A lost or expired cookie means a new
   temporary user; there is no recovery mechanism. "Rejoin with the same
   identity" means: while the cookie is valid, every request and reconnect
   resolves to the same `user_id`. A valid signature whose user has been
   soft-deleted is treated as no session.

   _Rejected — rejoin codes:_ a redemption endpoint, code storage, and
   brute-force handling to give disposable guests a recovery story the
   product doesn't promise (§8 defers reconnect polish).

5. **Cookie attributes are config-driven.** `httpOnly` and `Path=/` always;
   `Secure` and `SameSite` come from `AppConfig` with localhost-friendly
   defaults (`Lax`, not `Secure`), so production on split origins (Render)
   flips env vars, not code.

## Consequences

- Auth verification is pure computation plus one `findById` — no session
  storage to provision, clean up, or replicate. Rooms and restarts (§6)
  need no session recovery logic.
- Sessions cannot be revoked server-side before expiry; acceptable for
  passwordless guests, revisit if accounts-with-passwords ever land.
- Rotating `SESSION_SECRET` invalidates every live session at once — that
  is the only kill switch, and it is acceptable.
- The `SessionSignerPort` boundary commits us to keeping crypto out of
  `application`; tests stub the signer and clock, never real HMAC or time.
- If the API ever scales horizontally, stateless tokens keep working
  unchanged — only the §6 room actor model needs rethinking, not auth.
