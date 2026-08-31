import { SqlClient } from "@effect/sql"
import { PgClient } from "@effect/sql-pg"
import { Effect, Layer, ManagedRuntime, Redacted } from "effect"

import { uid } from "@cambio/domain/testing"

import { GameRepositoryLive } from "../../src/infra/game-repository.js"
import { UserRepositoryLive } from "../../src/infra/user-repository.js"

/**
 * Shared plumbing for the apps/api integration suites. The literal default
 * keeps `pnpm --filter @cambio/api test` working with nothing but Docker up
 * (vitest does not run through `node --env-file`, so `.env` is not
 * auto-loaded); TEST_DATABASE_URL overrides it. The database is provisioned
 * and truncated by `test/global-setup.ts` — never point this at data you
 * care about.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://cambio:cambio@localhost:5433/cambio_test"

export const TestDatabaseLive = PgClient.layer({
  url: Redacted.make(TEST_DATABASE_URL),
  applicationName: "cambio-api-tests",
})

/** Both repository adapters over the test database, plus the raw SqlClient. */
export const TestLayer = Layer.mergeAll(GameRepositoryLive, UserRepositoryLive).pipe(
  Layer.provideMerge(TestDatabaseLive),
)

/** One runtime (one pool) per suite file; dispose it in afterAll. */
export const makeTestRuntime = () => ManagedRuntime.make(TestLayer)
export type TestRuntime = ReturnType<typeof makeTestRuntime>

/**
 * The harness rosters are `uid(0)…uid(n-1)` (max 5 players), so the seeded
 * users cover every simulated game; idempotent for reuse across files.
 */
export const ensureRosterUsers = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  for (let n = 0; n < 5; n++) {
    yield* sql`
      INSERT INTO users (user_id, user_name)
      VALUES (${uid(n)}, ${`sim-player-${n}`})
      ON CONFLICT (user_id) DO NOTHING
    `
  }
})
