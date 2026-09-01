# CAM-4 — Temporary-user auth: cookie sessions, first use cases, first routes (backend)

- **Root plan:** [root/CAM-4.md](../root/CAM-4.md) — the functional contract
  (C1–C5) lives there; this document is implementation detail for the backend
  side.
- **ADRs:** [0018](../../adr/0018-stateless-hmac-cookie-sessions.md)
  (stateless HMAC-signed cookie, 7-day sliding lifetime, cookie is the
  identity, signer behind an application port, config-driven attributes),
  [0017](../../adr/0017-effect-only-external-imports-split-src-test-blocks.md)
  (import boundaries — the reason every byte of crypto and cookie handling
  lives in `apps/api`).

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

Work spans three packages. Governing skills: **application-layer** (the
repo's first use cases and the `SessionSignerPort`; ports as `Context.Tag`
classes namespaced `"@cambio/application/XxxPort"`; use cases as plain
exported functions returning `Effect`, tested against stub layers),
**architecture** (crypto/cookies are infrastructure → `apps/api` only; wire
shapes → `contracts`; the signer is a _technical_ capability so its port
lives in `application/src/ports/`, not domain), **effect-domain-modeling**
(error idiom repo-wide: `Data.TaggedError`, field-less errors omit the
generic entirely — never `<{}>`; `Schema.decodeUnknown` for anything
untrusted), **infrastructure-persistence** (adapter conventions —
`clock.ts`/`ids.ts` are the size and shape template; typed errors, never
throws). Nothing here touches game state or realtime, but the
hidden-information posture still applies trivially: the only things sent to
clients are `{ userId, name }` and an opaque token.

The surfaces this task touches, as they exist today:

