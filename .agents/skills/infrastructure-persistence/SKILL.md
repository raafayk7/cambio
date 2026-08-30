---
name: infrastructure-persistence
description: Cambio's database and adapter rules — @effect/sql-pg repositories, plain-SQL migrations via the hand-rolled runner, the persisted schema's design invariants (derived-nothing columns, stable slot indices, jsonb phase), soft-delete with partial indexes, and the append-only event log. Use this whenever you write a migration, implement a repository or any port adapter in apps/api/src/infra, design a table, or touch queries.
---

# Infrastructure & persistence

Adapters live in `apps/api/src/infra/` and are the **only** code that touches
Postgres, Supabase, Pino, or any SDK. Each adapter implements a port (from
`domain` or `application`) as an Effect `Layer` — `clock.ts` is the reference
shape. Database access is `@effect/sql-pg` (ADR-0002); do not add an ORM.

## Migrations

Plain SQL files in `apps/api/migrations/`, named `NNNN_name.sql`, applied in
filename order by the ~50-line runner in `src/infra/migrate.ts`
(`pnpm --filter @cambio/api migrate`). One transaction per file, recorded in
`_cambio_migrations`. **No down-migrations and no checksums** — deliberately,
until there is a production database worth protecting; don't add them in
passing. Never edit an applied migration; add a new one.

## Schema design rules (HANDOFF §4.3)

All tables carry `created_at`, `updated_at`, `deleted_at`. Beyond that, the
schema has opinions — violating them isn't style, it's a bug:

- **Store nothing derivable.** No `turn` column (active player lives inside
  `phase`), no `face_up_card` (it's `discard_pile[0]`), no deck `size`
  (it's `cards.length`), no `winner` (ties are possible — derive from final
  scores), no card `score` anywhere (derive from slug).
- **Cards are not a table.** `cardSlug` (`"AS"`, `"TH"`, …) is the natural
  key — no card UUIDs.
- **`games.phase` is jsonb** holding the domain's `Phase` tagged union,
  round-tripped through its Schema codec. `games.version` (int) is the
  optimistic-concurrency guard.
- **Slot indices are stable positions, not array offsets.** When a slam
  removes the card at index 1, indices 2 and 3 do **not** shift — index 1
  becomes a hole; incoming cards fill the lowest free index. This keeps cards
  visually stable, which matters enormously in a memory game. Never "compact"
  hands.
- `game_players` has PK `(game_id, user_id)`, unique `(game_id, seat_index)`;
  seats contiguous from 0; turn advance is `(seat_index + 1) % n`.

## Soft delete

Rows are soft-deleted (`deleted_at`), hard-deleted a week later by `pg_cron`
on Supabase. Two rules with sharp edges:

1. **Unique constraints must be partial:** `UNIQUE (…) WHERE deleted_at IS
   NULL`. A plain unique index starts rejecting inserts once soft-deleted
   rows accumulate.
2. **The `deleted_at IS NULL` filter lives in the repository layer, always.**
   The domain must never know soft-delete exists. If a repository method can
   return a soft-deleted row, that method is wrong.

## The event log

`game_events` is **append-only**: `(game_id, seq unique per game, type,
payload jsonb, actor_id, at)`. It is the source of truth — state tables are a
materialized fold over it, and after a restart (Render free tier spins down)
a room rebuilds by folding events from seq 0. Consequences:

- Every state mutation a repository performs must append the corresponding
  events **in the same transaction** as the state update.
- Never update or delete an event row.
- `card_peeks` records `(game_id, seq, viewer_id, card)` — required even
  though the UI is memory-faithful, because the server needs it to build
  per-player views and a future bot needs it as belief state.

## Repository conventions

- Interface comes from the port (domain for repositories); the adapter maps
  rows ↔ domain types through Schema codecs at the boundary — domain types
  never leak raw rows, rows never leak domain brands.
- SQL errors surface as typed errors in the Effect channel; a repository
  never throws.
- Local Postgres is Docker on host port **5433**
  (`docker compose -f docker/docker-compose.yml up -d`); deployed envs use
  the Supabase connection string via `DATABASE_URL`. Postgres major is pinned
  to 17 to match Supabase (ADR-0005).
