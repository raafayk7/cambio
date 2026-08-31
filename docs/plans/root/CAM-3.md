# CAM-3 — Persistence: schema migrations, repositories, event log + fold-to-state

- **Linear:** [CAM-3](https://linear.app/raafayk7/issue/CAM-3/persistence-schema-migrations-repositories-event-log-fold-to-state)
- **Scope:** backend
- **Child plans:** [backend](../backend/CAM-3.md)
- **ADRs:** [0014](../../adr/0014-self-contained-event-log-fold-transcribes.md)
  (shuffle events record PrngState; fold transcribes),
  [0015](../../adr/0015-aggregate-game-repository-port.md) (aggregate
  GameRepository), [0016](../../adr/0016-domain-testing-export-subpath.md)
  (harness ships via `@cambio/domain/testing`)

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

After this task, a game played through the pure engine can be persisted to
Postgres mid-flight and reconstructed **identically** — state tables as a
materialized fold, `game_events` as the append-only source of truth
(HANDOFF §6). Observable as: `pnpm --filter @cambio/api migrate` creates the
§4.3 schema on the Docker Postgres (port 5433), and randomized harness games
round-trip through Postgres with their event logs folding from seq 0 back to
deep-equal `GameState`s — a fast default batch in the gate, a 1000-game deep
run (`RT_GAMES=1000`) required locally before ship. This unblocks CAM-4
(users table exists), CAM-5 (repositories + fold are the load/save/recover
surface), and CAM-8 (soft-delete columns exist to sweep).

## Context & orientation

- **Domain** (`packages/domain/src/`): complete pure engine from CAM-1/2.
  `GameState` = `{ players, deck, discard, prng, phase, config }`
  (`GameState.ts:54-62`); hands are sparse sorted arrays of
  `{ slotIndex, card }` — holes are already modeled and never compact
  (`GameState.ts:27-40`). `Phase` is a 6-variant union **with codec**
  (`Phase.ts:68-86`) — note it supersedes the 5-variant sketch in HANDOFF
  §4.2 (ADR-0010/0011 added `ResolvingQueenSwap` and `SlamWindow.turnPlayerId`);
  the jsonb shape follows `Phase.ts`, not the handoff. 22 `GameEvent`
  variants with codecs (`GameEvent.ts`). **No fold/applyEvent exists yet;
  no repository ports exist anywhere.** `Seq` is minted in `Ids.ts:32` but
  unused.
- **CAM-2 harness** (`packages/domain/test/sim/`): seeded driver
  (`driver.ts:105` `simulateGame`) returning `{ finalState, events, trace,
roster, … }`, plus invariant checkers. Currently unreachable from other
  packages — ADR-0016 moves it under `src/testing/`.
- **apps/api**: migration runner `src/infra/migrate.ts` (one transaction per
  file, `_cambio_migrations` ledger, **runs `NodeRuntime.runMain` at module
  scope** — needs a refactor to be callable from test setup);
  `0001_init.sql` is applied and deliberately empty — CAM-3 starts at
  `0002_`. `DatabaseLive` reads `DATABASE_URL` (`infra/database.ts:12-15`);
  new repository layers register in `src/runtime.ts:15-17`. **apps/api has
  zero test infrastructure** — no vitest, no test script, no `test/` in
  tsconfig.
- **Governing docs:** HANDOFF §4.3 (schema sketch — explicitly "not final
  DDL"), §4.5 (invariants), §6 (reconstructibility), §7 (soft delete);
  ADR-0002 (plain SQL migrations), ADR-0005 (Postgres 17), ADR-0014/15/16
  (this task); skills: `infrastructure-persistence`,
  `effect-domain-modeling`, `architecture`, `hidden-information` (event
  payloads are full-truth — everything here is server-only).
- **Explicit deferrals landing here:** CAM-2 deferred the DB-shaped §4.5
  invariants "verbatim against the persisted schema" to CAM-3
  (`docs/plans/root/CAM-2.md:222,362-364`).
- **Explicitly NOT in scope:** recovery wiring into rooms (CAM-5), the
  `HoldingCard`-accepts-power schema refinement (CAM-10 — until it lands,
  a decoded `games.phase` is trusted as written), pg_cron lifecycle jobs
  (CAM-8), any HTTP route or realtime surface, any `contracts` change.

## Functional contract

### C1 — Migrations & persisted schema

- **C1.1** A new plain-SQL migration (`apps/api/migrations/0002_…`) creates
  `users`, `games`, `game_players`, `decks`, `user_cards`, `card_peeks`,
  `game_events`. Every table carries `created_at`, `updated_at`,
  `deleted_at`. Applying on a fresh database succeeds; re-running
  `pnpm --filter @cambio/api migrate` is a no-op. `0001_init.sql` is not
  edited.
- **C1.2** `games` columns: `game_id` uuid PK, `status`
  (`lobby | in_progress | completed | abandoned`), `phase` jsonb (the
  `Phase.ts` union via its codec), `discard_pile` (ordered, element 0 =
  top), `prng` jsonb (encoded `PrngState`), `config` jsonb (encoded
  `GameConfig`), `version` int. **No** `turn`, `face_up_card`, `winner`, or
  `called_cambio_by` column (all derivable — see Decision log).
- **C1.3** `game_players`: PK `(game_id, user_id)`; unique
  `(game_id, seat_index)` **partial on `deleted_at IS NULL`**; seat_index
  materializes the `GameState.players` array position; `final_score` int
  null, `is_connected` bool, `is_bot` bool default false.
- **C1.4** `decks`: keyed by `game_id` (PK + FK — one deck per game, no
  surrogate `deck_id`); `cards` ordered, element 0 = next to draw; no
  `size` column.
- **C1.5** `user_cards`: one row per occupied `HandSlot`
  `(game_id, user_id, index, card)`; unique `(game_id, user_id, index)` and
  unique `(game_id, card)`, both **partial on `deleted_at IS NULL`**.
  Indices are stable positions — persisting a hand with holes stores
  exactly the occupied slots, never compacted.
- **C1.6** `card_peeks`: `(game_id, seq, viewer_id, card)` — one row per
  `CardPeeked` event, `seq` = that event's sequence number.
- **C1.7** `game_events`: `(game_id, seq, type, payload jsonb, actor_id
uuid null, at)`; unique `(game_id, seq)`; append-only — no code path in
  this task updates or deletes an event row.

### C2 — Domain additions

- **C2.1** `GameStarted` and `DeckReshuffled` payloads gain
  `prng: PrngState` recording the post-shuffle state (ADR-0014); `dealGame`
  and the engine populate it; the full existing CAM-1 + CAM-2 test suites
  pass after the change.
- **C2.2** A pure `foldEvents` in `packages/domain` reconstructs
  `GameState` from an ordered event array per ADR-0014: transcription for
  players/hands/deck/discard/config/prng; phase inference; card identities
  for `CardsBlindSwapped`/`CardGivenFromHand` derived from the fold's own
  accumulated state. It never calls `shuffle` or `applyCommand`, and
  returns a typed error (never throws) on empty, malformed, or
  non-`GameStarted`-initial streams.
- **C2.3** `GameRepository` and `UserRepository` ports are declared in
  `packages/domain` as `Context.Tag` classes (tags namespaced
  `"@cambio/domain/…"`), aggregate-shaped per ADR-0015. `packages/domain`
  still imports `effect` only.
- **C2.4** The simulation harness moves to `packages/domain/src/testing/`
  with a `"./testing"` package export (ADR-0016); domain's own tests import
  it from `src/` and stay green; the main `"."` barrel does not re-export
  it.

### C3 — GameRepository adapter (apps/api/src/infra)

- **C3.1** `save` writes the full aggregate (`games`, `game_players`,
  `decks`, `user_cards`) **and** appends the new events to `game_events`
  plus one `card_peeks` row per `CardPeeked` — all in a single transaction.
  Sequence numbers are contiguous from 0 across the game's lifetime.
- **C3.2** `save` is guarded by `games.version` (optimistic concurrency): a
  save against a stale expected version fails with a typed conflict error
  and writes nothing (no partial aggregate, no orphan events).
- **C3.3** Rows map to domain types only through Schema codecs at the
  boundary: `load` returns a branded, decoded `GameState` whose `phase`
  round-tripped through the `Phase` codec; raw rows never leak out of the
  adapter.
- **C3.4** `games.status` is derived at save time: phase `Ended` ⇒
  `completed`, otherwise `in_progress` (`lobby`/`abandoned` are reserved
  for later tasks). Phase/status consistency is thereby structural.
- **C3.5** `final_score` is written for every player exactly when the game
  completes (materialized from `GameEnded.scores`) and is null before.
- **C3.6** Every read filters `deleted_at IS NULL` inside the repository; a
  soft-deleted game behaves as not-found. The domain never sees a
  `deleted_at`.
- **C3.7** SQL failures surface as typed errors in the Effect error
  channel; the adapter never throws across the layer boundary.
- **C3.8** `game_events.actor_id` is populated by an exhaustive per-tag
  mapping (compiler-checked `satisfies never` default); events with no
  actor (`GameStarted`, `SlamWindowClosed`, `DeckReshuffled`) store null.
- **C3.9** `getEvents(gameId)` returns the complete ordered stream decoded
  to `GameEvent` values.

### C4 — UserRepository adapter

- **C4.1** Create and fetch users (`user_id`, `user_name`) with the same
  codec-boundary, soft-delete-filtered, typed-error discipline as C3.
  (CAM-4 builds auth on this; nothing more is needed here.)

### C5 — Reconstruction & invariant proof

- **C5.1** Pure fold property (domain test, no DB): for a batch of seeded
  harness games, `foldEvents(run.events)` deep-equals `run.finalState` —
  phase and prng included — and for sampled mid-game steps, folding the
  event prefix deep-equals the intermediate state.
- **C5.2** Integration round-trip (apps/api test, Docker Postgres): persist
  harness games mid-flight and at completion through `GameRepository`;
  `foldEvents(getEvents(gameId))` deep-equals the live state, and `load`
  deep-equals it too (state tables and event log agree).
- **C5.3** The §4.5 invariants are asserted **verbatim against persisted
  rows** (the CAM-2 deferral): all 52 slugs partition across `decks.cards`
  - `user_cards` + `games.discard_pile` (+ any phase-held card) with no
    duplicates; no negative hand counts; `seat_index` contiguous from 0;
    final scores sum to the scores of all cards held at game end; phase
    `Ended` ⟺ status `completed`.
- **C5.4** Sharp-edge tests: version-conflict save rejected atomically
  (C3.2); a soft-deleted duplicate row does not block re-insert under the
  partial unique indexes (§7 gotcha 1); soft-deleted game invisible to
  reads (C3.6).

### C6 — Test & tooling infrastructure

- **C6.1** `migrate.ts` is refactored so the migration program is an
  exported, reusable Effect; `pnpm --filter @cambio/api migrate` behaves
  exactly as before.
- **C6.2** apps/api gains vitest + `@effect/vitest` (pinned to the
  workspace's exact versions), a `test` script, and integration-test setup
  that provisions/migrates an isolated `cambio_test` database on the same
  Docker Postgres via `TEST_DATABASE_URL` (added to `.env.example` and
  `turbo.json` — strict env mode strips undeclared vars).

### Acceptance criteria

- [x] Fresh database: migrate applies `0002_…`; second run reports no
      pending migrations.
- [x] `pnpm turbo build typecheck lint test` passes with Docker Postgres up
      (the full gate, including the new apps/api suite).
- [x] C5.1 fold property passes over the full harness batch; C5.2/C5.3
      round-trip + verbatim §4.5 invariants pass against Postgres.
- [x] CAM-1 + CAM-2 domain suites green after the C2.1 payload change and
      C2.4 harness move.
- [x] No derivable columns exist (grep the migration for
      `turn|face_up|size|winner|score|called_cambio` finds nothing beyond
      `final_score`).
- [ ] Review confirms: events appended in the same transaction as state,
      partial unique indexes, soft-delete filter only in repositories.

## Plan of work

Domain first (test-first, HANDOFF §12), infrastructure second; the fold is
proven **pure** before Postgres enters, so the DB suite only has to prove
persistence fidelity, not fold correctness. No `contracts` work exists to
freeze — this task has no wire surface, so there are no parallel lanes.

1. **M1 — Event payload extension (C2.1).** Add `prng` to
   `GameStarted`/`DeckReshuffled`, thread it through `Deal.ts` and
   `Engine.ts`, repair the ~affected domain tests. Small, unblocks the fold.
2. **M2 — Harness relocation (C2.4).** Move `test/sim/` modules to
   `src/testing/`, add the `"./testing"` export, update domain test
   imports. Mechanical; done early so later milestones import the final
   paths.
3. **M3 — foldEvents (C2.2, C5.1).** Test-first: the fold property over
   harness batches (final + mid-flight prefixes) drives out the
   transcription and phase-inference logic. All in `packages/domain`.
4. **M4 — Repository ports (C2.3).** Declare `GameRepository`/
   `UserRepository` in domain; typed error vocabulary
   (conflict/not-found/storage).
5. **M5 — Migration + test scaffolding (C1, C6).** Write `0002_…`, refactor
   `migrate.ts`, stand up apps/api vitest with the `cambio_test`
   provisioning setup. First integration test: migrate → introspect schema.
6. **M6 — Adapters (C3, C4).** `GameRepositoryLive` / `UserRepositoryLive`
   in `apps/api/src/infra/`, registered in `runtime.ts`. Codec boundary,
   transactional save, version guard, soft-delete filters.
7. **M7 — Round-trip & invariant suite (C5.2–C5.4).** Harness-driven
   persistence round-trips, verbatim §4.5 assertions against rows,
   sharp-edge tests. Full gate.

File-level detail lives in the [backend child plan](../backend/CAM-3.md).

## Validation

- `docker compose -f docker/docker-compose.yml up -d` then
  `pnpm --filter @cambio/api migrate` — applies `0002`; re-run prints "no
  pending migrations".
- `pnpm --filter @cambio/domain test` — CAM-1/2 suites + new fold property
  (fold ≡ live state across seeded batches; seeds reproduce failures).
- `pnpm --filter @cambio/api test` — integration suite against
  `cambio_test`: round-trips, §4.5-verbatim invariants, version conflict,
  partial-index and soft-delete edges.
- `pnpm turbo build typecheck lint test` — the gate; also proves the
  ESLint boundaries still hold after the `src/testing` move.

## Progress

_(updated continuously; append new entries at the BOTTOM — newest last;
timestamp each entry)_

- [x] 2026-08-31 — plan written; awaiting `/implement`
- [x] 2026-08-31 23:08 — M1: `prng` in `GameStarted`/`DeckReshuffled` (test-first); domain suite green
- [x] 2026-08-31 23:10 — M2: harness → `src/testing/` + `@cambio/domain/testing` export
- [x] 2026-08-31 23:14 — M3: `foldEvents` + `onStep` eventCount; fold ≡ live over the 250-game batch, final + prefixes, first run
- [x] 2026-08-31 23:16 — M4: `GameRepository`/`UserRepository` ports + `GameVersion`
- [x] 2026-08-31 23:20 — M5: `0002_cambio_schema.sql` (applied, idempotent), `migrate` exported, api vitest + `cambio_test` provisioning
- [x] 2026-08-31 23:27 — M6: both adapters, `runtime.ts` wiring; 16 api tests green
- [x] 2026-08-31 23:31 — M7: round-trip batch + §4.5-verbatim sweeps + sharp edges; **full gate 20/20 tasks green (51.5s)**
- [x] 2026-08-31 23:41 — `RT_GAMES=1000` deep run: 1000 games persisted and reconstructed, all 26 api tests green, wall time **8m37s**; `RT_GAMES=4` under `turbo test` proves the strict-env declaration is live; acceptance criteria checked (the review-owned box stays for `/review`)

## Decision log

_(planning decisions 2026-08-31, all confirmed with the user)_

- Aggregate-shaped `GameRepository` + small `UserRepository`, ports in
  domain — promoted to ADR-0015 (rejected table-per-repository).
- Event log made self-contained: `prng` recorded in shuffle events, fold =
  transcription + phase inference, no command replay — promoted to
  ADR-0014 (rejected shuffle-recompute and full phase transcription).
- Harness reuse via `@cambio/domain/testing` export subpath — promoted to
  ADR-0016 (rejected relative imports and relocating DB tests into domain).
- Scope: pure fold + tests only; recovery wiring lands in CAM-5. CAM-10's
  `HoldingCard` refinement stays separate — until it lands, decoded
  `games.phase` is trusted as written (exposure documented, accepted).
- Test bar: reuse the CAM-2 randomized harness for round-trip proofs, not
  scripted games only.
- `decks` keyed by `game_id`, no `DeckId` brand — exactly one deck per
  game (HANDOFF §4.1 locks this); the §4.3 sketch's surrogate `deck_id`
  dropped ("sketch, not final DDL").
- `called_cambio_by` column dropped: `CallCambio` ends the game immediately
  (`Engine.ts:94-103`), so it is always `phase.calledBy` when `Ended` —
  storing it would violate "store nothing derivable".
- `games` gains `prng` and `config` jsonb columns: `GameState` fields that
  postdate the §4.3 sketch; not derivable from other columns, required to
  load without folding.
- `status` derived from phase at save time (`Ended` ⇒ `completed`, else
  `in_progress`); `lobby`/`abandoned` enum values reserved for CAM-5/CAM-8.
- `final_score` stored per the sketch (materialized from `GameEnded`, null
  mid-game) — the §4.5 "scores sum" invariant checks stored against
  derived.
- `game_events.at` stores domain `Timestamp` (epoch-ms bigint) to match
  `Ids.ts:28`; row-bookkeeping `created_at`/`updated_at`/`deleted_at`
  remain timestamptz. Mixed deliberately: domain time vs. infrastructure
  time.
- `actor_id` nullable; exhaustive per-tag `actorOf` mapping (five actor
  field spellings across 22 events; two events actorless).
- Test isolation: `cambio_test` database on the same container,
  provisioned by test setup (`CREATE DATABASE` if missing + programmatic
  migrate), `TEST_DATABASE_URL` declared in `.env.example` and
  `turbo.json`.
- `migrate.ts` refactored to export the migration Effect (module-scope
  `runMain` prevents programmatic reuse today); CLI entry preserved.

_(reconciled from backend child-plan drafting, same day)_

- The fixture builders (`test/fixtures.ts`) move to `src/testing/` with the
  harness — `driver.ts`/`fuzz.ts` import them, so ADR-0016's move is
  impossible without them; a one-line shim keeps existing test imports
  untouched.
- The harness `onStep` hook gains an additive 4th parameter `eventCount` —
  C5.1's prefix property and C5.2's mid-flight saves need event-boundary
  alignment the hook doesn't expose today. Deliberate, backwards-compatible
  API change to the now-published harness; flagged for `/review`.
- `user_cards`, `card_peeks`, and `game_events` get surrogate identity PKs:
  a natural composite PK cannot be partial, and every unique constraint must
  be partial on `deleted_at IS NULL`. `game_players` keeps its natural PK
  per C1.3; `games`/`decks`/`users` PKs are single-column and unaffected.
- `SaveGameInput` carries an `at: Timestamp` — events (except `GameStarted`)
  have no timestamp by design (`GameEvent.ts:18-21`); the persistence layer
  stamps `game_events.at` from it.
- Round-trip batch sizing follows the CAM-2 convention: `RT_GAMES`/`RT_SEED`
  knobs, default 25 in the gate, `RT_GAMES=1000` deep run required locally
  before ship.
- (implementation) `actorOf(GameStarted) = null` — the deal is
  system-driven like the clock-close and auto-reshuffle; C3.8's actorless
  list is three events, not two.

## Surprises & discoveries

- Planning: HANDOFF §4.2/§4.3's phase sketch is stale (5 variants vs. the
  real 6, different fields) — the persisted jsonb follows `Phase.ts`.
- Planning: `GameState.prng` was unrecoverable from event payloads and
  phase is announced by no event — both resolved by ADR-0014.
- Planning: ESLint's boundary rules only deny `@cambio/*` imports, so a
  non-workspace violation (e.g. `@effect/sql-pg` inside domain) would pass
  lint silently. Out of CAM-3 scope; flagged as a separate harness task.
- Implementation: `@effect/sql-pg` 0.53.0 rides node-postgres, and two of
  its binding behaviours bit: `sql.json` of a JS array becomes a PG array
  literal (invalid json — the `PrngState` tuple), and `${array}` is an
  IN-list helper, never a PG array. The adapter pre-stringifies json params
  (`::jsonb` cast) and binds `text[]` via `string_to_array`; details in the
  backend plan's Surprises.

## Outcomes & retrospective

_(review 2026-08-31, two independent reviewers — contract + architecture — plus
an uncached gate run)_

**Verdict: fix-then-ship.** No contract clause is violated, no architecture
rule is broken, and nothing in the diff can reach a client. The fix list is
small and precise: one missing test assertion, three coverage-table rows that
claim more than their tests assert, and a handful of unlogged minor
deviations.

**What passed**

- Independently re-ran the gate uncached: `turbo build typecheck lint test
--force` → 20/20 tasks green (50.3s); migrate re-run "no pending migrations
  (2 applied)". `RT_GAMES=1000` deep run green (8m37s).
- All 27 contract clauses adjudicated **satisfied** (C3.1/C3.2 satisfied in
  code but their atomicity guarantee is untested — see findings).
- Architecture: all checks pass with evidence — domain (src + testing +
  test) imports `effect` only; ports/tags/layers per ADR-0015; no throw
  crosses a boundary (both `Sync` codec call sites wrapped); every adapter
  read/update filters `deleted_at IS NULL` (18-statement inventory);
  `game_events` never updated/deleted; migration discipline intact; barrel
  does not re-export testing (ADR-0016); `apps/web` untouched and unable to
  resolve the new subpath; env declarations match turbo's documented
  discipline.

**Findings — fix before ship**

1. **(F1) Rollback is untested and the coverage table says otherwise.** The
   C3.1 row claims "a failed save leaves zero event rows", but the conflict
   test fails at the transaction's _first_ statement, and the FK-violation
   test (`GameRepository.test.ts`, C3.7) — which genuinely fails
   mid-transaction after the `games` insert — asserts only the error tag,
   never that the `games`/`decks`/event rows for that game were rolled back.
   One count-assertion closes it.
2. **(F4, F5) Coverage-table overclaims.** C1.3's row claims
   `final_score`/`is_connected`/`is_bot` columns are asserted (no test
   introspects them); C1.5's row claims holes-survive-uncompacted is pinned
   (it rides probabilistically on load-equality). Strengthen the tests or
   correct the rows.
3. **(F3) The §4.5 partition sweep never exercises the phase-held-card
   term.** Every RoundTrip game's last save is `Ended`, so `HOLDING_TAGS` is
   dead code in practice — the partition is proven only at completion.
   Persist one game left mid-flight (or sweep at a mid-flight point) so the
   held-card branch runs.
4. **(F6, F7) Unlogged deviations.** `final_score` is sticky
   (`COALESCE(...)` never reverts it — an invariant C3.5 didn't ask for),
   and a save of an `Ended` state whose batch lacks `GameEnded` would write
   `completed` with null scores (unreachable today, unguarded);
   `GameRepositoryLive` yields `PgClient.PgClient` though nothing pg-specific
   remains after the `jsonb` helper replaced `sql.json` — inconsistent with
   `user-repository.ts`. Log both (or normalize the tag).
5. **(F9) Stale comment**: `0002_cambio_schema.sql`'s `actor_id` comment
   omits `GameStarted` from the actorless list. The migration is applied, so
   per the skill it is not edited — record the correction here and in the
   child plan rather than touching the file.

**Deferred / advisory** (logged, not blocking)

- Upserts on `game_players`/`decks` conflict on the full PK and never reset
  `deleted_at` — harmless today (nothing soft-deletes those tables), a real
  trap once CAM-8's sweeper exists. Carry into CAM-8.
- ESLint boundary deny-lists match exact package names, so
  `@cambio/domain/testing` is not covered for `apps/web` (pnpm's strict
  node_modules is the actual guard). Fold into the standing ESLint-gap task
  along with the non-workspace-import gap.
- `GameVersion.make` at three adapter sites throws-as-defect on invalid
  input (unreachable; hygiene). The C3.2 UPDATE-branch race
  (`expected:1, actual:2`) and the empty-`text[]` boundary
  (`string_to_array('', ',') = {}`) are untested edges. Test setup TRUNCATE
  has no `_test`-suffix guard beyond loud comments.
- `user_cards` tombstones grow linearly with saves (soft-delete-then-
  reinsert by design); CAM-8's sweeper is load-bearing, and `created_at` on
  a card row means "last save", not "dealt at".
- HANDOFF §4.3's sketch still lists `called_cambio_by` and a status enum;
  the migration deviates (justified in-file and in the Decision log). An
  eventual §4.3 amendment would close the loop.

**Carry into next tasks:** CAM-5 consumes `GameRepository.save/load/getEvents`
and `foldEvents` as designed; CAM-8 must address the upsert/`deleted_at`
interaction and the tombstone volume; CAM-10's `HoldingCard` refinement now
has a live decode path to harden (`games.phase` jsonb via `load`).

**Verdict: fix-then-ship** — address findings 1–5, re-run the gate, then
`/ship CAM-3`.
