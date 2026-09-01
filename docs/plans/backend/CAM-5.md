# CAM-5 — Application use cases + per-room command queue (backend)

- **Root plan:** [root/CAM-5.md](../root/CAM-5.md) — the functional contract
  (clauses 1–13) lives there; this document is implementation detail for the
  backend side.
- **ADRs:** [0019](../../adr/0019-lobby-pure-domain-model-row-backed-persistence.md)
  (lobby is a pure domain model outside the engine, persisted as rows via
  `GameRepository` lobby methods; the event log never contains lobby history),
  [0020](../../adr/0020-room-actor-queue-deferred-replies-cached-state.md)
  (room actor: per-room queue with `Deferred` replies, cached state,
  surface-and-invalidate on `VersionConflict`, evict on end, timer as
  optimization only).

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

Work spans `packages/domain`, `packages/application`, and `apps/api`.
Governing skills per area: **effect-domain-modeling** (M1 — the `Lobby`
model is domain work: test-first, branded schemas, `Data.TaggedError` with
one error per caller reaction, field-less errors omit the generic;
docstrings cite §1/§4 provenance), **application-layer** (M2/M4/M5 — ports
as `Context.Tag` classes tagged `"@cambio/application/XxxPort"`, use cases
as exported functions with explicit `Effect` return annotations, the §6
queue discipline, stub-layer testing), **infrastructure-persistence** (M3 —
never edit an applied migration, partial unique indexes, `deleted_at IS
NULL` filtering only in the repository layer, codec boundary, typed
`StorageError` never throws), **architecture** (throughout — the lobby
repository methods belong on the _domain_ port, seed/publisher are
_technical_ ports in `application/src/ports/`; enforcement claims must be
probe-verified), **cambio-rules** (the slam-race and slam-window tests must
assert what the engine actually returns, never a prior about how other
Cambio variants resolve races), **hidden-information** (nothing in CAM-5
sends anything to a client, but `RealtimePublisherPort` carries full
`GameState` — its doc comment must state that the CAM-6 adapter applies
`viewFor` before anything leaves the server; the port itself is server-side
plumbing only).

The surfaces this task touches, as they exist today:

- **Engine entry points (CAM-1/2, untouched by this task):**
  `applyCommand(state, command, now)` (`packages/domain/src/Engine.ts:327`)
  returns `Either<readonly [GameState, GameEvent[]], GameError>` — legality
  is checked first, an illegal command is a `Left` with state untouched, and
  a legal command's events are a **whole batch** (e.g. `HeldSwapped` +
  `SlamWindowOpened` together). `dealGame(players, seed, config, now)`
  (`src/Deal.ts:16-62`) enforces 2–5 players (`BadPlayerCount`), emits
  exactly one `GameStarted`, and takes the seed as a plain number — the
  domain has no entropy. `GameState` (`src/GameState.ts:54-61`) is
  `{ players, deck, discard, prng, phase, config }` — **no `gameId`, no
  lobby fields**; the `Phase` union (`src/Phase.ts:68-75`) has **no lobby
  variant** (ADR-0019 keeps it that way).
