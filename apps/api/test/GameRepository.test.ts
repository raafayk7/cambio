import { afterAll, beforeAll, describe, expect, it } from "@effect/vitest"
import { SqlClient } from "@effect/sql"
import { Effect, Either, Schema } from "effect"

import {
  dealGame,
  decodeGameConfig,
  GameId,
  GameRepository,
  GameVersion,
  type GameEvent,
  UserId,
} from "@cambio/domain"
import { type GameRun, simulateGame, ts, uid } from "@cambio/domain/testing"

import { actorOf } from "../src/infra/game-repository.js"
import { ensureRosterUsers, makeTestRuntime } from "./support/db.js"

/**
 * The aggregate adapter on one scripted harness game (C1.6, C3.*): fixed
 * seeds so the game is reproducible; RoundTrip.test.ts does the batch.
 */
const runtime = makeTestRuntime()
afterAll(() => runtime.dispose())

const config = decodeGameConfig({ slamWindowMs: 4000 })
const gid = (n: number): GameId =>
  Schema.decodeUnknownSync(GameId)(`00000000-0000-4000-a000-${String(n).padStart(12, "0")}`)

const v = (n: number): GameVersion => GameVersion.make(n)

interface Cut {
  readonly state: GameRun["finalState"]
  readonly eventCount: number
}

let run: GameRun
let midCut: Cut

beforeAll(async () => {
  const cuts: Array<Cut> = []
  run = simulateGame({
    gameSeed: 101,
    driverSeed: 202,
    playerCount: 3,
    config,
    onStep: (state, _now, _step, eventCount) => cuts.push({ state, eventCount }),
  })
  midCut = cuts[Math.floor(cuts.length / 2)]!
  await runtime.runPromise(ensureRosterUsers)
})

const saveAll = (gameId: GameId) =>
  Effect.gen(function* () {
    const games = yield* GameRepository
    return yield* games.save({
      gameId,
      state: run.finalState,
      expectedVersion: v(0),
      newEvents: run.events,
      at: ts(1_000_000),
    })
  })

