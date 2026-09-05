# CAM-17 — Lobby + room screens — contract groundwork + backend (backend)

- **Root plan:** [root/CAM-17.md](../root/CAM-17.md) — the functional
  contract lives there; this document is implementation detail for the
  backend side: contracts clauses C1–C5, backend clauses B1–B5, and the
  backend half of W3's env story (which turns out to be documentation only).

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

Governing skills: `architecture` (import table; contracts import `effect`
only), `application-layer` (use-case shape, ports as `Context.Tag`, the
per-room queue), `effect-domain-modeling` (branded types, TaggedStruct,
typed errors, purity), `infrastructure-persistence` (store nothing
derivable, soft-delete filter lives in repositories, no editing applied
migrations), `hidden-information` (viewFor is the single projection; every
new wire field is an entitlement decision). All five re-read before this
plan was written; the probes below were run against the live code on this
branch.

### The surfaces this side touches

- `packages/contracts/src/GameView.ts` — `LobbyView` (members today:
  `Schema.Array(Uuid)`), `ViewPlayer` (today `{ id, hand }`),
  `PlayerGameView` (no config exposure today).
- `packages/contracts/src/GameEvents.ts` — the two channel unions; no
  `LobbyUpdated` schema exists anywhere in contracts.
- `packages/contracts/src/Responses.ts` — `LobbyResponse`
  `{ lobby, version, grants }` (create/join), `LeaveLobbyResponse`
  (no grants), `GameReply`, `ViewResponse`.
- `packages/domain/src/Lobby.ts` — pure lobby model (ADR-0019): `members`
  is `Schema.Array(UserId)`, transitions `createLobby` / `joinLobby` /
  `leaveLobby` / `startSeats`, errors `LobbyFull` / `AlreadyInLobby` /
  `NotInLobby` / `LobbyNotJoinable`.
- `packages/domain/src/UserRepository.ts` — `User = { id, name }` schema
  plus the repository port (`create`, `findById` only).
- `packages/application/src/projection/ViewFor.ts` — `viewFor(viewerId,
state)` and `lobbyView(lobby)`; `EventProjection.ts` (`projectEvents`)
  needs **no** change: no room or private event carries a name, and
  `GameStarted` already carries `config.slamWindowMs`.
- Use cases `CreateLobby.ts`, `JoinLobby.ts`, `LeaveLobby.ts`,
  `StartGame.ts`, `ExecuteGameCommand.ts`; the actor in
  `room/RoomRegistry.ts` (caches `{ state, version }` only — untouched).
- `apps/api/src/infra/game-repository.ts` (`loadLobby` / `saveLobby`),
  `user-repository.ts`, `realtime-publisher.ts` (`publishLobby` sends
  event name `LobbyUpdated` with a **bare, untagged** `LobbyView`
  payload — the C3 gap), `topics.ts` (`grantsFor` — unchanged).