- **Slam-window legality (drives the actor design):** `Slam` is illegal
  once `now >= closesAt` (`SlamTooLate`, `src/Legality.ts:191-193`);
  `CloseSlamWindow` is illegal while `now < closesAt` (`WindowStillOpen`,
  `Legality.ts:219-224`) and deliberately carries no `playerId` (the
  actor's timer fiber is a legitimate issuer). Critically, **every other
  command during `SlamWindow` is wrong-phase-illegal even after
  `closesAt`** — the engine never auto-closes the window, so the lazy close
  path of clause 11 must be the actor's doing (decision 11 below).
- **Persistence (CAM-3, the gap ADR-0019 closes):** `GameRepository`
  (`packages/domain/src/GameRepository.ts`) has `save` (one version-guarded
  transaction, `expectedVersion === 0` inserts, returns the new
  `GameVersion`), `load`, `getEvents`, with errors
  `GameNotFound`/`VersionConflict{gameId,expected,actual}`/`StorageError`.
  The adapter (`apps/api/src/infra/game-repository.ts`) derives `status` as
  `in_progress`/`completed` only (`:124`) — `'lobby'`/`'abandoned'` are
  unwritable; `games.phase`/`discard_pile`/`prng`/`config` are NOT NULL
  (`apps/api/migrations/0002_cambio_schema.sql:34-45`); nothing adds or
  removes players pre-deal, and the `game_players` upsert never soft-deletes
  a row (`:167-177`). Event seq numbering is `COALESCE(MAX(seq)+1, 0)`
  under the `games` row lock (`:206-210`) — the `save` path StartGame rides
  reuses all of this unchanged. `foldEvents` (`src/Fold.ts:328-357` region;
  contract in the module docstring at `Fold.ts:7-22`) requires
  whole-command prefixes with `GameStarted` first (`MissingGameStarted`
  otherwise) — which holds after StartGame precisely because lobby history
  never enters `game_events` (ADR-0019): seq 0 is always `GameStarted` even
  though `games.version` is already past the lobby's mutations.
- **Users:** `UserRepository` (`packages/domain/src/UserRepository.ts:20-25`)
  has `create` and `findById` only; `game_players.user_id` FKs to `users`,
  so JoinLobby validates existence via `findById` (decision 9 — N calls at
  ≤5 members is fine).
- **Application idioms (CAM-4, the pattern to copy):** ports are
  `Context.Tag` classes with tag string `"@cambio/application/XxxPort"`,
  regression-tested via `Tag.key` in `packages/application/test/Ports.test.ts:9`.
  Use cases are exported arrows `(input) => Effect<Result, ErrorUnion,
PortUnion>` with the return type written out, `Effect.gen` bodies, ports
  `yield*`'d at the top, use-case-local errors declared in the use-case
  file, everything re-exported from `src/index.ts` —
  `src/use-cases/CreateTemporaryUser.ts` is the reference. Tests are
  `@effect/vitest` `it.effect` suites on stub layers: `Layer.succeed` with
  unused members as `Effect.die("… unused in this suite")`, recording stubs
  returning `{ collected, layer }`, failure assertions via `Effect.either`
  - `_tag` (`test/CreateTemporaryUser.test.ts` is the model).
- **Concurrency precedent: none.** No `Queue`/`Deferred`/`Fiber`/`Ref`
  usage exists anywhere in the repo (the single `acquireRelease` in
  `apps/api/src/index.ts:26-38` is it). Whatever M5 writes becomes the
  repo's template (ADR-0020 says so explicitly) — favor the plainest
  spelling of each idiom. `effect` is exact-pinned at **3.22.1**;
  `Queue`, `Deferred`, `Fiber`, `Ref`, `TestClock` all ship in it, so
  **no dependency changes** anywhere in this task.
- **Test clock:** `packages/application/vitest.config.ts` has no
  fake-timer setup and needs none — `@effect/vitest`'s `it.effect` already
  runs on the test runtime whose `TestClock` controls `Effect.sleep`.
  Decision 14 pairs that with a `Ref`-backed settable `ClockPort` stub for
  authority time.
- **Boundaries:** `packages/application/src` may import `@cambio/domain`,
  `@cambio/contracts`, `effect` only (`packages/config/eslint.base.js:126-130`
  — since the CAM-12 fix this covers Node builtins too); `test/**` is
  exempt from effect-only, so `@cambio/domain/testing` fixtures
  (`uid`/`slot`/`ts`/`card`, ADR-0016) and `@effect/vitest` are fine in
  tests. A full-game drive of the CAM-2 harness through the queue stack is
  explicitly **out** of this task's test bar (root Decision Log).
- **apps/api test conventions:** suites run serially
  (`fileParallelism: false`) over the Docker Postgres test database;
  `test/support/db.ts` exports `TestLayer`/`makeTestRuntime()` (one
  `ManagedRuntime` per suite file, disposed in `afterAll`) — the new
  integration suite plugs straight into it. **`test/Migrations.test.ts:63`
  hardcodes the applied-migrations list**
  `["0001_init.sql", "0002_cambio_schema.sql"]` — migration `0003` breaks
  it; step 3.1 extends it in the same commit.
- **Not in scope:** `packages/contracts` (untouched — root Decision Log),
  HTTP routes and `apps/api/src/presentation/**` (CAM-6 extends the
  `errors.ts` mapping, not us), realtime/seed live adapters and any
  `runtime.ts`/env/turbo change (decision 15), mid-game leave/abandon
  (root Decision Log — no engine change of any kind).
- **Toolchain:** if `pnpm` is missing from PATH:
  `source ~/.nvm/nvm.sh && nvm use 22`. Postgres:
  `docker compose -f docker/docker-compose.yml up -d` (host port 5433).

### Decisions this plan makes (open details the root plan left to the child)

Recorded here so `/implement` doesn't re-litigate; candidates for the root
Decision Log are flagged in Surprises as they're confirmed.

1. **Domain `Lobby` shape.** A `Schema.Struct`:
   `{ id: GameId, members: ReadonlyArray<UserId>, status: LobbyStatus }`
   with `LobbyStatus = Schema.Literal("open", "abandoned", "started")`.
   `members` is join order and _is_ the eventual seat order (§4.5
   contiguous-from-0 holds by construction, ADR-0019). `"started"` is a
   read-only projection — `loadLobby` maps an
   `in_progress`/`completed` row to it so join/leave/start refusals stay
   pure domain decisions; `saveLobby` never writes it (guard in the
   adapter).
2. **Lobby error vocabulary** — one per caller reaction
   (effect-domain-modeling): `LobbyFull` (field-less), `AlreadyInLobby`
   `{ userId }`, `NotInLobby` `{ userId }`, `LobbyNotJoinable`
   `{ status: LobbyStatus }` (covers join/leave/start against an
   abandoned or started lobby). The under-2-members start failure is **not**
   a lobby error — `dealGame`'s `BadPlayerCount` already owns it and the
   lobby model does not duplicate the check (single source of legality).
3. **Port method set: exactly two new members on `GameRepository`** —
   `saveLobby` (with `expectedVersion === 0` meaning insert, exactly like
   `save`; no separate `createLobby` method) and `loadLobby`. Both reuse
   the existing error vocabulary (`GameNotFound`, `VersionConflict`,
   `StorageError`) — no new persistence errors.
4. **Lobby membership lives in `game_players` with
   `seat_index` = position in join order, compacted on every leave.** The
   adapter diffs `lobby.members` against the live rows: soft-deletes
   absentees, upserts each member at its position, **updating in ascending
   position order** — leaves only ever shift indices downward into
   just-vacated (soft-deleted, hence invisible to the partial unique index)
   slots, so sequential single-row updates never transiently collide with
   `game_players_seat_key`. StartGame's seats are then the live rows by
   construction and the existing `save` upsert needs no change.
5. **Migration `0003` mechanics:** `ALTER TABLE games` drops NOT NULL on
   `phase`, `discard_pile`, `prng`, `config`, then adds one named CHECK
   requiring all four non-null unless `status IN ('lobby','abandoned')` —
   in-game rows stay exactly as strict as CAM-3 left them (ADR-0019
   consequence). `0002` is not touched; per the infrastructure-persistence
   rule, `0003`'s header comment also carries the standing correction to
   `0002`'s stale `actor_id` comment (`GameStarted` is null-actor too, per
   the shipped `actorOf`).
6. **`load`/`getEvents` treat undealt rows as `GameNotFound`.** After
   `0003`, a `status = 'lobby'`/`'abandoned'` row has NULL `phase`; letting
   `load` decode it would surface a misleading `StorageError`
   (corrupt-row semantics). The adapter guards: a row that has never been
   dealt is not a loadable game.
7. **Seed port:** `SeedPort`, tag `"@cambio/application/SeedPort"`, one
   member `nextSeed: Effect.Effect<number>` — infallible, like
   `IdGeneratorPort`. Separate from id generation because entropy and
   identity are different capabilities (root Decision Log). No live adapter
   in CAM-5 (decision 15).
