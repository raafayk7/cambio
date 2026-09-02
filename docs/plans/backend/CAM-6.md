# CAM-6 — Presentation + realtime: Fastify routes, viewFor projection, Supabase Broadcast (backend)

- **Root plan:** [root/CAM-6.md](../root/CAM-6.md) — the functional contract
  (clauses C1.1–C6.2) lives there; this document is implementation detail for
  the backend side.
- **ADRs:**
  [0021](../../adr/0021-viewfor-structural-projection-event-time-private-delivery.md)
  (viewFor projects structure only; private values delivered once, at event
  time, never re-sent),
  [0022](../../adr/0022-penalty-cards-enter-hand-unseen.md) (penalty cards
  unseen by everyone, slammer included),
  [0023](../../adr/0023-channel-privacy-unguessable-capability-topics.md)
  (channel topics are capabilities carrying HMAC-derived secrets),
  [0024](../../adr/0024-selfhosted-realtime-container-rest-broadcast-publishing.md)
  (self-hosted Realtime container in compose; publishing via REST broadcast,
  no SDK in prod deps).

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

Work spans `packages/contracts`, `packages/application`, `apps/api`,
`docker/`, and the env/turbo plumbing. Governing skills per area:
**hidden-information** (the whole task — the prime invariant "never send it
at all" governs every schema, projection, and payload; read it before every
milestone), **application-layer** (M2 — projections are pure functions in
`packages/application`, the only layer that legally imports both `domain`
and `contracts`; contracts are shapes only, no logic), **architecture**
(throughout — contracts import `effect` only, so domain brands never cross;
adapters live in `apps/api/src/infra`; enforcement claims must be
probe-verified), **infrastructure-persistence** (M3 — adapters as Effect
Layers, `clock.ts` the reference shape; no ORM, no new migrations expected),
**effect-domain-modeling** (idioms repo-wide: TaggedStruct unions with
`decodeX`/`encodeX` helpers, exhaustive `switch` ending
`satisfies never`, field-less tagged errors omit the generic),
**cambio-rules** (any assertion about what a phase or event means checks the
skill, never a prior from other Cambio variants).

The surfaces this task touches, as they exist today (all verified against
release-v0 tip):

- **Presentation (CAM-4):** `buildServer`
  (`apps/api/src/presentation/server.ts:20-61`) — registration order:
  `setErrorHandler` (`:35-46`) → `@fastify/cors` (`:48-51`) →
  `@fastify/cookie` (no secret, deliberate — `:54-55`) → `healthRoutes`
  (`:57`) → `usersRoutes` (`:58`). Route plugins are curried factories
  `(runtime, config?) => async (app) => {…}`. **No `setNotFoundHandler`
  yet** — C1.11 finally lands it here after two deferrals. Error mapping:
  `sessionErrorStatus` (`errors.ts:18-29`) is the exhaustive-switch
  pattern (`default: return error satisfies never` at `:27`);
  `errorBody` (`:32-41`) returns plain `{error: string}` — the doc at
  `:31` says "no error contract yet"; this task adds the contract and
  migrates these bodies. `unhandledErrorResponse` (`:51-56`) is the
  defect/framework fallback. Session guard: `makeRequireSession(runtime,
config)` (`auth.ts:48-67`), per-route opt-in (`users.ts:50`), request
  augmentation `request.sessionUser?: User` (`auth.ts:22-27`). Body-decode
  pattern: `users.ts:22` — `Schema.decodeUnknownEither` → `Either.isLeft`
  → 400 **before any effect runs**; effects via `Runtime.runPromise` +
  `Effect.either` (`users.ts:30-32`).
- **Runtime & config:** `apps/api/src/runtime.ts:19-25` — `AppServices =
SqlClient | ClockPort | IdGeneratorPort | SessionSignerPort |
GameRepository | UserRepository`; `AppLayer` (`:27-33`) is
  `Layer.mergeAll(…).pipe(Layer.provideMerge(DatabaseLive))`. CAM-6 adds
  the `SeedPort` adapter (port exists at
  `packages/application/src/ports/Seed.ts:14-19`, `nextSeed:
Effect<number>`, no adapter), the publisher adapter, and
  `RoomRegistryLive` (scoped Layer; deps at
  `packages/application/src/room/RoomRegistry.ts:105` = `GameRepository |
UserRepository | ClockPort | SeedPort | RealtimePublisherPort`). Server
  entry `apps/api/src/index.ts:14-40` — runtime at `:23`, `Effect.scoped`
  at `:38` already bounds actor lifetimes; no entry-point change expected.
  `apps/api/src/config.ts:9-37` is the single `Config.all`; the doc header
  demands `.env.example` stays in sync. New vars must land in four places
  in one change: `config.ts`, `.env.example`, `turbo.json`
  `globalPassThroughEnv` (`:10-23`), and the test `baseConfig`
  (`apps/api/test/support/http.ts:34-45`).
- **Application surface (CAM-5):** `RoomRegistry` service interface
  (`RoomRegistry.ts:87-103`): `execute(gameId, command) → GameAdvanced`,
  errors `GameError | GameNotFound | VersionConflict | StorageError`;
  `join(gameId, userId) → LobbyChanged`, errors `GameNotFound |
UserNotFound | LobbyFull | AlreadyInLobby | LobbyNotJoinable |
VersionConflict | StorageError`; `leave → LobbyChanged`, errors
  `GameNotFound | NotInLobby | LobbyNotJoinable | VersionConflict |
StorageError`; `start(gameId, {config,…}: StartInput
(RoomRegistry.ts:58-61)) → GameAdvanced`, errors `GameNotFound |
NotInLobby | LobbyNotJoinable | GameError | VersionConflict |
StorageError`. `GameAdvanced {state, version, events}`
  (`use-cases/StartGame.ts:42-46`) is **full truth** — C6.2 adds the
  warning doc comment. `createLobby`
  (`use-cases/CreateLobby.ts:29-50`) — input `{creatorId}`, result
  `{lobby, version}`, errors `VersionConflict | StorageError`, needs
  `IdGeneratorPort | GameRepository | RealtimePublisherPort` — is called
  directly by the route, not via the registry. `RealtimePublisherPort`
  (`ports/RealtimePublisher.ts:22-32`): `publishGame(gameId, state,
events)`, `publishLobby(gameId, lobby)`, **no error channel**; tag
  `"@cambio/application/RealtimePublisherPort"` pinned by
  `test/Ports.test.ts:40`.
- **Dying-actor residual (root C1.10):** registry callers await a
  `Deferred` (`RoomRegistry.ts:335`); actor teardown interrupts stranded
  envelopes (`:292-310`, the interrupts at `:301-303`) and the defect
  guard (`:252-260`) completes replies with the cause — so `execute` can
  terminate with a **bare interrupt or defect outside the typed union**.
  Routes must inspect the `Exit` (`Effect.exit`), map
  interrupted/defective exits to a 500-class response, and never hang.
