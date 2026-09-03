import { afterAll, beforeAll, describe, expect, it } from "@effect/vitest"
import { SqlClient } from "@effect/sql"
import { Effect, Either, Schema } from "effect"

import {
  createLobby,
  decodeGameConfig,
  GameId,
  GameRepository,
  GameVersion,
  joinLobby,
  type Lobby,
} from "@cambio/domain"
import { type GameRun, simulateGame, ts, uid } from "@cambio/domain/testing"

import { ensureRosterUsers, makeTestRuntime } from "./support/db.js"

/**
 * The CAM-8 lifecycle sweeps (root plan C1–C7, C9) against real Docker
 * Postgres. Isolation discipline (backend plan M3): this suite owns the
 * `e000` id prefix and only ever BACKDATES ITS OWN ROWS — every function
 * call uses the production-default cutoffs (24h/30d/7d), which no other
 * suite's near-now() rows can clear. Exact-count assertions on the
 * functions' return values are safe under exactly that discipline.
 */
const runtime = makeTestRuntime()
afterAll(() => runtime.dispose())
beforeAll(() => runtime.runPromise(ensureRosterUsers))

const config = decodeGameConfig({ slamWindowMs: 4000 })
const gid = (n: number): GameId =>
  Schema.decodeUnknownSync(GameId)(`00000000-0000-4000-e000-${String(n).padStart(12, "0")}`)
// Raw-inserted users get their own tail range so they can never collide
// with game ids in reading the fixtures (different tables regardless).
const eUid = (n: number): string => `00000000-0000-4000-e000-9${String(n).padStart(11, "0")}`
const v = (n: number): GameVersion => GameVersion.make(n)

let run: GameRun
beforeAll(() => {
  run = simulateGame({ gameSeed: 801, driverSeed: 802, playerCount: 2, config })
})

type Fx<A> = Effect.Effect<A, unknown, GameRepository | SqlClient.SqlClient>
const runFx = <A>(effect: Fx<A>): Promise<A> =>
  runtime.runPromise(effect as Effect.Effect<A, never, never>)

