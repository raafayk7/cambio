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
| C1     | `LobbyView.members: Array({ id: Uuid, name: String })` (name constrained by the shared `DisplayName` schema — amended in the review fix cycle, F4: the plan-time claim "1–32 by construction, plain Schema.String" became false once `"—"` fallbacks and wire validation landed)                                                                                                                     |
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

| Clause | Test (file + name)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | What is asserted                                                                                                                                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1     | `packages/contracts/test/GameView.test.ts` — "members are {id, name} objects and round-trip", "rejects the pre-C1 bare-uuid member array — regression pin"; `packages/domain/test/Lobby.test.ts` — "appends members, preserving join order (C1)", "joining twice is AlreadyInLobby — membership is by id, not by name", "any current member gets back the member IDS as the seat order — dealGame consumers stay id-typed"; `apps/api/test/Lobbies.test.ts` — "creates a lobby: 201 with the lobby view, version, and the caller's grants"; `apps/api/test/LobbyRepository.test.ts` — "lifecycle round-trips: create → join ×2 → leave → abandon, rows compacted (13a)"                                                                                                                                                                       | `LobbyView.members` is `{id, name}`; domain membership/refusals key on id; the wire carries display names end to end; `loadLobby` re-joins names from `users`                                                                   |
| C2     | `packages/contracts/test/GameView.test.ts` — "every player carries a name and the view round-trips", "rejects a player without a name — regression pin for the pre-C2 shape"; `packages/application/test/ViewFor.test.ts` — "every player carries their public name, identical in every viewer's projection (C2)", "a player missing from the names map gets an empty-string name — defensive totality (C2)"; `packages/application/test/AdversarialProjection.test.ts` — "no player's view at any step contains an unentitled value; event projections stay channel-clean" (names threaded, identical-per-viewer invariant); `apps/api/test/UserRepository.test.ts` — "findManyById returns present users; missing and soft-deleted ids are simply absent (C2)", "findManyById of an empty id list is an empty result, no query needed (C2)" | `ViewPlayer.name` is on the wire; every viewer sees identical names; the batch lookup filters soft-deletes and omits missing ids; `?? ""` totality pinned                                                                       |
| C3     | `packages/contracts/test/GameEvents.test.ts` — "round-trips through decode/encode", "the \_tag literal is fixed to LobbyUpdated", "rejects the pre-C3 bare-LobbyView payload (no \_tag, no version) — regression pin", "rejects a payload missing the version"; `apps/api/test/RealtimePublisher.test.ts` — "publishes the public lobby view on the room topic"; `apps/api/test/RealtimeIntegration.test.ts` — "publishLobby lands the public lobby view on the room topic"                                                                                                                                                                                                                                                                                                                                                                   | LobbyUpdated is a tagged struct carrying `{lobby, version}`; the published payload's event name equals `_tag`; the old bare-LobbyView shape no longer decodes                                                                   |
| C4     | `packages/application/test/ViewFor.test.ts` — "exposes config.slamWindowMs from the state it received — the started-with value (C4)"; `packages/contracts/test/GameView.test.ts` — "carries the started-with slamWindowMs and round-trips", "rejects a view without config — the field is required, not optional"; `apps/api/test/Lobbies.test.ts` — "assembles GameConfig from AppConfig — the override lands in the persisted game"                                                                                                                                                                                                                                                                                                                                                                                                         | `viewFor` fills `config` from `state.config` for every viewer; the started view over HTTP reports the 7777 override the game was started with                                                                                   |
| C5     | `apps/api/test/Lobbies.test.ts` — "a member gets 200 {lobby, version, grants} — own grants only, decodable through LobbyResponse (B1, C5)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | GET-lobby 200 body decodes through the reused `LobbyResponse` schema — no new export                                                                                                                                            |
| B1     | `apps/api/test/Lobbies.test.ts` — "a member gets 200 {lobby, version, grants} — own grants only, decodable through LobbyResponse (B1, C5)" and "401 without a session (B1's auth edge)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | member 200 with exactly `{grants, version, lobby}` keys, grants match the join reply's, another member's private topic absent, 401 unauthenticated                                                                              |
| B2     | `apps/api/test/Lobbies.test.ts` — "404s byte-identically for non-members, unknown ids, started and abandoned lobbies (B2)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | raw `res.body` string equality across all four 404 causes — no existence leak down to the byte                                                                                                                                  |
| B3     | `apps/api/test/Lobbies.test.ts` — "malformed :gameId is a 400 before any effect — empty publisher journal (B3)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 400 contract body, publisher journal empty — refused before any effect                                                                                                                                                          |
| B4     | full backend suites through turbo — `Lobbies.test.ts`, `GameCommands.test.ts`, `EndToEndGame.test.ts`, `SlamWindow.test.ts`, `Auth.test.ts`, `Topics.test.ts`, `Lifecycle.test.ts`, `RoundTrip.test.ts` and the rest (api 118, application 86, domain 194, contracts 10)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | every pre-existing behavior green with payload-shape-only updates; no route/status/taxonomy behavior changed                                                                                                                    |
| B5     | `apps/api/test/EndToEndGame.test.ts` — "plays a full game over HTTP; every reply and published payload is leak-free" (extended)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | every create/join lobby publish carries each member's `{id, name}`; the pre-start membership names both players; each player's GET-view snapshot names every seat identically; fixture names ≥3 chars per the leak-scanner note |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [ ] 2026-09-05 — backend child plan written; awaiting `/implement`
- [x] 2026-09-05 — Step 1 done: contracts vitest harness (`vitest.config.ts`,
      `test/` included in `tsconfig.json`), `LobbyUpdated` tagged struct +
      helpers in `GameEvents.ts` (schema tests green), `publishLobby` port
      gained the `version` argument (port, three lobby use cases, both stub
      publishers, SlamTiming's hooked publisher, live adapter now sends the
      tagged payload with event name = `_tag`), C4 landed TDD-first
      (`ViewFor.test.ts` red → `PlayerGameView.config` + `viewFor` fill →
      green; contracts pin + Lobbies 7777 pin). Suites: contracts 6,
      application 84, api 112 — all green through turbo.