- **Domain shapes to project:** `GameState`
  (`packages/domain/src/GameState.ts:54-61`) `{players, deck, discard,
prng, phase, config}`; `GamePlayer` (`:42-45`) `{id, hand}`; `Hand` is a
  **sparse** `ReadonlyArray<HandSlot>` (`:33-39`, `{slotIndex, card}`);
  helpers `seatOf :71`, `handOf :76`, `lowestFreeSlot :80`, `slotCard
:87`, `occupiedSlots :93`, `allCards :121`. `Phase`
  (`Phase.ts:68-75`), six variants: `AwaitingDraw{playerId}`,
  `HoldingCard{playerId, card, source: "deck" | "discard"}`,
  `ResolvingPower{playerId, card}`, `ResolvingQueenSwap{playerId, card}`,
  `SlamWindow{turnPlayerId, closesAt, rank}`, `Ended{calledBy}`.
  `Command` (`Command.ts:74-85`), ten variants — the wire exposes **9**
  (no `CloseSlamWindow`): `CallCambio`/`TakeDiscard`/`DrawFromDeck`/
  `DiscardHeld`/`KeepHeld` all `{playerId}`; `SwapHeld{playerId,
slotIndex}`; `PowerPeek{playerId, target: SlotRef}`;
  `PowerSwap{playerId, first, second}`; `Slam{playerId, target,
giveSlot: SlotIndex | null}`. `GameEvent` (`GameEvent.ts:167-190`) —
  22 variants, full truth; the C3 classification over all 22 is fixed in
  the root plan. `Lobby` (`Lobby.ts:22-27`) `{id, members, status}` —
  fully public. `GameConfig` (`GameConfig.ts:10-12`) — exactly
  `{slamWindowMs}`. Scoring: `gameScores` (`Scoring.ts:19-20`),
  `winnersOf` (`:23-26`). `PrngState` is the PCG tuple — it appears in
  **no payload, ever**.
- **Contracts:** only `index.ts`, `Health.ts`, `User.ts`. Pattern:
  `decodeX = Schema.decodeUnknownSync` / `encodeX = Schema.encodeSync`
  (`Health.ts:9-10`, `User.ts:29-32`) — the Sync variants throw, so
  routes use `Schema.decodeUnknownEither` directly (`users.ts:15-17`);
  this task also exports `decodeXEither` helpers (precedent:
  `decodeCardSlugEither`, domain `Card.ts:41`). Brands cannot cross —
  `User.ts:19-21` uses `Schema.UUID`, not branded `UserId`; wire shapes
  re-declare primitives. `packages/contracts` has **no test directory**
  (decision 5 below keeps it that way).
- **Tests:** api integration harness — `test/global-setup.ts:44-47`
  creates `cambio_test`, migrates, and TRUNCATEs (`:36-42`);
  `test/support/db.ts:18-19` hardcodes `TEST_DATABASE_URL`'s literal
  default (vitest does not load `.env` — new realtime test constants
  follow the same literal pattern); `test/support/http.ts:52-61` is the
  `app.inject` harness (`TestAppLayer :26-32` must gain `SeedPort`, the
  publisher stub, and `RoomRegistryLive`; `baseConfig :34-45` gains the
  new config fields). `apps/api/vitest.config.ts`: `fileParallelism:
false` (`:12`), `testTimeout: 30_000`. Infra adapter tests live flat in
  `apps/api/test/`, one file per adapter. Application stub kit:
  `packages/application/test/support/stubs.ts` — `makeJournal :42`,
  `makePublisherStub :167-179` (the template for CAM-6's publisher test
  double), `makeGameRepoStub :65-164`, `makeSettableClock :186-192`,
  `seedStub :194-195`, `usersStub :207-214`; suites import
  `{describe, expect, it}` from `@effect/vitest` and use `it.effect`.
  Simulation driver: `@cambio/domain/testing` (ADR-0016) —
  `simulateGame` (`packages/domain/src/testing/driver.ts:110`), the
  `onStep(state, now, step, eventCount)` hook (`:45`) rides **every
  intermediate state** (ideal for the adversarial sweep across all
  phases), `SimParams.initial` (`:34-38`) forces rare phases, `GameRun`
  (`:53-61`) exposes the event log for classification tests; fixtures
  `uid`/`gid`/`slot`/`ts`/`card` (`testing/fixtures.ts:7-17`). Precedent
  for cross-package simulation use + env knobs:
  `apps/api/test/RoundTrip.test.ts` with `turbo.json:52`
  (`RT_GAMES`/`RT_SEED`).
- **Realtime container (research, verified against supabase/realtime +
  the supabase self-host compose):** image `supabase/realtime` pinned to
  whatever supabase/supabase's docker-compose pins (v2.102.3 at research
  time — **verify the current pin during implementation** and record it
  in the compose comment). Env: `PORT 4000`,
  `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME` (superuser required —
  compose user `cambio` owns the DB; the container runs Ecto
  migrations), `DB_AFTER_CONNECT_QUERY 'SET search_path TO _realtime'`
  (the `_realtime` schema must exist **before** first boot, else its
  `schema_migrations` lands in `public` and collides with our
  `_cambio_migrations` — decision 8), `DB_ENC_KEY` exactly 16 chars,
  `API_JWT_SECRET` ≥ 32 chars (becomes the tenant `jwt_secret`),
  `SECRET_KEY_BASE` 64 chars, `ERL_AFLAGS '-proto_dist inet_tcp'`,
  `APP_NAME realtime`, `SEED_SELF_HOST true` (seeds tenant
  `realtime-dev`), `RUN_JANITOR true`. **Tenant resolution is by Host
  subdomain**: clients/tests must use `realtime-dev.localhost:4000` —
  bare `localhost` → tenant not found. Health:
  `GET /api/tenants/realtime-dev/health` with a Bearer JWT signed with
  `API_JWT_SECRET`. Server publish: `POST
http://realtime-dev.localhost:4000/api/broadcast`, `Authorization:
Bearer <HS256 JWT, claims {role, exp}>`, body `{messages: [{topic,
event, payload}]}` — **one request per `publishGame` call** (batch).
  Websocket subscribe (integration tests only):
  `ws://realtime-dev.localhost:4000/socket/websocket?apikey=<JWT>&vsn=1.0.0`.
  Realtime needs **no** `wal_level` change for Broadcast-only use.
  Existing compose: `postgres:17-alpine`, host port 5433 → container
  5432, user/pass/db `cambio/cambio/cambio`, volume `cambio-pgdata`, no
  `command:` override — the realtime service reaches it as
  `postgres:5432` on the compose network.
- **Root-plan decisions already made (do not reopen):** replies are
  `{view, version}` only; projections live in `packages/application`;
  topic secrets are HMAC-derived from a dedicated server secret;
  `SLAM_WINDOW_MS` default 5000 in `.env.example`; error statuses per
  C1.9 (404 not-found incl. non-participant views, 409 conflicts, 422
  `GameError`, 500 `StorageError`); realtime integration tests
  **hard-fail** when the container is down.
- **Toolchain:** if `pnpm` is missing from PATH:
  `source ~/.nvm/nvm.sh && nvm use 22`. Docker services:
  `docker compose -f docker/docker-compose.yml up -d`.

### Decisions this plan makes (open details the root plan left to the child)

Recorded here so `/implement` doesn't re-litigate; candidates for the root
Decision Log are flagged in Surprises as they're confirmed.

1. **Projection module layout:** a new directory
   `packages/application/src/projection/` with three files —
   `ViewFor.ts` (`viewFor` + the trivial `lobbyView`),
   `EventProjection.ts` (the total classification/projection over all 22
   event variants), `CommandMapping.ts` (wire command → domain `Command`,
   injecting the session user id). All pure functions from domain shapes
   to contracts shapes; re-exported from `src/index.ts`.
2. **`viewFor` keeps its two-argument signature** `(playerId, gameState)`
   (ADR-0021 pins it). The game version is **not** a `viewFor` concern:
   it travels beside the view in the `{view, version}` reply envelope
   (root Decision Log), which is how C2.6's "the view includes … the game
   version" is satisfied — the versioned envelope, not a field the pure
   projection would have to be handed separately.
3. **Wire commands carry no `playerId` field at all** — C1.5's "absent
   from the wire schemas" branch. The 9 wire variants hold only their
   payload data (`slotIndex`, `target`, `first`/`second`, `giveSlot`);
   `CommandMapping` injects the session user as the domain `playerId`.
   (`SlotRef.playerId` for peek/swap/slam **targets** remains — targeting
   another player is data, not identity.) Because
   `Schema.decodeUnknownEither` ignores excess properties by default, a
   spoofed `playerId` key in a request body is dead weight — the
   impersonation test sends one anyway and proves it changes nothing.