- Routes `apps/api/src/presentation/lobbies.ts` (create/join/leave/start;
  the new GET lands here) and `games.ts` (commands, view — the
  non-participant 404 uses `typedErrorBody(404, { _tag: "GameNotFound" })`,
  byte-identical to the unknown-game body; the new GET copies this
  pattern exactly). Error mapping stays centralized in
  `presentation/errors.ts` — no new statuses or tags are needed
  (`lobbyErrorStatus` already maps `GameNotFound` → 404 and
  `StorageError` → 500, which covers the GET route's whole error union).

### Probe results the mechanisms rest on

1. **C4 mechanism probe (root plan asked this plan to decide):**
   `GameState.config: GameConfig` is part of the domain state
   (`packages/domain/src/GameState.ts:54-62`), persisted in the
   `games.config` jsonb column and round-tripped by
   `game-repository.ts` on every `save`/`load`. So `viewFor` can source
   `slamWindowMs` **from the state it already receives** — the exposed
   value is definitionally the value the game was started with, with no
   env-stability assumption and no route-layer plumbing. **Decision: C4
   lands on `PlayerGameView` (filled inside `viewFor` from
   `state.config`), not on `ViewResponse`/`GameReply` at the route
   layer.** The rejected alternative (route-layer injection from
   `AppConfig.slamWindowMs`) would silently report the wrong value for
   any game started before an env change.
2. **Name-availability probe:** projections receive only the domain
   aggregates. `Lobby.members` and `GameState.players[].id` are bare ids;
   names live solely in the `users` table (`user_name` column) and in the
   session (`request.sessionUser` is a DB-fresh domain `User` — the auth
   preHandler re-loads it every request). `viewFor` is called from three
   route sites (start, commands, view) and `lobbyView` from four (create,
   join, leave, and the publisher's `publishLobby`).
3. **Least-invasive name paths (decision, with the rejected options):**
   - **Lobby names: embed in the domain `Lobby` aggregate** —
     `members` becomes an array of the existing domain `User`
     `{ id, name }`. `loadLobby` gains a join to `users`; `saveLobby`
     writes only ids (storing names in `game_players` would violate the
     store-nothing-derivable rule). Every `lobbyView`/`publishLobby` site
     then works unchanged in shape, including the publisher, which
     otherwise would have needed a port-signature change to receive
     names. No new queries at runtime: `JoinLobby` already calls
     `users.findById` (today it discards the result), and create's
     member is the route's `sessionUser`. The lobby is deliberately
     outside the rules engine (ADR-0019, rows not events), so no
     fold/reconstruction concern exists.
   - **Game-view names: a names argument to `viewFor`** —
     `viewFor(viewerId, state, names)`. Embedding names in
     `GameState.players` was rejected: state is rebuilt by folding
     `game_events`, and events carry no names, so a fold-rebuilt state
     would silently lose them; it would also touch `dealGame`, the
     engine, and every state fixture. Changing `GameRepository.load` to
     return names was rejected as a wider ripple (port type, actor
     cache, `GameAdvanced`, every stub). Instead the `UserRepository`
     port gains a batch `findManyById`, and a small application helper
     (`playerNames`, next to `ViewFor.ts`) turns a `GameState` into the
     names map; the three `viewFor` route sites compose it (one
     `SELECT … WHERE user_id IN (…)` for ≤5 rows per request — accepted
     for v0; the GET-view route already composes the repository directly,
     so route-level composition has precedent).
4. **Leak-scan interaction:** `apps/api/test/support/leaks.ts` matches
   **whole strings** against card slugs, so ordinary fixture names
   ("Alice") can never false-positive — but a player literally named
   `"AS"` would. Keep fixture names ≥3 chars; note this in the test.
5. **Contracts has no test runner** (`packages/contracts/package.json`
   has no `test` script). Root M1 wants the frozen clauses to carry
   schema tests, so this plan adds a minimal vitest harness there
   (turbo's `test` task picks up any package `test` script
   automatically).
6. **Env half of W3 (ADR-0032):** nothing executable lands on the
   backend. The anon JWT is minted by an operator reusing the signer in
   `apps/api/src/infra/realtime-jwt.ts` (`signRealtimeJwt(secret)`
   defaults to `role: "anon"` — already suitable; pass a long
   `expiresInSeconds` when minting). The `VITE_REALTIME_URL` /
   `VITE_REALTIME_ANON_JWT` additions to `.env.example` and `turbo.json`
   are **frontend-owned** (frontend child plan); this side must not edit
   those files, only keep `REALTIME_JWT_SECRET` semantics unchanged.

### Wire shapes frozen by M1 (the contract the frontend codes against)

All five are public-information changes — every recipient may legally see
every field (names are labels shown at the table; `slamWindowMs` is
already broadcast to the whole room inside `GameStarted`).

| Clause | Shape (advisory sketch — coverage table is what gets reconciled)                                                                                                                                                                                                                                                                                                                                     |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1     | `LobbyView.members: Array({ id: Uuid, name: String })` (name is 1–32 by construction at `POST /users`; responses carry it as plain `Schema.String`, the `SessionUser` precedent)                                                                                                                                                                                                                     |
| C2     | `ViewPlayer` gains `name: Schema.String`; identical value in every viewer's projection                                                                                                                                                                                                                                                                                                               |
| C3     | `LobbyUpdated = Schema.TaggedStruct("LobbyUpdated", { lobby: LobbyView, version: GameVersion })` exported from `GameEvents.ts` with decode/encode helpers; **not** added to `RoomGameEvent` (that union is the projection of the 22 in-game domain events; `LobbyUpdated` is the pre-game row-backed broadcast). `version` added at root-plan reconciliation — the client's staleness guard needs it |
| C4     | `PlayerGameView` gains `config: Schema.Struct({ slamWindowMs: Schema.Int })` — mirrors the `GameStarted` event's `config` field verbatim                                                                                                                                                                                                                                                             |
| C5     | The GET-lobby endpoint reuses `LobbyResponse` `{ lobby, version, grants }` — the schema C5 requires already exists; its doc comment gains the new route                                                                                                                                                                                                                                              |

## Plan of work

Ordered so each step leaves the repo compiling and green. The contracts
shapes above are frozen **now, by this table**; steps 1–3 land them in the
first half of the work and nothing after revisits them (root M1 freeze
rule — a "contracts-only" first commit is impossible for shape _changes_,
since `viewFor`/`lobbyView` type against them, so each clause lands at the
head of its vertical slice instead).

### Step 1 — contracts test harness + C3 + C4 slice

1. Give `packages/contracts` a test setup mirroring `packages/domain`:
   `vitest.config.ts`, a `test: "vitest run"` script, vitest devDependency
   (same versions as domain). New `packages/contracts/test/` directory.
2. **C3:** add the `LobbyUpdated` tagged struct (with `version:
GameVersion` — see the shape table) + `decodeLobbyUpdated` /
   `encodeLobbyUpdated` / `decodeLobbyUpdatedEither` helpers to
   `GameEvents.ts` (it may import `LobbyView` from `GameView.js`).
   Schema test: round-trip, `_tag` literal, rejection of the current
   bare-LobbyView payload shape (regression pin for the gap C3 fixes).
3. **C3 wiring:** `realtime-publisher.ts` `publishLobby` sends
   `payload: { _tag: "LobbyUpdated", lobby: lobbyView(lobby), version }` —
   the event name stays `"LobbyUpdated"`, which now equals `payload._tag`,
   making the pre-game event consistent with all 24 tagged broadcasts.
   Carrying `version` means the publisher port's `publishLobby` gains a
   version argument (advisory: exact signature at implement) — the lobby
   use cases already hold the version they return in replies, so each
   call site passes it through; update the port, its stub, and the two
   publisher suites accordingly.
   Update the `publishLobby` expectations in
   `apps/api/test/RealtimePublisher.test.ts` ("publishes the public lobby
   view on the room topic") and `apps/api/test/RealtimeIntegration.test.ts`
   ("publishLobby lands the public lobby view on the room topic").
4. **C4 (TDD in application first):** extend
   `packages/application/test/ViewFor.test.ts` with the config-exposure
   expectation, then add `config: { slamWindowMs: state.config.slamWindowMs }`
   to `viewFor`'s output and the matching `config` field to
   `PlayerGameView` in `GameView.ts`. Contracts schema test pins the
   field. API suites that recompute `viewFor` in-test
   (`GameCommands.test.ts` "a legal command returns {view, version} where
   view equals viewFor recomputed in-test") stay green by construction;
   `Lobbies.test.ts` "assembles GameConfig from AppConfig — the override
   lands in the persisted game" gains a cheap extra assertion that the
   started view reports the overridden value (7777) — that is the C4
   equals-started-with pin.

### Step 2 — C1: lobby names vertical (domain TDD first)

1. `packages/domain/test/Lobby.test.ts` first: rewrite fixtures so
   members are `User` objects; assert join order, `AlreadyInLobby` by id,
   `startSeats` returning **ids** in seat order.
2. `packages/domain/src/Lobby.ts`: `members: Schema.Array(User)` (reuse
   the existing `User` schema from `UserRepository.ts` — same package,
   identical shape, no new type). `createLobby(id, creator: User)`;
   `joinLobby(lobby, user: User)` (membership check by `id`);
   `leaveLobby(lobby, userId)` unchanged signature, filters by `m.id`;
   `startSeats` maps members to ids so `dealGame` and every engine
   consumer stay untouched.
3. `packages/contracts/src/GameView.ts`: `LobbyView.members` becomes the
   `{ id, name }` array (C1). Contracts schema test pins it.
4. `packages/application`: `CreateLobby` input becomes
   `{ creator: User }`; `JoinLobby` feeds its existing `findById` result
   into the transition (the lookup stops being discard-only);
   `LeaveLobby`/`StartGame` compile-fix only; `lobbyView` maps
   `{ id, name }` through. Update `CreateLobby.test.ts`,
   `JoinLobby.test.ts`, `LeaveLobby.test.ts`, `StartGame.test.ts`,
   `RoomRegistry.test.ts`, `ViewFor.test.ts` ("is fully public and
   round-trips the contracts codec") and `test/support/stubs.ts` /
   `registry.ts` fixtures (the stub `loadLobby` that derives a started
   lobby from a saved state fabricates deterministic stub names).
5. `apps/api/src/infra/game-repository.ts`: `loadLobby` joins names —
   `LEFT JOIN users … AND users.deleted_at IS NULL` with
   `COALESCE(user_name, '')`, so a member row never vanishes if its user
   was soft-deleted mid-lifecycle (flagging for review: this is the one
   spot the repo's always-filter-soft-deletes convention is applied to a
   _joined_ table via LEFT JOIN rather than dropping rows). `saveLobby`
   maps `members` to ids for its mirror loop. `lobbies.ts` create route
   passes `{ creator: user }` (the session user is DB-fresh — the auth
   preHandler reloads it per request, so no staleness).
6. Update api suites that assert member arrays:
   `LobbyRepository.test.ts`, `Lobbies.test.ts` ("leave returns the view
   and version, no grants (C1.2)" asserts members — now objects; body
   keys stay exactly `["lobby", "version"]`), `Lifecycle.test.ts`,
   `RealtimeIntegration.test.ts` / `RealtimePublisher.test.ts` lobby
   fixtures (they construct domain lobbies inline).

### Step 3 — C2: view names vertical

1. `packages/domain/src/UserRepository.ts`: add
   `findManyById(ids: ReadonlyArray<UserId>) => Effect<ReadonlyArray<User>, StorageError>`
   to the port — missing ids are simply absent from the result (no
   `UserNotFound`: callers decide). Update the four stub implementations
   (`packages/application/test/support/stubs.ts`,
   `VerifySession.test.ts`, `CreateTemporaryUser.test.ts` × 2).
2. `apps/api/src/infra/user-repository.ts`: implement it as one
   `SELECT … WHERE user_id IN (…) AND deleted_at IS NULL`; extend
   `apps/api/test/UserRepository.test.ts`.
3. `packages/application/src/projection/ViewFor.ts` (tests first in
   `ViewFor.test.ts`): `viewFor(viewerId, state, names: ReadonlyMap<UserId, string>)`;
   players gain `name: names.get(p.id) ?? ""` (the empty-string arm is
   defensive totality for the same soft-deleted-user edge as step 2.5 —
   FK + `game_players` guarantee coverage in every reachable game;
   recorded here so the reviewer sees it was chosen, not overlooked).
   New sibling `projection/PlayerNames.ts`: `playerNames(state)` — an
   Effect requiring `UserRepository`, returning the map for
   `state.players`. Export both from the package index.
4. `packages/contracts/src/GameView.ts`: `ViewPlayer` gains `name` (C2);
   contracts schema test pins it.
5. Route composition: in `lobbies.ts` (start) and `games.ts` (commands,
   view), the route effect becomes use-case-result `Effect.flatMap`
   `playerNames(state)`, and `onSuccess` builds
   `viewFor(user.id, state, names)`. `StorageError` from the lookup is
   already mapped to 500 by both status functions. The 404-before-names
   ordering in GET view is preserved: membership is checked on `state`
   before any response is built (names of a game you cannot see are
   never fetched — no behavior change to the no-existence-leak rule).
6. `packages/application/test/AdversarialProjection.test.ts`: thread a
   names fixture through the sweep and add the C2 half-invariant — every
   viewer's projection carries **identical** name fields (names are
   public; the sweep's job is proving the new field leaks nothing and
   varies for no one). `EndToEndGame.test.ts` and `GameCommands.test.ts`
   pick up names via their recompute-and-compare structure.

### Step 4 — C5 + B1–B3: `GET /lobbies/:gameId`

1. `Responses.ts`: extend `LobbyResponse`'s doc comment to name the GET
   endpoint (C5 — the `{ lobby, version, grants }` schema already
   exists and is reused; a distinct alias export was rejected as a
   second name for the same frozen shape).
2. New route in `lobbies.ts`, following the GET-view pattern in
   `games.ts` (read path, no actor — the row is the materialized
   authority): `requireSession` → decode `gameId`
   (`Either.isLeft` → 400 `errorBody(400)`, before any effect — B3) →
   `games.loadLobby` → in `onSuccess`, refuse with
   `typedErrorBody(404, { _tag: "GameNotFound" })` when
   `lobby.status !== "open"` **or** the caller is not a member; else 200
   `encodeLobbyResponse` with `lobbyView(lobby)`, `version`, and
   `grantsFor(topicSecret, gameId, user.id)` (own grants only — B1).
   The unknown-id path is `loadLobby`'s typed `GameNotFound` through
   `lobbyErrorStatus` — the same `typedErrorBody` construction, which is
   what makes the three 404s byte-identical (B2), exactly as
   `GameCommands.test.ts` pins for GET view ("a non-participant gets a
   404 body identical to an unknown game — no existence leak").
3. New `describe` in `Lobbies.test.ts` covering: member 200 with body
   keys exactly `["grants", "version", "lobby"]`-sorted and own-grants
   isolation (mirroring "join returns the joiner's grants; one player's
   response never carries another's private topic (C4.4)"); the
   byte-identical trio of 404s (non-member vs unknown id vs
   started/abandoned — compare raw bodies); malformed uuid 400 with an
   empty publisher journal; 401 without a session.

### Step 5 — B4/B5 closure

1. **B5:** extend `EndToEndGame.test.ts` ("plays a full game over HTTP;
   every reply and published payload is leak-free") to assert names
   end-to-end: lobby payloads carry every member's `{ id, name }` and
   every player's view names every seat identically. Fixture names stay
   ≥3 characters (probe 4).
2. **B4:** full pass over the untouched behaviors — create 201 shape,
   join grants isolation, leave without grants, start `{ view, version }`,
   409/422 taxonomy, `SlamWindow.test.ts`, `Topics.test.ts`,
   `Auth.test.ts` — green with only the payload-shape updates steps 2–3
   already made. Then the final gate and the coverage table fill-in.

## Concrete steps & validation

Prereq for api suites: `docker compose -f docker/docker-compose.yml up -d`
(Postgres on 5433 + the realtime container), and
`pnpm --filter @cambio/api migrate` if in doubt.

Per step (run through turbo so workspace deps rebuild first):

```bash
pnpm turbo test --filter @cambio/contracts     # step 1+ (new harness)
pnpm turbo test --filter @cambio/domain        # step 2
pnpm turbo test --filter @cambio/application   # steps 1–3
pnpm turbo test --filter @cambio/api           # steps 1–5
```

Iterating on one suite after a build: bare `vitest run <file>` inside the
package is fine. Success signals: every suite named in the step green; the
adversarial sweep (`AdversarialProjection.test.ts`) and both realtime
suites are the canaries — a red there is a projection or payload-shape
regression, not a flake.

Final gate, run bare — never piped (the PreToolUse hook enforces this):

```bash
pnpm turbo build typecheck lint test
```

## Contract coverage

_(maintained by `/implement`, verified by `/review`: one row per root-plan
contract clause this side owns. **Plan-time rows carry only the clause and
a planned approach**; test file, name, and assertion phrase are written by
`/implement` as each test lands — planned approaches name suites to
extend, never invented test titles.)_

| Clause | Test (file + name)                                                                                                                                                                          | What is asserted |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| C1     | _planned:_ contracts schema test (new `packages/contracts/test/`) + extended member assertions in `apps/api/test/Lobbies.test.ts` and `LobbyRepository.test.ts`                             | _(pending)_      |
| C2     | _planned:_ contracts schema test + extended `packages/application/test/ViewFor.test.ts` structure coverage; identical-for-every-viewer via `AdversarialProjection.test.ts`                  | _(pending)_      |
| C3     | _planned:_ contracts schema test (tag + version + round-trip + bare-payload rejection) + updated publishLobby expectations in `RealtimePublisher.test.ts` and `RealtimeIntegration.test.ts` | _(pending)_      |
| C4     | _planned:_ `ViewFor.test.ts` sources config from state; equals-started-with pinned via the `slamWindowMs` override already used by `apps/api/test/Lobbies.test.ts` start coverage           | _(pending)_      |
| C5     | _planned:_ decode of the GET-lobby 200 body through `LobbyResponse` in the new `Lobbies.test.ts` describe                                                                                   | _(pending)_      |
| B1     | _planned:_ new GET describe in `Lobbies.test.ts` — member 200, exact body keys, own-grants isolation mirroring the join-grants test                                                         | _(pending)_      |
| B2     | _planned:_ same describe — raw-body equality across non-member / unknown-id / non-open 404s                                                                                                 | _(pending)_      |
| B3     | _planned:_ same describe — malformed uuid 400 with empty publisher journal, patterned on the existing C1.8 test                                                                             | _(pending)_      |
| B4     | _planned:_ existing suites stay green with shape-only updates (`Lobbies`, `GameCommands`, `EndToEndGame`, `SlamWindow`, `Auth`, `Topics`); no behavioral edits                              | _(pending)_      |
| B5     | _planned:_ extended `EndToEndGame.test.ts` full-HTTP flow asserting names in lobby payloads and every player's view                                                                         | _(pending)_      |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [ ] 2026-09-05 — backend child plan written; awaiting `/implement`

## Surprises & notes for the root plan

- **C4 mechanism resolved (root plan asked):** config **is** persisted
  with the game (`GameState.config` → `games.config` jsonb), so
  `slamWindowMs` is exposed on `PlayerGameView` from state inside
  `viewFor` — the value equals what the game was started with by
  construction; no env-stable assumption needed, none documented.
- **C5 needs no new schema:** the GET endpoint's `{ lobby, version,
grants }` is exactly `LobbyResponse`; the clause is satisfied by reuse
  plus the decode pin, not a new export.
- `packages/contracts` had no test runner; M1's "schema tests" require
  adding a vitest harness there (step 1.1) — small, but it is new
  test infrastructure the root plan didn't call out.
- The `LEFT JOIN`-with-`COALESCE` treatment of soft-deleted users in
  `loadLobby` (and the `?? ""` fallback in `viewFor`) is a deliberate
  totality decision, flagged for the reviewer in steps 2.5 / 3.3.
- The api leak scanner matches whole strings, so player names cannot
  false-positive unless a fixture name is literally a card slug — fixture
  names stay ≥3 characters.
- Env half of W3: backend contributes documentation only (probe 6);
  `.env.example` / `turbo.json` `VITE_*` additions belong to the frontend
  child plan — this side must not edit them, avoiding a shared-file
  collision.
- **Reconciliation (root-plan owner, 2026-09-05):** `LobbyUpdated` gained
  `version` after the frontend plan flagged the bootstrap-vs-broadcast
  staleness race; the publisher port ripple (probe 3's
  "signatures unchanged" claim for the lobby path) is accepted and
  scoped in step 1.3.
