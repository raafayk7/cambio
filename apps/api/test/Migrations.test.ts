import { afterAll, describe, expect, it } from "@effect/vitest"
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"

import { migrate } from "../src/infra/migrate.js"
import { makeTestRuntime } from "./support/db.js"

/**
 * Schema introspection (root plan C1): the migration ran in global-setup;
 * these tests pin what it created — table set, exact games columns (set
 * equality proves the derivable columns absent), keys, and the partial
 * unique indexes that make soft delete safe (§7).
 */
const runtime = makeTestRuntime()
afterAll(() => runtime.dispose())

const sqlRows = <A extends object>(
  f: (sql: SqlClient.SqlClient) => Effect.Effect<ReadonlyArray<A>, unknown>,
): Promise<ReadonlyArray<A>> =>
  runtime.runPromise(
    SqlClient.SqlClient.pipe(Effect.flatMap(f)) as Effect.Effect<ReadonlyArray<A>, never, never>,
  )

const SEVEN_TABLES = [
  "card_peeks",
  "decks",
  "game_events",
  "game_players",
  "games",
  "user_cards",
  "users",
]

describe("0002_cambio_schema (C1)", () => {
  it("0002 creates the seven §4.3 tables, each with soft-delete columns (C1.1)", async () => {
    const tables = await sqlRows<{ table_name: string }>(
      (sql) => sql`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `,
    )
    const names = tables.map((t) => t.table_name).sort()
    expect(names).toStrictEqual(["_cambio_migrations", ...SEVEN_TABLES])

    for (const table of SEVEN_TABLES) {
      const cols = await sqlRows<{ column_name: string }>(
        (sql) => sql`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ${table}
        `,
      )
      const colNames = cols.map((c) => c.column_name)
      expect(colNames).toContain("created_at")
      expect(colNames).toContain("updated_at")
      expect(colNames).toContain("deleted_at")
    }
  })

  it("re-running migrate is a no-op (C1.1, C6.1)", async () => {
    const before = await sqlRows<{ id: string }>(
      (sql) => sql`SELECT id FROM _cambio_migrations ORDER BY id`,
    )
    expect(before.map((r) => r.id)).toStrictEqual([
      "0001_init.sql",
      "0002_cambio_schema.sql",
      "0003_lobby_rows.sql",
    ])
    await runtime.runPromise(migrate)
    const after = await sqlRows<{ id: string }>(
      (sql) => sql`SELECT id FROM _cambio_migrations ORDER BY id`,
    )
    expect(after).toStrictEqual(before)
  })

  it("games has exactly the decided columns and no derivable ones (C1.2)", async () => {
    const cols = await sqlRows<{ column_name: string }>(
      (sql) => sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'games'
      `,
    )
    expect(cols.map((c) => c.column_name).sort()).toStrictEqual(
      [
        "game_id",
        "status",
        "phase",
        "discard_pile",
        "prng",
        "config",
        "version",
        "created_at",
        "updated_at",
        "deleted_at",
      ].sort(),
    )
  })

  it("game_players has exactly the decided columns (C1.3)", async () => {
    const cols = await sqlRows<{ column_name: string }>(
      (sql) => sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'game_players'
      `,
    )
    expect(cols.map((c) => c.column_name).sort()).toStrictEqual(
      [
        "game_id",
        "user_id",
        "seat_index",
        "final_score",
        "is_connected",
        "is_bot",
        "created_at",
        "updated_at",
        "deleted_at",
      ].sort(),
    )
  })

  it("game_players/decks keys match the contract (C1.3, C1.4)", async () => {
    const pk = (table: string) =>
      sqlRows<{ column_name: string }>(
        (sql) => sql`
          SELECT kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON kcu.constraint_name = tc.constraint_name
          WHERE tc.table_schema = 'public'
            AND tc.table_name = ${table}
            AND tc.constraint_type = 'PRIMARY KEY'
          ORDER BY kcu.ordinal_position
        `,
      )
    expect((await pk("game_players")).map((c) => c.column_name)).toStrictEqual([
      "game_id",
      "user_id",
    ])
    expect((await pk("decks")).map((c) => c.column_name)).toStrictEqual(["game_id"])

    const deckCols = await sqlRows<{ column_name: string }>(
      (sql) => sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'decks'
      `,
    )
    const names = deckCols.map((c) => c.column_name)
    expect(names).not.toContain("deck_id")
    expect(names).not.toContain("size")
  })

  it("0003 relaxes the dealt-game columns for lobby rows only (CAM-5 clause 13)", async () => {
    const cols = await sqlRows<{ column_name: string; is_nullable: string }>(
      (sql) => sql`
        SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'games'
          AND column_name IN ('phase', 'discard_pile', 'prng', 'config')
      `,
    )
    expect(cols).toHaveLength(4)
    for (const col of cols) expect(col.is_nullable, col.column_name).toBe("YES")

    const checks = await sqlRows<{ conname: string }>(
      (sql) => sql`
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'games'::regclass AND contype = 'c'
      `,
    )
    expect(checks.map((c) => c.conname)).toContain("games_dealt_columns_present")

    // The CHECK has teeth: an in_progress row with NULL phase is rejected.
    const rejected = await runtime.runPromise(
      SqlClient.SqlClient.pipe(
        Effect.flatMap(
          (sql) => sql`
            INSERT INTO games (game_id, status, version)
            VALUES ('00000000-0000-4000-9000-00000000dead', 'in_progress', 1)
          `,
        ),
        Effect.as(false),
        Effect.catchAll(() => Effect.succeed(true)),
      ),
    )
    expect(rejected).toBe(true)
  })

  it("every unique constraint is partial on deleted_at (C1.3, C1.5, C1.7)", async () => {
    const indexes = await sqlRows<{ indexname: string; indexdef: string }>(
      (sql) => sql`
        SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND indexname LIKE '%_key'
      `,
    )
    const byName = new Map(indexes.map((i) => [i.indexname, i.indexdef]))
    for (const name of [
      "game_players_seat_key",
      "user_cards_slot_key",
      "user_cards_card_key",
      "card_peeks_seq_key",
      "game_events_seq_key",
    ]) {
      const def = byName.get(name)
      expect(def, name).toBeDefined()
      expect(def!).toContain("WHERE (deleted_at IS NULL)")
    }
  })
})