- **CAM-3 layer (build on, don't re-plan):** the `users` table exists
  (`apps/api/migrations/0002_cambio_schema.sql:26-32`) — **no schema change
  for CAM-4**. `packages/domain/src/UserRepository.ts` has
  `User = Schema.Struct({ id: UserId, name: Schema.String })`, `UserNotFound`
  (carries `userId`), and the port with
  `create: (user) => Effect<void, StorageError>` and
  `findById: (userId) => Effect<User, UserNotFound | StorageError>` — note
  `create` returns `void`: the use case constructs the `User` value itself
  and carries it forward. `StorageError` lives in
  `packages/domain/src/GameRepository.ts:28-31`
  (`{ operation: string; cause: unknown }`). The adapter
  (`apps/api/src/infra/user-repository.ts`) already filters
  `deleted_at IS NULL` in SQL, so a soft-deleted user surfaces as
  `UserNotFound` — exactly the C2.5 behavior, for free.
- **packages/application** holds only `ports/Clock.ts` and
  `ports/IdGenerator.ts` — no use cases, no tests, no vitest deps, no `test`
  script. CAM-4 writes the repo's first use cases and adds the package's
  test infrastructure. `Clock.ts:13-18` is the port pattern to copy
  verbatim (tag string, `Effect`-returning members, doc comment saying why
  the port exists and that impls live in `apps/api/src/infra`).
- **packages/contracts** holds only `Health.ts`. Its convention: PascalCase
  `Schema.Struct`, `export type X = typeof X.Type`,
  `decodeX = Schema.decodeUnknownSync` + `encodeX = Schema.encodeSync`,
  barrel `export * from "./X.js"`. Contracts may import **`effect` only** —
  it cannot see `UserId`, so wire shapes re-declare ids as plain
  `Schema.UUID`.
- **apps/api wiring:** `src/index.ts:14-40` is the single entry point — it
  reads `AppConfig` first (`yield* AppConfig`), so a missing required
  variable already fails boot before anything listens (that mechanism _is_
  C4.1; we only add the variable). `src/runtime.ts:18-26` is where
  `AppServices` and `AppLayer` grow. `src/presentation/server.ts:17-37`
  (`buildServer({ config, logger, runtime })`, async, registers
  `@fastify/cors` with `credentials: true`) and
  `src/presentation/health.ts:18-25` (curried route factory
  `(runtime) => async (app) => {…}` with `Runtime.runPromise(runtime)`
  hoisted once) are the presentation idioms to copy. **No hooks, request
  decorations, or typed-error→HTTP mapping exist anywhere yet** — CAM-4
  establishes all three patterns deliberately.
- **Crypto:** `src/infra/ids.ts` holds the repo's only `node:crypto` import
  today; the ESLint boundaries (ADR-0017, `packages/config/eslint.base.js`)
  make `node:crypto` a lint error in `domain`/`contracts`/`application`
  `src/**` (node builtins count as external). `test/**` blocks already
  permit vitest.
- **Testing conventions:** `apps/api/vitest.config.ts` runs
  `test/**/*.test.ts` serially (`fileParallelism: false`, shared DB) with
  `globalSetup: ./test/global-setup.ts`; `test/support/db.ts` exports
  `TEST_DATABASE_URL` (literal fallback — vitest does **not** load `.env`),
  `TestLayer` (repo layers over the test DB), and
  `makeTestRuntime()` (one `ManagedRuntime` per suite file, disposed in
  `afterAll`). `test/UserRepository.test.ts` is the model suite: imports
  from `@effect/vitest`, typed-error assertions via `Effect.either` +
  `Either` guard + `._tag`, test titles citing contract clauses. **Nothing
  imports `buildServer` outside `index.ts`** — the `app.inject()` pattern is
  established here, via a new helper beside `db.ts` (M5).
- **Toolchain:** everything exact-pinned, no carets. fastify 5.11.2,
  @fastify/cors 11.3.0, effect 3.22.1, vitest 3.2.7, @effect/vitest 0.30.0,
  TS 5.9.3. `@fastify/cookie` is **not installed** — CAM-4 adds it
  (Fastify-5-compatible v11 line, exact-pinned, used for parse/serialize
  only; its signing mode stays unused, ADR-0018 §2). Turborepo runs strict
  env mode: new variables must join `turbo.json` `globalPassThroughEnv` or
  tasks see them as undefined. `.env.example`'s header promises every
  variable appears there. If `pnpm` is missing from PATH:
  `source ~/.nvm/nvm.sh && nvm use 22`.

### Decisions this plan makes (open details the root plan left to the child)

Each is recorded here so `/implement` doesn't re-litigate; anything the root
Decision Log should absorb is flagged in Surprises at the bottom.

1. **Token wire format (adapter-private):**
   `base64url(JSON.stringify(encodedPayload)) + "." + hex(HMAC-SHA256(secret, base64urlPart))`.
   The format lives entirely inside the infra adapter; `application` sees
   only `SessionPayload ⇄ opaque string`. Verification order: split on `.`
   (exactly two parts), recompute the MAC over the payload part, length-guard
   then `timingSafeEqual`, only then JSON-parse and
   `Schema.decodeUnknown(SessionPayload)` — untrusted bytes never reach a
   throwing decoder, and the MAC check precedes any parsing.
2. **Expiry is checked by the use case, not the signer.** The port's
   `verify` proves authenticity + shape only; `verifySession` compares
   `payload.expiresAt` against `ClockPort.now`. This keeps the crypto
   adapter clock-free (testable with fixed tokens) and gives expiry its own
   typed error (`SessionExpired` vs `SessionInvalid`) — both map to 401,
   but logs and tests can tell them apart.
3. **TTL reaches use cases as a plain input field (`ttlMillis`), supplied
   by presentation from `AppConfig`.** Rejected: a config port — TTL is a
   static value, not a capability; a port would exist only to launder a
   number. Cookie attributes (`Secure`/`SameSite`) never reach the
   application layer at all — cookie _serialization_ is presentation's job;
   use cases return `{ user, token, expiresAt }` and nothing cookie-shaped.
4. **Hook style: per-route opt-in `preHandler`, no global hook.**
   `presentation/auth.ts` exports a factory
   `makeRequireSession(runtime, options)` returning a Fastify `preHandler`;
   protected routes attach it via route options. Rejected: a global
   `onRequest` hook with an allowlist — with two routes (one public, one
   protected) an allowlist is more machinery and a worse pattern for CAM-5,
   where route-level opt-in composes with per-route schemas.
5. **Request decoration via module augmentation:**
   `declare module "fastify" { interface FastifyRequest { sessionUser?: User } }`
   in `auth.ts` (domain `User` — legal in `apps/api`). Optional (`?`)
   because only routes behind the hook have it; handlers guard defensively.
6. **Sliding renewal's `Set-Cookie` happens inside the auth `preHandler`.**
   `verifySession` already returns a renewed token; the hook sets it, so
   every route that opts into auth gets C3.1 with zero per-route code.
   `POST /users` sets the initial cookie itself via the same shared
   `setSessionCookie` helper.
7. **Contracts gets no test infrastructure.** The name rule
   (trim → non-empty → max 32) is pinned where it is enforced — the M5 HTTP
   400-matrix — not by a third package-level vitest setup for three
   assertions. Revisit when contracts grows game-event schemas.
8. **Cookie name `cambio_session`; env names `SESSION_SECRET`,
   `SESSION_TTL_SECONDS` (default 604800), `SESSION_COOKIE_SECURE` (default
   false), `SESSION_COOKIE_SAMESITE` (default `lax`).** `httpOnly` and
   `Path=/` are unconditional literals in the cookie helper (ADR-0018 §5 —
   they are invariants, not config).
9. **401 bodies are a plain `{ error: string }` literal, not a contract.**
   No clause gives clients structured error shapes yet; an error contract is
   CAM-5+ material. The typed-error→HTTP mapping itself is centralized in
   `presentation/errors.ts` (one place says "SessionInvalid → 401") so the
   pattern is reusable. No cookie clearing on 401 — the contract demands
   401 only; the client decides whether to re-create a user.
10. **Session errors:** `SessionInvalid` (field-less — omit the generic) in
    `ports/SessionSigner.ts` beside the port whose `verify` produces it;
    `SessionExpired` (carries `expiresAt: Timestamp`) in the
    `VerifySession` use-case module that produces it. Tokens are plain
    `string` — opaque, never round-tripped through schemas; a brand would
    be ceremony without a confusion risk (nothing else is a string here).

## Module layout

New/changed files in `packages/contracts`:

| File                  | Exports                                                                                                                                      | Job                                                                                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/User.ts` (new)   | `CreateUserRequest`, `SessionUser` (+ types), `decodeCreateUserRequest`, `encodeCreateUserRequest`, `decodeSessionUser`, `encodeSessionUser` | The two wire shapes (C5.2) + the name rule (C1.3): trim, then non-empty, max 32. `userId` is plain `Schema.UUID` — contracts cannot see domain brands. `Health.ts` is the pattern. |
| `src/index.ts` (edit) | re-exports `./User.js`                                                                                                                       | Barrel, explicit `.js` extension (NodeNext).                                                                                                                                       |

New/changed files in `packages/application`:

| File                                         | Exports                                                          | Job                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ports/SessionSigner.ts` (new)           | `SessionSignerPort`, `SessionPayload` (+ type), `SessionInvalid` | The ADR-0018 §2 port: `sign(payload) → Effect<string>`, `verify(token) → Effect<SessionPayload, SessionInvalid>`. `SessionPayload = { userId: UserId, expiresAt: Timestamp }` (domain imports are legal here); the schema is exported so the adapter decodes untrusted payloads through it. `Clock.ts` is the pattern. |
| `src/use-cases/CreateTemporaryUser.ts` (new) | `createTemporaryUser` (+ input/result types)                     | First use case: mint id (`IdGeneratorPort`), build `User`, `UserRepository.create`, `expiresAt = now + ttlMillis` (`ClockPort`), sign. Returns `{ user, token, expiresAt }`; errors: `StorageError`.                                                                                                                   |
| `src/use-cases/VerifySession.ts` (new)       | `verifySession` (+ input/result types), `SessionExpired`         | verify → expiry check → `findById` → sign renewed token (C3.1). Returns `{ user, token, expiresAt }`; errors: `SessionInvalid \| SessionExpired \| UserNotFound \| StorageError`.                                                                                                                                      |
| `src/index.ts` (edit)                        | re-exports the three new modules                                 | Barrel; doc comment's "no use cases yet" paragraph updated.                                                                                                                                                                                                                                                            |
| `package.json` (edit)                        | —                                                                | devDeps `"vitest": "3.2.7"`, `"@effect/vitest": "0.30.0"` (exact pins); script `"test": "vitest run"` — turbo's `test` task picks it up with no turbo.json change.                                                                                                                                                     |
| `tsconfig.json` (edit)                       | —                                                                | `include` gains `test/**/*.ts` (mirror `apps/api/tsconfig.json`; `tsconfig.build.json` stays `src/`-only).                                                                                                                                                                                                             |
| `vitest.config.ts` (new)                     | —                                                                | Minimal: `include: ["test/**/*.test.ts"]`. No globalSetup, no DB, default timeout — these are pure unit tests.                                                                                                                                                                                                         |
| `test/Ports.test.ts` (new)                   | —                                                                | Port-shape tests, mirroring `packages/domain/test/Ports.test.ts`: tag key string, error tags/fields, `SessionPayload` rejects non-UUID userIds.                                                                                                                                                                        |
| `test/CreateTemporaryUser.test.ts` (new)     | —                                                                | C1.1/C1.2 use-case halves on stub layers.                                                                                                                                                                                                                                                                              |
| `test/VerifySession.test.ts` (new)           | —                                                                | The four verification outcomes + renewal (C2.1, C2.3–C2.5, C3.1) on stub layers.                                                                                                                                                                                                                                       |

New/changed files in `apps/api` (plus repo-root config):

| File                                | Exports                                                                                                         | Job                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/config.ts` (edit)              | `AppConfig` gains `sessionSecret`, `sessionTtlSeconds`, `sessionCookieSecure`, `sessionCookieSameSite`          | `Config.redacted("SESSION_SECRET")` (no default → boot failure when missing, C4.1); `Config.integer("SESSION_TTL_SECONDS")` default 604800; `Config.boolean` default false; SameSite as a validated literal set (`lax`/`strict`/`none`) default `lax` (C4.2).                                                                                                                                                                                                                                                           |
| `src/infra/session-signer.ts` (new) | `makeSessionSigner`, `SessionSignerLive`                                                                        | The HMAC adapter (decision 1): `makeSessionSigner(secret: Redacted<string>)` builds the service (pure factory — tests use it with a literal secret); `SessionSignerLive = Layer.effect(SessionSignerPort, Effect.map(AppConfig, …))`. `createHmac` + `timingSafeEqual` from `node:crypto`. `ids.ts`/`clock.ts` are the size template.                                                                                                                                                                                   |
| `src/runtime.ts` (edit)             | `AppServices` gains `\| SessionSignerPort`                                                                      | `SessionSignerLive` joins `Layer.mergeAll`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/presentation/errors.ts` (new)  | `SessionError` (type), `sessionErrorStatus`, `errorBody`                                                        | The repo's first typed-error→HTTP mapping, in one place: `SessionInvalid`/`SessionExpired`/`UserNotFound` → 401, `StorageError` → 500; body-decode failure → 400 handled at the route. Exhaustive over the use-case error unions (`satisfies never` default arm).                                                                                                                                                                                                                                                       |
| `src/presentation/auth.ts` (new)    | `SESSION_COOKIE`, `makeRequireSession`, `setSessionCookie`, fastify module augmentation (`request.sessionUser`) | Decisions 4–6: preHandler factory reading `request.cookies["cambio_session"]` (absent → 401, C2.2), running `verifySession` through the runtime, decorating `request.sessionUser`, re-issuing the renewed cookie (C3.1). `setSessionCookie(reply, token, config)`: `httpOnly: true`, `path: "/"` unconditional; `secure`/`sameSite`/`maxAge` from config (C4.2). Never logs token values (pino already redacts the cookie header — keep it that way).                                                                   |
| `src/presentation/users.ts` (new)   | `usersRoutes(runtime, config)`                                                                                  | `POST /users`: decode body via `Schema.decodeUnknownEither(CreateUserRequest)` (invalid → 400, nothing else happens, C1.3); run `createTemporaryUser`; `setSessionCookie`; 201 `encodeSessionUser` (C1.1, C1.2). `GET /me`: `preHandler: makeRequireSession(…)`; encodes `request.sessionUser` → 200 (C2.1). `health.ts` is the curried-factory pattern.                                                                                                                                                                |
| `src/presentation/server.ts` (edit) | —                                                                                                               | Registers `@fastify/cookie` (before routes; parse/serialize only — no `secret` option, ADR-0018 §2) and `usersRoutes(options.runtime, options.config)`.                                                                                                                                                                                                                                                                                                                                                                 |
| `package.json` (edit)               | —                                                                                                               | dependency `@fastify/cookie` **11.1.2** (exact-pinned).                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `test/SessionSigner.test.ts` (new)  | —                                                                                                               | Adapter units on `makeSessionSigner` with literal secrets: sign→verify round-trip, tampered payload rejected, wrong-secret rejected, malformed/empty token rejected — all as typed `SessionInvalid` via `Effect.either`, nothing thrown. No DB use.                                                                                                                                                                                                                                                                     |
| `test/Config.test.ts` (new)         | —                                                                                                               | `AppConfig` via `ConfigProvider.fromMap`: missing `SESSION_SECRET` → `ConfigError` (C4.1); with only the secret supplied, TTL/cookie defaults are 604800 / `lax` / not-Secure (C4.2).                                                                                                                                                                                                                                                                                                                                   |
| `test/support/http.ts` (new)        | `TEST_SESSION_SECRET`, `testSigner`, `TestAppLayer`, `makeTestApp`                                              | The new inject harness (root decision log): `TestAppLayer = ClockLive + IdGeneratorLive + repo layers + Layer.succeed(SessionSignerPort, makeSessionSigner(literal test secret))` over `TestDatabaseLive`; `makeTestApp(configOverrides?)` builds a hand-rolled `AppConfig` object (test DB, controllable TTL/attrs) + a silent pino logger + `ManagedRuntime`, awaits `buildServer`, returns `{ app, runtime, config }` for `afterAll` disposal. `db.ts` stays untouched — sibling helper, existing suites unaffected. |
| `test/Auth.test.ts` (new)           | —                                                                                                               | The C1–C3 HTTP matrix through `app.inject()` (M5).                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `turbo.json` (edit, repo root)      | —                                                                                                               | `SESSION_SECRET`, `SESSION_TTL_SECONDS`, `SESSION_COOKIE_SECURE`, `SESSION_COOKIE_SAMESITE` → `globalPassThroughEnv` (runtime config, not hashed — same reasoning as `DATABASE_URL`).                                                                                                                                                                                                                                                                                                                                   |
| `.env.example` (edit, repo root)    | —                                                                                                               | The four variables under the apps/api section, each commented; `SESSION_SECRET` gets a dev-only placeholder value and a "generate your own; never reuse in deployed envs" note.                                                                                                                                                                                                                                                                                                                                         |

(`pnpm-lock.yaml` changes ride along with the two `package.json` edits.)

## Plan of work

Ordered by root-plan milestone. Contracts freeze first, then inward-out.
Application work is test-first: write the named suite, watch it fail, then
implement. Every step leaves the repo compiling and the touched package's
suite green.

### M1 — Contracts (C1.3, C5.2)

**Step 1.1 — `packages/contracts/src/User.ts`.** Follow `Health.ts`
verbatim (struct + type + `decodeUnknownSync`/`encodeSync` helpers). Sketch
(advisory):

```ts
/** Request body of `POST /users` (CAM-4). Name rule per root plan decision:
 *  trimmed, then non-empty, max 32 chars. */
export const CreateUserRequest = Schema.Struct({
  name: Schema.Trim.pipe(Schema.minLength(1), Schema.maxLength(32)),
})

/** Response body of `POST /users` and `GET /me`. Plain UUID — contracts
 *  cannot import domain brands (§3.1). */
export const SessionUser = Schema.Struct({
  userId: Schema.UUID,
  name: Schema.String,
})
```

Decode of `{ name: "  Raafay  " }` must yield `"Raafay"` (trim is a
transform, not a filter); `""`, `"   "`, and a 33-char name must fail
decode. Update `src/index.ts` and its "only contract here is the health
check" doc paragraph. No test infra here (decision 7) — the rule is pinned
by the M5 400-matrix.

Checkpoint: `pnpm --filter @cambio/contracts build typecheck lint` green.

### M2 — Application: port, errors, first use cases (C1.1, C1.2, C2.\*, C3.1, C5.1)

**Step 2.1 — Test scaffolding.** `package.json` devDeps + `test` script,
`tsconfig.json` include, `vitest.config.ts` (Module layout); `pnpm install`.
An empty run (`pnpm --filter @cambio/application test`) may report "no test
files" — fine until 2.2 lands.

**Step 2.2 — `SessionSignerPort` + `SessionInvalid`, test-first.** Write
`test/Ports.test.ts` (mirror `packages/domain/test/Ports.test.ts`): the tag
key is `"@cambio/application/SessionSignerPort"`; `SessionInvalid`
constructs with `_tag: "SessionInvalid"` and no payload; `SessionPayload`
decodes a valid `{ userId: uuid, expiresAt: int }` and rejects a non-UUID
`userId` and a fractional `expiresAt`. Then implement
`src/ports/SessionSigner.ts` (advisory sketch):

```ts
export const SessionPayload = Schema.Struct({
  userId: UserId,
  expiresAt: Timestamp, // branded epoch millis (domain Ids.ts)
})
export type SessionPayload = typeof SessionPayload.Type

export class SessionInvalid extends Data.TaggedError("SessionInvalid") {}

export class SessionSignerPort extends Context.Tag("@cambio/application/SessionSignerPort")<
  SessionSignerPort,
  {
    readonly sign: (payload: SessionPayload) => Effect.Effect<string>
    readonly verify: (token: string) => Effect.Effect<SessionPayload, SessionInvalid>
  }
>() {}
```

Doc comment: why the port exists (ADR-0017 bans `node:crypto` here;
ADR-0018 §2), impls in `apps/api/src/infra`, and that `verify` proves
authenticity + shape only — expiry is the caller's business (decision 2).

**Step 2.3 — `createTemporaryUser`, test-first.**
`test/CreateTemporaryUser.test.ts` with stub layers
(`Layer.succeed(ClockPort, { now: Effect.succeed(t) })`, a fixed-id
IdGenerator stub, an in-memory `UserRepository` recording `create` calls, a
deterministic fake signer such as `sign: (p) => Effect.succeed("tok:" + p.userId + ":" + p.expiresAt)`).
Test intents (titles cite clauses at implement time):

- the created `User` carries the stub-minted id and the input name, and the
  repository received exactly that value (C1.1's use-case half);
- the result's `expiresAt` is exactly `now + ttlMillis` and the token is
  the signer's output over `{ userId, expiresAt }` (C1.2's use-case half);
- a failing repository (`Layer.succeed` stub whose `create` fails with
  `StorageError`) surfaces as a typed `Either.left`, nothing thrown.

Then implement `src/use-cases/CreateTemporaryUser.ts` (advisory):

```ts
export interface CreateTemporaryUserInput {
  readonly name: string // already validated by contracts at the edge
  readonly ttlMillis: number
}
export interface SessionResult {
  readonly user: User
  readonly token: string
  readonly expiresAt: Timestamp
}
export const createTemporaryUser = (
  input: CreateTemporaryUserInput,
): Effect.Effect<
  SessionResult,
  StorageError,
  IdGeneratorPort | ClockPort | SessionSignerPort | UserRepository
> => Effect.gen(...)
```

(the application-layer skill's use-case shape: acquire ports with
`yield*`, sequence, no decisions that belong elsewhere; `Timestamp.make`
re-brands the arithmetic result).

**Step 2.4 — `verifySession` + `SessionExpired`, test-first.**
`test/VerifySession.test.ts`, same stub style. The five intents:

- valid token, live user ⇒ result carries the repo's `User`, a renewed
  token signed over `{ same userId, now + ttlMillis }`, and the new
  `expiresAt` (C2.1 + C3.1's use-case half);
- signer stub fails ⇒ `SessionInvalid` passes through untouched (C2.3's
  use-case half);
- payload `expiresAt < now` ⇒ `SessionExpired` carrying that `expiresAt`,
  and the user repository is never consulted (C2.4);
- repo `findById` fails with `UserNotFound` ⇒ passes through (C2.5 — the
  adapter's `deleted_at IS NULL` filter makes soft-deleted ≡ nonexistent);
- repo `StorageError` ⇒ passes through.

Then implement `src/use-cases/VerifySession.ts`: `SessionExpired` tagged
error (`{ readonly expiresAt: Timestamp }`), input
`{ token: string; ttlMillis: number }`, result `SessionResult`, error union
`SessionInvalid | SessionExpired | UserNotFound | StorageError`,
requirements `ClockPort | SessionSignerPort | UserRepository`. Update
`src/index.ts` (barrel + doc comment).

Checkpoint: `pnpm --filter @cambio/application test` green (3 files);
`typecheck` + `lint` clean (lint proves no `node:crypto`, no `Date.now()`
snuck in — C5.1's teeth).

### M3 — Infra: signer adapter + config (C2.3, C4.1, C4.2)

**Step 3.1 — Config.** `src/config.ts` gains the four entries (Module
layout). Same file's doc rule: update `.env.example` in the same commit —
add the four variables with comments (`SESSION_SECRET=dev-only-not-a-secret`
placeholder + generation note, e.g. `openssl rand -hex 32`). `turbo.json`
`globalPassThroughEnv` gains all four. Add `SESSION_SECRET` to your local
`.env` now — after this commit the api refuses to boot without it (that is
C4.1 working as designed; flag it in the commit message).

Test alongside (`test/Config.test.ts`, no DB): load `AppConfig` through
`ConfigProvider.fromMap` — a map with `DATABASE_URL` but no
`SESSION_SECRET` fails with a `ConfigError` naming it; a map with both
yields the documented defaults (`sessionTtlSeconds === 604800`,
`sessionCookieSameSite === "lax"`, `sessionCookieSecure === false`).

**Step 3.2 — Signer adapter, test-first.** `test/SessionSigner.test.ts`
against `makeSessionSigner(Redacted.make("test-secret-a"))` (pure — no DB,
no runtime beyond `Effect.runPromise`/`Effect.either`):

- sign→verify round-trips a `SessionPayload` (branded values intact after
  decode);
- flipping one character of the payload half ⇒ `SessionInvalid`;
- a token signed by `makeSessionSigner(secret B)` fails verification under
  secret A ⇒ `SessionInvalid` (C2.3's adapter half);
- structurally hopeless inputs (`""`, `"no-dot"`, `"a.b.c"`, valid MAC over
  non-JSON payload, valid JSON that fails `SessionPayload` decode) ⇒
  `SessionInvalid`, and none of them **throw** (every case through
  `Effect.either`).

Then implement `src/infra/session-signer.ts` per decision 1.
`timingSafeEqual` throws on length mismatch — guard lengths first and
return `SessionInvalid` (constant-time comparison is only required between
equal-length candidate MACs; a length mismatch is already
shape-invalid). Register in `src/runtime.ts` (`AppServices` union +
`SessionSignerLive` in the merge).

Checkpoint: `pnpm --filter @cambio/api test` green (Docker up — the global
setup provisions the test DB for the whole suite even though the two new
files don't use it); `pnpm --filter @cambio/api build` proves the runtime
wiring.

### M4 — Presentation: cookie plugin, auth hook, routes (C1.\*, C2.\*, C3.1)

**Step 4.1 — Plugin + helpers.**
`pnpm --filter @cambio/api add --save-exact @fastify/cookie@11` (take the
current 11.x; record the exact pin in Progress). Register it in
`server.ts` **before** route registration, with no `secret` option
(parse/serialize only, ADR-0018 §2). Write `presentation/errors.ts`
(decision 9): the mapping is exhaustive over the verify/create error unions
with a `satisfies never` default arm, so CAM-5's new error variants break
this file's build instead of silently 500ing.

**Step 4.2 — `presentation/auth.ts`** (decisions 4–6): module
augmentation, `setSessionCookie(reply, token, config)` (httpOnly + path
unconditional; `secure`, `sameSite`, `maxAge: sessionTtlSeconds` from
config), and `makeRequireSession(runtime, config)` returning the
preHandler: no `cambio_session` cookie ⇒ 401 immediately (C2.2); otherwise
run `verifySession({ token, ttlMillis })`, on success decorate
`request.sessionUser` and `setSessionCookie` with the renewed token (C3.1),
on typed failure map via `errors.ts` (401/500).

**Step 4.3 — `presentation/users.ts`** (Module layout): the curried
factory idiom from `health.ts`, `Runtime.runPromise(runtime)` hoisted once.
`POST /users` decodes the body with `Schema.decodeUnknownEither` (the
throwing `decodeCreateUserRequest` helper exists for convention parity but
the route must not throw on user input) — `Either.left` ⇒ 400 before any
effect runs (C1.3); then `createTemporaryUser`, `setSessionCookie`, 201
`encodeSessionUser({ userId: user.id, name: user.name })`. `GET /me` opts
in via `preHandler` and encodes `request.sessionUser` (missing ⇒ 401
defensive guard, not 500). Register `usersRoutes` in `server.ts`.

Checkpoint: `build` + `typecheck` + `lint` green, then the manual curl
sequence (Concrete steps below) against `pnpm dev`.

### M5 — HTTP matrix + gate (C1–C3 end to end)

**Step 5.1 — `test/support/http.ts`.** As specified in Module layout.
Config literal: test DB url irrelevant to `buildServer` but present for
shape; `sessionTtlSeconds` small-but-safe default (e.g. 3600) overridable
per call; logger via `pino({ level: "silent" })`. One
`{ app, runtime }` per suite file; `afterAll`: `app.close()` +
`runtime.dispose()`.

**Step 5.2 — `test/Auth.test.ts`.** The matrix, `app.inject()` throughout,
titles citing clauses when written. Intents:

- **C1.1** — `POST /users` `{ name: "Raafay" }` ⇒ 201, body
  `{ userId: uuid, name: "Raafay" }`, and a `users` row with that id/name
  exists (query via the runtime's `SqlClient`); a padded name
  (`"  Raafay  "`) lands trimmed in both body and row.
- **C1.2** — the 201's `set-cookie`: name `cambio_session`, `HttpOnly`,
  `Path=/`, `SameSite=Lax`, no `Secure` under test config; its value
  verifies under the **test signer** and the payload carries the response's
  `userId` with `expiresAt` = (injection window around) now + configured
  TTL. A second suite pass with `sessionCookieSecure: true` /
  `sameSite: "strict"` overrides pins that attributes follow config (C4.2's
  HTTP half).
- **C1.3** — missing `name`, `""`, `"   "`, 33 chars ⇒ 400 each, **no**
  `set-cookie` header, and the `users` row count is unchanged across the
  four calls (32 chars ⇒ 201, the boundary case).
- **C2.1** — replay the C1.1 cookie against `GET /me` ⇒ 200 with the same
  `{ userId, name }`.
- **C2.2** — `GET /me` with no cookie ⇒ 401.
- **C2.3** — the C1.1 cookie with one flipped payload character ⇒ 401; a
  token minted by a signer with a different secret ⇒ 401.
- **C2.4** — a token signed by the test signer with `expiresAt` in the
  past ⇒ 401 (the test signer makes forging expired-but-authentic tokens
  trivial — this is why `http.ts` exports the secret).
- **C2.5** — a validly signed unexpired token whose `userId` is a random
  uuid ⇒ 401; create a user, soft-delete the row by raw SQL
  (`UPDATE users SET deleted_at = now() …`, the `UserRepository.test.ts`
  idiom), replay its still-valid cookie ⇒ 401.
- **C3.1** — an authenticated `GET /me` response carries a fresh
  `set-cookie`: same `userId`, `expiresAt` strictly ≥ the original and
  equal to (injection window around) now + TTL. With a large TTL override
  the renewed expiry is visibly later than the original's remaining
  lifetime.

**Step 5.3 — Gate + sweeps.** The full command matrix under Concrete
steps: untouched-surface diffs, literal-leak grep (C4.2), crypto-location
grep (C5.1), then `pnpm turbo build typecheck lint test`. Run the manual
boot-failure check (C4.1) once more against the final tree.

## Concrete steps & validation

Run from the repo root. If `pnpm` is missing:
`source ~/.nvm/nvm.sh && nvm use 22`. Postgres must be up for M3+ api
suites:

```bash
docker compose -f docker/docker-compose.yml up -d
```

Per-milestone signals:

- **M1**: `pnpm --filter @cambio/contracts build typecheck lint` — clean.
- **M2**: `pnpm install` then `pnpm --filter @cambio/application test` — 3
  test files green, no skips; `pnpm turbo test --filter=@cambio/application`
  also green (proves the script is wired into the turbo task).
- **M3**: `pnpm --filter @cambio/api test` — existing 28 CAM-3 tests plus
  the new SessionSigner + Config suites, all green;
  `pnpm --filter @cambio/api build` clean.
- **M4** (manual, against `pnpm dev` with `SESSION_SECRET` in `.env`):

```bash
curl -i -X POST localhost:3001/users -H 'content-type: application/json' -d '{"name":"Raafay"}'
# HTTP/1.1 201 — body {"userId":"<uuid>","name":"Raafay"}
# set-cookie: cambio_session=<payload>.<mac>; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax

curl -i localhost:3001/me -H 'cookie: cambio_session=<value from above>'
# HTTP/1.1 200 — same {"userId","name"}; a fresh set-cookie header (sliding renewal)

curl -i localhost:3001/me
# HTTP/1.1 401

curl -i -X POST localhost:3001/users -H 'content-type: application/json' -d '{"name":"   "}'
# HTTP/1.1 400, no set-cookie
```

Boot-failure check (C4.1): comment out `SESSION_SECRET` in `.env`,
restart `pnpm dev` — the api exits with a `ConfigError` naming
`SESSION_SECRET` before listening; restore the variable.

- **M5**: `pnpm --filter @cambio/api test` — full suite green including
  `Auth.test.ts`; record the final test count in Progress.

Untouched-surface checks (each must print nothing):

```bash
git diff --name-only origin/release-v0...HEAD -- apps/api/migrations packages/domain apps/web
grep -rn "from \"node:crypto\"" packages/*/src         # crypto imports live in apps/api only (C5.1)
grep -rn "Date.now\|new Date(" packages/application/src  # time comes from ClockPort
grep -rn "604800" apps/api/src packages/ | grep -v "src/config.ts"  # TTL literal only in config (C4.2)
grep -rniE "sameSite|httpOnly" apps/api/src | grep -vE "src/config.ts|src/presentation/auth.ts"
                                                        # cookie attrs: config + the one helper
```

Final gate (must pass before /ship, Docker Postgres up):

```bash
pnpm turbo build typecheck lint test
```

(`lint` includes the repo-wide prettier check — run `pnpm format` if it
complains about the new files.)

## Contract coverage

_(maintained by `/implement`, verified by `/review`: one row per root-plan
contract clause this side owns — the test that pins it, or why none can.
Each row must also say **what is asserted**, in one phrase. **Plan-time
rule:** only the Clause column and a planned-approach note are filled here;
test file, name, and assertion phrase are written by `/implement` as each
test actually lands — a plan-time row that invents a test title is an
overclaim waiting to become a review finding.)_

| Clause | Test (file + name)                                                                                                                                                                                                                                                                                                                                             | What is asserted                                                                                                                                                                                                                                      |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1.1   | `packages/application/test/CreateTemporaryUser.test.ts` "creates the user with the minted id and given name (C1.1)"; `apps/api/test/Auth.test.ts` "POST /users creates the row and returns it, trimming the name (C1.1)"                                                                                                                                       | unit: result user = `{minted id, input name}` and the repository received exactly that value; HTTP: 201 body matches a real `users` row, padded name stored trimmed                                                                                   |
| C1.2   | `packages/application/test/CreateTemporaryUser.test.ts` "expiry is now + ttl and the token signs exactly that payload (C1.2)"; `apps/api/test/Auth.test.ts` "the 201 sets a signed httpOnly session cookie for that user (C1.2)"                                                                                                                               | unit: `expiresAt = now + ttlMillis`, token = signer over that payload; HTTP: cookie is httpOnly/Path=/, Lax, not Secure, `maxAge` = TTL, and its payload (decoded by the test signer) carries the response's userId with expiry in the now+TTL window |
| C1.3   | `apps/api/test/Auth.test.ts` "invalid names get 400, no cookie, no row (C1.3)"                                                                                                                                                                                                                                                                                 | missing/empty/whitespace/33-char names each 400 with zero cookies and unchanged `users` count; 32-char boundary is 201. Pins the contracts schema (decision 7 — no contracts-package suite)                                                           |
| C2.1   | `packages/application/test/VerifySession.test.ts` "valid token + live user yields the user and a renewed session (C2.1, C3.1)"; `apps/api/test/Auth.test.ts` "GET /me with the created cookie resolves the same user (C2.1)"                                                                                                                                   | unit: result carries the repository's user; HTTP: replayed cookie → 200 with a body equal to the creation response                                                                                                                                    |
| C2.2   | `apps/api/test/Auth.test.ts` "GET /me without a cookie is 401 (C2.2)"                                                                                                                                                                                                                                                                                          | no cookie → 401                                                                                                                                                                                                                                       |
| C2.3   | `apps/api/test/SessionSigner.test.ts` "a tampered payload half is rejected (C2.3)" + "a token signed under a different secret is rejected (C2.3)"; `apps/api/test/Auth.test.ts` "tampered or wrong-secret cookies are 401 (C2.3)"; passthrough: `packages/application/test/VerifySession.test.ts` "a signer rejection passes through as SessionInvalid (C2.3)" | adapter: both forgeries fail as typed `SessionInvalid` (via `Effect.either`, nothing thrown); HTTP: both → 401. Constant-time compare is by construction (`timingSafeEqual`) — review-checked, not timing-tested                                      |
| C2.4   | `packages/application/test/VerifySession.test.ts` "an expired payload fails SessionExpired without consulting the repository (C2.4)"; `apps/api/test/Auth.test.ts` "an authentic but expired token is 401 (C2.4)"                                                                                                                                              | unit: `SessionExpired` carrying the stale `expiresAt`, repository untouched; HTTP: authentic-but-expired forge → 401                                                                                                                                  |
| C2.5   | `packages/application/test/VerifySession.test.ts` "an unknown or soft-deleted user passes through as UserNotFound (C2.5)"; `apps/api/test/Auth.test.ts` "a valid cookie for an unknown or soft-deleted user is 401 (C2.5)"                                                                                                                                     | unit: `UserNotFound` passthrough; HTTP: 401 for a random-uuid token and for a real user's cookie after `UPDATE users SET deleted_at = now()`                                                                                                          |
| C3.1   | `packages/application/test/VerifySession.test.ts` "valid token + live user yields the user and a renewed session (C2.1, C3.1)"; `apps/api/test/Auth.test.ts` "every authenticated request re-issues the cookie with a fresh expiry (C3.1)"                                                                                                                     | unit: renewed token = sign(same userId, now + ttl); HTTP: `GET /me` sets a fresh cookie, same userId, expiry ≥ original and in the now+TTL window                                                                                                     |
| C4.1   | `apps/api/test/Config.test.ts` "missing SESSION_SECRET fails to load, naming the variable (C4.1)"; manual boot check in Progress (M4)                                                                                                                                                                                                                          | `ConfigProvider.fromMap` without the secret → `ConfigError` naming SESSION_SECRET; live boot without it exits before listening                                                                                                                        |
| C4.2   | `apps/api/test/Config.test.ts` "…documented defaults (C4.2)" + "…follow the environment when set (C4.2)" + "an unknown SameSite value is rejected"; `apps/api/test/Auth.test.ts` "cookie attributes follow config when overridden (C4.2)"; literal-leak greps in the M5 sweep                                                                                  | defaults 604800/lax/not-Secure, env values honored, bad SameSite rejected; HTTP: Secure+Strict override reflected in the Set-Cookie; greps: no TTL/attribute literals outside config + the cookie helper                                              |
| C5.1   | structural — boundary lint in the gate + the crypto/`Date.now` greps print nothing; no dedicated test can pin an absence better than the linter that fails CI                                                                                                                                                                                                  | `node:crypto` imports exist only under `apps/api`; no `Date.now`/`new Date(` in `packages/application/src`                                                                                                                                            |
| C5.2   | structural + indirect — contracts builds importing only `effect`; `apps/api/test/Auth.test.ts` round-trips both wire shapes (create body decoded, `SessionUser` encoded in 201/200 bodies)                                                                                                                                                                     | wire shapes usable without domain imports; boundary lint enforces the rest                                                                                                                                                                            |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [x] 2026-09-01 — backend plan written; awaiting `/implement`
- [x] 2026-09-01 11:20 — M1: `packages/contracts/src/User.ts` + barrel;
      trim/length semantics verified in node before commit (padded name →
      trimmed, ""/whitespace/33 rejected, 32 accepted). Commit `a75875c`.
- [x] 2026-09-01 11:30 — M2: application test infra (vitest 3.2.7 +
      @effect/vitest 0.30.0, `test` script, tsconfig include,
      vitest.config.ts); `SessionSignerPort`+`SessionInvalid`+`SessionPayload`,
      `createTemporaryUser`, `verifySession`+`SessionExpired` — each
      test-first (red observed) — 12 tests green in 3 files; build,
      typecheck, lint clean; `pnpm turbo test --filter=@cambio/application`
      picks the script up.
- [x] 2026-09-01 11:45 — M3: `AppConfig` session entries
      (`Config.literal` for SameSite), `.env.example` + `turbo.json` +
      local `.env` in lockstep; `Config.test.ts` (4 tests, `fromMap`);
      signer adapter test-first (red observed) — `session-signer.ts`
      (`makeSessionSigner` + `SessionSignerLive`), registered in
      `runtime.ts`. Api suite 36 green (was 28), build + lint clean.
- [x] 2026-09-01 11:55 — M4: `@fastify/cookie` **11.1.2** exact-pinned,
      registered secret-less; `errors.ts` (exhaustive mapping + `errorBody`),
      `auth.ts` (SESSION_COOKIE, `setSessionCookie`, `makeRequireSession`),
      `users.ts` (`POST /users`, `GET /me`), `server.ts` wiring. Manual curl
      matrix against `pnpm dev`: 201+cookie (trimmed name, Lax/HttpOnly/
      Path=/, Max-Age 604800), replay → 200 with renewed cookie, no cookie →
      401, tampered → 401, whitespace name → 400 no cookie. Boot without
      SESSION_SECRET exits naming the variable ("Missing data …
      SESSION_SECRET") before listening. Commit `0019a91`.
- [x] 2026-09-01 12:05 — M5: `test/support/http.ts` harness +
      `test/Auth.test.ts` — 10 HTTP tests, all green first run. Untouched-
      surface sweeps clean. Full gate `pnpm turbo build typecheck lint test`:
      22 tasks green (after one `pnpm format` pass over the new files). Api
      suite final count: **46** (28 CAM-3 + 18 new); application: 12;
      contracts: pinned via the HTTP matrix.

## Surprises & notes for the root plan

_(anything the root plan's Decision Log or the reviewer must know)_

- Candidates for the root Decision Log once `/implement` confirms them
  (decisions 1–10 above, headline items): expiry checked in the use case
  rather than the signer; TTL as a plain use-case input (no config port);
  per-route opt-in `preHandler` instead of a global hook; renewal cookie
  set inside the auth hook; contracts gets no test infra (name rule pinned
  by the HTTP 400-matrix); env names
  `SESSION_SECRET`/`SESSION_TTL_SECONDS`/`SESSION_COOKIE_SECURE`/`SESSION_COOKIE_SAMESITE`
  and cookie name `cambio_session`.
- The root plan's Purpose curl uses port 3001 — correct — but remember the
  root Surprise about `WEB_ORIGIN` defaulting to 3000 while the web dev
  server runs on 3100: irrelevant to curl, but the first browser-based
  cookie test will hit it.
- Implement-time note: the planned `grep -rn "node:crypto" packages/` sweep
  matched the port's own doc comments (which explain _why_ crypto is banned
  there); the sweep now greps for `from "node:crypto"` imports instead —
  same invariant, honest matcher. The lint boundary remains the real teeth.
