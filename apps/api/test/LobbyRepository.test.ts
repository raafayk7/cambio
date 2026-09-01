import { afterAll, beforeAll, describe, expect, it } from "@effect/vitest"
import { SqlClient } from "@effect/sql"
import { Cause, Effect, Either, Schema } from "effect"

import {
  createLobby,
  dealGame,
  decodeGameConfig,
  foldEvents,
  GameId,
  GameRepository,
  GameVersion,
  joinLobby,
  leaveLobby,
  type Lobby,
} from "@cambio/domain"
import { ts, uid } from "@cambio/domain/testing"

import { ensureRosterUsers, makeTestRuntime } from "./support/db.js"

/**
 * The ADR-0019 lobby persistence vertical (root plan clause 13): lifecycle
 * round-trip, version guard, lobby→game transition + reconstruction, and the
 * undealt-row guard — against the real Docker Postgres.
 */

const runtime = makeTestRuntime()
afterAll(() => runtime.dispose())
beforeAll(() => runtime.runPromise(ensureRosterUsers))

const gid = (n: number): GameId =>
  Schema.decodeUnknownSync(GameId)(`00000000-0000-4000-b000-${String(n).padStart(12, "0")}`)

const config = decodeGameConfig({ slamWindowMs: 4000 })

const right = <R, L>(e: Either.Either<R, L>): R => {
  if (Either.isLeft(e)) throw new Error(`expected Right, got ${JSON.stringify(e.left)}`)
  return e.right
}

const run = <A, E>(effect: Effect.Effect<A, E, GameRepository | SqlClient.SqlClient>) =>
  runtime.runPromise(effect as Effect.Effect<A, E, never>)

