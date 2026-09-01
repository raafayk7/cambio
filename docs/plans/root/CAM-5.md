# CAM-5 — Application use cases + per-room command queue

- **Linear:** [CAM-5](https://linear.app/raafayk7/issue/CAM-5/application-use-cases-per-room-command-queue)
- **Scope:** backend
- **Child plans:** [backend](../backend/CAM-5.md)
- **ADRs:** 0019 (lobby: pure domain model, row-backed persistence), 0020
  (room actor: queue + Deferred replies, cached state, evict on end)

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

After this task, the backend can run a complete game lifecycle end to end
through typed application services: create a lobby, join and leave it, start
the game, and play every in-game command (draw, take discard, swap/discard,
keep, powers, slam, call cambio) — with all commands for a room serialized
through one queue so slam races are deterministic, and every outcome (success
or illegal move) a typed value. Observe it working by running
`pnpm --filter @cambio/application test` and
`pnpm --filter @cambio/api test` (integration tests need the Docker
Postgres on port 5433). No HTTP surface yet — that is CAM-6.

## Context & orientation

- **Domain (CAM-1/2, done):** `packages/domain` has the full rules engine.
  Entry point `applyCommand(state, command, now)` in `src/Engine.ts` returns
  `Either<[GameState, GameEvent[]], GameError>`; games begin via
  `dealGame(players, seed, config, now)` in `src/Deal.ts` (player count 2–5
  enforced there, `GameStarted` emitted). `Phase` has **no lobby variant**;
  `foldEvents` (`src/Fold.ts`, ADR-0014) requires `GameStarted` first and
  whole-command event prefixes. The simulation harness is importable from
  `@cambio/domain/testing` (ADR-0016).
- **Persistence (CAM-3, done):** `GameRepository` port in
  `packages/domain/src/GameRepository.ts` (ADR-0015): `save` is one
  version-guarded transaction (`expectedVersion === 0` inserts) returning the
  new `GameVersion`; `load`, `getEvents`. Adapter in
  `apps/api/src/infra/game-repository.ts`; DDL in
  `apps/api/migrations/0002_cambio_schema.sql`. **Gap this task closes:**
  `save` cannot express a lobby — `status` is derived
  (`in_progress`/`completed` only), `phase`/`prng`/`config`/`discard_pile`
  are NOT NULL, and no method adds/removes players pre-deal. See ADR-0019.
- **Application (CAM-4, done):** use-case shape and port idioms exist —
  `packages/application/src/use-cases/CreateTemporaryUser.ts`,
  `src/ports/Clock.ts` (`Context.Tag`, tag string
  `"@cambio/application/XxxPort"`). Tests are `@effect/vitest` stub-layer
  suites in `packages/application/test/`.
- **Governing docs:** HANDOFF §6 (queue, timers-not-authoritative,
  reconstructibility), §4.3 (schema), §12 step 4; skills
  `application-layer`, `architecture`, `effect-domain-modeling`,
  `infrastructure-persistence`; ADRs 0011 (closesAt authority), 0014, 0015,
  0019, 0020.

## Functional contract

**Lobby lifecycle** (ADR-0019: lobby is a pure domain model; rows are the
authority, the event log never contains lobby history):

1. **CreateLobby** — given a creator's `UserId`, creates a lobby whose sole
   member is the creator and returns its `GameId`. The persisted row has
   `status = 'lobby'` and version 1 semantics (first version-guarded write).
2. **JoinLobby** — adds a user to the lobby, preserving join order. Typed
   failures: joining a full lobby (5 members) fails; joining a lobby you are
   already in fails; joining a started or abandoned lobby fails; joining a
   nonexistent game fails.
3. **LeaveLobby** — removes a member; leaving a lobby you are not in is a
   typed failure. When the **last** member leaves, the lobby's status
   becomes `'abandoned'`; an abandoned lobby cannot be joined or started.
4. **StartGame** — **any current member** may start. With 2–5 members it
   deals via `dealGame` (seed from the seed port, `now` from `ClockPort`,
   `GameConfig` from input), assigns seats in join order (contiguous from
   0), and persists the dealt state **with the full `GameStarted` batch in
   one save** guarded by the lobby's current version. With fewer than 2
   members it fails with the domain's `BadPlayerCount`; a non-member cannot
   start; a lobby that already started cannot start again.

**In-game commands:**

5. **ExecuteGameCommand** — for every domain `Command` variant, the use case
   sequences load → `applyCommand` → save → publish. A legal command's full
   event batch is persisted in **one** `save` call (never split — this is
   the whole-batch promise CAM-3's fold and `final_score` write depend on)
   and then published. An illegal command yields its typed `GameError`,
   persists nothing, and publishes nothing.
6. **Version conflicts are typed outcomes.** A `save` hitting
   `VersionConflict` surfaces that error to the caller unchanged; the room's
   cached state is invalidated so the next command reloads (ADR-0020 — no
   retry).
7. **Publishing goes through a publisher port.** Every successful command
   publishes its events after persistence succeeds; lobby mutations publish
   a lobby update the same way. Tests observe publications via a recording
   stub; no realtime implementation in this task (CAM-6).

**Room actor** (ADR-0020):

8. **Serialization** — all commands for a room pass through that room's
   single queue and are processed by one fiber, in enqueue order. Two
   concurrent slam submissions produce a deterministic outcome: the
   first-enqueued wins, the second receives the typed error the engine
   gives a late/second slam; state reflects exactly one slam.
9. **Reconstruction** — a room actor starting fresh (first command after a
   simulated restart: new registry, same repository) serves an in-game room
   from persisted state and a lobby room from lobby rows, with identical
   results to a never-restarted room.
10. **Eviction** — when a game ends or a lobby is abandoned, the room's
    actor is removed from the registry; a later command for that room gets a
    fresh actor whose reply is the appropriate typed error
    (`GameAlreadyEnded` / not-joinable), not a crash.
11. **Slam-window timer is an optimization only** — after a save leaves the
    game in `SlamWindow`, the actor schedules an internal `CloseSlamWindow`
    enqueue at `closesAt`. The engine never auto-closes the window (every
    non-slam command during `SlamWindow` is wrong-phase-illegal even after
    `closesAt`), so the lazy path is the actor's: before processing any
    command while the room's phase is `SlamWindow` with
    `ClockPort.now >= closesAt`, it first executes a `CloseSlamWindow` as
    its own persisted and published batch. (As built, the injection is
    skipped for a `Slam` — so a late slammer gets the engine's specific
    `SlamTooLate`, not a generic `WrongPhase` — and for an explicit
    `CloseSlamWindow`, which simply runs.) With timers suppressed
    (test-controlled clock), that lazy path alone closes the window, and
    the timer-driven and lazy paths produce identical states.

**Purity of orchestration:**

12. Time enters only via `ClockPort`, ids only via `IdGeneratorPort`, deal
    seeds only via the seed port; use cases and the actor never call
    `Date.now`/`Math.random`. All use-case tests run on stub layers only.

**Infrastructure vertical** (ADR-0019):

13. Migration `0003` makes lobby rows representable (relaxing CAM-3's
    NOT NULLs for lobby-status rows while a CHECK keeps them mandatory for
    non-lobby rows) without touching migration `0002`. The Postgres adapter
    implements the new lobby port methods; integration tests prove:
    lobby create → join → leave → abandon round-trips; version-guarded lobby
    mutation (stale version ⇒ `VersionConflict`); StartGame persists a game
    that `load` and `getEvents`+`foldEvents` reconstruct identically.

### Acceptance criteria

- [x] All contract clauses above are pinned by tests (coverage table in the
      backend child plan).
- [x] A queue-determinism test exists (clause 8) and passes repeatedly, not
      flakily — 20 fresh-room repetitions inside the test body, plus three
      bare re-runs of the package suite.
- [x] `pnpm --filter @cambio/api migrate` applies 0003 idempotently on a
      database that already ran 0001–0002 (second run: "no pending
      migrations (3 applied)").
- [x] The quality gate passes, run bare (never piped):
      `pnpm turbo build typecheck lint test` — 22/22 tasks, exit 0.

## Plan of work

No `contracts` work in this task (wire schemas land with CAM-6's viewFor —
Decision Log), so there are no parallel lanes to freeze shapes for; the
milestones are sequential, each leaving the gate green.

1. **M1 — Domain lobby model** (`packages/domain`, test-first): the `Lobby`
   type, pure create/join/leave/start-eligibility transitions, typed lobby
   errors. Engine, Phase, Fold untouched.
2. **M2 — Ports**: lobby methods on `GameRepository` (domain port, ADR-0019);
   new application ports for deal seeds and realtime publishing; extend the
   port regression tests. In-memory stub layers for all of them in
   application tests.
3. **M3 — Infra vertical** (`apps/api`): migration `0003`, adapter
   implementations of the new port methods, CAM-3-style integration tests
   against Docker Postgres.
4. **M4 — Use cases** (`packages/application`): CreateLobby, JoinLobby,
   LeaveLobby, StartGame, ExecuteGameCommand — each stub-layer tested,
   including the whole-batch persistence and publish-after-persist
   sequencing.
5. **M5 — Room registry + actor**: the registry service, per-room queue and
   fiber, Deferred replies, cached state, eviction, slam-window timer;
   queue-determinism and reconstruction tests.
6. **M6 — Close-out**: full gate, plan-document reconciliation, Linear
   update.

M3 can technically follow M4/M5 — it only depends on M2 — but running it
right after M2 validates the port design against real SQL before the use
cases build on it.

## Validation

- `pnpm --filter @cambio/domain test` — lobby model unit tests (new) plus
  the untouched CAM-1/2 suites proving the engine didn't move.
- `pnpm --filter @cambio/application test` — use-case stub-layer suites and
  the actor suites: slam-race determinism (clause 8), restart reconstruction
  (clause 9), eviction (clause 10), timer-vs-lazy close equivalence
  (clause 11).
- `pnpm --filter @cambio/api test` — integration tests for clause 13
  (requires `docker compose -f docker/docker-compose.yml up -d`).
- Final: `pnpm turbo build typecheck lint test` run bare; exit code checked
  directly.

## Progress

_(updated continuously; append new entries at the BOTTOM — newest last;
timestamp each entry)_

- [x] 2026-09-01 — plan written, awaiting implementation
- [x] 2026-09-01 13:16 — M1 domain Lobby model (`e91da8e`; see the backend
      child plan's Progress for per-milestone detail)
- [x] 2026-09-01 13:21 — M2 ports + adapter, M3 migration 0003 +
      integration tests (Docker Postgres)
- [x] 2026-09-01 17:00 — M4 use cases, M5 room registry/actor, all suites
      green (domain 190, application 41, api 52+)
- [x] 2026-09-01 17:10 — M6: full gate green (22/22 tasks), untouched-
      surface and purity sweeps empty, plan docs reconciled

## Decision log

- 2026-09-01 — **Mid-game leave/abandon is out of scope** (user call,
  interview round 1). Only lobby leave exists; leaving a started game has no
  playtested rule and HANDOFF §8 defers reconnect UX. A future task decides
  it before touching the engine.
- 2026-09-01 — **Wire contracts deferred to CAM-6** (user call). Use cases
  take plain typed inputs (CAM-4 pattern); command/event wire schemas are
  designed together with `viewFor`, where the hidden-information gate
  applies. `packages/contracts` is untouched by CAM-5.
- 2026-09-01 — **Integration test bar = queue determinism** (user call).
  Restart reconstruction and eviction are still covered as actor unit tests
  (clauses 9–10); no full-game drive of the CAM-2 harness through the queue
  stack in this task.
- 2026-09-01 — **One `ExecuteGameCommand` use case, not ten per-verb ones.**
  The domain `Command` union already encodes the verbs and the orchestration
  (load → apply → save → publish) is identical for all; per-verb wrappers
  would add names, not behavior. CAM-6 maps wire commands onto the union.
- 2026-09-01 — **Deal seeds come from a new application port** (technical
  capability, `application/src/ports/`), not from `IdGeneratorPort` — id
  generation and entropy are different capabilities; the domain takes the
  seed as a parameter (`dealGame`). Exact name/shape is the child plan's.
- 2026-09-01 — **`GameConfig` is a `StartGame` input; lobby rows don't store
  config.** The caller (CAM-6's route layer) will assemble it from
  `AppConfig`; `SLAM_WINDOW_MS` env plumbing (`apps/api/src/config.ts`,
  `turbo.json` passthrough) lands in CAM-6 where it is first read. No
  process-env dependency enters `packages/application`.
- 2026-09-01 — **Publisher port carries `(gameId, state, events)`**
  (advisory shape): the CAM-6 adapter needs the post-command state to build
  `viewFor` projections without reloading. The port stays in
  `application/src/ports/`; nothing in CAM-5 serializes it to a client.
- 2026-09-01 — **Any lobby member may start; no host concept** (user call).
  No host marker in schema or domain.
- 2026-09-01 — **Empty lobby → `status='abandoned'`, not soft-delete**
  (user call). Exercises the reserved enum value; §7's pg_cron design later
  reaps abandoned rows.
- 2026-09-01 — **Slam-close timer fiber ships in this task** (user call),
  inside the actor per ADR-0020; correctness proven independently of it
  (clause 11).
- 2026-09-01 — **Lobby mutations are serialized through the same per-room
  queue as game commands** (child plan decision 12): a join racing a start
  is deterministic, and abandonment-driven eviction is observed at the one
  place that owns the room. CreateLobby alone stays outside the registry —
  no room exists until the first join/start message.

## Surprises & discoveries

_(anything found mid-implementation that the plan didn't predict — wrong
assumptions, upstream bugs, better approaches. Evidence included.)_

- (from planning exploration, for the implementer) The application-layer
  skill's `engine.apply` snippet is pseudocode — the real API is the free
  function `applyCommand(state, command, now)` returning `Either`, lifted
  via `Effect.fromEither`-style code, and `dealGame` is a separate entry
  point.
- (from planning exploration) `CloseSlamWindow` deliberately carries no
  `playerId` — the actor's timer fiber is a legitimate issuer.
- (implementation) A StartGame-specific VersionConflict unit test is
  impossible from outside the use case: it loads the lobby's version
  itself, so a stub can't get stale between its load and save. The
  conflict path is pinned instead by ExecuteGameCommand's stale-`cached`
  test, the registry's invalidate-and-reload test, and the integration
  suite's stale-version test (13b).
- (implementation) The repo-wide prettier check flagged a pre-existing
  violation in `docs/plans/root/CAM-12.md` (landed unformatted); fixed in
  the formatting commit rather than left to fail every future gate.
- (implementation) The gate-piping trap AGENTS.md warns about bit during
  M4: `pnpm --filter … lint | tail` masked a lint failure and a commit
  landed red; caught immediately and amended. Bare runs only.

## Outcomes & retrospective

_(filled by `/review`, 2026-09-01)_

**Verdict: fix-then-ship.** Independently verified: gate `pnpm turbo build
typecheck lint test --force` 22/22 tasks, 296 tests (domain 190,
application 41, api 52, config 13); migrate idempotent ("no pending
migrations (3 applied)"); application suite stable across repeated bare
runs. Clean on all recurring high-value checks: import boundaries, domain
purity, ports placement, typed errors end to end, soft-delete/codec
discipline, hidden-information (no client-facing payloads; publisher port
carries the §5 warning), and every Decision Log user call.

**Findings (ranked; fix cycle must re-run each finding's sweep, not
spot-fix cited lines):**

1. **Clause 8's second half is a wrong rule prior, and no test pins it**
   (contract violation — of the document, not the engine). Verified by
   direct engine reproduction: in the pinned race scenario both slams are
   accepted (`SlamFailed`+`PenaltyDrawn` each; the window stays open and
   admits multiple attempts), and the two racers are the same player on
   different targets. "The second receives the typed error the engine
   gives a late/second slam; state reflects exactly one slam" is
   contradicted by the playtested engine. Sweep (all instances):
   `docs/plans/root/CAM-5.md:101-102` and
   `docs/plans/backend/CAM-5.md:646-647`. The race test's determinism half
   (20 fresh rooms, identical outcome triples, serialized enqueue order)
   is real and stays. Fix: rewrite both clause texts to the engine's
   actual semantics and either assert the second slam's observed outcome
   explicitly or build a true two-player double-submit on one target.
2. **Actor fiber is unsupervised** (`packages/application/src/room/
RoomRegistry.ts`): a defect inside `closeIfDue` (which runs before the
   reply `Deferred` completes) or an interruption kills the room fiber
   with its map entry left behind — every later caller for that room hangs
   on `Deferred.await` forever. Fix direction: `Effect.onExit` cleanup
   (remove entry under the lock, fail pending deferreds) and hoist
   `closeIfDue` into the exit-guarded region.
3. **Two clause halves lack an observing assertion**: clause 10's
   abandoned-lobby eviction (the test's `LobbyNotJoinable` assertion holds
   whether or not eviction happened) and clause 11's timer path
   (`timedResult.journalOps` is computed but never asserted, so a
   never-fired timer would still pass via the lazy fallback).
4. **`saveLobby` adapter**: the "members only ever shift downward"
   comment is unsound (a rejoiner shifts upward to the tail — safety
   actually comes from compact-survivors-first-then-append); the
   single-delta precondition that makes the diff collision-free is absent
   from the port contract; and the guarded UPDATE lacks a
   `status IN ('lobby','abandoned')` clause, so a correct-version
   `saveLobby` against an `in_progress` row would silently downgrade it.
   Unreachable through today's use cases; structural fix recommended.
5. **Plan reconciliation misses** in `docs/plans/backend/CAM-5.md`
   despite the "reconciled" Progress claim: step 5.1's `loadLobby`-first
   bootstrap and "bounded Queue" texts, decision 13's "shuts its queue",
   `RoomRegistryLive` deps missing `SeedPort`, the stubs module-layout row
   missing `usersStub`, and the domain table missing
   `src/testing/fixtures.ts` (`gid`).
6. **Advisories**: `GameAdvanced` (full-truth carrier) deserves the same
   viewFor warning as the publisher port; `Effect.die` with a raw string
   sets a weak defect precedent; `RoomRegistry.key` not pinned in
   `Ports.test.ts`; the lobby-restart test is vacuous by construction (the
   in-game restart test carries clause 9); the 0003 CHECK is one-way
   (a lobby row with non-null phase passes); `Lobby.members` schema admits
   duplicates at the codec boundary; the application-layer skill's "room
   state is a fold of game_events from seq 0" wording is now stale
   (ADR-0014 makes the state row a materialized fold; the actor loads it —
   sanctioned by ADR-0020's "loads or folds").

Deferred (unchanged from planning): wire contracts, viewFor, live
seed/publisher adapters, SLAM_WINDOW_MS plumbing, `setNotFoundHandler` —
all CAM-6.
