# CAM-8 — Data lifecycle: pg_cron soft/hard-delete jobs

- **Linear:** [CAM-8](https://linear.app/raafayk7/issue/CAM-8/data-lifecycle-pg-cron-softhard-delete-jobs)
- **Scope:** backend
- **Child plans:** [backend](../backend/CAM-8.md)
- **ADRs:** [0025](../../adr/0025-data-lifecycle-sql-functions-guarded-pg-cron.md)

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

After this task, stale data reaps itself: abandoned lobbies get marked
within hours, ended games and orphaned users get soft-deleted after 30
days, and tombstoned rows — including the `user_cards` tombstones that
every live-game save produces — get physically deleted a week after
tombstoning. Observe it locally by calling the three `lifecycle_*` SQL
functions against Docker Postgres (the integration suite does exactly
that); on Supabase the same migration registers them as pg_cron jobs.

## Context & orientation

Everything lives in `apps/api` (infrastructure layer only — no domain,
application, or contracts changes; no wire schemas move). Governing docs:
HANDOFF §7, the `infrastructure-persistence` skill, ADR-0025 (this task's
design), ADR-0019 (lobbies are `games` rows; last-leaver already writes
`status='abandoned'`), ADR-0020 (room actor; idle actors stay resident by
design).

Current state, established by exploration (2026-09-03):

- Seven tables (migration `0002`), all with `deleted_at` and partial
  unique indexes `WHERE deleted_at IS NULL` — CAM-3 shipped the §7
  precondition. Migration `0003` made lobby rows representable.
- **No triggers maintain `updated_at`** — it is hand-written in
  `apps/api/src/infra/game-repository.ts` only. Every game/lobby mutation
  bumps `games.updated_at` (the `save` and `saveLobby` UPDATE branches
  both set it), so it is a faithful last-activity timestamp for games.
  **`users.updated_at` is dead**: `users` is INSERT-only (the single
  INSERT in `user-repository.ts` is the sole write; session verification
  is a pure SELECT), hence ADR-0025's user criterion uses `created_at`
  plus the live-reference check.
- CAM-3 carry-forwards aimed at this task (root plan CAM-3, Outcomes),
  **both closed by this task's M2**: the `game_players`/`decks` upserts
  in `save()` never reset `deleted_at` pre-fix (they now do, mirroring
  the `saveLobby` member upsert that always did); and `save()` tombstones
  every `user_cards` row on every save (the rewrite step in `save()`), so
  hard-delete reaping is load-bearing housekeeping.
- The migration runner (`src/infra/migrate.ts`) applies each file in one
  transaction, no error tolerance — the pg_cron scheduling must be
  guarded (ADR-0025) or it aborts migration on Docker.
- `apps/api/test/Migrations.test.ts` asserts the exact applied-migration
  list and the exact table list — adding `0004` must update the former,
  and this task adds **no new tables** so the latter stays.

## Functional contract

All clauses about existing system behavior below are pinned by cited
tests or verified file:line reads from the 2026-09-03 exploration; new
behavior gets tests per the coverage table in the backend child plan.

**C1 — Lobby expiry.** Calling `lifecycle_expire_lobbies(cutoff)` sets
`status='abandoned'`, increments `version`, and bumps `updated_at` on
exactly the `games` rows with `status='lobby'`, `deleted_at IS NULL`, and
`updated_at < cutoff`. Rows in any other status (including dealt
`in_progress` games, which the `games_dealt_columns_present` CHECK would
otherwise let through) and lobbies at or after the cutoff are untouched.
The default cutoff is `now() - interval '24 hours'`.

**C2 — No lobby resurrection.** After C1 abandons a lobby, a `saveLobby`
carrying the pre-abandon `expectedVersion` fails as a typed
`VersionConflict` and the row remains `'abandoned'`. (The guard mechanism
is pinned by `LobbyRepository.test.ts` — "a stale expectedVersion is a
typed VersionConflict and the row is untouched (13b)"; the version bump in
C1 is what makes the guard fire here.)

**C3 — Game soft-delete.** Calling `lifecycle_soft_delete(...)` tombstones
(sets `deleted_at`) every `games` row with
`status IN ('completed','abandoned')`, `deleted_at IS NULL`, and
`updated_at` older than the game cutoff (default 30 days), together with
**all still-live** dependent rows of those games across `game_players`,
`decks`, `user_cards`, `card_peeks`, and `game_events`. Every row the
call tombstones carries the same timestamp; rows already tombstoned
earlier (e.g. a game's accumulated `user_cards` rewrite tombstones) are
not modified and keep their original stamps. _(Amended in the review fix
cycle — the original "a game and its dependents carry the same tombstone
timestamp" overstated: it holds only for games with no prior tombstones;
review F1.)_

**C4 — Soft-delete touches nothing else.** `in_progress` games,
`'lobby'` rows, and ended games newer than the cutoff are not modified by
`lifecycle_soft_delete` in any column.

**C5 — User soft-delete.** The same call tombstones every `users` row
with `created_at` older than the user cutoff (default 30 days) that has
**no** `game_players` row with `deleted_at IS NULL` referencing it. A
user with any live reference survives regardless of age; a user younger
than the cutoff survives regardless of references.

**C6 — Hard-delete.** Calling `lifecycle_hard_delete(cutoff)` physically
deletes every row whose `deleted_at` is older than the cutoff (default 7
days) across all seven tables, children before parents, `users`
additionally gated on no physically remaining referencing rows. No
foreign-key violation is raised; rows with `deleted_at` at/after the
cutoff or `NULL` remain.

**C7 — Live-game tombstone reaping.** A live (`in_progress`) game's
tombstoned `user_cards` rows older than the hard-delete cutoff are
removed while the game's live rows are untouched: `GameRepository.load`
returns the same state before and after the sweep.

**C8 — Upsert resurrection (carry-forward fix).** After a `game_players`
or `decks` row of a game is tombstoned, a subsequent
`GameRepository.save` of that game resurrects the row
(`deleted_at = NULL`) and a following `load` returns the full seat roster
and deck. (Re-insert over tombstones under the partial uniques is pinned
by `SharpEdges.test.ts` — "a soft-deleted row does not block re-insert
under the partial unique indexes (§7 gotcha 1)"; this clause adds the
upsert-path resurrection that CAM-3 left broken.)

**C9 — The domain never sees soft-delete.** After any sweep, swept games
behave exactly per the existing pinned semantics — `load`/`getEvents`
yield `GameNotFound`, `save` yields `VersionConflict` (pinned by
`SharpEdges.test.ts` — "a soft-deleted game behaves as not-found
(C3.6)"). Every repository read path filters `deleted_at IS NULL`
(verified exhaustively across `game-repository.ts` and
`user-repository.ts` on 2026-09-03); this task adds no read path that
does not.

**C10 — Local applicability, guarded scheduling.** Migration
`0004` applies cleanly on pg_cron-less Docker Postgres — the scheduling
block is skipped by the availability guard and the three `lifecycle_*`
functions exist and are callable afterwards. On a host where pg_cron is
available, the same migration registers the three cron jobs (hourly
expiry, weekly soft-delete, daily hard-delete). The Supabase half is
verified manually at deploy time and cannot be asserted by the local
suite; the local half is tested.

### Acceptance criteria

- [x] All contract clauses C1–C10 hold, each new-behavior clause covered
      by the backend child plan's coverage table (C10's Supabase half
      deferred to deploy-time manual verification as specified).
- [x] `apps/api/test/Migrations.test.ts` updated: applied list includes
      `0004`; table-list assertion unchanged (no new tables).
- [x] No changes outside `apps/api` + plan docs (import boundaries
      trivially hold).
- [x] The quality gate passes: `pnpm turbo build typecheck lint test`
      (run bare — 22/22 tasks, 2026-09-03).

## Plan of work

No contracts-package changes exist, so there is no schema freeze to
sequence around; the milestones are ordered by dependency.

**M1 — Migration `0004_data_lifecycle.sql`.** The three `lifecycle_*`
functions (cutoff parameters with production defaults per ADR-0025),
supporting indexes for the sweep predicates and FK checks (names must not
end in `_key` — the Migrations suite asserts over that suffix), and the
guarded `DO` block that creates the pg_cron extension and schedules the
three jobs only where `pg_available_extensions` offers pg_cron. Update
`Migrations.test.ts` in the same step so the suite stays green.

**M2 — Repository fixes.** Add `deleted_at = NULL` to the `game_players`
and `decks` upserts in `save()` (mirroring the `saveLobby` upsert), and
add `updated_at = now()` to the `user_cards` tombstoning UPDATE for
consistency. Regression tests for C8.

**M3 — Lifecycle integration suite.** New `apps/api/test` suite owning
its own game-id prefix, exercising C1–C7 and C9 against Docker Postgres
by backdating its own rows (direct UPDATEs of `updated_at`/`deleted_at`/
`created_at`) and calling the functions — never by mass-deleting at
`now()`, which would cross other suites' data. Details and the
cross-suite hazards are in the backend child plan.

**M4 — Close-out.** Full gate, coverage table reconciliation, Linear
update.

## Validation

Beyond the acceptance criteria: the integration suite is the proof — each
lifecycle function is called with backdated fixtures and explicit or
default cutoffs, asserting both the swept and the untouched populations
(the untouched half is what catches over-broad predicates, C1/C4/C5's
second sentences). `pnpm --filter @cambio/api migrate` against a fresh
local database demonstrates C10's local half; the migration's guard path
on Supabase is exercised at the release→development deploy and recorded
in the Linear issue when it happens.

## Progress

_(updated continuously; append new entries at the BOTTOM — newest last;
timestamp each entry)_

- [x] 2026-09-03 — planning: interview rounds 1–2 done, exploration done,
      ADR-0025 written, plans authored.
- [x] 2026-09-03 12:40 — M1: migration `0004_data_lifecycle.sql` +
      Migrations-suite update; applies cleanly on Docker, functions
      verified callable.
- [x] 2026-09-03 12:42 — M2: repository upsert/consistency fixes,
      test-first (C8 regression red → green in the SharpEdges suite).
- [x] 2026-09-03 12:46 — M3: `test/Lifecycle.test.ts`, 8 tests covering
      C1–C7 + C9 under the backdating isolation discipline.
- [x] 2026-09-03 12:50 — M4: full gate green (22/22 turbo tasks);
      coverage table reconciled; acceptance criteria checked off.
- [x] 2026-09-03 13:10 — review fix cycle closed: F1 (C3 amended
      everywhere + saved-twice test) and F2 (exact C6 assertion) fixed;
      re-review verified the claim sweep and mutant-kills; gate green.

## Decision log

_(every non-obvious choice made during planning or implementation: what
was decided, why, what was rejected. Promote to an ADR if it meets the adr
skill's bar.)_

- 2026-09-03 — Eligibility criteria and mechanism per ADR-0025 (user
  interview): games ended + 30 days idle; users created 30+ days ago with
  no live `game_players` refs; lobbies marked `'abandoned'` after 24 idle
  hours (not soft-deleted directly); hard-delete row-level per table at 7
  days; SQL functions + guarded pg_cron scheduling in one migration.
- 2026-09-03 — Upsert fix is in scope for CAM-8 (user call, closing
  CAM-3 carry-forward #1) rather than scoping the sweeper around it.
- 2026-09-03 — Job cadence: hourly expiry, weekly soft-delete, daily
  hard-delete. Daily hard-delete keeps "one week after soft-delete" as a
  minimum retention while reaping live-game tombstones promptly.
- 2026-09-03 — Within `lifecycle_soft_delete`, games sweep before users:
  a user whose last game is swept in the same run is tombstoned in that
  run too (the 7-day hard-delete grace still applies). Rejected: sweeping
  users first for an extra cycle of lag — no observable benefit.
- 2026-09-03 — No job-audit table. Keeps the Migrations suite's exact
  table-list assertion intact; the functions return affected-row counts,
  and Supabase's `cron.job_run_details` provides run history.
- 2026-09-03 — Cron-driven abandonment does not evict the lobby's room
  actor (ADR-0025 consequence; ADR-0020 keeps idle actors resident, lobby
  state is never cached, next command gets typed `LobbyNotJoinable`).
- 2026-09-03 — New index names must not end in `_key`
  (`Migrations.test.ts` asserts over the `%_key` pattern for the partial
  uniques; lifecycle indexes stay out of that namespace).
- 2026-09-03 (implementation) — the sweep functions set
  `updated_at = ts` alongside `deleted_at` when tombstoning (and the
  expiry bump sets it with the version bump), keeping the bookkeeping
  convention uniform with the repository's `saveLobby` soft-delete; the
  M2 consistency fix brings the `user_cards` tombstoning UPDATE in
  `save()` in line with the same convention.
- 2026-09-03 (implementation) — `lifecycle_hard_delete` carries
  belt-and-braces `NOT EXISTS` gates on the `games` delete as well as
  the mandatory `users` gates: under the shared-tombstone invariant the
  games gate never blocks, but it makes the function safe standalone.
- 2026-09-03 (review fix cycle) — **standing correction to the applied
  `0004_data_lifecycle.sql` header** (per the infrastructure-persistence
  rule, applied files are never edited — the next migration's header
  must carry this): its line "ended games idle 30d are tombstoned with
  every dependent row at one shared timestamp" overstates. Correct
  reading: every row the call tombstones shares one timestamp;
  dependent rows already tombstoned earlier keep their original stamps
  (the sweep only targets `deleted_at IS NULL` rows). Review F1.

## Surprises & discoveries

- 2026-09-03 (planning exploration) — `users.updated_at` is never
  written after INSERT; "idle" had to be redefined (ADR-0025).
- 2026-09-03 (planning exploration) — the documented fold-from-seq-0
  restart path has no production caller: room bootstrap is
  `games.load()` of materialized state (`RoomRegistry.ts:180-186`).
  Hard-deleting a game's rows together therefore cannot half-break a
  rebuild today; keeping events and state in the same sweep preserves
  the invariant if the fold path is ever wired.

## Outcomes & retrospective

**Review 2026-09-03 — verdict: fix-then-ship.** Two reviewers (contract,
architecture) plus independent verification: full gate green; api suite
force-rerun fresh against live containers (20 files / 112 tests, zero
cache); virgin-database migration probe (0001→0004 applies clean); a
hand-run psql probe of the full expire→soft→hard chain on a pristine
database behaved exactly per contract. Architecture review: **zero
violations** — applied migrations untouched, correction discipline
followed (0004's header discharges 0002's forward-reference), repository
conventions and the domain-never-sees-soft-delete invariant intact,
append-only carve-out respected, ADR-0025 conformance exact.

**Findings — both RESOLVED in the 2026-09-03 fix cycle** (F1: clause
amended in all instances — including a sixth, the backend plan's M3
test-intent bullet, caught by re-review — and the test reworked to a
saved-twice fixture with sweep-stamp-scoped assertions; F2: the test was
strengthened to exact before/after count equality, keeping the "keeps
all rows" row true rather than weakening it. Re-review verified the
sweep, the mutant-kills — a tombstone-rewriting sweep fails two
assertions, a per-statement `clock_timestamp()` sweep fails the
per-table stamp check — and that the applied migration stayed
untouched). Original findings as reported:

- **F1 — C3 is overstated, and its test is pinned by the fixture, not
  the assertion.** The sweep only tombstones `deleted_at IS NULL` rows,
  so a production ended game (saved many times, carrying `user_cards`
  tombstones at many earlier stamps) does NOT end up with all rows at
  one timestamp — only the rows tombstoned **by the call** share the
  stamp. The C3 test passes only because its fixture saves once (zero
  pre-existing tombstones); saving twice would fail it. The correct
  claim: "every row tombstoned by the call shares one timestamp."
  Instances to fix (claim sweep, all phrasings): root plan Functional
  Contract C3 ("carry the same tombstone timestamp from a single
  call"); backend plan M1 step 3 ("carry the identical tombstone");
  backend plan coverage-table C3 row ("at most one distinct deleted_at
  value across every row of the game"); `Lifecycle.test.ts` C3 test
  title and its distinct-stamp assertions (must scope to rows
  tombstoned at sweep time, ideally with a saved-twice fixture); the
  `0004_data_lifecycle.sql` header ("every dependent row at one shared
  timestamp") — that file is applied and must NOT be edited; correct it
  in the next migration's header or note it here per the skill rule.
- **F2 — coverage-table C6 row overclaims.** Row says the 1-day
  tombstoned game "keeps all rows"; the landed assertion is a six-table
  sum `> 0`. Either strengthen the test (before/after count comparison)
  or weaken the row to what is asserted.

**Advisory (recorded, not blocking):** deploy checklist for C10's manual
half should include (a) schema-qualifying the cron command strings via a
follow-up migration if the deploy role's search_path is narrowed
(`SELECT public.lifecycle_*()`), and (b) awareness that
`pg_available_extensions` proves availability, not loadability — fine on
Supabase, a latent hazard on self-hosted images without
shared_preload_libraries. Untested edge cases worth future tests: C1
boundary at exactly the cutoff; soft-deleted lobby row excluded from
expiry; C5 user whose only refs are tombstoned (should sweep — the
inverse of C6's unfiltered gate); C4 dependent-row snapshots; C6
lobby-leave `game_players` tombstone reaped under a live game. The
`save()` upsert resurrection widens the (pre-existing) theoretical
seat-index collision surface of the `saveLobby` path; unreachable via
current code paths.