describe("GameRepository lobby methods (ADR-0019, clause 13)", () => {
  it("lifecycle round-trips: create → join ×2 → leave → abandon, rows compacted (13a)", async () => {
    const gameId = gid(1)
    await run(
      Effect.gen(function* () {
        const games = yield* GameRepository
        const sql = yield* SqlClient.SqlClient

        // v0 insert — creator only.
        let lobby: Lobby = createLobby(gameId, uid(0))
        let version = yield* games.saveLobby({
          gameId,
          lobby,
          expectedVersion: GameVersion.make(0),
        })
        expect(version).toBe(1)

        const row = yield* sql<{ status: string; phase: unknown }>`
          SELECT status, phase FROM games WHERE game_id = ${gameId}
        `
        expect(row[0]).toEqual({ status: "lobby", phase: null })

        // Two joins, loadLobby exact after each.
        for (const joiner of [uid(1), uid(2)]) {
          lobby = right(joinLobby(lobby, joiner))
          version = yield* games.saveLobby({ gameId, lobby, expectedVersion: version })
          const loaded = yield* games.loadLobby(gameId)
          expect(loaded.lobby).toEqual(lobby)
          expect(loaded.version).toBe(version)
        }

        // uid(1) leaves — seats compact to join order 0..n-1 over live rows.
        lobby = right(leaveLobby(lobby, uid(1)))
        version = yield* games.saveLobby({ gameId, lobby, expectedVersion: version })
        expect((yield* games.loadLobby(gameId)).lobby.members).toEqual([uid(0), uid(2)])
        const seats = yield* sql<{ user_id: string; seat_index: number }>`
          SELECT user_id, seat_index FROM game_players
          WHERE game_id = ${gameId} AND deleted_at IS NULL
          ORDER BY seat_index
        `
        expect(seats.map((s) => [s.user_id, Number(s.seat_index)])).toEqual([
          [uid(0), 0],
          [uid(2), 1],
        ])

        // The leaver rejoins — the soft-deleted row resurrects at the tail.
        lobby = right(joinLobby(lobby, uid(1)))
        version = yield* games.saveLobby({ gameId, lobby, expectedVersion: version })
        expect((yield* games.loadLobby(gameId)).lobby.members).toEqual([uid(0), uid(2), uid(1)])

        // Everyone leaves — the lobby is abandoned, and stays loadable as such.
        for (const leaver of [uid(0), uid(2), uid(1)]) {
          lobby = right(leaveLobby(lobby, leaver))
          version = yield* games.saveLobby({ gameId, lobby, expectedVersion: version })
        }
        const abandoned = yield* games.loadLobby(gameId)
        expect(abandoned.lobby).toEqual({ id: gameId, members: [], status: "abandoned" })
        const statusRow = yield* sql<{ status: string }>`
          SELECT status FROM games WHERE game_id = ${gameId}
        `
        expect(statusRow[0]!.status).toBe("abandoned")
      }),
    )
  })

  it("a stale expectedVersion is a typed VersionConflict and the row is untouched (13b)", async () => {
    const gameId = gid(2)
    await run(
      Effect.gen(function* () {
        const games = yield* GameRepository
        const lobby = createLobby(gameId, uid(0))
        const v1 = yield* games.saveLobby({ gameId, lobby, expectedVersion: GameVersion.make(0) })

        const grown = right(joinLobby(lobby, uid(1)))
        yield* games.saveLobby({ gameId, lobby: grown, expectedVersion: v1 })

        // Reusing the consumed v1 must conflict, typed, with the live version.
        const stale = yield* games
          .saveLobby({ gameId, lobby: grown, expectedVersion: v1 })
          .pipe(Effect.either)
        expect(Either.isLeft(stale)).toBe(true)
        if (Either.isLeft(stale)) {
          expect(stale.left._tag).toBe("VersionConflict")
          if (stale.left._tag === "VersionConflict") {
            expect(stale.left.expected).toBe(v1)
            expect(stale.left.actual).toBe(2)
          }
        }
        // Guard held: still the two-member lobby at version 2.
        const after = yield* games.loadLobby(gameId)
        expect(after.version).toBe(2)
        expect(after.lobby.members).toEqual([uid(0), uid(1)])
      }),
    )
  })

  it("start persists the GameStarted batch at the lobby's version; load and fold reconstruct it (13c)", async () => {
    const gameId = gid(3)
    await run(
      Effect.gen(function* () {
        const games = yield* GameRepository
        const sql = yield* SqlClient.SqlClient

        let lobby = createLobby(gameId, uid(0))
        lobby = right(joinLobby(lobby, uid(1)))
        lobby = right(joinLobby(lobby, uid(2)))
        let version = yield* games.saveLobby({
          gameId,
          lobby,
          expectedVersion: GameVersion.make(0),
        })
        version = yield* games.saveLobby({ gameId, lobby, expectedVersion: version })

        // The lobby→game transition: one save of the whole deal batch,
        // guarded by the lobby's current version.
        const [state, events] = right(dealGame(lobby.members, 424242, config, ts(1000)))
        const gameVersion = yield* games.save({
          gameId,
          state,
          expectedVersion: version,
          newEvents: events,
          at: ts(1000),
        })
        expect(gameVersion).toBe(version + 1)

        const statusRow = yield* sql<{ status: string }>`
          SELECT status FROM games WHERE game_id = ${gameId}
        `
        expect(statusRow[0]!.status).toBe("in_progress")

        // loadLobby now projects "started", members in seat order.
        const started = yield* games.loadLobby(gameId)
        expect(started.lobby).toEqual({
          id: gameId,
          members: [uid(0), uid(1), uid(2)],
          status: "started",
        })

        // load returns the dealt state; the event log reconstructs it —
        // GameStarted is seq 0: the lobby left no events (ADR-0019).
        const loaded = yield* games.load(gameId)
        expect(loaded.state).toEqual(state)
        const log = yield* games.getEvents(gameId)
        expect(log[0]!._tag).toBe("GameStarted")
        expect(right(foldEvents(log))).toEqual(state)
        const seq0 = yield* sql<{ seq: number; type: string }>`
          SELECT seq, type FROM game_events WHERE game_id = ${gameId} ORDER BY seq LIMIT 1
        `
        expect(Number(seq0[0]!.seq)).toBe(0)
        expect(seq0[0]!.type).toBe("GameStarted")
      }),
    )
  })

  it("saveLobby against a dealt game is a defect even at the correct version (review finding 4)", async () => {
    const gameId = gid(5)
    const exit = await runtime.runPromiseExit(
      Effect.gen(function* () {
        const games = yield* GameRepository
        let lobby = createLobby(gameId, uid(0))
        lobby = right(joinLobby(lobby, uid(1)))
        const version = yield* games.saveLobby({
          gameId,
          lobby,
          expectedVersion: GameVersion.make(0),
        })
        const [state, events] = right(dealGame(lobby.members, 7, config, ts(1000)))
        const gameVersion = yield* games.save({
          gameId,
          state,
          expectedVersion: version,
          newEvents: events,
          at: ts(1000),
        })
        // Correct version, dealt row: must die (one-way transition), and the
        // row must be untouched — never silently downgraded to 'lobby'.
        yield* games.saveLobby({ gameId, lobby, expectedVersion: gameVersion })
      }) as Effect.Effect<void, unknown, never>,
    )
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      expect(Cause.dieOption(exit.cause)._tag).toBe("Some")
    }
    const status = await run(
      SqlClient.SqlClient.pipe(
        Effect.flatMap(
          (sql) => sql<{ status: string }>`
          SELECT status FROM games WHERE game_id = ${gameId}
        `,
        ),
      ),
    )
    expect(status[0]!.status).toBe("in_progress")
  })

  it("load/getEvents on an undealt row are GameNotFound, not a decode error (13d)", async () => {
    const gameId = gid(4)
    await run(
      Effect.gen(function* () {
        const games = yield* GameRepository
        yield* games.saveLobby({
          gameId,
          lobby: createLobby(gameId, uid(0)),
          expectedVersion: GameVersion.make(0),
        })
        const loaded = yield* games.load(gameId).pipe(Effect.either)
        expect(Either.isLeft(loaded)).toBe(true)
        if (Either.isLeft(loaded)) expect(loaded.left._tag).toBe("GameNotFound")
        const eventsResult = yield* games.getEvents(gameId).pipe(Effect.either)
        expect(Either.isLeft(eventsResult)).toBe(true)
        if (Either.isLeft(eventsResult)) expect(eventsResult.left._tag).toBe("GameNotFound")
      }),
    )
  })
})