4. **Wire `CardSlug` is a `Schema.TemplateLiteral`** (rank
   `"2"–"9" | "T" | "J" | "Q" | "K" | "A"` × suit
   `"S" | "H" | "D" | "C"`), not a copy of the domain's 52-literal
   branded union and not a bare string — precise on the wire without
   duplicating domain vocabulary or importing it (contracts import
   `effect` only).
5. **`packages/contracts` gets no test infrastructure.** Its schemas are
   exercised where they are produced: every M2 projection suite
   round-trips its output through the contracts codecs
   (`Schema.encodeSync` then `decodeUnknownEither`), which is a stronger
   check than isolated shape tests and adds no vitest plumbing to a
   shapes-only package.
6. **Error contract shape:** `contracts` `ErrorBody =
{ error: { tag: string, message: string } }` — machine-readable tag,
   curated human message, top-level `error` key kept so the migration
   from CAM-4's `{error: string}` is shape-widening, not renaming.
   `errors.ts`'s `errorBody` is rewritten to produce it; existing CAM-4
   HTTP suites that assert the old bodies are updated in the same step.
   Tags are the typed error `_tag`s where one exists, curated constants
   (`"BadRequest"`, `"NotFound"`, `"Unauthorized"`, `"Internal"`) where
   none does. `GameError` bodies carry the specific variant tag (e.g.
   `"NotYourTurn"`) — all 16 are illegal-move-shaped and safe to name;
   the message stays generic (never interpolate state).
7. **Env/config names:** `SLAM_WINDOW_MS` → `slamWindowMs`
   (`Config.integer`, `withDefault(5000)` matching the `.env.example`
   placeholder), `REALTIME_URL` → `realtimeUrl` (`Config.string`,
   default `http://realtime-dev.localhost:4000`), `REALTIME_JWT_SECRET`
   → `realtimeJwtSecret` (`Config.redacted`, no default — fails boot
   like `SESSION_SECRET`), `TOPIC_SECRET` → `topicSecret`
   (`Config.redacted`, no default). The compose-side realtime secrets
   (`API_JWT_SECRET`, `DB_ENC_KEY`, `SECRET_KEY_BASE`) are hardcoded
   dev-only values in the compose file (matching the existing
   `cambio/cambio` style); **`API_JWT_SECRET` must equal the
   `REALTIME_JWT_SECRET` placeholder in `.env.example`** — a comment in
   both files says so.
