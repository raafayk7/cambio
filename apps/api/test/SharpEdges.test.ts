import { afterAll, beforeAll, describe, expect, it } from "@effect/vitest"
import { SqlClient } from "@effect/sql"
import { Effect, Either, Schema } from "effect"

import { decodeGameConfig, GameId, GameRepository, GameVersion } from "@cambio/domain"
import { type GameRun, simulateGame, ts } from "@cambio/domain/testing"

import { ensureRosterUsers, makeTestRuntime } from "./support/db.js"

/**
 * The sharp edges (root plan C5.4): conflict atomicity, the §7 partial-index
 * behaviour under soft delete, and soft-deleted-game invisibility.
 */
const runtime = makeTestRuntime()
afterAll(() => runtime.dispose())

const config = decodeGameConfig({ slamWindowMs: 4000 })
const gid = (n: number): GameId =>
  Schema.decodeUnknownSync(GameId)(`00000000-0000-4000-d000-${String(n).padStart(12, "0")}`)
const v = (n: number): GameVersion => GameVersion.make(n)

let run: GameRun

beforeAll(async () => {
  run = simulateGame({ gameSeed: 301, driverSeed: 302, playerCount: 2, config })
  await runtime.runPromise(ensureRosterUsers)
})

const counts = (gameId: GameId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{
      events: string
      cards: string
      peeks: string
      version: number
    }>`
      SELECT
        (SELECT COUNT(*) FROM game_events WHERE game_id = ${gameId}) AS events,
        (SELECT COUNT(*) FROM user_cards WHERE game_id = ${gameId} AND deleted_at IS NULL) AS cards,
        (SELECT COUNT(*) FROM card_peeks WHERE game_id = ${gameId}) AS peeks,
        (SELECT version FROM games WHERE game_id = ${gameId}) AS version
    `
    const r = rows[0]!
    return {
      events: Number(r.events),
      cards: Number(r.cards),
      peeks: Number(r.peeks),
      version: Number(r.version),
    }
  })

describe("sharp edges (C5.4)", () => {
  it("a stale-version save is rejected atomically — no partial aggregate, no orphan events (C3.2)", async () => {
    const gameId = gid(1)
    const [conflict, before, after] = await runtime.runPromise(
      Effect.gen(function* () {
        const games = yield* GameRepository
        yield* games.save({
          gameId,
          state: run.finalState,
          expectedVersion: v(0),
          newEvents: run.events,
          at: ts(1_000),
        })
        const snapshot = yield* counts(gameId)
        const result = yield* Effect.either(
          games.save({
            gameId,
            state: run.finalState,
            expectedVersion: v(0),
            newEvents: run.events.slice(0, 3),
            at: ts(2_000),
          }),
        )
        return [result, snapshot, yield* counts(gameId)] as const
      }),
    )
    if (Either.isRight(conflict)) throw new Error("expected VersionConflict")
    if (conflict.left._tag !== "VersionConflict") throw new Error("wrong error tag")
    expect(conflict.left.expected).toBe(0)
    expect(conflict.left.actual).toBe(1)
    expect(after).toStrictEqual(before)
  })

  it("a soft-deleted row does not block re-insert under the partial unique indexes (§7 gotcha 1)", async () => {
    const gameId = gid(2)
    const outcome = await runtime.runPromise(
      Effect.gen(function* () {
        const games = yield* GameRepository
        const sql = yield* SqlClient.SqlClient
        yield* games.save({
          gameId,
          state: run.finalState,
          expectedVersion: v(0),
          newEvents: run.events,
          at: ts(1_000),
        })
        const rows = yield* sql<{ user_id: string; index: number; card: string }>`
          SELECT user_id, "index", card FROM user_cards
          WHERE game_id = ${gameId} AND deleted_at IS NULL
          LIMIT 1
        `
        const row = rows[0]!
        yield* sql`
          UPDATE user_cards SET deleted_at = now()
          WHERE game_id = ${gameId} AND user_id = ${row.user_id}
            AND "index" = ${row.index} AND deleted_at IS NULL
        `
        // Identical live row again: the partial index must allow it...
        const reinsert = yield* Effect.either(sql`
          INSERT INTO user_cards (game_id, user_id, "index", card)
          VALUES (${gameId}, ${row.user_id}, ${row.index}, ${row.card})
        `)
        // ...and a duplicate against the LIVE row must still be rejected.
        const duplicate = yield* Effect.either(sql`
          INSERT INTO user_cards (game_id, user_id, "index", card)
          VALUES (${gameId}, ${row.user_id}, ${row.index}, ${row.card})
        `)
        return { reinsert, duplicate }
      }),
    )
    expect(Either.isRight(outcome.reinsert)).toBe(true)
    expect(Either.isLeft(outcome.duplicate)).toBe(true)
  })

  it("a soft-deleted game behaves as not-found (C3.6)", async () => {
    const gameId = gid(3)
    const [loadResult, eventsResult, saveResult] = await runtime.runPromise(
      Effect.gen(function* () {
        const games = yield* GameRepository
        const sql = yield* SqlClient.SqlClient
        yield* games.save({
          gameId,
          state: run.finalState,
          expectedVersion: v(0),
          newEvents: run.events,
          at: ts(1_000),
        })
        yield* sql`UPDATE games SET deleted_at = now() WHERE game_id = ${gameId}`
        return [
          yield* Effect.either(games.load(gameId)),
          yield* Effect.either(games.getEvents(gameId)),
          yield* Effect.either(
            games.save({
              gameId,
              state: run.finalState,
              expectedVersion: v(1),
              newEvents: [],
              at: ts(2_000),
            }),
          ),
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