describe("GameRepositoryLive (C3)", () => {
  it("first save inserts, load returns the identical decoded state and version (C3.3)", async () => {
    const gameId = gid(1)
    const loaded = await runtime.runPromise(
      Effect.gen(function* () {
        const games = yield* GameRepository
        const version = yield* saveAll(gameId)
        expect(version).toBe(1)
        return yield* games.load(gameId)
      }),
    )
    expect(loaded.version).toBe(1)
    expect(loaded.state).toStrictEqual(run.finalState)
  })

  it("getEvents returns the complete ordered decoded stream (C3.9)", async () => {
    const gameId = gid(2)
    const events = await runtime.runPromise(
      Effect.gen(function* () {
        const games = yield* GameRepository
        yield* saveAll(gameId)
        return yield* games.getEvents(gameId)
      }),
    )
    expect(events).toStrictEqual(run.events)
  })

  it("sequence numbers are contiguous from 0 across saves (C3.1)", async () => {
    const gameId = gid(3)
    const seqs = await runtime.runPromise(
      Effect.gen(function* () {
        const games = yield* GameRepository
        const sql = yield* SqlClient.SqlClient
        const v1 = yield* games.save({
          gameId,
          state: midCut.state,
          expectedVersion: v(0),
          newEvents: run.events.slice(0, midCut.eventCount),
          at: ts(500_000),
        })
        yield* games.save({
          gameId,
          state: run.finalState,
          expectedVersion: v1,
          newEvents: run.events.slice(midCut.eventCount),
          at: ts(1_000_000),
        })
        return yield* sql<{ seq: number }>`
          SELECT seq FROM game_events WHERE game_id = ${gameId} ORDER BY seq
        `
      }),
    )
    expect(seqs.map((r) => r.seq)).toStrictEqual(run.events.map((_, i) => i))
  })

  it("save writes one card_peeks row per CardPeeked with that event's seq (C1.6)", async () => {
    const gameId = gid(4)
    expect(run.counters.peeks).toBeGreaterThan(0)
    const rows = await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* saveAll(gameId)
        return yield* sql<{ seq: number; viewer_id: string; card: string }>`
          SELECT seq, viewer_id, card FROM card_peeks WHERE game_id = ${gameId} ORDER BY seq
        `
      }),
    )
    const expected = run.events.flatMap((event, seq) =>
      event._tag === "CardPeeked"
        ? [{ seq, viewer_id: event.viewerId as string, card: event.card as string }]
        : [],
    )
    expect(rows).toStrictEqual(expected)
  })

  it("status derives from phase at save (C3.4)", async () => {
    const gameId = gid(5)
    const statuses = await runtime.runPromise(
      Effect.gen(function* () {
        const games = yield* GameRepository
        const sql = yield* SqlClient.SqlClient
        const v1 = yield* games.save({
          gameId,
          state: midCut.state,
          expectedVersion: v(0),
          newEvents: run.events.slice(0, midCut.eventCount),
          at: ts(500_000),
        })
        const mid = yield* sql<{ status: string }>`
          SELECT status FROM games WHERE game_id = ${gameId}
        `
        yield* games.save({
          gameId,
          state: run.finalState,
          expectedVersion: v1,
          newEvents: run.events.slice(midCut.eventCount),
          at: ts(1_000_000),
        })
        const done = yield* sql<{ status: string }>`
          SELECT status FROM games WHERE game_id = ${gameId}
        `
        return [mid[0]!.status, done[0]!.status]
      }),
    )
    expect(statuses).toStrictEqual(["in_progress", "completed"])
  })

  it("final_score is null mid-game and materialized from GameEnded at completion (C3.5)", async () => {
    const gameId = gid(6)
    const ended = run.events.find((e): e is Extract<GameEvent, { _tag: "GameEnded" }> => {
      return e._tag === "GameEnded"
    })!
    const [mid, done] = await runtime.runPromise(
      Effect.gen(function* () {
        const games = yield* GameRepository
        const sql = yield* SqlClient.SqlClient
        const scoresOf = sql<{ user_id: string; final_score: number | null }>`
          SELECT user_id, final_score FROM game_players
          WHERE game_id = ${gameId} ORDER BY seat_index
        `
        const v1 = yield* games.save({
          gameId,
          state: midCut.state,
          expectedVersion: v(0),
          newEvents: run.events.slice(0, midCut.eventCount),
          at: ts(500_000),
        })
        const midRows = yield* scoresOf
        yield* games.save({
          gameId,
          state: run.finalState,
          expectedVersion: v1,
          newEvents: run.events.slice(midCut.eventCount),
          at: ts(1_000_000),
        })
        return [midRows, yield* scoresOf] as const
      }),
    )
    expect(mid.every((r) => r.final_score === null)).toBe(true)
    for (const row of done) {
      const score = ended.scores.find((s) => (s.playerId as string) === row.user_id)!
      expect(row.final_score).toBe(score.total)
    }
  })

  it("actor_id follows the exhaustive per-tag mapping (C3.8)", async () => {
    // Unit half: one literal of every tag through actorOf.
    const p = uid(0)
    const q = uid(1)
    expect(actorOf({ _tag: "CambioCalled", playerId: p })).toBe(p)
    expect(actorOf({ _tag: "TurnAdvanced", playerId: p })).toBe(p)
    expect(actorOf({ _tag: "GameEnded", calledBy: p, scores: [], winners: [] })).toBe(p)
    expect(
      actorOf({
        _tag: "CardPeeked",
        viewerId: p,
        target: { playerId: q, slotIndex: 0 },
        card: "AS",
      } as unknown as GameEvent),
    ).toBe(p)
    expect(
      actorOf({
        _tag: "CardsBlindSwapped",
        by: p,
        first: { playerId: p, slotIndex: 0 },
        second: { playerId: q, slotIndex: 0 },
      } as unknown as GameEvent),
    ).toBe(p)
    expect(
      actorOf({
        _tag: "SlamWindowOpened",
        turnPlayerId: p,
        closesAt: 1,
        rank: "2",
      } as unknown as GameEvent),
    ).toBe(p)
    expect(actorOf({ _tag: "SlamWindowClosed" })).toBeNull()
    expect(
      actorOf({ _tag: "DeckReshuffled", deck: [], prng: [1, 2, 3, 4] } as unknown as GameEvent),
    ).toBeNull()
    expect(actorOf({ _tag: "GameStarted" } as unknown as GameEvent)).toBeNull()
    for (const tag of [
      "CardDrawn",
      "DiscardTaken",
      "HeldSwapped",
      "HeldKept",
      "HeldDiscarded",
      "PowerFizzled",
      "PowerDiscarded",
      "PenaltyDrawn",
      "DrawSkipped",
    ] as const) {
      expect(actorOf({ _tag: tag, playerId: p } as unknown as GameEvent)).toBe(p)
    }
    for (const tag of [
      "SlamSucceeded",
      "SlamFailed",
      "CardGivenFromHand",
      "CardGivenFromDeck",
    ] as const) {
      expect(actorOf({ _tag: tag, slammerId: q } as unknown as GameEvent)).toBe(q)
    }

    // Integration half: the persisted column agrees for the scripted game.
    const gameId = gid(7)
    const rows = await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* saveAll(gameId)
        return yield* sql<{ seq: number; actor_id: string | null }>`
          SELECT seq, actor_id FROM game_events WHERE game_id = ${gameId} ORDER BY seq
        `
      }),
    )
    expect(rows.map((r) => r.actor_id)).toStrictEqual(
      run.events.map((e) => actorOf(e) as string | null),
    )
  })

  it("SQL failures surface as typed StorageError (C3.7)", async () => {
    // A roster of users that were never created: the game_players FK trips.
    const stranger = (n: number): UserId =>
      Schema.decodeUnknownSync(UserId)(`00000000-0000-4000-b000-${String(n).padStart(12, "0")}`)
    const dealt = Either.getOrThrow(dealGame([stranger(1), stranger(2)], 7, config, ts(0)))
    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const games = yield* GameRepository
        return yield* Effect.either(
          games.save({
            gameId: gid(8),
            state: dealt[0],
            expectedVersion: v(0),
            newEvents: dealt[1],
            at: ts(1),
          }),
        )
      }),
    )
    if (Either.isRight(result)) throw new Error("expected StorageError")
    expect(result.left._tag).toBe("StorageError")
  })
})