8. **`_realtime` schema pre-creation is a one-shot compose service**
   (`realtime-init`: `postgres:17-alpine` running `psql … -c "CREATE
SCHEMA IF NOT EXISTS _realtime"`, with the realtime service
   `depends_on: condition: service_completed_successfully`). Not a
   Postgres image init script (those only run on first volume init —
   `cambio-pgdata` already exists) and not an app migration (app
   migrations stay in `public`, per the infrastructure-persistence
   skill; realtime's bookkeeping is not our schema).
9. **Websocket test client:** `@supabase/realtime-js` as a
   **devDependency of `apps/api`** only — tests subscribe with it;
   production publishes via the hand-rolled REST client, keeping prod
   deps SDK-free (ADR-0024). If the client fights the self-hosted
   tenant, the fallback is a raw Phoenix-protocol websocket over Node
   22's global `WebSocket`; the switch is an implementation note, not a
   plan change.
10. **Topic derivation lives in `apps/api/src/infra/topics.ts`** —
    `roomTopic(gameId)`, `playerTopic(gameId, userId)`, and
    `grantsFor(gameId, userId)` (the contracts `ChannelGrants` for one
    caller), all HMAC-SHA256 over the id(s) with `TOPIC_SECRET`,
    truncated base64url. Both the publisher adapter and the route
    handlers call these — one derivation, two consumers, no persistence
    (restart-stable per the root Decision Log). Secrets never appear in
    log output.
11. **HS256 JWT signing is hand-rolled** in
    `apps/api/src/infra/realtime-jwt.ts` (`node:crypto` HMAC over
    base64url header.payload — ~20 lines): used by the publisher's REST
    client and exported for the integration suite's subscriber `apikey`.
    No `jsonwebtoken`-style dependency.
12. **Route/exit discipline for registry calls:** a shared helper in
    `apps/api/src/presentation/` (advisory name `run.ts`) wraps
    `Runtime.runPromise(runtime, Effect.exit(effect))` and folds the
    `Exit`: success → the route's reply builder; typed failure → the
    matching status function + contract body; **interrupted or defective
    exit → 500 + `errorBody` equivalent** (C1.10) — the reply is always
    sent, never hung. The existing `Effect.either` pattern remains fine
    for non-registry effects (`createLobby`, view loads).
13. **C1.10's test uses a bespoke app assembly:** the suite builds a
    server over a stub `RoomRegistry` layer whose `execute` dies
    (defect) or interrupts, because driving the real actor into its
    teardown race over HTTP is nondeterministic. The real actor's
    behavior is already pinned by CAM-5's suites; what CAM-6 owns is the
    route's exit handling.
14. **Leak-assertion helper per package:** the "payload contains no
    unentitled slug" check is duplicated as small test-support helpers —
    `packages/application/test/support/leaks.ts` (M2 sweep) and
    `apps/api/test/support/leaks.ts` (M4 e2e/reply suites) — each
    computing, from a full `GameState` and a viewer id, the set of card
    slugs the viewer is entitled to under C2, then scanning
    `JSON.stringify(payload)` for any of the 52 slugs outside that set,
    plus the `prng` tuple values and deck-order leakage. Cross-package
    test-code imports don't exist; 30 lines twice beats a new package.
15. **e2e determinism:** `TestAppLayer` provides a **fixed-seed
    `SeedPort` stub** (literal seed, same spirit as
    `TEST_DATABASE_URL`'s literal), so the e2e script can replay
    `dealGame`/`applyCommand` in-test (the domain is pure) to know the
    full truth, choose legal commands, and compute each player's
    entitled set — while asserting the HTTP replies reveal none of it.
    The e2e config override sets `slamWindowMs: 0` so slam windows
    lazy-close on the next command instead of stalling the script; one
    dedicated test uses a large window to exercise a real `Slam` over
    HTTP.
16. **Route → registry mapping:** `POST /lobbies` → `createLobby` use
    case directly (no room exists yet); `join`/`leave`/`start`/
    `commands` → the corresponding `RoomRegistry` member; `GET
/games/:gameId/view` → `GameRepository.load` directly (a read needs
    no serialization; the actor's cache is an optimization, not the
    authority) → non-participant check (`seatOf` miss ⇒ the same 404
    body as `GameNotFound` — no existence leak) → `viewFor`.
17. **Malformed `:gameId`/params** (non-UUID) are a 400 decode failure
    like malformed bodies — params go through the same
    `decodeUnknownEither`-first pattern, before any effect.

## Module layout

New/changed files in `packages/contracts`:

| File                          | Exports                                                                                                                                                                                                             | Job                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/GamePrimitives.ts` (new) | wire `CardSlug` (TemplateLiteral, decision 4), `SlotIndex`, `SlotRef`, `GameVersion`, `Uuid` alias                                                                                                                  | Unbranded wire primitives every game schema shares (`User.ts:19-21` precedent).                                                      |
| `src/GameCommand.ts` (new)    | `WireCommand` — 9-variant union, **no `playerId` on any variant** (decision 3); `decodeWireCommandEither`                                                                                                           | C1.4/C1.5 by construction: `CloseSlamWindow` and issuer identity simply don't exist on the wire.                                     |
| `src/GameView.ts` (new)       | `PlayerGameView` (seat-ordered players with occupancy-only hands, deck count, discard pile, wire phase union with explicit optional held-card value, endgame reveal at `Ended`), `LobbyView`; decode/encode helpers | C2's shape, designed field-by-field — every field answers "may every recipient of this view see it?"                                 |
| `src/GameEvents.ts` (new)     | `RoomGameEvent` union (C3.1 pass-throughs + C3.2 public-with-value + C3.3 value-stripped shapes, each a named TaggedStruct), `PlayerGameEvent` union (C3.4: private drawn/peeked values); helpers                   | The channel split is done **by construction**: no schema in either union can even represent a payload its channel isn't entitled to. |
| `src/Channel.ts` (new)        | `ChannelGrants` `{roomTopic, playerTopic}`                                                                                                                                                                          | ADR-0023 capability grants as a wire shape.                                                                                          |
| `src/Error.ts` (new)          | `ErrorBody` (decision 6) + helpers                                                                                                                                                                                  | The error contract `errors.ts:31` promised.                                                                                          |
| `src/Responses.ts` (new)      | `LobbyResponse` `{lobby, version, grants}` (create/join; leave omits grants per C1.2), `GameReply` `{view, version}`, `ViewResponse` `{view, version, grants}`                                                      | The reply envelopes of C1.1–C1.6/C6.1.                                                                                               |
| `src/index.ts` (edit)         | barrel + doc paragraph update ("commands and events arrive with the rules engine" → arrived)                                                                                                                        | Barrel.                                                                                                                              |

New/changed files in `packages/application`:

| File                                       | Exports                                                                                                                     | Job                                                                                                                                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/projection/ViewFor.ts` (new)          | `viewFor(playerId, state): PlayerGameView`, `lobbyView(lobby): LobbyView`                                                   | ADR-0021's structural projection: exhaustive switch over `Phase`, `satisfies never`; C2.1–C2.7.                                                                                         |
| `src/projection/EventProjection.ts` (new)  | `projectEvents(state, events): {room: RoomGameEvent[], perPlayer: ReadonlyMap<UserId, PlayerGameEvent[]>}` (advisory shape) | C3's total classification over all 22 variants, exhaustive + `satisfies never`; full truth in, channel-safe shapes out.                                                                 |
| `src/projection/CommandMapping.ts` (new)   | `toDomainCommand(userId, wire): Command`                                                                                    | C1.5's injection point; exhaustive over the 9 wire variants.                                                                                                                            |
| `src/use-cases/StartGame.ts` (edit)        | `GameAdvanced` gains the full-truth warning doc comment                                                                     | C6.2 — same wording stance as `RealtimePublisher.ts:11-15`.                                                                                                                             |
| `src/index.ts` (edit)                      | re-exports the three projection modules                                                                                     | Barrel.                                                                                                                                                                                 |
| `test/ViewFor.test.ts` (new)               | —                                                                                                                           | M2 per-phase unit suite (C2.1–C2.7 positives and negatives).                                                                                                                            |
| `test/EventProjection.test.ts` (new)       | —                                                                                                                           | M2 per-variant unit suite (C3.1–C3.4, one classification per variant).                                                                                                                  |
| `test/CommandMapping.test.ts` (new)        | —                                                                                                                           | Session-id injection over all 9 variants.                                                                                                                                               |
| `test/AdversarialProjection.test.ts` (new) | —                                                                                                                           | The simulation sweep: `simulateGame` + `onStep`, every player's view and every event's channel payloads at every step, asserting absences (C2/C3/C3.5). `VIEW_GAMES`/`VIEW_SEED` knobs. |
| `test/support/leaks.ts` (new)              | entitled-set computation + no-leak assertion (decision 14)                                                                  | Shared by the M2 suites.                                                                                                                                                                |

New/changed files in `apps/api`:

| File                                           | Exports                                                                                                                                        | Job                                                                                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/infra/seed.ts` (new)                      | `SeedLive`                                                                                                                                     | `SeedPort` adapter — crypto-random int via `node:crypto` (`clock.ts` is the Layer shape).                                                           |
| `src/infra/topics.ts` (new)                    | `roomTopic`, `playerTopic`, `grantsFor` (decision 10)                                                                                          | ADR-0023 HMAC topic derivation; consumed by publisher + routes.                                                                                     |
| `src/infra/realtime-jwt.ts` (new)              | `signRealtimeJwt` (decision 11)                                                                                                                | HS256 signer for publish auth + test subscriber apikey.                                                                                             |
| `src/infra/realtime-publisher.ts` (new)        | `RealtimePublisherLive` (+ a constructor taking an injectable transport, for unit tests)                                                       | ADR-0024: project via `projectEvents`/`lobbyView`, derive topics, one batched `POST /api/broadcast` per call, swallow-and-log failures (C4.1–C4.3). |
| `src/presentation/run.ts` (new, advisory name) | exit-folding route runner (decision 12)                                                                                                        | C1.10: typed → status map, interrupt/defect → 500, always replies.                                                                                  |
| `src/presentation/lobbies.ts` (new)            | `lobbiesRoutes(runtime, config)`                                                                                                               | `POST /lobbies`, `/lobbies/:gameId/join`, `/leave`, `/start` (C1.1–C1.3, C1.7–C1.9).                                                                |
| `src/presentation/games.ts` (new)              | `gamesRoutes(runtime, config)`                                                                                                                 | `POST /games/:gameId/commands`, `GET /games/:gameId/view` (C1.4–C1.6, C6.1).                                                                        |
| `src/presentation/errors.ts` (edit)            | `lobbyErrorStatus`, `commandErrorStatus` (parallel to `sessionErrorStatus`); `errorBody` rewritten to contract bodies (decision 6)             | C1.9's exhaustive mappings; each new registry union gets its own `satisfies never` switch.                                                          |
| `src/presentation/server.ts` (edit)            | `setNotFoundHandler` + registers `lobbiesRoutes`, `gamesRoutes` after `usersRoutes`                                                            | C1.11.                                                                                                                                              |
| `src/config.ts` (edit)                         | four new keys (decision 7)                                                                                                                     | C5.2.                                                                                                                                               |
| `src/runtime.ts` (edit)                        | `AppServices` widens (`SeedPort`, `RealtimePublisherPort`, `RoomRegistry`); `AppLayer` completed                                               | C5.1. `RealtimePublisherLive` needs config — thread it the way `SessionSignerLive` gets its secret today.                                           |
| `test/support/http.ts` (edit)                  | `TestAppLayer` gains fixed-seed `SeedPort` stub, recording publisher (journal exposed), `RoomRegistryLive`; `baseConfig` gains the four fields | C5.2's test half; decision 15.                                                                                                                      |
| `test/support/leaks.ts` (new)                  | api-side no-leak helper (decision 14)                                                                                                          | Used by e2e/reply/impersonation suites.                                                                                                             |
| `test/Seed.test.ts` (new)                      | —                                                                                                                                              | Adapter unit test (flat, one file per adapter convention).                                                                                          |
| `test/Topics.test.ts` (new)                    | —                                                                                                                                              | Determinism, distinctness, secret-dependence of derived topics (C4.4's unit half).                                                                  |
| `test/RealtimePublisher.test.ts` (new)         | —                                                                                                                                              | Unit suite over the injectable transport: batching, topics, projected payloads, swallow-and-log (C4.1–C4.3).                                        |
| `test/RealtimeIntegration.test.ts` (new)       | —                                                                                                                                              | Container-backed: real REST publish, websocket subscribe, right-topic delivery + wrong-topic absence; **hard-fails when the container is down**.    |
| `test/Lobbies.test.ts` (new)                   | —                                                                                                                                              | Lobby route suite (C1.1–C1.3, C1.7–C1.9, C4.4's grant-isolation half).                                                                              |
| `test/GameCommands.test.ts` (new)              | —                                                                                                                                              | Command + view routes: decode-first 400s, statuses, impersonation (C1.5), non-participant 404 (C1.6).                                               |
| `test/DyingActor.test.ts` (new)                | —                                                                                                                                              | C1.10 over the stub registry (decision 13).                                                                                                         |
| `test/EndToEndGame.test.ts` (new)              | —                                                                                                                                              | The scripted full game (acceptance): every reply passes the no-leak assertion; publisher journal shows projected room/per-player traffic (C6.1).    |
| existing CAM-4 HTTP suites (edit)              | —                                                                                                                                              | Error-body assertions migrate to the contract shape (decision 6).                                                                                   |
| `package.json` (edit)                          | devDependency `@supabase/realtime-js` (decision 9)                                                                                             | Test subscriber only; prod deps unchanged.                                                                                                          |

Repo root / docker:

| File                               | Change                                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `docker/docker-compose.yml` (edit) | `realtime-init` one-shot + `supabase/realtime` service (decision 8; ADR-0024 env block; pinned version verified) |
| `.env.example` (edit)              | `SLAM_WINDOW_MS=5000`, `REALTIME_URL`, `REALTIME_JWT_SECRET`, `TOPIC_SECRET` with comments (decision 7)          |
| `turbo.json` (edit)                | `globalPassThroughEnv` gains the four vars; `test.env` gains `VIEW_GAMES`, `VIEW_SEED`                           |

Untouched surfaces: `packages/domain/src/**` (no domain change of any
kind), `apps/web`, all applied migrations, `apps/api/src/index.ts` — the
close-out sweep enforces this.

## Plan of work

Ordered by root-plan milestone. Projection work is test-first: write the
suite, watch it fail, then implement. Every step leaves the repo compiling
and the touched packages' suites green.

**Code sketches (signatures, DDL, exports) are advisory** — the coverage
table and module layout are the artifacts reconciled against as-built code.

### M1 — Contracts freeze (C1.4/C1.5 wire half, C2/C3 shapes, error contract)

**Step 1.1 — Primitives + command union.** `src/GamePrimitives.ts`, then
`src/GameCommand.ts`. The 9 variants mirror `Command.ts:74-85` minus
`CloseSlamWindow` and minus every `playerId` issuer field (decision 3).
Follow the domain's TaggedStruct-union idiom; export
`decodeWireCommandEither` (decision 5 means no dedicated tests — routes
and M2 suites exercise it).

**Step 1.2 — View shapes.** `src/GameView.ts`. `PlayerGameView` carries:
players in seat order (`id` + occupancy-only hand: slot indices), deck
**count**, discard pile (slugs, public), a wire phase union whose
`HoldingCard`/`ResolvingPower`/`ResolvingQueenSwap` variants hold an
**optional** card value (present exactly under C2.4's entitlement),
`SlamWindow` fully public, and an `Ended` reveal (all hands with values,
per-player totals, winner set — ties representable). `LobbyView` is
members + status, one shape for all viewers (C2.7). Design each field
against the hidden-information gate before writing it.

**Step 1.3 — Event unions.** `src/GameEvents.ts`. One named schema per
projected shape, grouped exactly as C3 classifies: C3.1 pass-throughs
(payloads already value-free), C3.2 public-with-value, C3.3
value-stripped (`GameStarted` → players/seat order/first discard/deck
count/config; `DeckReshuffled` → new deck count; `HeldSwapped` → slots +
displaced-card value only; `HeldKept`/`PenaltyDrawn`/`CardGivenFromDeck`
→ slots only), C3.4 per-player privates (`CardDrawn` with value for the
drawer; `CardPeeked` with value for the viewer) **plus** their
value-stripped room counterparts. "Never mostly-public with one private
field — split the event" is done here, by construction.

**Step 1.4 — Grants, errors, envelopes, barrel.** `src/Channel.ts`,
`src/Error.ts` (decision 6), `src/Responses.ts`, `src/index.ts`.

Checkpoint: `pnpm --filter @cambio/contracts build typecheck lint` green
(no test dir, deliberately — decision 5).

### M2 — Projections in application (C2, C3, C6.1's engine)

**Step 2.1 — `CommandMapping`, test-first.**
`test/CommandMapping.test.ts` intents: each of the 9 wire variants maps
to its domain `Command` with `playerId` = the given user id and payload
fields intact; the mapping is exhaustive (compile-time `satisfies
never`). Then implement `src/projection/CommandMapping.ts`.

**Step 2.2 — `viewFor`, test-first.** `test/ViewFor.test.ts` — build
small real states with `dealGame` (literal seeds) and hand-tuned phases
(fixtures `uid`/`card`/`slot`/`ts`). Intents, per C2 clause: own and
opponent hands are occupancy-only (C2.1); no view at any phase contains
the deck array or any `prng` component (C2.2 — assert via the leaks
helper); discard included as-is (C2.3); the C2.4 phase matrix —
holder sees held value always; everyone sees it when
`source === "discard"`; non-holders with `source === "deck"` see no
value; `ResolvingPower`/`ResolvingQueenSwap` value holder-only;
`SlamWindow` fully public; `AwaitingDraw`/`Ended` phase payloads carry
no values; `Ended` view carries the full reveal, totals matching
`gameScores`, winners matching `winnersOf`, a tie representable (C2.5);
seat order + current phase/turn present (C2.6); `lobbyView` identical
for any viewer (C2.7). Every output round-trips the contracts codec
(decision 5). Then implement `src/projection/ViewFor.ts` — one
exhaustive switch over `Phase`, `satisfies never`.

**Step 2.3 — `EventProjection`, test-first.**
`test/EventProjection.test.ts` intents: one test per event variant
pinning its C3 classification — pass-throughs land on room unchanged
(C3.1); the five public-with-value events keep their card value on room
(C3.2); each value-stripped projection loses exactly the fields C3.3
names and keeps the slot movements (assert the stripped field is
**absent**, not null — `PenaltyDrawn`'s slug appears in no output,
ADR-0022); `CardDrawn`/`CardPeeked` produce a private payload for
exactly the entitled player **and** a value-free room event (C3.4); the
function is total over all 22 variants (`satisfies never` — adding a
23rd domain event must break this file's build). Then implement
`src/projection/EventProjection.ts`.

**Step 2.4 — Adversarial simulation sweep.**
`test/support/leaks.ts` (decision 14), then
`test/AdversarialProjection.test.ts`: drive `simulateGame` over
`VIEW_GAMES` seeded games (default modest, knob-raisable; add
`VIEW_GAMES`/`VIEW_SEED` to `turbo.json` `test.env` in this step). In
`onStep`, for **every player at every intermediate state**: `viewFor`
output passes the no-leak assertion (C2 negatives, all phases including
`ResolvingQueenSwap`/fizzles/reshuffles via `SimParams.initial`);
`projectEvents` over the step's events yields room payloads containing
no slug outside the public/entitled set and per-player payloads only
for entitled players (C3 negatives); and once a `HoldingCard`/peek
phase has passed, the next step's views no longer contain the
previously-delivered value (C3.5 — private values never re-sent).

Checkpoint: `pnpm --filter @cambio/application test` green (existing 42

- new suites); `pnpm --filter @cambio/application lint` proves the
  boundary holds over `src/projection/`.

### M3 — Infrastructure (C4, C5.3)

**Step 3.1 — Compose: realtime service.** Edit
`docker/docker-compose.yml` per decision 8 and the research block in
Context (verify the current supabase/supabase version pin and record it
in a comment). Validate by hand: `docker compose -f
docker/docker-compose.yml up -d`, then the health request from Context
with a JWT signed by the dev `API_JWT_SECRET` returns healthy; confirm
`_realtime.schema_migrations` exists and `public` gained no realtime
tables (`psql` one-liners — record them in Progress).

**Step 3.2 — `SeedPort` adapter.** `src/infra/seed.ts` (`clock.ts`
shape) + `test/Seed.test.ts` (yields integers, successive calls differ —
statistical smoke, not crypto proof).

**Step 3.3 — Topics + JWT.** `src/infra/topics.ts` +
`src/infra/realtime-jwt.ts`, then `test/Topics.test.ts`: same inputs ⇒
same topics (restart-stability), different gameId/userId/secret ⇒
different topics, room and player topics follow ADR-0023's shapes, and
derived secrets are non-trivial length. JWT: header/payload/signature
verify against `node:crypto` independently.

**Step 3.4 — Publisher adapter, unit-tested.**
`src/infra/realtime-publisher.ts` with an injectable transport
(advisory: constructor takes `(config, transport)` where the live layer
passes a `fetch` wrapper). `test/RealtimePublisher.test.ts` intents:
one `publishGame` ⇒ **one** transport call whose body batches all room
messages plus per-player messages for each participant, each on the
correct derived topic, all payloads being exactly `projectEvents`
output (C4.1, C4.2's shape); the request carries the Bearer HS256 JWT
(C4.2); a rejecting/non-2xx transport ⇒ the effect still succeeds
`void` and a log line is emitted (C4.3); `publishLobby` ⇒ `lobbyView`
on the room topic. Tag-shape compliance is compile-time
(`Layer.succeed(RealtimePublisherPort, …)` typechecks against the
pinned tag).

**Step 3.5 — Container integration suite.**
`test/RealtimeIntegration.test.ts`: subscribe with the devDep client
(decision 9) to a room topic and two player topics; publish a small
projected batch through the real adapter (real `fetch`, literal
`REALTIME_URL`/secret constants per the `db.ts` pattern); assert each
message arrives on its intended topic and that the wrong-player topic
receives **nothing** during the window; assert connection failure to
the container **fails the suite** (no skip — the beforeAll throws on
unreachable health endpoint, same philosophy as the Postgres
global-setup).

Checkpoint: `pnpm --filter @cambio/api test` green with both containers
up.

### M4 — Presentation & wiring (C1, C5.1, C5.2, C6)

**Step 4.1 — Config/env, one change.** `src/config.ts` gains the four
keys (decision 7); `.env.example` gains the four vars with comments
(including the `API_JWT_SECRET`-must-match note); `turbo.json`
`globalPassThroughEnv` gains the four names; `test/support/http.ts`
`baseConfig` gains the four fields. Implementers must also sync their
local `.env` by hand — `.env` is not generated from the example.
(C5.2's four-places-in-one-change rule.)

**Step 4.2 — Error contract + not-found handler.** Extend
`presentation/errors.ts`: `lobbyErrorStatus` and `commandErrorStatus`
as parallel exhaustive switches over the registry unions (C1.9's table:
`GameNotFound`/`UserNotFound` → 404, `VersionConflict`/`LobbyFull`/
`AlreadyInLobby`/`NotInLobby`/`LobbyNotJoinable` → 409, `GameError` →
422, `StorageError` → 500), each ending `satisfies never`; rewrite body
builders to the contracts `ErrorBody` (decision 6); update
`unhandledErrorResponse` to the contract shape. Add
`setNotFoundHandler` in `server.ts` returning the curated 404 contract
body (C1.11). Update the CAM-4 suites' body assertions in the same
step. Checkpoint: existing api HTTP suites green again.

**Step 4.3 — Runtime + test wiring.** `src/runtime.ts`: `AppServices`
gains `SeedPort | RealtimePublisherPort | RoomRegistry`; `AppLayer`
merges `SeedLive`, `RealtimePublisherLive` (config-fed), and
`RoomRegistryLive` provided with its deps (`RoomRegistry.ts:105`).
`test/support/http.ts`: `TestAppLayer` gains the fixed-seed stub
(decision 15), a recording publisher whose journal the harness exposes,
and `RoomRegistryLive`. Checkpoint: `pnpm --filter @cambio/api build
typecheck` green; api boots locally (`pnpm dev`) with compose up.

**Step 4.4 — Lobby routes, test-first.** `test/Lobbies.test.ts` intents:
create ⇒ 201 with lobby view, version, and the caller's grants — and
the grants match `grantsFor` (C1.1); join ⇒ 200 with view/version/the
**joiner's** grants; leave ⇒ view/version (C1.2); player A's create/join
responses never contain player B's `playerTopic` secret (C4.4's HTTP
half); start assembles `GameConfig` from `slamWindowMs` config —
override the config and observe the started game's persisted
`config.slamWindowMs` via the repository (C1.3); every route 401s
without a session, contract body (C1.7); malformed body/params ⇒ 400
with **no** registry/publisher journal activity (C1.8, C1.17 note in
decision 17); each typed refusal surfaces its mapped status (C1.9
sampling — the exhaustiveness itself is compile-time). Then implement
`presentation/lobbies.ts` (decode-first pattern from `users.ts:22-32`;
registry calls through the `run.ts` helper; publish-side effects come
free via the use cases).

**Step 4.5 — Game routes, test-first.** `test/GameCommands.test.ts`
intents: a legal command ⇒ 200 `{view, version}` where `view` equals
`viewFor(caller, state)` recomputed in-test and the body has **no**
`state`/`events` keys (C6.1's shape half); a command body carrying a
spoofed `playerId` (another participant, or a non-participant UUID)
executes as the **session** user — observed via the engine outcome
(e.g. the session user's typed `NotYourTurn` when it isn't their turn)
and never as the spoofed player (C1.5); wire `CloseSlamWindow` ⇒ 400 at
decode (C1.4); `GET /view` for a participant ⇒ snapshot + version +
caller's grants, and for a non-participant session ⇒ the 404 body
identical to the unknown-game 404 (C1.6); `GameError` ⇒ 422 with the
variant tag in the body (C1.9). `test/DyingActor.test.ts` (decision
13): stub registry defect ⇒ 500 contract body, response completes;
stub interrupt ⇒ same (C1.10). Then implement `presentation/games.ts`

- `run.ts`.

**Step 4.6 — End-to-end scripted game + reply adversarial suite.**
`test/support/leaks.ts` (api copy), then `test/EndToEndGame.test.ts`:
two-to-three users via `POST /users`; create/join/start over HTTP;
replay `dealGame` in-test from the fixed seed (decision 15) to know
truth; script the game to completion through `POST …/commands`
(covering draw/keep/swap/discard, at least one power, at least one
slam via the large-window variant, cambio call, ended reveal). At
**every** reply and every `GET /view`: the no-leak assertion for the
calling player (C6.1); at the end: the `Ended` view carries the reveal
and correct scores. The publisher journal is asserted throughout:
room messages value-clean, per-player messages only to entitled
players, persist-before-publish order preserved through the real
wiring (the CAM-5 journal pattern at `stubs.ts:167-179`).

**Step 4.7 — C6.2.** Add the full-truth warning doc comment to
`GameAdvanced` (`use-cases/StartGame.ts:42-46`), mirroring
`RealtimePublisher.ts:11-15`'s stance. Doc-only; no test (coverage row
says so).

Checkpoint: `pnpm --filter @cambio/api test` green;
`pnpm --filter @cambio/application test` green.

### M5 — Gate + reconciliation

Full bare gate, sweeps below, coverage table filled by `/implement`,
module layout reconciled against as-built files, Progress/Surprises
finalized, root plan's Progress updated.

## Concrete steps & validation

Run from the repo root. If `pnpm` is missing:
`source ~/.nvm/nvm.sh && nvm use 22`. Both containers must be up for M3+
api suites:

```bash
docker compose -f docker/docker-compose.yml up -d
```

Per-milestone signals:

- **M1:** `pnpm --filter @cambio/contracts build typecheck lint` — green;
  `pnpm turbo build` still green repo-wide (nothing imports the new
  schemas yet).
- **M2:** `pnpm --filter @cambio/application test` — the three unit
  suites + the sweep green; run the sweep once with a raised knob
  (`VIEW_GAMES=25 pnpm --filter @cambio/application test`) before calling
  the milestone done; record counts in Progress.
- **M3:** compose up → the health probe and `psql` schema checks from
  step 3.1 recorded in Progress; `pnpm --filter @cambio/api test` —
  adapter units + the integration suite green. Then stop the realtime
  container once (`docker compose -f docker/docker-compose.yml stop
realtime`) and confirm the integration suite **fails** (the hard-fail
  acceptance); start it again.
- **M4:** `pnpm --filter @cambio/api test` — all HTTP suites incl. the
  e2e scripted game green; `pnpm dev` boots with the full layer stack
  (C5.1's observable).
- **M5:** the full gate.

Untouched-surface and discipline sweeps (each must print nothing):

```bash
git diff --name-only origin/release-v0...HEAD -- \
  packages/domain/src apps/web apps/api/migrations apps/api/src/index.ts
grep -rn "Date.now\|Math.random\|setTimeout\|setInterval" \
  packages/application/src packages/contracts/src   # projections stay pure
grep -rn "from \"node:" packages/application/src packages/contracts/src
grep -rn "@supabase" apps/api/src                    # prod publish path is SDK-free (ADR-0024)
grep -rni "topicSecret\|playerSecret" apps/api/src --include="*.ts" -l | \
  xargs grep -ln "log"                               # then eyeball: secrets never logged
```

Final gate (must pass before `/ship`, both containers up). **Never pipe
it** — a pipe replaces the gate's exit code with the filter's and has
committed a broken build before (the PreToolUse hook
`.agents/hooks/block-piped-gate.sh` also denies piped gate invocations
without `pipefail`); run it bare and check the exit status directly:

```bash
pnpm turbo build typecheck lint test
```

(`lint` includes the repo-wide prettier check — `pnpm format` if it
complains about new files, this document included.)

## Contract coverage

_(maintained by `/implement`, verified by `/review`: one row per root-plan
contract clause this side owns — the test that pins it, or why none can.
Each row must also say **what is asserted**, in one phrase. Per the
template rule, the **Contract coverage table stays test-nameless at plan
time**: rows hold clause → planned approach; `/implement` fills the test
file, test name, and assertion phrase as each test actually lands —
invented test titles become review findings. The "Planned approach"
column below is plan-time orientation only.)_

| Clause | Test (file + name)                                                                                                                                                        | What is asserted                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| C1.1   | `apps/api/test/Lobbies.test.ts` › "creates a lobby: 201 with the lobby view, version, and the caller's grants"                                                            | 201; body `lobby`/`version`/`grants`; grants equal `grantsFor(secret, gameId, caller)`                                     |
| C1.2   | `Lobbies.test.ts` › "join returns the joiner's grants…" and "leave returns the view and version, no grants"                                                               | join body carries the joiner's grants; leave body keys are exactly `lobby`+`version`                                       |
| C1.3   | `Lobbies.test.ts` › "assembles GameConfig from AppConfig — the override lands in the persisted game"                                                                      | started game's persisted `config.slamWindowMs` equals the route's overridden config                                        |
| C1.4   | `apps/api/test/GameCommands.test.ts` › "CloseSlamWindow is not on the wire: 400 at decode"                                                                                | a wire `CloseSlamWindow` body is rejected 400 (`BadRequest`) before any effect                                             |
| C1.5   | `GameCommands.test.ts` › "a spoofed playerId in the body executes as the session user, never the spoofed player"                                                          | Bob's body claiming `playerId: alice` executes as Bob → 422 `NotYourTurn`                                                  |
| C1.6   | `GameCommands.test.ts` › "a participant gets snapshot + version + their grants…" and "a non-participant gets a 404 body identical to an unknown game"                     | participant view equals recomputed `viewFor`; non-participant 404 body byte-identical to unknown-game                      |
| C1.7   | `Lobbies.test.ts` › "all lobby routes 401 without a session" + `GameCommands.test.ts` › "…unauthenticated → 401"                                                          | every game/lobby route without a session → 401 `Unauthorized`                                                              |
| C1.8   | `GameCommands.test.ts` › "malformed bodies 400 before any effect"; `Lobbies.test.ts` › "malformed :gameId is a 400 before any effect — no registry or publisher activity" | malformed body/params → 400; publisher journal empty                                                                       |
| C1.9   | `Lobbies.test.ts` › "typed refusals surface their mapped status and tag" + `errors.ts` exhaustive `satisfies never` switches                                              | 409 `AlreadyInLobby`/`NotInLobby`, 404 `GameNotFound`, 422 `NotYourTurn`; exhaustiveness compile-time                      |
| C1.10  | `apps/api/test/DyingActor.test.ts` › "a defect escaping the typed union becomes a 500…" and "a bare interrupt becomes a 500 too"                                          | stub-registry defect and interrupt each → 500 `Internal`; reply always completes                                           |
| C1.11  | `GameCommands.test.ts` › "unmatched routes get the curated contract 404"                                                                                                  | unknown path → 404 `{error:{tag:"NotFound"}}`                                                                              |
| C2.1   | `packages/application/test/ViewFor.test.ts` › "hands are occupancy-only for everyone…" + `AdversarialProjection.test.ts` sweep                                            | every hand (own included) is slot indices only, all phases                                                                 |
| C2.2   | `ViewFor.test.ts` › "the deck is a count; deck order and prng exist in no view" + sweep (`expectNoLeak`)                                                                  | `deckCount` only; no `deck`/`prng` key at any depth in any view                                                            |
| C2.3   | `ViewFor.test.ts` › "the discard pile is included as-is, top first"                                                                                                       | discard array projected verbatim                                                                                           |
| C2.4   | `ViewFor.test.ts` › "phase projection (C2.4)" block (6 tests)                                                                                                             | held value holder-only / everyone-on-discard-source / absent otherwise; power phases holder-only; SlamWindow public        |
| C2.5   | `ViewFor.test.ts` › "Ended: all hands revealed…", "ties are representable…", "the reveal is identical for every viewer"                                                   | reveal hands+totals = `gameScores`, winners = `winnersOf`; plural winners on a tie                                         |
| C2.6   | `ViewFor.test.ts` › "seat order and the phase are present" (+ C1.1/C6.1 envelope tests for version)                                                                       | players in seat order, phase present; version rides the reply envelope                                                     |
| C2.7   | `ViewFor.test.ts` › "is fully public and round-trips the contracts codec"                                                                                                 | `lobbyView` output is viewer-independent                                                                                   |
| C3.1   | `packages/application/test/EventProjection.test.ts` › "C3.1 — pass-throughs"                                                                                              | each pass-through lands on room unchanged, no private counterpart                                                          |
| C3.2   | `EventProjection.test.ts` › "C3.2 — public with value, by rule" (5 tests)                                                                                                 | DiscardTaken/HeldDiscarded/PowerDiscarded/SlamSucceeded/SlamFailed keep their card on room                                 |
| C3.3   | `EventProjection.test.ts` › "C3.3 — value-stripped for everyone" (6 tests)                                                                                                | stripped fields absent (not null); `PenaltyDrawn` slug in no output; totality via `satisfies never`                        |
| C3.4   | `EventProjection.test.ts` › "C3.4 — split into private value + value-free room event"                                                                                     | CardDrawn/CardPeeked → one private payload to the entitled player + value-free room event                                  |
| C3.5   | `AdversarialProjection.test.ts` sweep (private-delivery invariants)                                                                                                       | each private draw/peek delivered exactly to the entitled player; none stray                                                |
| C4.1   | `apps/api/test/RealtimePublisher.test.ts` › "one call, one batch: room messages + per-player messages on derived topics"                                                  | single transport call; batch = `projectEvents` output on `roomTopic`/`playerTopic`                                         |
| C4.2   | `apps/api/test/RealtimeIntegration.test.ts` › "delivers room and private messages to their topics…" + `RealtimeJwt.test.ts`                                               | real REST publish + websocket delivery to intended topics; HS256 JWT verifies                                              |
| C4.3   | `RealtimePublisher.test.ts` › "a failing transport is swallowed…" and "a defective transport is swallowed too"                                                            | failing/defective transport → effect still succeeds void                                                                   |
| C4.4   | `apps/api/test/Topics.test.ts` (4 tests) + `Lobbies.test.ts` › "…never carries another's private topic"                                                                   | topics deterministic/distinct/secret-dependent; Bob's body omits Alice's playerTopic                                       |
| C5.1   | full api suite boots over `TestAppLayer` (Seed+Publisher+RoomRegistry) + `pnpm dev` boot recorded in Progress                                                             | app resolves the full layer stack; `/health` ok, no startup exception                                                      |
| C5.2   | `apps/api/test/Config.test.ts` › realtime entries block (3 tests)                                                                                                         | `REALTIME_JWT_SECRET`/`TOPIC_SECRET` required; `slamWindowMs`/`realtimeUrl` defaults                                       |
| C5.3   | `RealtimeIntegration.test.ts` `beforeAll` health gate                                                                                                                     | suite hard-fails when the container is down (probed in M3); passes when up                                                 |
| C6.1   | `apps/api/test/EndToEndGame.test.ts` › "plays a full game over HTTP…" and "a real Slam over HTTP…"                                                                        | every reply is `{view, version}` == recomputed `viewFor`, leak-free; published room stream carries only rule-public values |
| C6.2   | doc-only — warning comment on `GameAdvanced` (`packages/application/src/use-cases/StartGame.ts`)                                                                          | no test pins a comment; verified by reading the source                                                                     |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [x] 2026-09-01 — backend plan written; awaiting `/implement`
- [x] 2026-09-01 15:20 — M1 complete (c31f815): seven contracts files landed
      (`GamePrimitives`, `GameCommand`, `GameView`, `GameEvents`, `Channel`,
      `Error`, `Responses`) + barrel; contracts build/typecheck/lint green.
      Private events got distinct tags (`PrivateCardDrawn`,
      `PrivateCardPeeked`) so the two streams can never be confused — see
      Surprises.
- [x] 2026-09-01 15:45 — M2 complete: `src/projection/{ViewFor,
EventProjection,CommandMapping}.ts` + four test suites + `leaks.ts`
      helper, TDD (suites written first, red on missing modules, then green).
      Application suite 80 tests green; raised-knob sweep `VIEW_GAMES=25`
      green (thousands of per-step views checked). `VIEW_GAMES`/`VIEW_SEED`
      added to `turbo.json` test env. Deviation: `projectEvents(events)` —
      the advisory `(state, events)` first parameter proved unnecessary
      (deck counts come from the events themselves).
- [x] 2026-09-01 16:30 — M3 complete (1618a8f): compose gained `realtime-init` + `supabase/realtime:v2.102.3` (pin re-verified against the
      supabase/supabase compose today; one surprise: `METRICS_JWT_SECRET` is
      required at boot — added, set to the same dev secret). Schema checks
      recorded: `_realtime.{tenants,extensions,schema_migrations,feature_flags}`
      only; `public` untouched; tenant `realtime-dev` seeded. Health endpoint
      answered with the self-signed JWT. `seed.ts`, `topics.ts`,
      `realtime-jwt.ts`, `realtime-publisher.ts` landed; 16 tests green incl.
      the container-backed integration suite (real REST publish → real
      websocket delivery; wrong player's channel silent). Hard-fail acceptance
      probed: stopping the container fails the suite with an actionable
      message; restarted. Config/env/turbo/baseConfig four-place change landed
      here (early — the publisher layer needs config; step 4.1 is thereby
      done). Local `.env` synced by hand.
- [x] 2026-09-01 16:45 — M4 complete (d6f47d6): error contract
      (`errors.ts` rewritten to `ErrorBody`; `commandErrorStatus`,
      `lobbyErrorStatus`, `typedErrorBody`), `setNotFoundHandler`, `run.ts`
      exit-folding runner, `lobbies.ts`, `games.ts`, runtime wiring
      (`AppServices`/`AppLayer` widened with Seed/Publisher/RoomRegistry),
      `GameAdvanced` full-truth doc warning (C6.2). Test wiring: `TestAppLayer`
      gained fixed-seed `SeedPort`, a recording publisher journal, and
      `RoomRegistryLive`. Suites: `Lobbies`, `GameCommands`, `DyingActor`,
      `EndToEndGame` + Config/Auth migrations. Full api suite 93 tests green;
      API boots on the full layer stack (`/health` ok, no exceptions — the
      only startup error seen was EADDRINUSE from a stray dev process, not a
      wiring fault). Deviations logged below.
- [x] 2026-09-01 16:55 — M5: full gate green
      (`pnpm turbo build typecheck lint test`); coverage table filled;
      docs reconciled.

## Surprises & notes for the root plan

_(anything the root plan's Decision Log or the reviewer must know)_

- `.env.example` is currently complete against `config.ts` (verified at
  plan time — the header's completeness claim holds). The sync risk is
  the implementer's **local `.env`**, which is copied once and drifts:
  after step 4.1, add the four new vars to `.env` by hand or `pnpm dev`
  fails boot on the required secrets. Deliberate — required-no-default
  secrets failing loudly is the ADR-0018 posture.
- CAM-4's HTTP suites assert the old `{error: string}` bodies; migrating
  them to the contract shape (decision 6) is a planned edit of existing
  tests, not scope creep — flag any suite whose assertions turn out to
  depend on exact wording rather than shape.

### As-built deviations from the advisory sketches (reconciled at close-out)

- **`projectEvents(events)`**, not the sketched `projectEvents(state,
events)` — the `state` argument was never needed (deck counts come from
  `GameStarted`/`DeckReshuffled` themselves). `ViewFor.ts` module-layout row
  stands as written.
- **`METRICS_JWT_SECRET`** is required by `supabase/realtime:v2.102.3` at
  boot (not in the researched env set) — added to the compose service,
  same dev secret as `API_JWT_SECRET`. Recorded in the compose comment.
- **`typedErrorBody`** (not sketched) sits alongside `errorBody` in
  `errors.ts`: it renders a typed error's `_tag` + a status-class message,
  while `errorBody` handles the tagless framework/404/401 cases. Both feed
  the `contracts` `ErrorBody`.
- **`publishLobby` event name** on the wire is `"LobbyUpdated"` (the port
  gave no name); documented in the publisher adapter.
- The `Error.ts`/`Channel.ts`/`Responses.ts` contracts modules, the three
  `projection/` modules, and the four new `infra/` modules all landed at
  their sketched paths. `.env.example` was already complete pre-CAM-6
  (plan-time verification held); the four new vars were added to it,
  `config.ts`, `turbo.json`, `baseConfig`, and the local `.env`.
