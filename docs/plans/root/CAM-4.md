# CAM-4 — Temporary-user auth: resolve §9.5 and implement

- **Linear:** [CAM-4](https://linear.app/raafayk7/issue/CAM-4/temporary-user-auth-resolve-95-and-implement)
- **Scope:** backend
- **Child plans:** [backend](../backend/CAM-4.md)
- **ADRs:** [0018](../../adr/0018-stateless-hmac-cookie-sessions.md) —
  stateless HMAC-signed cookie, 7-day sliding lifetime, cookie is the
  identity, signer behind an application port, config-driven attributes

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

After this task, a browser can become a temporary user by choosing a display
name, and the API knows who is making every subsequent request: `POST /users`
creates the user and sets a signed httpOnly session cookie, `GET /me` answers
"who am I" from that cookie, and an auth hook resolves identity for any
protected route — the plumbing every future game command (CAM-5's use cases)
will use to know its actor. Observe it working: start the api
(`pnpm dev`), `curl -i -X POST localhost:3001/users -H 'content-type:
application/json' -d '{"name":"Raafay"}'` → 201 + `set-cookie`, then replay
that cookie against `GET /me` → the same user.

## Context & orientation

- **Governing docs:** HANDOFF §9.5 (resolved by ADR-0018), §4.3 (`users`
  table), §6 (single instance, restarts), §7 (weekly user soft-delete);
  skills: `architecture`, `application-layer`, `effect-domain-modeling`
  (error idiom), `infrastructure-persistence` (adapter conventions).
- **Already exists (CAM-3):** the `users` table
  (`apps/api/migrations/0002_cambio_schema.sql`) and the `UserRepository`
  port (`packages/domain/src/UserRepository.ts` — `create`, `findById`,
  typed `UserNotFound`/`StorageError`) with its adapter
  (`apps/api/src/infra/user-repository.ts`). `ClockPort` and
  `IdGeneratorPort` exist in `packages/application/src/ports/` with adapters
  in `apps/api/src/infra/`. No schema change is needed.
- **Missing (this task):** any use case at all (`packages/application` holds
  only the two ports — CAM-4 writes the repo's first use cases), any Fastify
  hook/request decoration, any typed-error→HTTP mapping, any HTTP-level
  test, and test infrastructure for `packages/application`. Each of those is
  a first; this plan establishes the pattern.
- **Boundary constraints (ADR-0017):** `domain`, `contracts`, `application`
  may import only `effect` — `node:crypto`, `fastify`, and `@fastify/cookie`
  are lint errors there. All crypto and cookie handling therefore lives in
  `apps/api` behind the `SessionSignerPort`.

## Functional contract

All clauses assume the decided design (ADR-0018): session = httpOnly cookie
carrying an HMAC-SHA256-signed payload of `{ userId, expiresAt }`.

### C1 — User creation

- **C1.1** `POST /users` with a valid body `{ name }` creates a row in
  `users` with a freshly minted uuid and the given name, and responds `201`
  with `{ userId, name }` where `userId` is that row's id.
- **C1.2** The `201` response carries a `Set-Cookie` for the session cookie:
  httpOnly, `Path=/`, its value verifiable by the signer, its payload
  carrying the created `userId` and an expiry equal to now + the configured
  TTL.
- **C1.3** An invalid body — missing name, empty/whitespace-only name, or
  name longer than the contracts-defined maximum — responds `400`, creates
  no row, and sets no cookie.

### C2 — Session verification

- **C2.1** A request to a protected route with a valid session cookie
  resolves to the cookie's user: `GET /me` responds `200` with
  `{ userId, name }` matching the user created in C1.1.
- **C2.2** A request to a protected route with no session cookie responds
  `401`.
- **C2.3** A cookie whose signature does not verify (tampered payload or
  wrong secret) responds `401`. Signature comparison is constant-time.
- **C2.4** A structurally valid cookie whose `expiresAt` is in the past
  responds `401`.
- **C2.5** A validly signed, unexpired cookie whose `userId` matches no
  live user (nonexistent or soft-deleted) responds `401` — treated as no
  session, per ADR-0018 §4.

### C3 — Sliding renewal

- **C3.1** Every authenticated request (any route behind the auth hook)
  re-issues the session cookie with the same `userId` and a fresh expiry of
  now + TTL.

### C4 — Configuration

- **C4.1** `SESSION_SECRET` is required: the api fails at boot when it is
  absent, exactly as it does for `DATABASE_URL`.
- **C4.2** Session TTL and the cookie's `Secure`/`SameSite` attributes are
  configuration with localhost-friendly defaults (7 days; `Lax`, not
  `Secure`); `httpOnly` and `Path=/` are unconditional. No TTL or attribute
  literal appears outside the config layer and `.env.example`.

### C5 — Architecture invariants

- **C5.1** Signing and cookie mechanics exist only in `apps/api`:
  `packages/application` gains the `SessionSignerPort` interface, its typed
  session errors, and use cases that acquire time/ids/signing exclusively
  via ports (`ClockPort`, `IdGeneratorPort`, `SessionSignerPort`) — no
  `Date.now()`, no `crypto`. Enforced by the existing lint boundaries; the
  gate passing is the check.
- **C5.2** The wire shapes (create-user request, session-user response) live
  in `packages/contracts` with the `decodeX`/`encodeX` helper convention,
  importable by `apps/web` without touching `domain`.

### Acceptance criteria

- [ ] `pnpm turbo build typecheck lint test` passes.
- [ ] The Purpose section's curl sequence works against `pnpm dev` (201 +
      cookie, then 200 `/me` with the same user).
- [ ] ADR-0018 exists, is indexed in `docs/adr/README.md`, and the
      implementation matches it.
- [ ] `packages/application` has a `test` script wired into `turbo test`,
      with use-case tests running on stub layers.
- [ ] `.env.example` and `turbo.json` (`globalPassThroughEnv`) cover every
      new variable; a fresh clone with `.env` copied from the example boots.

## Plan of work

Backend-only, but the ordering rule still applies: **contracts freeze
first**, then the layers build inward-out. Milestone detail (files, sketches,
commands) lives in the [backend child plan](../backend/CAM-4.md).

1. **M1 — Contracts.** `CreateUserRequest` / `SessionUser` schemas with
   decode/encode helpers and the name length rule (C1.3, C5.2). Frozen
   before anything depends on them.
2. **M2 — Application.** `SessionSignerPort` + typed session errors beside
   it; the repo's first use cases — create-temporary-user and
   verify-session (including sliding renewal, C3.1) — written test-first
   against stub layers; test infrastructure (vitest + `@effect/vitest`,
   `test` script) added to the package.
3. **M3 — Infra.** The HMAC signer adapter (`node:crypto`) implementing
   `SessionSignerPort`; `AppConfig` gains `SESSION_SECRET` (redacted,
   required), TTL, and cookie-attribute config; `.env.example` and
   `turbo.json` updated in lockstep (C4).
4. **M4 — Presentation.** `@fastify/cookie` registered (parse/serialize
   only); the auth hook resolving cookie → user and decorating the request;
   `POST /users` and `GET /me` routes; the repo's first typed-error→HTTP
   mapping (400/401/500).
5. **M5 — HTTP tests + gate.** `app.inject()` tests through `buildServer`
   pinning C1–C3 end to end (cookie set on create, 401 matrix, sliding
   renewal), then the full gate.

## Validation

- **Unit (M2):** use-case tests with stubbed clock/ids/signer/repository
  prove creation returns the minted user + token, and verification's four
  outcomes (valid → user + renewed token; bad signature; expired; unknown
  user) as typed results — no Postgres, no real time.
- **Adapter (M3):** signer adapter tests prove sign→verify round-trip,
  tamper rejection, and that verification of a token signed with a
  different secret fails.
- **HTTP (M5):** `app.inject()` suite in `apps/api/test/` (shares the
  existing test DB harness) covers the C1–C3 matrix; the child plan's
  Contract coverage table maps every clause to its landed test.
- **Manual:** the Purpose curl sequence; plus boot-failure check by
  unsetting `SESSION_SECRET` (C4.1).
- **Gate:** `pnpm turbo build typecheck lint test` — includes the
  repo-wide prettier check.

## Progress

_(updated continuously; append new entries at the BOTTOM — newest last;
timestamp each entry)_

- [x] 2026-09-01 — Planning: §9.5 resolved with Raafay (two interview
      rounds), ADR-0018 written, exploration report gathered, plans drafted.

## Decision log

_(every non-obvious choice made during planning or implementation: what was
decided, why, what was rejected. Promote to an ADR if it meets the adr
skill's bar.)_

- 2026-09-01 — Mechanism/lifetime/rejoin/signer-port/cookie-attrs → ADR-0018
  (all five put to Raafay with alternatives; §9 items always get an ADR).
- 2026-09-01 — Display-name rule lives in **contracts, not the DB**:
  trimmed, non-empty, max 32 chars. The `users` table stays
  constraint-free (CAM-3 shipped it; names are guest-chosen labels, not
  identities — no uniqueness). Rejected: a `0003` migration adding a CHECK —
  schema churn for a rule the wire boundary already enforces.
- 2026-09-01 — Routes are `POST /users` and `GET /me`. Rejected
  `/auth/session`-style naming: there is no auth resource distinct from the
  user; the cookie is issued as a side effect of user creation.
- 2026-09-01 — HTTP-level testing via `fastify.inject()` against the
  exported `buildServer` is established here (first in repo), reusing the
  existing Postgres test harness in `apps/api/test/support/`. Rejected:
  unit-only testing (leaves the hook and status mapping unpinned).
- 2026-09-01 — Tests supply the session secret as a literal test-only
  constant in `apps/api/test/support/` (vitest doesn't load `.env`;
  `TEST_DATABASE_URL` precedent).
- 2026-09-01 — DECISIONS.md's "still open" §9 list is left as-is (history;
  precedent: ADRs 0009–0012 didn't edit it either — the ADR index is the
  record).

## Surprises & discoveries

_(anything found mid-implementation that the plan didn't predict — wrong
assumptions, upstream bugs, better approaches. Evidence included.)_

- Planning: `WEB_ORIGIN` default (3000) disagrees with the actual web dev
  port (3100, per AGENTS.md and `.env`). Harmless until credentialed CORS +
  cookies; if the browser drops the cookie during manual testing, check
  `WEB_ORIGIN` first.

## Outcomes & retrospective

_(filled at the end, typically by `/review`: what shipped, what was cut,
what should carry into the next task.)_