8. **Publisher port:** `RealtimePublisherPort`, tag
   `"@cambio/application/RealtimePublisherPort"`, two members:
   `publishGame(gameId, state, events)` (the root Decision Log's advisory
   shape — the CAM-6 adapter builds `viewFor` projections from the
   post-command state without reloading) and `publishLobby(gameId, lobby)`
   for lobby mutations. Both return `Effect.Effect<void>` with **no error
   channel**: a persisted command must never fail because realtime
   hiccupped; delivery failure handling is the CAM-6 adapter's concern.
9. **JoinLobby validates user existence via `UserRepository.findById`**
   (typed `UserNotFound`), rather than letting the `game_players` FK
   explode into an untyped-cause `StorageError` at save time.
10. **`executeGameCommand` takes an optional `cached: { state, version }`.**
    Absent ⇒ the use case loads (clause 5's load → apply → save → publish
    sequence, and what any non-actor caller gets). Present — the actor's
    path — ⇒ the load is skipped and nothing else changes. This keeps
    ADR-0020's "use cases remain plain functions / serialization is the
    actor's concern" split without making the cache vestigial. On
    `VersionConflict` the actor completes the caller's `Deferred` with the
    conflict unchanged and drops its cache so the next envelope reloads
    (clause 6); the use case itself never retries.
11. **Lazy slam-close is the actor's job.** Because the engine treats every
    non-`Slam`/`CloseSlamWindow` command during `SlamWindow` as wrong-phase
    even after `closesAt` (see Context), the actor — before running a
    queued envelope while its cached phase is `SlamWindow` with
    `ClockPort.now >= closesAt` — first executes a `CloseSlamWindow`
    through the same use case (its own persisted + published batch), then
    the envelope. The timer fiber merely enqueues that same close earlier.
    A close that turns out illegal when processed (window already closed by
    the other path, game moved on) is dropped silently: internal enqueue,
    no `Deferred` to complete, nothing persisted or published (clause 5's
    illegal-command promise makes this automatic).
12. **The registry serializes lobby mutations too.** Join/leave/start ride
    the same per-room queue as game commands — that is how
    abandoned-lobby eviction (clause 10) is observed at the single place
    that owns the room, and how a join racing a start is deterministic.
    CreateLobby does not touch the registry (no room exists yet — the
    first join/start lazily creates the actor).
13. **Eviction + timer lifecycle:** after each processed envelope the actor
    inspects the outcome — new game phase `Ended`, or lobby `status`
    `"abandoned"` ⇒ the actor removes its registry entry, interrupts any
    pending timer fiber, and shuts its queue. A later message for that room
    finds no entry, gets a fresh actor whose bootstrap reads rows/state and
    whose reply is the appropriate typed error, not a crash. The timer
    fiber is forked when (and only when) a save leaves the game in
    `SlamWindow`, sleeps `closesAt − now` via `Effect.sleep`, and is
    interrupted whenever the phase moves off `SlamWindow` or the actor is
    evicted.
14. **Test clock approach (the root-plan open point):** two clocks,
    deliberately. `Effect.sleep` in the timer fiber is governed by the test
    runtime's `TestClock` (`it.effect` provides it; no vitest config
    change) — _timers suppressed_ = never advance the `TestClock`, _timer
    path_ = `TestClock.adjust` past the sleep. Authority time (what the
    engine sees as `now`) comes from a `Ref`-backed settable `ClockPort`
    stub in `test/support/stubs.ts` — the lazy-close test sets the `Ref`
    past `closesAt` without touching the `TestClock`. This mirrors
    production, where the runtime clock drives sleeps and `ClockPort` is
    the authority (§6: the process may have been asleep when the timer
    should have fired).
15. **No wiring, dependency, or env changes.** No new packages (all
    concurrency primitives ship in effect 3.22.1); `apps/api/src/runtime.ts`
    (`AppServices`), `turbo.json`, `.env.example` untouched — `SeedPort`,
    `RealtimePublisherPort`, and `RoomRegistry` get live adapters/wiring in
    CAM-6 where routes first need them (root Decision Log defers
    `SLAM_WINDOW_MS` plumbing there too). CAM-5's only api-side runtime
    surface is the repository adapter, exercised through
    `test/support/db.ts`'s existing `TestLayer`.

## Module layout

New/changed files in `packages/domain`:

| File                           | Exports                                                                                                                                                                        | Job                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/Lobby.ts` (new)           | `Lobby`, `LobbyStatus` (+ types), `MAX_LOBBY_MEMBERS`, `createLobby`, `joinLobby`, `leaveLobby`, `startSeats`, `LobbyFull`, `AlreadyInLobby`, `NotInLobby`, `LobbyNotJoinable` | ADR-0019's pure model: ordered members + status, pure transitions returning `Either`, typed errors. Engine/Phase/Fold untouched.        |
| `src/GameRepository.ts` (edit) | port gains `saveLobby`, `loadLobby`; new `SaveLobbyInput`                                                                                                                      | The ADR-0015-anticipated growth path: finer-grained access = new methods on the port, not a new repository. Errors reused (decision 3). |
| `src/index.ts` (edit)          | re-exports `./Lobby.js`                                                                                                                                                        | Barrel.                                                                                                                                 |
| `test/Lobby.test.ts` (new)     | —                                                                                                                                                                              | M1's test-first suite: transitions + typed failures (clauses 1–4's pure halves).                                                        |
| `test/Ports.test.ts` (edit)    | —                                                                                                                                                                              | Lobby error tag/field rows beside the existing repository-error rows.                                                                   |

New/changed files in `packages/application`:

| File                                                                                                                                               | Exports                                                                                                                                                                                             | Job                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/ports/Seed.ts` (new)                                                                                                                          | `SeedPort`                                                                                                                                                                                          | Decision 7. `Clock.ts` is the pattern verbatim.                                                                                                                                      |
| `src/ports/RealtimePublisher.ts` (new)                                                                                                             | `RealtimePublisherPort`                                                                                                                                                                             | Decision 8; doc comment carries the hidden-information warning (full truth in, `viewFor` before anything leaves the server — CAM-6).                                                 |
| `src/use-cases/CreateLobby.ts` (new)                                                                                                               | `createLobby` use case (+ input/result types)                                                                                                                                                       | mint `GameId` → domain `createLobby` → `saveLobby` v0 → `publishLobby` (clause 1).                                                                                                   |
| `src/use-cases/JoinLobby.ts` (new)                                                                                                                 | `joinLobby` use case                                                                                                                                                                                | `loadLobby` → `findById` (decision 9) → domain `joinLobby` → `saveLobby` at loaded version → `publishLobby` (clause 2).                                                              |
| `src/use-cases/LeaveLobby.ts` (new)                                                                                                                | `leaveLobby` use case                                                                                                                                                                               | `loadLobby` → domain `leaveLobby` (last member out ⇒ `status: "abandoned"`) → `saveLobby` → `publishLobby` (clause 3).                                                               |
| `src/use-cases/StartGame.ts` (new)                                                                                                                 | `startGame` use case                                                                                                                                                                                | `loadLobby` → domain `startSeats` → `SeedPort` + `ClockPort` → `dealGame` → **one** `save` of the full `GameStarted` batch at the lobby's version → `publishGame` (clause 4).        |
| `src/use-cases/ExecuteGameCommand.ts` (new)                                                                                                        | `executeGameCommand` (+ input, `CommandAccepted`)                                                                                                                                                   | Clause 5–7's core: (cached or loaded) → `applyCommand` lifted from `Either` → whole-batch `save` → `publishGame`; illegal ⇒ typed `GameError`, nothing persisted, nothing published. |
| `src/room/RoomRegistry.ts` (new)                                                                                                                   | `RoomRegistry` (Context.Tag), `RoomRegistryLive` (Layer), outcome types                                                                                                                             | ADR-0020: lazy per-room actors — envelope queue, `Deferred` replies, cached `{state, version}`, lazy close, timer fiber, eviction (decisions 10–13).                                 |
| `src/index.ts` (edit)                                                                                                                              | re-exports the seven new modules                                                                                                                                                                    | Barrel; the "realtime publisher port arrives with the event types it publishes" doc paragraph updated.                                                                               |
| `test/Ports.test.ts` (edit)                                                                                                                        | —                                                                                                                                                                                                   | Two new tag-key rows: `"@cambio/application/SeedPort"`, `"@cambio/application/RealtimePublisherPort"`.                                                                               |
| `test/support/stubs.ts` (new)                                                                                                                      | in-memory `GameRepository` stub (real version guards, lobby store, shared ordered call journal), settable `Ref` clock layer + setter, recording publisher, fixed `SeedPort`/`IdGeneratorPort` stubs | One home for the CAM-4-style stubs the six suites share; the journal is what pins publish-after-persist ordering. Test-only — `@cambio/domain/testing` fixtures welcome.             |
| `test/CreateLobby.test.ts`, `test/JoinLobby.test.ts`, `test/LeaveLobby.test.ts`, `test/StartGame.test.ts`, `test/ExecuteGameCommand.test.ts` (new) | —                                                                                                                                                                                                   | M4's stub-layer suites (clauses 1–7, 12).                                                                                                                                            |
| `test/RoomRegistry.test.ts` (new)                                                                                                                  | —                                                                                                                                                                                                   | M5's actor suites: slam-race determinism, restart reconstruction, eviction, timer-vs-lazy equivalence (clauses 8–11).                                                                |

New/changed files in `apps/api`:

| File                                   | Exports                                                | Job                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `migrations/0003_lobby_rows.sql` (new) | —                                                      | Decision 5: status-conditional nullability; header also corrects `0002`'s stale `actor_id` comment.                          |
| `src/infra/game-repository.ts` (edit)  | layer additionally implements `saveLobby`, `loadLobby` | Decision 4's membership diff, `'lobby'`/`'abandoned'` status writes, decision 6's undealt-row guard on `load`/`getEvents`.   |
| `test/LobbyRepository.test.ts` (new)   | —                                                      | Clause 13's integration trio: lifecycle round-trip, stale-version conflict, start-then-reconstruct.                          |
| `test/Migrations.test.ts` (edit)       | —                                                      | Applied-list assertion (`:63`) gains `0003_lobby_rows.sql`; a new introspection test pins the conditional-nullability CHECK. |

No changes to `packages/contracts`, `apps/web`, `apps/api/src/presentation`,
`apps/api/src/runtime.ts`, any `package.json`, `turbo.json`, or
`.env.example` (decision 15) — the untouched-surface sweep below enforces
this.

## Plan of work

Ordered by root-plan milestone (M6 close-out is root-level). Domain and
application work is test-first: write the suite, watch it fail, then
implement. Every step leaves the repo compiling and the touched packages'
suites green.

**Code sketches (signatures, DDL, exports) are advisory** — the coverage
table and module layout are the artifacts reconciled against as-built code.

### M1 — Domain lobby model (clauses 1–4, pure halves)

**Step 1.1 — `Lobby`, test-first.** Write
`packages/domain/test/Lobby.test.ts` (plain `it` — pure functions; fixtures
`uid` from `test/fixtures.ts`). Test intents:

