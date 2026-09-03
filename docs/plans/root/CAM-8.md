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
  bumps `games.updated_at` (save UPDATE at `:154`, saveLobby UPDATE at
  `:336`), so it is a faithful last-activity timestamp for games.
  **`users.updated_at` is dead**: `users` is INSERT-only
  (`user-repository.ts:36-39` is the sole write; session verification is
  a pure SELECT), hence ADR-0025's user criterion uses `created_at` plus
  the live-reference check.
- CAM-3 carry-forwards aimed at this task (root plan CAM-3, Outcomes):
  the `game_players`/`decks` upserts in `save()`
  (`game-repository.ts:174-182`, `:186-191`) never reset `deleted_at`
  (the `saveLobby` upsert at `:396-402` is the correct reference); and
  `save()` tombstones every `user_cards` row on every save
  (`:197-208`), so hard-delete reaping is load-bearing housekeeping.
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
**all** dependent rows of those games across `game_players`, `decks`,
`user_cards`, `card_peeks`, and `game_events` — a game and its dependents
carry the same tombstone timestamp from a single call.

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

- [ ] All contract clauses C1–C10 hold, each new-behavior clause covered
      by the backend child plan's coverage table.
- [ ] `apps/api/test/Migrations.test.ts` updated: applied list includes
      `0004`; table-list assertion unchanged (no new tables).
- [ ] No changes outside `apps/api` (import boundaries trivially hold).
- [ ] The quality gate passes: `pnpm turbo build typecheck lint test`
      (run bare, never piped).

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

_(filled at the end, typically by `/review`: what shipped, what was cut,
what should carry into the next task.)_
