# 0025 — Data lifecycle as SQL functions with guarded pg_cron scheduling; row-level hard-delete

- **Status:** accepted
- **Date:** 2026-09-03
- **Task:** CAM-8

## Context

HANDOFF §7 mandates retention jobs via `pg_cron` on Supabase — weekly
soft-delete of users, games, and dependent rows; hard-delete a week after
soft-delete; abandoned lobbies expiring in hours — but leaves three things
open: the eligibility criteria (no ages or statuses are given), where the
sweep SQL lives given that `pg_cron` does not exist on the local Docker
Postgres (CAM-8's brief requires the statements to be locally testable),
and what "hard-delete the soft-deleted rows" means when
`GameRepository.save` tombstones every `user_cards` row of a **live** game
on every save (CAM-3's retrospective names reaping those tombstones as the
sweeper's load-bearing job). A further constraint: the migration runner
(ADR-0002) applies each file in a single transaction with no error
tolerance, so a bare `CREATE EXTENSION pg_cron` would abort the whole
migration on any host without the extension.

## Decision

**All sweep logic lives in plain SQL functions created by a normal
migration; the same migration schedules them with `cron.schedule` inside a
guard that checks pg_cron availability.** Three functions, each taking
cutoff parameters with production defaults so tests can backdate instead of
waiting:

- `lifecycle_expire_lobbies` — hourly: rows with `status = 'lobby'`,
  not soft-deleted, idle (by `updated_at`) past **24 hours** become
  `status = 'abandoned'`. The update **bumps `games.version`** (and
  `updated_at`) so any in-flight `saveLobby` from a stale read fails as a
  typed `VersionConflict` instead of resurrecting the lobby. Scoped to
  `status = 'lobby'` explicitly — the `games_dealt_columns_present` CHECK
  exempts `'abandoned'`, so an unscoped update would silently abandon
  dealt games.
- `lifecycle_soft_delete` — weekly: games with
  `status IN ('completed', 'abandoned')` idle past **30 days** are
  tombstoned together with all their dependent rows; users with
  `created_at` older than **30 days** and **no non-deleted `game_players`
  references** are tombstoned. The reference check is load-bearing, not
  belt-and-braces: `users.updated_at` is never written after insert
  (sessions are stateless per ADR-0018), so age alone means "created 30+
  days ago" and recent games are what protect an active player.
- `lifecycle_hard_delete` — daily: **row-level per table** — every row
  with `deleted_at` older than **7 days** is physically deleted, children
  before parents, `users` additionally gated on no physically remaining
  referencing rows. Row-level scope (rather than "rows whose parent game
  was soft-deleted") is deliberate: it is what reaps the `user_cards` and
  `game_players` tombstones that live games accumulate on every save.

This is the first code permitted to delete `game_events` rows — the
append-only rule (`0002` header, infrastructure-persistence skill) carves
out exactly this lifecycle by name; the carve-out is now real.

Alternatives considered:

- **Scheduling in a documented Supabase-only script, functions in the
  migration** — keeps migrations byte-identical across environments, but
  the schedule drifts from the functions and is easy to forget on a fresh
  Supabase project; rejected for the one-artifact property.
- **Full SQL inline in `cron.schedule` command strings** — nothing
  callable locally, contradicting the brief's testing requirement;
  rejected outright.
- **Game-scoped cascade hard-delete** — cleaner mental model but never
  reaps live-game tombstones, defeating the housekeeping purpose; a
  second special-case job would be needed anyway.
- **Making `users.updated_at` meaningful** (bump on activity, sweep on
  true idleness) — truer to "idle" but adds a write path to every
  activity for no behavioral difference given the reference check;
  rejected as scope creep beyond infra SQL.

## Consequences

- The sweep is testable end to end on Docker Postgres: tests call the
  functions directly with backdated rows and explicit or default cutoffs;
  `pg_cron` is exercised only on Supabase, where the guard registers the
  jobs when the migration applies there.
- Retention numbers (24 h / 30 d / 30 d / 7 d) are function parameter
  defaults — changing one is a new migration replacing the function, not
  an app deploy.
- Cron-driven lobby abandonment does **not** evict the room actor
  (eviction happens only on the actor's own Leave path). Accepted:
  ADR-0020 keeps idle actors resident by design, lobby state is never
  cached (every lobby command re-reads rows), and a stale actor's next
  command surfaces a typed `LobbyNotJoinable`.
- Hard-deleting a game removes its `game_events` in the same transaction
  as its state rows, so the (currently unwired) fold-from-seq-0 recovery
  path can never find half a game.
- If the API ever writes sweeps of its own, or a second scheduler
  appears, this ADR is the one to supersede.