- [x] 2026-09-05 — Step 2 done (C1 vertical): domain TDD
      (`Lobby.test.ts` rewritten to `User` members, red 5 → green),
      `Lobby.members: Schema.Array(User)` with id-keyed transitions and
      `startSeats` returning ids; new `user(n)` fixture in
      `@cambio/domain/testing` (name matches `ensureRosterUsers`);
      `LobbyView.members` is `{id, name}` (`LobbyMember` schema + pins);
      `CreateLobby` takes `{creator: User}`, `JoinLobby` feeds its lookup
      into the transition, `lobbyView` maps names through; stub repo derives
      deterministic started-lobby names; `loadLobby` LEFT JOINs `users` with
      `COALESCE(user_name,'')`, `saveLobby` writes ids only; create route
      passes the session user. Suites: domain 194, application 84, api 112 —
      green.
- [x] 2026-09-05 — Step 3 done (C2 vertical): `UserRepository.findManyById`
      port + four stub updates; api adapter one `IN` query
      (`sql.in("user_id", ids)`, empty-list short-circuit) with two new
      `UserRepository.test.ts` pins; TDD on `ViewFor.test.ts` (3 red name
      tests → green) — `viewFor(viewerId, state, names)` with the `?? ""`
      totality arm; new `projection/PlayerNames.ts` (`playerNames(state)`),
      exported from the index; `ViewPlayer.name` in contracts + pins; the
      three route sites compose `playerNames` (GET view keeps
      404-before-names via a `names: null` marker decided on `state` before
      any lookup); adversarial sweep threads names and asserts the
      identical-per-viewer invariant; `setupGame` returns `nameById` and
      SlamWindow/EndToEndGame/GameCommands recompute `viewFor` with it.
      Suites: contracts 10, domain 194, application 86, api 114 — green.
- [x] 2026-09-05 — Step 4 done (C5 + B1–B3): `GET /lobbies/:gameId` in
      `lobbies.ts` — read path composing `GameRepository.loadLobby` directly
      (no actor, the GET-view precedent), member-of-open 200 reusing
      `encodeLobbyResponse` with own grants, the typed GameNotFound 404
      body via `typedErrorBody` for non-member/non-open, 400-before-effect on
      malformed uuid; `LobbyResponse` doc comment names the GET (C5 by
      reuse). New `Lobbies.test.ts` describe: member 200 + LobbyResponse
      decode + grants isolation, byte-identical 404 quartet (non-member /
      unknown / started / abandoned — raw-body equality), malformed-uuid
      400 with empty journal, 401. api suite 118 — green.
- [x] 2026-09-05 — Step 5 done (B4/B5 closure): `setupGame` snapshots the
      create/join lobby publishes before its journal clear and returns
      them; `EndToEndGame.test.ts` asserts every lobby publish carries
      `{id, name}` members, the pre-start membership names both players,
      and each player's GET-view snapshot names every seat identically
      (fixture names ≥3 chars per the leak-scanner note). Closing gate:
      `build typecheck test` filtered to the four backend packages — 12/12
      tasks green (contracts 10, domain 194, application 86, api 118);
      per-package `eslint .` green for all four. The `lint` turbo task's
      repo-wide `//#format:check` dependency fails ONLY on
      `packages/ui/src/components/app-shell.tsx` — the frontend lane's
      in-flight file, outside this lane's boundary (see Surprises).
