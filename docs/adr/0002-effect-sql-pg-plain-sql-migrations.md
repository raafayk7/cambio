# 0002 — @effect/sql-pg for queries; plain SQL migrations via a hand-rolled runner

- **Status:** accepted
- **Date:** 2026-08-30 (decided during Task 1, the scaffold; recorded here on ADR migration)

## Context

HANDOFF §9.1 left migration tooling open: `@effect/sql-pg` + plain SQL was
suggested; Drizzle and Kysely were alternatives. Separately, `@effect/sql`'s
built-in migrator expects TypeScript migration modules, which conflicts with
the plain-SQL choice.

## Decision

Queries go through `@effect/sql-pg` (consistent with the Effect commitment —
typed errors, layers, no second data-access idiom). Migrations are plain
`NNNN_name.sql` files in `apps/api/migrations/`, applied in filename order
by a ~50-line hand-rolled runner (`apps/api/src/infra/migrate.ts`), one
transaction per file, recorded in `_cambio_migrations`. Drizzle/Kysely lost
because they add a query-building layer the Effect stack already covers.

## Consequences

No ORM; row ↔ domain mapping happens explicitly through Schema codecs in
repositories. The runner deliberately has **no down-migrations and no
checksums** — add them when there is a production database worth protecting,
not before. Applied migrations are never edited; changes are new files.