const sqlDo = <A, E, R>(
  f: (sql: SqlClient.SqlClient) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | SqlClient.SqlClient> => Effect.flatMap(SqlClient.SqlClient, f)

/** The three functions, called with their production-default cutoffs. */
const expireLobbies = sqlDo(
  (sql) => sql<{ n: number | string }>`SELECT lifecycle_expire_lobbies() AS n`,
).pipe(Effect.map((r) => Number(r[0]!.n)))
const softDelete = sqlDo(
  (sql) =>
    sql<{
      swept_games: number | string
      swept_users: number | string
    }>`SELECT * FROM lifecycle_soft_delete()`,
).pipe(Effect.map((r) => ({ games: Number(r[0]!.swept_games), users: Number(r[0]!.swept_users) })))
const hardDelete = sqlDo(
  (sql) => sql<{ n: number | string }>`SELECT lifecycle_hard_delete() AS n`,
).pipe(Effect.map((r) => Number(r[0]!.n)))

/** Full-row snapshot — the "untouched" assertions compare these wholesale. */
const gameRow = (gameId: GameId) =>
  sqlDo(
    (sql) =>
      sql<{ row: object }>`SELECT to_jsonb(g.*) AS row FROM games g WHERE game_id = ${gameId}`,
  ).pipe(Effect.map((r) => r[0]!.row))

const saveLobbyRow = (gameId: GameId, lobby: Lobby, expectedVersion: number) =>
  Effect.flatMap(GameRepository, (games) =>
    games.saveLobby({ gameId, lobby, expectedVersion: v(expectedVersion) }),
  )

const saveGame = (gameId: GameId, expectedVersion: number, events: GameRun["events"] | []) =>
  Effect.flatMap(GameRepository, (games) =>
    games.save({
      gameId,
      state: run.finalState,
      expectedVersion: v(expectedVersion),
      newEvents: events,
      at: ts(1_000 * (expectedVersion + 1)),
    }),
  )

describe("lifecycle sweeps (CAM-8)", () => {
  it("expiry abandons exactly the idle lobbies — version bumped, everything else untouched (C1)", async () => {
    const idleLobby = gid(10)
    const freshLobby = gid(11)
    const dealtOld = gid(12)
    const abandonedOld = gid(13)
    const outcome = await runFx(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* saveLobbyRow(idleLobby, createLobby(idleLobby, uid(0)), 0)
        yield* saveLobbyRow(freshLobby, createLobby(freshLobby, uid(1)), 0)
        // A dealt game flipped to in_progress and backdated: the CHECK
        // exemption would accept abandoning it, so only the function's
        // status = 'lobby' scoping protects it (C1's sharpest edge).
        yield* saveGame(dealtOld, 0, run.events)
        yield* sql`UPDATE games SET status = 'in_progress' WHERE game_id = ${dealtOld}`
        // abandonedOld: a real abandoned lobby row, backdated.
        yield* saveLobbyRow(abandonedOld, { id: abandonedOld, members: [], status: "abandoned" }, 0)

        yield* sql`
          UPDATE games SET updated_at = now() - interval '25 hours'
          WHERE game_id IN (${idleLobby}, ${dealtOld}, ${abandonedOld})
        `
        const before = {
          fresh: yield* gameRow(freshLobby),
          dealt: yield* gameRow(dealtOld),
          abandoned: yield* gameRow(abandonedOld),
        }
        const expired = yield* expireLobbies
        return {
          expired,
          before,
          after: {
            fresh: yield* gameRow(freshLobby),
            dealt: yield* gameRow(dealtOld),
            abandoned: yield* gameRow(abandonedOld),
          },
          idle: yield* gameRow(idleLobby),
        }
      }),
    )
    expect(outcome.expired).toBe(1)
    const idle = outcome.idle as { status: string; version: number; updated_at: string }
    expect(idle.status).toBe("abandoned")
    expect(idle.version).toBe(2)
    expect(new Date(idle.updated_at).getTime()).toBeGreaterThan(Date.now() - 60_000)
    expect(outcome.after).toStrictEqual(outcome.before)
  })

  it("a saveLobby holding the pre-expiry version is a VersionConflict; the row stays abandoned (C2)", async () => {
    const gameId = gid(20)
    const outcome = await runFx(
      Effect.gen(function* () {
        const games = yield* GameRepository
        const sql = yield* SqlClient.SqlClient
        const lobby = createLobby(gameId, uid(0))
        const held = yield* saveLobbyRow(gameId, lobby, 0)
        yield* sql`
          UPDATE games SET updated_at = now() - interval '25 hours'
          WHERE game_id = ${gameId}
        `
        yield* expireLobbies
        const joined = joinLobby(lobby, uid(1))
        if (Either.isLeft(joined)) throw new Error("join should be pure-legal")
        const stale = yield* Effect.either(
          games.saveLobby({ gameId, lobby: joined.right, expectedVersion: held }),
        )
        const status = yield* sql<{ status: string }>`
          SELECT status FROM games WHERE game_id = ${gameId}
        `
        return { stale, status: status[0]!.status }
      }),
    )
    if (Either.isRight(outcome.stale)) throw new Error("expected VersionConflict")
    if (outcome.stale.left._tag !== "VersionConflict") throw new Error("wrong error tag")
    expect(outcome.stale.left.expected).toBe(1)
    expect(outcome.stale.left.actual).toBe(2)
    expect(outcome.status).toBe("abandoned")
  })

  it("soft-delete tombstones an old ended game and every dependent row at one shared timestamp (C3)", async () => {
    const gameId = gid(30)
    const outcome = await runFx(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* saveGame(gameId, 0, run.events)
        yield* sql`
          UPDATE games SET updated_at = now() - interval '31 days'
          WHERE game_id = ${gameId}
        `
        const swept = yield* softDelete
        const stamps = yield* sql<{ src: string; live: string; stamps: number | string }>`
          SELECT 'games' AS src,
                 COUNT(*) FILTER (WHERE deleted_at IS NULL) AS live,
                 COUNT(DISTINCT deleted_at) AS stamps
          FROM games WHERE game_id = ${gameId}
          UNION ALL
          SELECT 'game_players', COUNT(*) FILTER (WHERE deleted_at IS NULL), COUNT(DISTINCT deleted_at)
          FROM game_players WHERE game_id = ${gameId}
          UNION ALL
          SELECT 'decks', COUNT(*) FILTER (WHERE deleted_at IS NULL), COUNT(DISTINCT deleted_at)
          FROM decks WHERE game_id = ${gameId}
          UNION ALL
          SELECT 'user_cards', COUNT(*) FILTER (WHERE deleted_at IS NULL), COUNT(DISTINCT deleted_at)
          FROM user_cards WHERE game_id = ${gameId}
          UNION ALL
          SELECT 'game_events', COUNT(*) FILTER (WHERE deleted_at IS NULL), COUNT(DISTINCT deleted_at)
          FROM game_events WHERE game_id = ${gameId}
          UNION ALL
          SELECT 'card_peeks', COUNT(*) FILTER (WHERE deleted_at IS NULL), COUNT(DISTINCT deleted_at)
          FROM card_peeks WHERE game_id = ${gameId}
        `
        const distinctAcross = yield* sql<{ n: number | string }>`
          SELECT COUNT(DISTINCT deleted_at) AS n FROM (
            SELECT deleted_at FROM games WHERE game_id = ${gameId}
            UNION ALL SELECT deleted_at FROM game_players WHERE game_id = ${gameId}
            UNION ALL SELECT deleted_at FROM decks WHERE game_id = ${gameId}
            UNION ALL SELECT deleted_at FROM user_cards WHERE game_id = ${gameId}
            UNION ALL SELECT deleted_at FROM game_events WHERE game_id = ${gameId}
            UNION ALL SELECT deleted_at FROM card_peeks WHERE game_id = ${gameId}
          ) all_rows
        `
        return { swept, stamps, distinctAcross: Number(distinctAcross[0]!.n) }
      }),
    )
    expect(outcome.swept.games).toBe(1)
    for (const row of outcome.stamps) {
      expect(Number(row.live), row.src).toBe(0)
      // Present tables carry exactly the one shared stamp; card_peeks may
      // legitimately have zero rows for this simulated run.
      if (row.src !== "card_peeks") expect(Number(row.stamps), row.src).toBe(1)
    }
    expect(outcome.distinctAcross).toBeLessThanOrEqual(1)
  })

  it("soft-delete leaves in-progress games, lobbies, and fresh ended games byte-identical (C4)", async () => {
    const dealtOld = gid(40)
    const freshLobby = gid(41)
    const recentEnded = gid(42)
    const outcome = await runFx(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* saveGame(dealtOld, 0, run.events)
        yield* sql`UPDATE games SET status = 'in_progress' WHERE game_id = ${dealtOld}`
        yield* sql`
          UPDATE games SET updated_at = now() - interval '40 days'
          WHERE game_id = ${dealtOld}
        `
        yield* saveLobbyRow(freshLobby, createLobby(freshLobby, uid(2)), 0)
        yield* saveGame(recentEnded, 0, run.events)
        yield* sql`
          UPDATE games SET updated_at = now() - interval '10 days'
          WHERE game_id = ${recentEnded}
        `
        const before = {
          dealt: yield* gameRow(dealtOld),
          lobby: yield* gameRow(freshLobby),
          recent: yield* gameRow(recentEnded),
        }
        const swept = yield* softDelete
        return {
          swept,
          before,
          after: {
            dealt: yield* gameRow(dealtOld),
            lobby: yield* gameRow(freshLobby),
            recent: yield* gameRow(recentEnded),
          },
        }
      }),
    )
    expect(outcome.swept).toStrictEqual({ games: 0, users: 0 })
    expect(outcome.after).toStrictEqual(outcome.before)
  })

  it("soft-delete sweeps only old users with no live game_players reference (C5)", async () => {
    const refLobby = gid(50)
    const [old, referenced, young] = [eUid(1), eUid(2), eUid(3)]
    const outcome = await runFx(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        for (const [id, name] of [
          [old, "lifecycle-old"],
          [referenced, "lifecycle-referenced"],
          [young, "lifecycle-young"],
        ] as const) {
          yield* sql`INSERT INTO users (user_id, user_name) VALUES (${id}, ${name})`
        }
        yield* sql`
          UPDATE users SET created_at = now() - interval '31 days'
          WHERE user_id IN (${old}, ${referenced})
        `
        // A live seat for the referenced user (the load-bearing gate —
        // users.updated_at is dead, so this is what protects activity).
        yield* saveLobbyRow(refLobby, createLobby(refLobby, uid(0)), 0)
        yield* sql`
          INSERT INTO game_players (game_id, user_id, seat_index)
          VALUES (${refLobby}, ${referenced}, 1)
        `
        const swept = yield* softDelete
        const rows = yield* sql<{ user_id: string; deleted: boolean }>`
          SELECT user_id, (deleted_at IS NOT NULL) AS deleted FROM users
          WHERE user_id IN (${old}, ${referenced}, ${young})
          ORDER BY user_id
        `
        return { swept, rows }
      }),
    )
    expect(outcome.swept.users).toBe(1)
    const byId = new Map(outcome.rows.map((r) => [r.user_id, r.deleted]))
    expect(byId.get(old)).toBe(true)
    expect(byId.get(referenced)).toBe(false)
    expect(byId.get(young)).toBe(false)
  })

  it("hard-delete removes old tombstones children-first, keeps fresh ones, and FK-gates users (C6)", async () => {
    const sweptGame = gid(60)
    const freshGame = gid(61)
    const gateLobby = gid(62)
    const gatedUser = eUid(4)
    const freeUser = eUid(5)
    const tombstoneGame = (gameId: GameId, interval: string) =>
      sqlDo((sql) =>
        Effect.gen(function* () {
          for (const table of [
            "games",
            "game_players",
            "decks",
            "user_cards",
            "card_peeks",
            "game_events",
          ]) {
            yield* sql`
              UPDATE ${sql(table)} SET deleted_at = now() - ${interval}::interval
              WHERE game_id = ${gameId}
            `
          }
        }),
      )
    const remaining = (gameId: GameId) =>
      sqlDo(
        (sql) => sql<{ n: number | string }>`
          SELECT (SELECT COUNT(*) FROM games WHERE game_id = ${gameId})
               + (SELECT COUNT(*) FROM game_players WHERE game_id = ${gameId})
               + (SELECT COUNT(*) FROM decks WHERE game_id = ${gameId})
               + (SELECT COUNT(*) FROM user_cards WHERE game_id = ${gameId})
               + (SELECT COUNT(*) FROM card_peeks WHERE game_id = ${gameId})
               + (SELECT COUNT(*) FROM game_events WHERE game_id = ${gameId}) AS n
        `,
      ).pipe(Effect.map((r) => Number(r[0]!.n)))

    const outcome = await runFx(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* saveGame(sweptGame, 0, run.events)
        yield* tombstoneGame(sweptGame, "8 days")
        yield* saveGame(freshGame, 0, run.events)
        yield* tombstoneGame(freshGame, "1 day")

        // gatedUser: 8-day tombstone but a physically-remaining (1-day
        // tombstoned) seat still references them — the FK gate must skip
        // them. freeUser: 8-day tombstone, no refs — must go.
        for (const [id, name] of [
          [gatedUser, "lifecycle-gated"],
          [freeUser, "lifecycle-free"],
        ] as const) {
          yield* sql`INSERT INTO users (user_id, user_name) VALUES (${id}, ${name})`
        }
        yield* saveLobbyRow(gateLobby, createLobby(gateLobby, uid(0)), 0)
        yield* sql`
          INSERT INTO game_players (game_id, user_id, seat_index)
          VALUES (${gateLobby}, ${gatedUser}, 1)
        `
        yield* sql`
          UPDATE game_players SET deleted_at = now() - interval '1 day'
          WHERE game_id = ${gateLobby} AND user_id = ${gatedUser}
        `
        yield* sql`
          UPDATE users SET deleted_at = now() - interval '8 days'
          WHERE user_id IN (${gatedUser}, ${freeUser})
        `

        const deleted = yield* hardDelete
        const users = yield* sql<{ user_id: string }>`
          SELECT user_id FROM users WHERE user_id IN (${gatedUser}, ${freeUser})
        `
        return {
          deleted,
          sweptRemaining: yield* remaining(sweptGame),
          freshRemaining: yield* remaining(freshGame),
          survivors: users.map((u) => u.user_id),
        }
      }),
    )
    expect(outcome.deleted).toBeGreaterThan(0)
    expect(outcome.sweptRemaining).toBe(0)
    expect(outcome.freshRemaining).toBeGreaterThan(0)
    expect(outcome.survivors).toStrictEqual([gatedUser])
  })

  it("hard-delete reaps a live game's old user_cards tombstones without disturbing the game (C7)", async () => {
    const gameId = gid(70)
    const outcome = await runFx(
      Effect.gen(function* () {
        const games = yield* GameRepository
        const sql = yield* SqlClient.SqlClient
        yield* saveGame(gameId, 0, run.events)
        // The second save rewrites user_cards: every previously-live row
        // becomes a tombstone (the linear growth CAM-3 flagged).
        yield* saveGame(gameId, 1, [])
        yield* sql`UPDATE games SET status = 'in_progress' WHERE game_id = ${gameId}`
        yield* sql`
          UPDATE user_cards SET deleted_at = now() - interval '8 days'
          WHERE game_id = ${gameId} AND deleted_at IS NOT NULL
        `
        const before = yield* games.load(gameId)
        const counts = (label: string) =>
          Effect.map(
            sql<{ live: number | string; dead: number | string }>`
              SELECT COUNT(*) FILTER (WHERE deleted_at IS NULL) AS live,
                     COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS dead
              FROM user_cards WHERE game_id = ${gameId}
            `,
            (r) => ({ label, live: Number(r[0]!.live), dead: Number(r[0]!.dead) }),
          )
        const pre = yield* counts("pre")
        yield* hardDelete
        const post = yield* counts("post")
        const after = yield* games.load(gameId)
        return { before, after, pre, post }
      }),
    )
    expect(outcome.pre.dead).toBeGreaterThan(0)
    expect(outcome.post.dead).toBe(0)
    expect(outcome.post.live).toBe(outcome.pre.live)
    expect(outcome.after.state).toStrictEqual(outcome.before.state)
  })

  it("a lifecycle-swept game behaves per the pinned soft-delete semantics (C9)", async () => {
    const gameId = gid(90)
    const [loadResult, eventsResult, saveResult] = await runFx(
      Effect.gen(function* () {
        const games = yield* GameRepository
        const sql = yield* SqlClient.SqlClient
        yield* saveGame(gameId, 0, run.events)
        yield* sql`
          UPDATE games SET updated_at = now() - interval '31 days'
          WHERE game_id = ${gameId}
        `
        yield* softDelete
        return [
          yield* Effect.either(games.load(gameId)),
          yield* Effect.either(games.getEvents(gameId)),
          yield* Effect.either(saveGame(gameId, 1, [])),
        ] as const
      }),
    )
    if (Either.isRight(loadResult)) throw new Error("expected GameNotFound from load")
    expect(loadResult.left._tag).toBe("GameNotFound")
    if (Either.isRight(eventsResult)) throw new Error("expected GameNotFound from getEvents")
    expect(eventsResult.left._tag).toBe("GameNotFound")
    if (Either.isRight(saveResult)) throw new Error("expected VersionConflict from save")
    if (saveResult.left._tag !== "VersionConflict") throw new Error("wrong error tag")
    expect(saveResult.left.actual).toBeNull()
  })
})
