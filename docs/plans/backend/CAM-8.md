# CAM-8 — Data lifecycle: pg_cron soft/hard-delete jobs (backend)

- **Root plan:** [root/CAM-8.md](../root/CAM-8.md) — the functional contract
  (clauses C1–C10) lives there; this document is implementation detail for
  the backend side.
- **ADRs:** [ADR-0025](../../adr/0025-data-lifecycle-sql-functions-guarded-pg-cron.md)
  (this task's design — SQL functions, guarded pg_cron scheduling, row-level
  hard-delete). Governing context: ADR-0019 (lobbies are `games` rows),
  ADR-0020 (idle room actors stay resident), ADR-0002 (migration runner).

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

Everything lands in `apps/api` — one migration, two small repository edits,
and tests. No domain, application, or contracts changes; the architecture
skill's import table is trivially satisfied. The governing layer skill is
**infrastructure-persistence**: plain-SQL migrations through the hand-rolled
runner, never edit an applied migration (comment corrections go in the new
migration's header), partial uniques stay partial, the `deleted_at IS NULL`
filter lives in the repository layer and the domain never sees soft delete.
This migration is also the first code permitted to delete `game_events`
rows — the append-only carve-out that `0002`'s header and the skill both
name for exactly this lifecycle (ADR-0025).

The surfaces this task builds on, as they exist today (verified against
release-v0 tip, 2026-09-03):

- **Migration runner** (`apps/api/src/infra/migrate.ts:48-58`): each
  `NNNN_name.sql` file applies via one `sql.unsafe(contents)` call inside
  one transaction, no error tolerance. Multi-statement files and
  dollar-quoted function bodies are fine (single round-trip), but a bare
  `CREATE EXTENSION pg_cron` aborts the whole file on the Docker
  `postgres:17-alpine` image, where the extension does not exist. Hence
  ADR-0025's guard: check `pg_available_extensions` before touching
  pg_cron. On Supabase pg_cron is available (it lives in the `postgres`
  database, which is exactly what `DATABASE_URL` points at), so the same
  file schedules the jobs there.
- **Schema** (`apps/api/migrations/0002_cambio_schema.sql`, relaxed by
  `0003_lobby_rows.sql`): seven tables, all with
  `created_at`/`updated_at`/`deleted_at`. FK graph — `game_players` →
  `games` + `users`; `decks` → `games` (PK **is** the FK); `user_cards` →
  `games` + `users`; `card_peeks` → `games` + `users` (`viewer_id`);
  `game_events` → `games` only (`actor_id` carries **no** FK). No
  `ON DELETE CASCADE` anywhere, and none of the FK columns are indexed
  today. The `games_dealt_columns_present` CHECK (0003) exempts
  `status IN ('lobby','abandoned')` — which is why the expiry UPDATE must
  scope `status = 'lobby'` explicitly (C1): the CHECK would happily accept
  a dealt game flipped to `'abandoned'`.
- **Repository** (`apps/api/src/infra/game-repository.ts`): every read
  path filters `deleted_at IS NULL` (verified exhaustively across this
  file and `user-repository.ts` in root-plan exploration — C9's standing
  half). The CAM-3 carry-forward bugs, **fixed in M2 (as built)**: the
  `game_players` and `decks` upserts in `save()` now set
  `deleted_at = NULL` in their `DO UPDATE` clauses, mirroring the
  `saveLobby` member upsert that was always correct; the `user_cards`
  tombstoning UPDATE in `save()` now sets `updated_at = now()` alongside
  `deleted_at` (root Decision Log consistency call). `saveLobby`'s
  version guard (`WHERE version = expectedVersion` in its UPDATE branch)
  is what C2 leans on: the expiry function bumps `games.version`, so a
  stale `saveLobby` misses the predicate and surfaces the typed
  `VersionConflict` (mechanism pinned by `LobbyRepository.test.ts` — "a
  stale expectedVersion is a typed VersionConflict and the row is
  untouched (13b)").
- **`users` semantics**: the single INSERT in `user-repository.ts` is the
  only write — never an UPDATE — so `users.updated_at` is dead and
  ADR-0025's user criterion is `created_at` age plus no live
  `game_players` references.
- **Existing test discipline** (`apps/api/vitest.config.ts`:
  `fileParallelism: false`, 30s timeout; `test/global-setup.ts` migrates
  and truncates `cambio_test` once per run): suites share one database and
  isolate by id prefix, not cleanup. Claimed game-id prefixes (4th UUID
  group): `9000` fixtures/HTTP suites, `a000` GameRepository, `b000`
  LobbyRepository (also its UserId prefix in GameRepository.test.ts),
  `c000` RoundTrip, `d000` SharpEdges. User ids: `ensureRosterUsers` seeds
  `uid(0..4)` (`8000-` prefix, `test/support/db.ts:39-48`),
  UserRepository.test.ts uses `9000-`. The new Lifecycle suite claims
  **`e000`** for both its game ids and its raw-inserted user ids.
  `Migrations.test.ts` pins the exact applied-migration list ("re-running
  migrate is a no-op (C1.1, C6.1)"), the exact `public` table list ("0002
  creates the seven §4.3 tables, each with soft-delete columns (C1.1)" —
  so **no new tables**, per root Decision Log no audit table), and sweeps
  `pg_indexes` for names `LIKE '%_key'` ("every unique constraint is
  partial on deleted_at (C1.3, C1.5, C1.7)") — so **new lifecycle index
  names must not end in `_key`** (use `_idx`). Raw-SQL assertions follow
  the local `sqlRows`/`rowsOf` helper idiom (`Migrations.test.ts:17-22`,
  `RoundTrip.test.ts:161-166`).
- **Cross-suite hazards for the sweeps** (root plan M3): other suites'
  rows all carry near-`now()` timestamps — they never qualify under the
  production-default cutoffs (24h/30d/7d). The iron rule: the Lifecycle
  suite **backdates its own rows** (direct UPDATEs of
  `updated_at`/`deleted_at`/`created_at`) and calls the functions with
  default or explicit cutoffs that only backdated rows can clear. It never
  passes a cutoff at or near `now()` — `lifecycle_hard_delete(now())`
  would reap the tombstones SharpEdges and RoundTrip just wrote.
  RoundTrip's batch-wide card-partition sweep reads only
  `deleted_at IS NULL` rows of `c000` games, so hard-deleting ancient
  (backdated) tombstones cannot disturb it. No conditional skips: the
  functions exist on Docker Postgres after 0004, so the suite hard-fails
  when infra is down (RealtimeIntegration precedent).

Files touched:

| File                                          | Change                                       |
| --------------------------------------------- | -------------------------------------------- |
| `apps/api/migrations/0004_data_lifecycle.sql` | new — functions, indexes, guarded scheduling |
| `apps/api/test/Migrations.test.ts`            | applied-list + 0004 introspection            |
| `apps/api/src/infra/game-repository.ts`       | upsert resurrection + tombstone `updated_at` |
| `apps/api/test/SharpEdges.test.ts`            | C8 regression tests                          |
| `apps/api/test/Lifecycle.test.ts`             | new — integration suite for C1–C7, C9        |
| `docs/plans/root/CAM-8.md`, this file         | living-doc updates                           |

## Plan of work

### M1 — Migration `0004_data_lifecycle.sql` + Migrations suite update

Create `apps/api/migrations/0004_data_lifecycle.sql`. One file, applied in
one transaction by the runner; everything below is plain SQL. Header
comment: name the append-only carve-out (this is the code `0002`'s
`game_events` comment promised), cite ADR-0025, and state the retention
defaults. Contents, in order:

1. **Supporting indexes** — names ending `_idx`, never `_key`. Advisory
   set, sized to the sweep predicates and the hard-delete FK checks on
   tables that will grow (this is a hobby-scale database; do not gold-plate
   beyond what the sweeps scan):
   - `games (status, updated_at)` partial `WHERE deleted_at IS NULL` —
     drives both the expiry and soft-delete eligibility scans.
   - Per-table partial indexes on `deleted_at` `WHERE deleted_at IS NOT
NULL` for the row-level hard-delete scans (at minimum `user_cards`,
     the table where live games accumulate tombstones on every save).
   - FK-side indexes for the user gating and game-scoped dependent sweeps:
     `game_players (user_id)`, `user_cards (user_id)`,
     `card_peeks (viewer_id)`, and `game_id` on the dependent tables that
     lack a leading-`game_id` index. Check `pg_indexes` before adding any:
     several dependents already have partial uniques leading on `game_id`
     (e.g. `user_cards_slot_key`), which the planner can use — add only
     what is missing, and record the final set in this plan's Progress.
2. **`lifecycle_expire_lobbies(cutoff timestamptz DEFAULT now() - interval
'24 hours') RETURNS integer`** — single UPDATE per C1:
   `status = 'abandoned'`, `version = version + 1`,
   `updated_at = now()` on rows with `status = 'lobby'` (explicit — the
   CHECK exemption trap above), `deleted_at IS NULL`,
   `updated_at < cutoff`. Returns the affected-row count (root Decision
   Log: counts instead of an audit table). The version bump is
   load-bearing for C2; do not "optimize" it away.
3. **`lifecycle_soft_delete(game_cutoff timestamptz DEFAULT now() -
interval '30 days', user_cutoff timestamptz DEFAULT now() - interval
'30 days')`** — games first, then users (root Decision Log ordering),
   one captured timestamp so every row the call tombstones carries the
   identical stamp — already-tombstoned rows are untouched and keep their
   earlier stamps, since the sweep only targets `deleted_at IS NULL` rows
   (C3 as amended by review F1; a plpgsql variable or CTE over
   one `now()` — implementer's choice). Games: `status IN ('completed',
'abandoned')`, `deleted_at IS NULL`, `updated_at < game_cutoff`;
   dependents: all rows of those games across `game_players`, `decks`,
   `user_cards`, `card_peeks`, `game_events` with `deleted_at IS NULL`.
   Users: `created_at < user_cutoff`, `deleted_at IS NULL`, and `NOT
EXISTS` a `game_players` row with `deleted_at IS NULL` for that user
   (the live-reference check — C5). Returns affected counts (a composite
   or two OUT params; advisory).
4. **`lifecycle_hard_delete(cutoff timestamptz DEFAULT now() - interval
'7 days') RETURNS integer`** (or per-table counts) — row-level per
   table, `deleted_at < cutoff`, children before parents:
   `user_cards`, `card_peeks`, `game_events`, `game_players`, `decks`,
   then `games`, then `users`. `users` is additionally gated on `NOT
EXISTS` **physically remaining** rows referencing the user in
   `game_players`, `user_cards`, or `card_peeks` — with **no**
   `deleted_at` filter on the subqueries, because even a tombstoned child
   row still holds the FK (`game_events.actor_id` has no FK and does not
   gate). `games` needs no such gate under the shared-tombstone invariant
   from step 3 (a qualifying game's children qualify too and are already
   deleted this run), but a symmetric `NOT EXISTS` guard is acceptable
   belt-and-braces; either way C6's "no FK violation" must hold. Note this
   function must not assume tombstoned parents: C7's whole point is that
   it reaps `user_cards` tombstones of **live** games.
5. **Guarded scheduling** — a `DO $$ ... $$` block: `IF EXISTS (SELECT 1
FROM pg_available_extensions WHERE name = 'pg_cron') THEN` create the
   extension (`IF NOT EXISTS`) and `cron.schedule` three named jobs —
   hourly `lifecycle_expire_lobbies()`, weekly `lifecycle_soft_delete()`,
   daily `lifecycle_hard_delete()` — all calling with defaults. Named jobs
   make re-registration idempotent on pg_cron; on Docker the branch is
   simply skipped and the migration still succeeds (C10). Since
   `cron.schedule` is only resolvable inside the guard, invoke it via
   dynamic SQL (`EXECUTE`/`PERFORM`) so the DO block parses where pg_cron
   is absent.

Update `apps/api/test/Migrations.test.ts` in the same step: the
applied-list assertion gains `"0004_data_lifecycle.sql"`, and add
introspection for the new objects — the three `lifecycle_*` functions
exist in `pg_proc` and are callable, and the new index names avoid the
`%_key` suffix (keeping the partial-uniques sweep untouched). The
seven-table assertion must pass **unchanged** — if it fails, the migration
grew a table it must not have.

Checkpoint: migration applies to both databases, api suite green.

### M2 — Repository fixes + C8 regression tests

Three one-line edits in `apps/api/src/infra/game-repository.ts`, all
mirroring the `saveLobby` reference member upsert (as built — line refs
dropped at close-out because this diff moved them):

- `game_players` upsert in `save()`: `deleted_at = NULL` added to the
  `DO UPDATE` set list.
- `decks` upsert in `save()`: same.
- `user_cards` tombstoning UPDATE in `save()`: `updated_at = now()`
  added (consistency with the `saveLobby` member soft-delete, which
  already set it; root Decision Log).

Regression tests for C8 go in `apps/api/test/SharpEdges.test.ts` (it owns
the §7 soft-delete edges and already has the simulated-run fixtures; new
tests claim fresh `gid(n)` values in its `d000` range). Intent: persist a
game, tombstone one `game_players` row and the `decks` row by direct SQL,
`save()` again at the correct version, then assert the rows are live again
(`deleted_at IS NULL`) and `load` returns the full seat roster and deck.
The neighbouring pinned test "a soft-deleted row does not block re-insert
under the partial unique indexes (§7 gotcha 1)" covers the insert path;
these tests cover the conflict-update path that CAM-3 left broken.

Checkpoint: api suite green (the new tests fail before the M2 edits, pass
after — do the test-first dance within this step).

### M3 — `apps/api/test/Lifecycle.test.ts` (C1–C7, C9)

New integration suite over `makeTestRuntime()` + `ensureRosterUsers`
(simulated games seat `uid(0..1)`), following the SharpEdges shape: local
`gid`/`v` helpers on the **`e000`** game-id prefix, a local user-id helper
on the **`e000`** user-id prefix for raw-inserted users, raw SQL through
the runtime per the `sqlRows` idiom, `afterAll` disposes the runtime.

Fixture mechanics, per the isolation rule (Context above):

- Lobbies via `GameRepository.saveLobby` (so C2 exercises the real port),
  then backdated with a direct `UPDATE games SET updated_at = ...`.
- Dealt games via `simulateGame` + `save` (SharpEdges pattern); a second
  `save` at the next version manufactures `user_cards` tombstones for C7.
- Users for C5/C6 via raw `INSERT INTO users` with explicit `e000` ids,
  backdated via `UPDATE users SET created_at = ...` (or `deleted_at` for
  C6).
- Function calls are raw `SELECT lifecycle_*(...)` with defaults where the
  backdating suffices (25 hours / 31 days / 8 days) — never a cutoff at or
  after other suites' write times.
- Assert **populations, not just counts**: the swept rows changed exactly
  as specified and the control rows are byte-identical (snapshot the full
  row before, compare after — C1/C4/C5's "untouched" sentences are the
  teeth). Return-count assertions are safe to make exact under the
  backdating discipline (no other suite's rows can qualify), but the
  row-state assertions are the primary evidence.

Planned test intents (titles are `/implement`'s to write, per the coverage
rule):

- **C1**: one backdated lobby, one fresh lobby, one backdated
  `in_progress` game, one backdated already-`abandoned` row; default-cutoff
  expiry flips only the backdated lobby (status, version+1, `updated_at`
  bumped) and touches nothing else.
- **C2**: expire a lobby out from under a held `expectedVersion`; the
  stale `saveLobby` is a typed `VersionConflict` and the row stays
  `'abandoned'`.
- **C3** _(as amended by review F1, and as built with a saved-twice
  fixture)_: a completed game saved twice (so it carries pre-existing
  `user_cards` tombstones), backdated 31 days; one soft-delete call
  tombstones the game and every still-live dependent row at the sweep
  stamp, while the earlier tombstones keep stamps strictly before it
  (count-preserved).
- **C4**: backdated `in_progress` game, fresh lobby, completed game
  backdated only 10 days — full-row snapshots unchanged by the sweep.
- **C5**: three raw users — 31 days old with no refs (tombstoned), 31 days
  old with a live `game_players` ref (survives), 1 day old with no refs
  (survives).
- **C6**: rows with `deleted_at` backdated 8 days across the seven tables
  are physically gone after hard-delete; rows with recent or NULL
  `deleted_at` remain; a user with an 8-day tombstone but a physically
  remaining (recently tombstoned) `game_players` ref survives; the call
  raises no FK error.
- **C7**: a live game saved twice, its tombstoned `user_cards` backdated 8
  days; `load` before and after hard-delete deep-equal, tombstones
  physically gone.
- **C9**: after the C3 sweep, the swept game behaves per the pinned
  semantics — `load`/`getEvents` are `GameNotFound`, `save` is
  `VersionConflict` (same shape as SharpEdges "a soft-deleted game behaves
  as not-found (C3.6)", now reached via the lifecycle function instead of
  a hand-written tombstone).

Checkpoint: api suite green.

### M4 — Gate + close-out

Full bare gate, reconcile the coverage table below against as-built tests
(fill file + name + assertion phrase per row), grep this plan and the root
for `:<digits>` citations into files the diff touched, update root-plan
Progress/Decision Log/Surprises, update Linear. C10's Supabase half is
recorded as a deploy-time manual verification in the Linear issue (root
plan Validation) — nothing in the local suite claims it.

## Concrete steps & validation

Every checkpoint assumes Docker Postgres is up:

```bash
docker compose -f docker/docker-compose.yml up -d
```

**M1** — apply and verify locally (dev database first, then the suite,
whose global-setup migrates `cambio_test`):

```bash
pnpm --filter @cambio/api migrate
docker exec -i cambio-postgres psql -U cambio -d cambio -c '\df lifecycle_*'
pnpm turbo test --filter @cambio/api
```

Success: migrate logs `applied 0004_data_lifecycle.sql` (idempotent on
re-run: `no pending migrations`); `\df` lists the three functions (C10
local half, observed by hand); the Migrations suite passes with the
updated applied list and the unchanged seven-table assertion. (Adjust the
container name if `docker ps` shows a different one.)

**M2 / M3** — after each step:

```bash
pnpm turbo test --filter @cambio/api
```

Success: all api suites pass — including the untouched GameRepository,
LobbyRepository, RoundTrip, and SharpEdges suites, whose continued green
is itself evidence the sweeps' test fixtures respected the isolation rule.

**M4** — the full gate, bare, never piped (check the exit status
directly):

```bash
pnpm turbo build typecheck lint test
```

## Contract coverage

_(maintained by `/implement`, verified by `/review`: one row per root-plan
contract clause this side owns. **At plan time only the Clause column and a
planned-approach note are filled**; test file, test name, and the
assertion phrase are written by `/implement` as each test lands — a
plan-time row that invents a test title is an overclaim waiting to become
a review finding.)_

| Clause | Test (file + name)                                                                                                                                                                                                                              | What is asserted                                                                                                                                                                                                                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1     | `test/Lifecycle.test.ts` — "expiry abandons exactly the idle lobbies — version bumped, everything else untouched (C1)"                                                                                                                          | return count is exactly 1; the idle lobby's status is `abandoned`, version bumped 1→2, `updated_at` fresh; full-row `to_jsonb` snapshots of the fresh lobby, backdated in-progress game, and backdated abandoned row are strict-equal before/after                                                                          |
| C2     | `test/Lifecycle.test.ts` — "a saveLobby holding the pre-expiry version is a VersionConflict; the row stays abandoned (C2)"                                                                                                                      | `saveLobby` at the pre-expiry version fails with typed `VersionConflict` (expected 1, actual 2) and the row's status remains `abandoned`                                                                                                                                                                                    |
| C3     | `test/Lifecycle.test.ts` — "soft-delete tombstones an old ended game — rows it tombstones share the sweep stamp, earlier tombstones keep theirs (C3)"                                                                                           | on a saved-twice game (pre-existing `user_cards` tombstones proven `> 0`): zero live rows remain; tables without prior tombstones have every row at the sweep stamp; `user_cards` rows at the sweep stamp equal the pre-sweep live count and earlier-stamped tombstones are count-preserved strictly before the sweep stamp |
| C4     | `test/Lifecycle.test.ts` — "soft-delete leaves in-progress games, lobbies, and fresh ended games byte-identical (C4)"                                                                                                                           | sweep returns `{games: 0, users: 0}` and the three control rows' full-row `to_jsonb` snapshots are strict-equal before/after                                                                                                                                                                                                |
| C5     | `test/Lifecycle.test.ts` — "soft-delete sweeps only old users with no live game_players reference (C5)"                                                                                                                                         | `swept_users` is 1; the 31-day ref-free user is tombstoned; the 31-day referenced user and the fresh user keep `deleted_at IS NULL`                                                                                                                                                                                         |
| C6     | `test/Lifecycle.test.ts` — "hard-delete removes old tombstones children-first, keeps fresh ones, and FK-gates users (C6)"                                                                                                                       | the 8-day-tombstoned game has zero physical rows across all six tables; the 1-day-tombstoned game keeps all rows (exact before/after count equality, review F2); the FK-referenced user survives, the ref-free one is gone; call raises no error                                                                            |
| C7     | `test/Lifecycle.test.ts` — "hard-delete reaps a live game's old user_cards tombstones without disturbing the game (C7)"                                                                                                                         | backdated tombstone count goes >0 → 0, live-row count unchanged, and `load().state` is deep-equal before/after the sweep                                                                                                                                                                                                    |
| C8     | `test/SharpEdges.test.ts` — "save() resurrects tombstoned game_players/decks rows and keeps tombstone bookkeeping consistent (CAM-8 C8)"                                                                                                        | after tombstoning a seat + the deck and re-saving, live seat count equals the roster and the deck row is live; no `user_cards` tombstone has `updated_at < deleted_at`; `load().state` unchanged                                                                                                                            |
| C9     | `test/Lifecycle.test.ts` — "a lifecycle-swept game behaves per the pinned soft-delete semantics (C9)"                                                                                                                                           | after `lifecycle_soft_delete`, `load` and `getEvents` fail `GameNotFound` and `save` fails `VersionConflict` with `actual: null` — the SharpEdges C3.6 shape via the lifecycle function                                                                                                                                     |
| C10    | `test/Migrations.test.ts` — "the three lifecycle functions exist and are callable on pg_cron-less Postgres (C10)", "lifecycle index names stay out of the \_key namespace (C10)", plus the updated "re-running migrate is a no-op (C1.1, C6.1)" | all three functions in `pg_proc` and callable with ancient cutoffs returning 0; index-name set exact, none ending `_key`; applied list includes `0004_data_lifecycle.sql`. **Supabase half (cron job registration) is manually verified at deploy time** — no local test claims it                                          |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [x] 2026-09-03 — plan authored (planning session; no implementation
      started).
- [x] 2026-09-03 12:40 — M1 done: `0004_data_lifecycle.sql` (8 indexes,
      3 functions, guarded DO block) applies on pg_cron-less Docker;
      functions verified callable by hand (`\df` + ancient-cutoff calls
      all returning 0); Migrations suite updated (applied list + two new
      0004 tests) — 19 files / 103 tests green.
- [x] 2026-09-03 12:42 — M2 done test-first: C8 regression added to the
      SharpEdges suite (red at 1 live seat pre-fix), then the three
      one-line repository edits (upserts gain `deleted_at = NULL`, the
      user_cards tombstoning UPDATE gains `updated_at = now()`); suite
      green. The regression also pins the tombstone-bookkeeping
      consistency (no tombstone with `updated_at < deleted_at`).
- [x] 2026-09-03 12:46 — M3 done: `test/Lifecycle.test.ts` (8 tests,
      prefix `e000`, backdating discipline throughout, default cutoffs
      only) covering C1–C7 and C9; full api suite green (20 files / 112
      tests) — the untouched suites' continued green is the isolation
      evidence.
- [x] 2026-09-03 12:50 — M4 done: full bare gate green (22/22 turbo
      tasks); coverage table filled with as-landed test names; line-ref
      sweep done (game-repository.ts citations converted to descriptive
      anchors — this diff shifted them).
- [x] 2026-09-03 13:10 — review fix cycle: C3 test reworked to a
      saved-twice fixture with sweep-stamp-scoped assertions (F1); C6
      fresh-game assertion strengthened to exact before/after count
      equality (F2); all doc instances of the old C3 claim amended,
      including the M3 test-intent bullet the re-review caught. Suite
      and full gate green.

## Surprises & notes for the root plan

- 2026-09-03 (M1) — the per-step checkpoint command must be
  `pnpm turbo test --filter @cambio/api`, not the bare package script:
  `pnpm --filter @cambio/api test` skips building workspace deps and
  fails with import-shaped errors (`.pipe` of undefined) when dist is
  stale. The Concrete-steps section has been corrected accordingly.
- 2026-09-03 (M1) — final index set (plan's advisory list, confirmed):
  `games_lifecycle_sweep_idx` on games (status, updated_at) partial on
  live rows; `user_cards_tombstone_idx` on deleted_at partial on
  tombstones; full FK-side indexes `game_players_user_idx`,
  `user_cards_user_idx`, `card_peeks_viewer_idx`, `user_cards_game_idx`,
  `card_peeks_game_idx`, `game_events_game_idx`. Tombstone-scan partials
  on the other six tables were skipped (their tombstones only arrive via
  the game sweep and age out in one batch).
