import { SqlClient } from "@effect/sql"
import { PgClient } from "@effect/sql-pg"
import { Effect, Redacted } from "effect"

import { migrate } from "../src/infra/migrate.js"
import { TEST_DATABASE_URL } from "./support/db.js"

/**
 * Integration-test provisioning (root plan C6.2): create the isolated
 * `cambio_test` database when absent, apply migrations through the exported
 * `migrate` effect, and truncate all tables so every suite run starts clean.
 * NEVER point TEST_DATABASE_URL at a database you care about.
 */

const testUrl = new URL(TEST_DATABASE_URL)
const testDbName = testUrl.pathname.slice(1)

// The compose-created dev database doubles as the admin connection for
// CREATE DATABASE (which cannot run inside a transaction).
const adminUrl = new URL(TEST_DATABASE_URL)
adminUrl.pathname = "/cambio"

const clientLayer = (url: URL) =>
  PgClient.layer({ url: Redacted.make(url.toString()), applicationName: "cambio-test-setup" })

const ensureDatabase = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const exists = yield* sql<{ ok: number }>`
    SELECT 1 AS ok FROM pg_database WHERE datname = ${testDbName}
  `
  if (exists.length === 0) {
    yield* sql.unsafe(`CREATE DATABASE "${testDbName}"`)
  }
})

const migrateAndClean = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* migrate
  yield* sql`
    TRUNCATE game_events, card_peeks, user_cards, decks, game_players, games, users
  `
})

export default async function setup(): Promise<void> {
  await Effect.runPromise(ensureDatabase.pipe(Effect.provide(clientLayer(adminUrl)), Effect.scoped))
  await Effect.runPromise(migrateAndClean.pipe(Effect.provide(clientLayer(testUrl)), Effect.scoped))
}
