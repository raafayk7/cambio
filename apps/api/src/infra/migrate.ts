import { readdir, readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { NodeRuntime } from "@effect/platform-node"
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"

import { DatabaseLive } from "./database.js"

/**
 * Plain-SQL migration runner (§9.1: `@effect/sql-pg` for queries, plain SQL
 * migration files).
 *
 * Migrations are `NNNN_name.sql` files in `apps/api/migrations`, applied in
 * filename order, each in its own transaction, recorded in `_cambio_migrations`
 * so re-running is a no-op. Deliberately dumb: no down-migrations, no
 * checksums. Add them when there is a production database worth protecting.
 */

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations")

const migrate = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql`
    CREATE TABLE IF NOT EXISTS _cambio_migrations (
      id          text        PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `

  const applied = yield* sql<{ id: string }>`SELECT id FROM _cambio_migrations`
  const alreadyApplied = new Set(applied.map((row) => row.id))

  const files = (yield* Effect.promise(() => readdir(MIGRATIONS_DIR)))
    .filter((name) => name.endsWith(".sql"))
    .sort()

  const pending = files.filter((name) => !alreadyApplied.has(name))

  if (pending.length === 0) {
    yield* Effect.logInfo(`no pending migrations (${files.length} applied)`)
    return
  }

  for (const name of pending) {
    const contents = yield* Effect.promise(() => readFile(join(MIGRATIONS_DIR, name), "utf8"))

    yield* sql
      .withTransaction(
        Effect.gen(function* () {
          yield* sql.unsafe(contents)
          yield* sql`INSERT INTO _cambio_migrations ${sql.insert({ id: name })}`
        }),
      )
      .pipe(Effect.withSpan("migration", { attributes: { name } }))

    yield* Effect.logInfo(`applied ${name}`)
  }
}).pipe(Effect.provide(DatabaseLive), Effect.scoped)

NodeRuntime.runMain(migrate)