- [x] 2026-09-05 18:45 — fix cycle (review findings F4–F9, backend lane):
  - **F6** — `User` entity extracted to `packages/domain/src/User.ts`
    (out of the port file, per architecture skill file-placement);
    `UserRepository.ts` re-exports it and `Lobby.ts` imports from
    `User.js`, so the Lobby → UserRepository → GameRepository → Lobby
    module cycle no longer exists. Both statement-form `import type`
    workarounds reverted to the repo's inline `{ type X }` style and the
    stale cycle comments deleted; `User.js` added to the domain index.
  - **F4** — shared `DisplayName` schema (Trim + min 1 + max 32) added to
    `contracts/GamePrimitives.ts`; reused by `CreateUserRequest`,
    `SessionUser`, `ViewPlayer.name`, `LobbyMember.name`. The
    vanished-user fallback is now the loud-but-valid literal `"—"`
    (decodes under `DisplayName`, where `""` would not) in both
    producers: the `viewFor` totality arm and `loadLobby`'s COALESCE;
    the false "1–32 by construction" docstring in `GameView.ts`
    rewritten; the `ViewFor.test.ts` pin updated from `""` to `"—"`.
  - **F5** — `viewForEffect(viewerId, state)` added to `ViewFor.ts`
    (requires `UserRepository`; composes `playerNames` + the pure
    `viewFor`, which stays exported as the test seam). The three route
    composition sites (commands, GET view, start) now call it — no
    per-handler names-map assembly remains.
  - **F7** — GET view's null-sentinel + double-cast branch dissolved: a
    non-participant now fails with the same typed `GameNotFound` the
    unknown-game path produces, mapped by the existing `statusOf` route
    to the byte-identical 404 (pin still green); membership is still
    decided on `state` before any name lookup.
  - **F8** — `WireGameConfig` (positive `slamWindowMs`) extracted to
    `GamePrimitives.ts`, used by both `GameStarted.config` and
    `PlayerGameView.config`; new contracts pin rejects 0 and negatives
    (contracts suite 10 → 11).
  - **F9** — Create/Join/LeaveLobby suites now assert the recorded
    `publishLobby` journal entry's `version` equals the use case
    result's version (with the result version pinned absolutely), so a
    `newVersion`→`version` swap in any lobby use case's publish or
    return fails a test.
  - Gate: forced `turbo test` for the four backend packages green
    (contracts 11, domain 194, application 86, api 118);
    `build typecheck lint` — all 8 package tasks green; the repo-wide
    `//#format:check` fails only on `design-system/references/tokens.md`,
    an orchestrator-lane file outside this fix cycle's boundary.

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
- **Module cycle surprise (step 2):** importing `User` into `Lobby.ts`
  closed a runtime cycle Lobby → UserRepository → GameRepository → Lobby
  (with `verbatimModuleSyntax`, inline `{ type X }` imports keep a runtime
  side-effect import), evaluating `Schema.Array(User)` before `User`
  existed — 18 domain suites failed with `Cannot read properties of
undefined (reading 'ast')`. Fixed by converting the two type-only edges
  (`GameRepository.ts` → Lobby, `UserRepository.ts` → GameRepository) to
  `import type` statements, which are fully elided; commented in both files.
- **Cross-lane format:check collision (step 5):** the `lint` turbo task
  depends on the repo-wide `//#format:check`, which is unfilterable — it
  fails on `packages/ui/src/components/app-shell.tsx` while the frontend
  lane edits it concurrently. Backend eslint was verified per package
  (`pnpm --filter <pkg> lint`, all four green); the orchestrator's final
  unfiltered gate after both lanes merge is the authoritative lint pass.
- **Type-only import style matters for lint too (step 5):** after the C1
  change, `UserId` in `Lobby.ts` became type-only and
  `@typescript-eslint/consistent-type-imports` required the inline `type`
  marker — the mirror image of the module-cycle fix above, which required
  the statement form. Rule of thumb recorded: statement-form `import type`
  when breaking a runtime edge, inline `{ type X }` otherwise.
- **Reconciliation (root-plan owner, 2026-09-05):** `LobbyUpdated` gained
  `version` after the frontend plan flagged the bootstrap-vs-broadcast
  staleness race; the publisher port ripple (probe 3's
  "signatures unchanged" claim for the lobby path) is accepted and
  scoped in step 1.3.