- `createLobby(id, creator)` yields `{ id, members: [creator], status: "open" }`.
- `joinLobby` appends, preserving join order across several joins.
- Joining twice ⇒ `AlreadyInLobby`; joining a 5-member lobby ⇒ `LobbyFull`
  (`MAX_LOBBY_MEMBERS = 5`, §1.1's player ceiling); joining a lobby with
  status `"abandoned"` or `"started"` ⇒ `LobbyNotJoinable` carrying that
  status.
- `leaveLobby` removes the member and keeps the remainder's order; leaving
  when not a member ⇒ `NotInLobby`; the **last** member leaving yields
  `status: "abandoned"` with empty members; leave against
  `"started"`/`"abandoned"` ⇒ `LobbyNotJoinable`.
- `startSeats(lobby, starter)`: any current member gets back the members
  array (the seat order — no host concept, root Decision Log); a
  non-member ⇒ `NotInLobby`; `"started"`/`"abandoned"` ⇒
  `LobbyNotJoinable`. **No member-count check here** (decision 2) — a
  1-member lobby passes `startSeats` and fails later in `dealGame`.
- Transitions are pure: inputs are structurally unchanged after each call.

Then implement `packages/domain/src/Lobby.ts` (advisory sketch):

```ts
export const LobbyStatus = Schema.Literal("open", "abandoned", "started")
export const Lobby = Schema.Struct({
  id: GameId,
  /** Join order — and, at start, the seat order (§4.5, ADR-0019). */
  members: Schema.Array(UserId),
  status: LobbyStatus,
})

export const createLobby = (id: GameId, creator: UserId): Lobby => …
export const joinLobby = (
  lobby: Lobby,
  userId: UserId,
): Either.Either<Lobby, LobbyFull | AlreadyInLobby | LobbyNotJoinable> => …
export const leaveLobby = (
  lobby: Lobby,
  userId: UserId,
): Either.Either<Lobby, NotInLobby | LobbyNotJoinable> => …
export const startSeats = (
  lobby: Lobby,
  starter: UserId,
): Either.Either<ReadonlyArray<UserId>, NotInLobby | LobbyNotJoinable> => …
```

Docstrings cite ADR-0019 and §1.1; the module states explicitly that the
engine begins at `dealGame` and the lobby never touches `Phase`. Extend
`test/Ports.test.ts` with the error-shape rows and `src/index.ts` with the
barrel line.

Checkpoint: `pnpm --filter @cambio/domain test` green — the new suite plus
every untouched CAM-1/2/3 suite (proving the engine didn't move).

### M2 — Ports (clause 13's port half, clause 12's vocabulary)

**Step 2.1 — `GameRepository` lobby methods + adapter implementations, one
commit.** These are compile-coupled: adding members to the port interface
breaks `apps/api/src/infra/game-repository.ts`'s typecheck until the
adapter implements them, so port and adapter land together; the adapter's
new _runtime_ paths stay dormant (nothing calls them) until `0003` exists
and M3's tests exercise them — the repo compiles and stays green
throughout.

Port additions (advisory):

```ts
export interface SaveLobbyInput {
  readonly gameId: GameId
  readonly lobby: Lobby
  /** The version the caller loaded; `GameVersion 0` means first save (insert). */
  readonly expectedVersion: GameVersion
}
// on the GameRepository service interface:
readonly saveLobby: (
  input: SaveLobbyInput,
) => Effect.Effect<GameVersion, VersionConflict | StorageError>
readonly loadLobby: (
  gameId: GameId,
) => Effect.Effect<
  { readonly lobby: Lobby; readonly version: GameVersion },
  GameNotFound | StorageError
>
```

Doc comments: rows are the lobby's authority and the event log never
contains lobby history (ADR-0019); `saveLobby` refuses `status: "started"`
input (that transition is `save` with the `GameStarted` batch);
`loadLobby` projects an `in_progress`/`completed` row to
`status: "started"` with members in seat order.

Adapter implementation notes (`apps/api/src/infra/game-repository.ts`):

- `saveLobby` — one `sql.withTransaction`, the same guard shape as `save`
  step 1: insert-on-conflict-do-nothing for `expectedVersion === 0`
  (status `'lobby'`, all four relaxed columns NULL), guarded UPDATE
  otherwise (status from `lobby.status`: `"open"` → `'lobby'`,
  `"abandoned"` → `'abandoned'`); zero rows ⇒ `failConflict`. Then the
  membership diff of decision 4 (soft-delete absentees, upsert positions
  ascending). No `game_events`, `decks`, `user_cards`, or `card_peeks`
  writes — a lobby has none.
- `loadLobby` — `games` row `WHERE deleted_at IS NULL` (else
  `GameNotFound`) + live `game_players` ordered by `seat_index`; map
  status through the projection above; decode through the `Lobby` schema
  (codec boundary — raw rows never escape).
- `load`/`getEvents` — decision 6's guard: a live row whose `phase` is
  NULL (equivalently `status IN ('lobby','abandoned')` and never dealt)
  fails `GameNotFound`.

Checkpoint: `pnpm --filter @cambio/domain test` and
`pnpm --filter @cambio/api build typecheck lint` green (api tests still
pass untouched — nothing reaches the new paths yet).

**Step 2.2 — Application ports, test-first.** Extend
`packages/application/test/Ports.test.ts` with the two tag-key rows, then
implement `src/ports/Seed.ts` and `src/ports/RealtimePublisher.ts`
(advisory):

```ts
export class SeedPort extends Context.Tag("@cambio/application/SeedPort")<
  SeedPort,
  { readonly nextSeed: Effect.Effect<number> }
>() {}

export class RealtimePublisherPort extends Context.Tag("@cambio/application/RealtimePublisherPort")<
  RealtimePublisherPort,
  {
    readonly publishGame: (
      gameId: GameId,
      state: GameState,
      events: ReadonlyArray<GameEvent>,
    ) => Effect.Effect<void>
    readonly publishLobby: (gameId: GameId, lobby: Lobby) => Effect.Effect<void>
  }
>() {}
```

`Clock.ts`-style doc comments (why the port exists, impls in
`apps/api/src/infra` — arriving with CAM-6); the publisher's carries the
hidden-information warning (decision 8). Barrel updates.

**Step 2.3 — `test/support/stubs.ts`.** The shared stub kit (Module
layout): the in-memory `GameRepository` honors version guards for both
`save` and `saveLobby` (real `VersionConflict`s — the actor suites depend
on it), keeps a `Map` of games/lobbies/event-logs, and appends every
`save*`/`publish*` invocation to one ordered journal the publisher stub
shares — ordering assertions read the journal, not call counts. The
settable clock is `Ref<Timestamp>` + a `Layer` reading it + an exported
setter. Fixed `SeedPort` and sequential `IdGeneratorPort` stubs round it
out.

Checkpoint: `pnpm --filter @cambio/application test` green.

### M3 — Infra vertical (clause 13)

**Step 3.1 — Migration `0003` + ledger test update.** Create
`apps/api/migrations/0003_lobby_rows.sql` (advisory DDL):

```sql
-- 0003_lobby_rows
--
-- ADR-0019: lobbies are games rows (status 'lobby'), so the four columns
-- that presume a dealt game become nullable — but ONLY for undealt rows:
-- the CHECK keeps CAM-3's strictness for in-progress/completed games.
-- (Correction to 0002's actor_id comment, per the infrastructure skill's
-- never-edit-applied rule: GameStarted rows are also null-actor — the
-- deal is system-driven; see actorOf in src/infra/game-repository.ts.)

ALTER TABLE games
  ALTER COLUMN phase DROP NOT NULL,
  ALTER COLUMN discard_pile DROP NOT NULL,
  ALTER COLUMN prng DROP NOT NULL,
  ALTER COLUMN config DROP NOT NULL;

ALTER TABLE games ADD CONSTRAINT games_dealt_columns_present CHECK (
  status IN ('lobby', 'abandoned')
  OR (
    phase IS NOT NULL AND discard_pile IS NOT NULL
    AND prng IS NOT NULL AND config IS NOT NULL
  )
);
```

In the same commit, update `apps/api/test/Migrations.test.ts`: the
applied-ledger assertion (`:63`) gains `"0003_lobby_rows.sql"`, and a new
introspection test pins the relaxation (the four columns report
`is_nullable = 'YES'`; the named CHECK exists; inserting an
`in_progress` row with NULL `phase` is rejected — the CHECK has teeth).
Apply: `pnpm --filter @cambio/api migrate` (applies `0003`), then again
(no pending — the root acceptance's idempotence check).

**Step 3.2 — Integration tests.** `apps/api/test/LobbyRepository.test.ts`
on `makeTestRuntime()` + `ensureRosterUsers` (the `db.ts` idioms;
`Effect.either` + `_tag` for failures). Test intents:

- **Lifecycle round-trip:** `saveLobby` v0 (creator only) ⇒ version 1 and
  a `games` row with `status = 'lobby'` and NULL phase; join twice, leave
  once, `loadLobby` after each mutation returns exactly the domain-side
  lobby and the incremented version; membership rows stay compacted
  join-order (`seat_index` 0..n−1 over live rows); last leave ⇒
  `status = 'abandoned'`, `loadLobby` shows `status: "abandoned"`.
- **Stale version:** a second `saveLobby` reusing an already-consumed
  version ⇒ typed `VersionConflict{expected, actual}`, and the row is
  unchanged (guard held).
- **Start-then-reconstruct:** build a lobby (3 members), `dealGame` with a
  literal seed, `save` the full `GameStarted` batch at the lobby's current
  version ⇒ status flips to `in_progress`; then `load` returns exactly the
  dealt state, and `getEvents` + `foldEvents` reproduces it identically
  (`GameStarted` is seq 0 — the lobby left no events, ADR-0019).
- **Undealt-row guard (decision 6):** `load`/`getEvents` on the lobby
  before starting ⇒ `GameNotFound`, not a decode `StorageError`.

Checkpoint: `pnpm --filter @cambio/api test` green with Docker up.

### M4 — Use cases (clauses 1–7, 12)

All suites are stub-layer only (clause 12): every port from
`test/support/stubs.ts`, nothing live, `Effect.either` + `_tag` for typed
failures. Each use case follows the `CreateTemporaryUser.ts` shape:
explicit return annotation, `Effect.gen`, ports at the top.

**Step 4.1 — `CreateLobby`, `JoinLobby`, `LeaveLobby`, test-first.** Test
intents per suite:

- Create: result carries the minted `GameId`; the repo stub holds a
  one-member `"open"` lobby saved with `expectedVersion` 0; the journal
  shows `saveLobby` **before** `publishLobby` (clause 7).
- Join: order preserved; the four typed refusals of clause 2 (full,
  duplicate, started/abandoned via a pre-seeded stub lobby, nonexistent
  game ⇒ `GameNotFound` passthrough) plus decision 9's `UserNotFound`;
  on any refusal the journal shows **no** save and **no** publish.
- Leave: member removed; `NotInLobby` typed; last-member leave saves
  `status: "abandoned"` and still publishes the lobby update (clause 3).

Then implement the three use-case files + barrel.

**Step 4.2 — `StartGame`, test-first.** Intents:

- Happy path (any member as starter, not just the creator): `dealGame`
  runs with the stub seed and clock now, seats are the join order, and
  **one** `save` call carries the whole `GameStarted` batch at the
  lobby's loaded version (journal: exactly one save, then one
  `publishGame` — clause 4 + 7).
- 1-member lobby ⇒ the domain's `BadPlayerCount` (clause 4 — passed
  through from `dealGame`, not re-derived); non-member ⇒ `NotInLobby`;
  already-started ⇒ `LobbyNotJoinable`; abandoned ⇒ `LobbyNotJoinable`.
  Each refusal: nothing saved, nothing published.
- `GameConfig` is a plain input field (root Decision Log — no config
  port, no env).

**Step 4.3 — `ExecuteGameCommand`, test-first.** Drive with small real
states (`dealGame` output with literal seeds — the engine is pure and
cheap). Intents:

- Legal command: full event batch in **one** `save` (journal), then one
  `publishGame` with the post-command state and that batch; result carries
  `{ state, version, events }` (the actor's cache update).
- Illegal command: the engine's typed `GameError` surfaces; journal shows
  no save and no publish (clause 5).
- `VersionConflict` from the repo stub passes through unchanged
  (clause 6's use-case half — invalidation is the actor's half, M5).
- `cached` provided ⇒ the repo stub records no `load` call; absent ⇒ one
  load (decision 10, both paths pinned).

Advisory signature:

```ts
export interface ExecuteGameCommandInput {
  readonly gameId: GameId
  readonly command: Command
  /** Actor's snapshot; absent ⇒ load from the repository (root clause 5). */
  readonly cached?: { readonly state: GameState; readonly version: GameVersion }
}
export interface CommandAccepted {
  readonly state: GameState
  readonly version: GameVersion
  readonly events: ReadonlyArray<GameEvent>
}
export const executeGameCommand = (
  input: ExecuteGameCommandInput,
): Effect.Effect<
  CommandAccepted,
  GameError | GameNotFound | VersionConflict | StorageError,
  GameRepository | ClockPort | RealtimePublisherPort
> => …
```

Checkpoint: `pnpm --filter @cambio/application test` green;
`pnpm --filter @cambio/application lint` proves the boundary holds over
the new files.

### M5 — Room registry + actor (clauses 8–11, ADR-0020)

**Step 5.1 — Registry + actor, basic path first.** Write the first
`test/RoomRegistry.test.ts` intents (a command routed through the registry
returns the same `CommandAccepted`/typed error the bare use case gives; a
second command reuses the cache — the repo stub records exactly one load),
watch them fail, then implement `src/room/RoomRegistry.ts`:

- `RoomRegistry` tag `"@cambio/application/RoomRegistry"`; members are the
  typed entry points (advisory): `execute(gameId, command)`,
  `join(gameId, userId)`, `leave(gameId, userId)`,
  `start(gameId, input)` — each enqueues an envelope and awaits its
  `Deferred` (decision 12; CreateLobby stays a plain use case).
- `RoomRegistryLive: Layer<RoomRegistry, never, GameRepository | ClockPort
| RealtimePublisherPort | UserRepository>` — built with a
  `Ref<Map<GameId, Room>>`; a room is created lazily on first message:
  bounded `Queue` of envelopes (a tagged union, each variant carrying its
  own typed `Deferred` — no type erasure), one forked consumer fiber, a
  `Ref` cache.
- Actor bootstrap (clause 9's substance): `loadLobby` first; status
  `"started"` ⇒ `load` for `{ state, version }` (an in-game room),
  otherwise a lobby room from rows. Bootstrap failures complete the
  triggering envelope's `Deferred` with the typed error.
- Envelope processing: decision 11's lazy-close pre-step, then the
  matching use case (with `cached` for game commands); success updates the
  cache; `VersionConflict` completes the `Deferred` and **drops the
  cache** (clause 6); decision 13's eviction check runs after every
  envelope.
- Timer: decision 13's fork/sleep/interrupt lifecycle; the enqueue is
  internal (no reply `Deferred`; an illegal-when-processed close is
  dropped).

**Step 5.2 — Determinism, conflict invalidation, eviction, restart.**
Remaining intents, added one at a time:

- **Slam race (clause 8):** drive a real dealt state into `SlamWindow`
  (literal-seed game; pick the slammed rank from the actual discard —
  cambio-rules skill: no invented rule priors), then enqueue two slam
  submissions from different players concurrently
  (`Effect.all(…, { concurrency: "unbounded" })` over the two `execute`
  calls after a deterministic enqueue order is arranged). First-enqueued
  wins; the second's reply is whatever typed error the engine returns for
  the second/late slam — assert its `_tag` from the observed engine
  behavior, not from a prior; final state reflects exactly one slam.
  **Repeat the race many times inside the test body** (a `for` loop of
  fresh rooms) — this is the root acceptance's "passes repeatedly, not
  flakily", pinned in-test rather than by rerunning vitest.
- **Conflict invalidation (clause 6):** poke the stub repo's stored
  version behind the actor's back; next command ⇒ `VersionConflict` reply;
  the command after that succeeds because the actor reloaded (stub records
  a second load).
- **Eviction (clause 10):** drive a game to `Ended` (cambio call on a
  near-end state) — registry entry gone (observable: the next `execute`
  triggers a fresh bootstrap load in the journal) and the reply to that
  later command is the engine's typed error for a finished game, not a
  crash. Same for a lobby abandoned by its last leave — a later `join`
  gets `LobbyNotJoinable`.
- **Restart reconstruction (clause 9):** run commands through registry A;
  build registry B over the _same_ stub repository (fresh `Ref` map — the
  simulated restart); the same next command against B and against a
  never-restarted control produces identical replies and identical
  post-command persisted state. Once for an in-game room, once for a
  lobby room.

**Step 5.3 — Timer-vs-lazy equivalence (clause 11).** Two rooms driven to
the identical `SlamWindow` state (same seed, same commands):

- **Lazy path (timers suppressed):** never advance the `TestClock`; set
  the `Ref` clock past `closesAt`; submit the next turn's command — the
  actor first closes the window (persisted + published `CloseSlamWindow`
  batch), then runs the command.
- **Timer path:** set the `Ref` clock past `closesAt` _and_
  `TestClock.adjust` past the sleep so the timer fiber enqueues the close;
  then submit the same command.
- Assert both rooms' final persisted states and event logs are identical
  (the timer is an optimization only, ADR-0011/HANDOFF §6), and that a
  timer close arriving after a lazy close already happened is a silent
  no-op (no extra events, no extra publish).

Update `src/index.ts` (barrel) and the package doc comment.

Checkpoint: `pnpm --filter @cambio/application test` green;
then the full bare gate.

## Concrete steps & validation

Run from the repo root. If `pnpm` is missing:
`source ~/.nvm/nvm.sh && nvm use 22`. Postgres must be up for M3+ api
suites:

```bash
docker compose -f docker/docker-compose.yml up -d
```

Per-milestone signals:

- **M1:** `pnpm --filter @cambio/domain test` — new `Lobby.test.ts` green,
  every pre-existing suite untouched and green;
  `pnpm --filter @cambio/domain lint` clean (effect-only holds).
- **M2:** `pnpm --filter @cambio/domain test` and
  `pnpm --filter @cambio/api build typecheck lint` (the compile-coupled
  adapter), then `pnpm --filter @cambio/application test` (new Ports rows).
- **M3:** `pnpm --filter @cambio/api migrate` — applies
  `0003_lobby_rows.sql`; run it a second time — "no pending migrations".
  `pnpm --filter @cambio/api test` — existing suites plus
  `LobbyRepository.test.ts` and the updated `Migrations.test.ts`, all
  green; record the new api test count in Progress.
- **M4:** `pnpm --filter @cambio/application test` — the five use-case
  suites + Ports green; record counts.
- **M5:** `pnpm --filter @cambio/application test` — the registry suite
  green, including the in-test repeated slam race. Run the package suite a
  few extra times bare (no pipes) to shake out scheduling flakiness before
  calling the milestone done.

Untouched-surface and purity sweeps (each must print nothing):

```bash
git diff --name-only origin/release-v0...HEAD -- \
  packages/contracts apps/web apps/api/src/presentation \
  apps/api/src/runtime.ts apps/api/migrations/0001_init.sql \
  apps/api/migrations/0002_cambio_schema.sql turbo.json .env.example
grep -rn "Date.now\|Math.random\|setTimeout\|setInterval" \
  packages/application/src packages/domain/src        # clause 12: time/entropy via ports only
grep -rn "from \"node:" packages/application/src packages/domain/src
git diff --name-only origin/release-v0...HEAD -- \
  packages/domain/src/Engine.ts packages/domain/src/Phase.ts \
  packages/domain/src/Legality.ts packages/domain/src/Fold.ts \
  packages/domain/src/GameEvent.ts                    # ADR-0019: engine untouched
```

Final gate (must pass before `/ship`, Docker Postgres up). **Never pipe
it** — `pnpm turbo … | tail` replaces the gate's exit code with the
filter's and has committed a broken build before; run it bare and check
the exit status directly (`set -o pipefail` first if output must be
filtered):

```bash
pnpm turbo build typecheck lint test
```

(`lint` includes the repo-wide prettier check — `pnpm format` if it
complains about the new files.)

## Contract coverage

_(maintained by `/implement`, verified by `/review`: one row per root-plan
contract clause this side owns — the test that pins it, or why none can.
Each row must also say **what is asserted**, in one phrase. Per the
template rule, the **Contract coverage table stays test-nameless at plan
time** (rows hold clause → planned approach; `/implement` fills file, test
name, and assertion phrase as each test actually lands — invented test
titles become review findings).)_

| Clause | Test (file + name)                                                                                                                                                                                                     | What is asserted           |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 1      | _planned:_ domain create transition (M1) + CreateLobby stub suite (M4.1) + the integration lifecycle's insert half (M3.2)                                                                                              | _(filled by `/implement`)_ |
| 2      | _planned:_ domain join transitions/failures (M1) + JoinLobby stub suite incl. all four typed refusals and no-save-on-refusal (M4.1)                                                                                    | _(filled by `/implement`)_ |
| 3      | _planned:_ domain leave/abandon transitions (M1) + LeaveLobby stub suite (M4.1) + the integration lifecycle's abandon half (M3.2)                                                                                      | _(filled by `/implement`)_ |
| 4      | _planned:_ StartGame stub suite (M4.2): any-member start, join-order seats, whole `GameStarted` batch in one save, `BadPlayerCount`/non-member/restart refusals                                                        | _(filled by `/implement`)_ |
| 5      | _planned:_ ExecuteGameCommand stub suite (M4.3): whole batch in one save then publish; illegal ⇒ typed `GameError`, nothing persisted, nothing published                                                               | _(filled by `/implement`)_ |
| 6      | _planned:_ conflict passthrough in the ExecuteGameCommand suite (M4.3) + actor cache-invalidation-and-reload in the registry suite (M5.2)                                                                              | _(filled by `/implement`)_ |
| 7      | _planned:_ the shared stub journal (M2.3) pins save-before-publish across every M4 suite; lobby mutations publish via `publishLobby`                                                                                   | _(filled by `/implement`)_ |
| 8      | _planned:_ registry slam-race test with in-test repetition over fresh rooms (M5.2); second slam's reply asserted from observed engine behavior                                                                         | _(filled by `/implement`)_ |
| 9      | _planned:_ restart-reconstruction test (fresh registry, same stub repo) for one in-game and one lobby room vs a never-restarted control (M5.2)                                                                         | _(filled by `/implement`)_ |
| 10     | _planned:_ eviction tests — game to `Ended` and lobby to abandoned; later command gets a fresh actor and a typed error, not a crash (M5.2)                                                                             | _(filled by `/implement`)_ |
| 11     | _planned:_ timer-vs-lazy equivalence (M5.3): suppressed-timer lazy close ≡ timer-driven close, byte-identical states/logs; late timer close is a silent no-op                                                          | _(filled by `/implement`)_ |
| 12     | _planned:_ structural — every M4/M5 suite runs on stubs only, plus the `Date.now`/`Math.random`/`setTimeout`/builtin grep sweeps in the validation section                                                             | _(filled by `/implement`)_ |
| 13     | _planned:_ migration ledger + CHECK introspection (M3.1) and the LobbyRepository integration trio: lifecycle round-trip, stale-version conflict, start-then-reconstruct via `load` and `getEvents`+`foldEvents` (M3.2) | _(filled by `/implement`)_ |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [x] 2026-09-01 — backend plan written; awaiting `/implement`
- [x] 2026-09-01 13:16 — M1 done (`e91da8e`): `src/Lobby.ts` + `test/Lobby.test.ts` (15 tests), `gid` fixture added to `src/testing/fixtures.ts`, barrel updated. Domain suite 190 green, lint clean. Deviation: lobby error-shape assertions live in `Lobby.test.ts` rather than `test/Ports.test.ts` — they are model errors, not port errors; coverage identical.
- [x] 2026-09-01 13:20 — M2 done (`9bdba56`): `saveLobby`/`loadLobby` + `SaveLobbyInput` on the domain port; adapter implements both (ascending-order membership diff, rejoin resurrects the soft-deleted row via PK-conflict `deleted_at = NULL`, undealt-row guard on `load`/`getEvents`); `ports/Seed.ts`, `ports/RealtimePublisher.ts`, tag rows in `test/Ports.test.ts`, stub kit `test/support/stubs.ts`. Domain/application/api all compile, tests green.
- [x] 2026-09-01 13:21 — M3 done (`55409ba`): `0003_lobby_rows.sql` applied + idempotent re-run verified; `Migrations.test.ts` ledger + CHECK-with-teeth introspection; `LobbyRepository.test.ts` four integration tests. api suite 9 files / 52 tests green.

## Surprises & notes for the root plan

_(anything the root plan's Decision Log or the reviewer must know)_
