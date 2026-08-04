import { SqlClient } from "@effect/sql"
import { PgClient } from "@effect/sql-pg"
import { Config, Effect } from "effect"

/**
 * Postgres adapter (§3.1: implementations of ports live here, in `apps/api/src/infra`).
 *
 * The service key lives only in this process — clients get no direct database
 * access (§5). `decks.cards` literally contains the shuffled future of the
 * game, so nothing browser-side is ever allowed to read it.
 */
export const DatabaseLive = PgClient.layerConfig({
  url: Config.redacted("DATABASE_URL"),
  applicationName: Config.succeed("cambio-api"),
})

/**
 * Boot-time connectivity check.
 *
 * Failing fast here is deliberate: a Render instance that starts without a
 * database is worse than one that refuses to start.
 */
export const verifyDatabaseConnection = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`select 1`
}).pipe(Effect.withSpan("verifyDatabaseConnection"))
