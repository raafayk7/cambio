import { afterAll, beforeAll, describe, expect, it } from "@effect/vitest"
import { SqlClient } from "@effect/sql"
import { Effect, Either, Schema } from "effect"

import {
  ALL_CARD_SLUGS,
  decodeGameConfig,
  foldEvents,
  GameId,
  GameRepository,
  GameVersion,
  score,
  type CardSlug,
  type GameState,
} from "@cambio/domain"
import { type GameRun, playerCountFor, seedPair, simulateGame, ts } from "@cambio/domain/testing"

import { ensureRosterUsers, makeTestRuntime } from "./support/db.js"

/**
 * The batch round-trip (root plan C5.2, C5.3): RT_GAMES seeded harness games
 * persisted incrementally through GameRepository at whole-command sample
 * points, then reconstructed. Knobs (declared in turbo.json's test env):
 *   RT_GAMES — batch size (default 25; the pre-ship deep run is
 *              `RT_GAMES=1000 pnpm --filter @cambio/api test`)
 *   RT_SEED  — base seed (default 20260831); game i uses seedPair(RT_SEED, i)
 * A failure names the game index — replay with
 * `simulateGame({ gameSeed, driverSeed, playerCount, config })` using
 * seedPair(RT_SEED, i) and playerCountFor(i).
 */
const RT_GAMES = Number(process.env.RT_GAMES ?? "25")
const RT_SEED = Number(process.env.RT_SEED ?? "20260831")
const BATCH_TIMEOUT_MS = Math.max(120_000, RT_GAMES * 3_000)
const SAMPLE_EVERY = 10

const config = decodeGameConfig({ slamWindowMs: 4000 })
const runtime = makeTestRuntime()
afterAll(() => runtime.dispose())

const gid = (n: number): GameId =>
  Schema.decodeUnknownSync(GameId)(`00000000-0000-4000-c000-${String(n).padStart(12, "0")}`)

interface Persisted {
  readonly index: number
  readonly gameId: GameId
  readonly run: GameRun
  /** load-after-save mismatches collected during the beforeAll (should stay empty). */
  readonly loadMismatches: ReadonlyArray<number>
}

const persisted: Array<Persisted> = []

const HOLDING_TAGS = new Set(["HoldingCard", "ResolvingPower", "ResolvingQueenSwap"])

beforeAll(async () => {
  await runtime.runPromise(ensureRosterUsers)

  // One extra game persisted ONLY mid-flight, cut at a point whose phase
  // holds a card — so the §4.5 partition sweep's "(+ phase-held card)" term
  // is exercised against rows, not just dead code (review finding F3).
  {
    const [gameSeed, driverSeed] = seedPair(RT_SEED, RT_GAMES)
    const cuts: Array<{ state: GameState; eventCount: number }> = []
    const run = simulateGame({
      gameSeed,
      driverSeed,
      playerCount: playerCountFor(RT_GAMES),
      config,
      onStep: (state, _now, _step, eventCount) => cuts.push({ state, eventCount }),
    })
    const holding = cuts.find((c) => HOLDING_TAGS.has(c.state.phase._tag))
    if (holding === undefined) throw new Error("no holding-phase step in the extra game")
    await runtime.runPromise(
      Effect.gen(function* () {
        const games = yield* GameRepository
        yield* games.save({
          gameId: gid(RT_GAMES),
          state: holding.state,
          expectedVersion: GameVersion.make(0),
          newEvents: run.events.slice(0, holding.eventCount),
          at: ts(500),
        })
      }),
    )
  }
  for (let i = 0; i < RT_GAMES; i++) {
    const [gameSeed, driverSeed] = seedPair(RT_SEED, i)
    const samples: Array<{ state: GameState; eventCount: number }> = []
    const run = simulateGame({
      gameSeed,
      driverSeed,
      playerCount: playerCountFor(i),
      config,
      onStep: (state, _now, step, eventCount) => {
        if (step % SAMPLE_EVERY === 0) samples.push({ state, eventCount })
      },
    })
    const gameId = gid(i)
    const loadMismatches: Array<number> = []

    await runtime.runPromise(
      Effect.gen(function* () {
        const games = yield* GameRepository
        let version = GameVersion.make(0)
        let cursor = 0
        const checkpoints = [...samples, { state: run.finalState, eventCount: run.events.length }]
        for (const [c, checkpoint] of checkpoints.entries()) {
          if (checkpoint.eventCount === cursor && c < checkpoints.length - 1) continue
          version = yield* games.save({
            gameId,
            state: checkpoint.state,
            expectedVersion: version,
            newEvents: run.events.slice(cursor, checkpoint.eventCount),
            at: ts(1_000 + c),
          })
          cursor = checkpoint.eventCount
          const loaded = yield* games.load(gameId)
          const same =
            loaded.version === version &&
            JSON.stringify(loaded.state) === JSON.stringify(checkpoint.state)
          if (!same) loadMismatches.push(c)
        }
      }),
    )
    persisted.push({ index: i, gameId, run, loadMismatches })
  }
}, BATCH_TIMEOUT_MS)

describe(`persistence round-trip over the harness batch (${RT_GAMES} games)`, () => {
  it("load deep-equals the live state at every persisted point (C5.2, C3.3)", () => {
    expect(persisted).toHaveLength(RT_GAMES)
    for (const p of persisted) {
      expect(p.loadMismatches, `game ${p.index}`).toStrictEqual([])
    }
  })

  it("foldEvents(getEvents) deep-equals the live state — state tables and event log agree (C5.2)", async () => {
    for (const p of persisted) {
      const [events, loaded] = await runtime.runPromise(
        Effect.gen(function* () {
          const games = yield* GameRepository
          return [yield* games.getEvents(p.gameId), yield* games.load(p.gameId)] as const
        }),
      )
      expect(events.length, `game ${p.index}`).toBe(p.run.events.length)
      const folded = Either.getOrThrow(foldEvents(events))
      expect(folded, `game ${p.index}`).toStrictEqual(p.run.finalState)
      expect(folded, `game ${p.index}`).toStrictEqual(loaded.state)
    }
  })
})

describe("§4.5 invariants, verbatim against persisted rows (C5.3)", () => {
  interface GameRow {
    readonly game_id: string
    readonly status: string
    readonly phase: { _tag: string; card?: string }
    readonly discard_pile: ReadonlyArray<string>
  }

  const rowsOf = <A extends object>(
    f: (sql: SqlClient.SqlClient) => Effect.Effect<ReadonlyArray<A>, unknown>,
  ): Promise<ReadonlyArray<A>> =>
    runtime.runPromise(
      SqlClient.SqlClient.pipe(Effect.flatMap(f)) as Effect.Effect<ReadonlyArray<A>, never, never>,
    )

  // Scoped to this suite's game-id prefix: the other suites persist games in
  // the same database (mid-flight ones included), and these sweeps assert
  // exact batch-wide facts.
  const gameRows = (): Promise<ReadonlyArray<GameRow>> =>
    rowsOf(
      (sql) => sql`
        SELECT game_id, status, phase, discard_pile FROM games
        WHERE deleted_at IS NULL AND game_id::text LIKE '00000000-0000-4000-c000-%'
      `,
    )

  it("all 52 slugs partition across decks.cards + user_cards + games.discard_pile (+ the phase-held card) with no duplicates (§4.5)", async () => {
    const sorted52 = [...ALL_CARD_SLUGS].sort()
    const games = await gameRows()
    // Vacuity guard: the deliberately mid-flight game guarantees the
    // held-card branch below runs at least once.
    expect(games.some((g) => HOLDING_TAGS.has(g.phase._tag))).toBe(true)
    for (const game of games) {
      const decks = await rowsOf<{ cards: ReadonlyArray<string> }>(
        (sql) => sql`
          SELECT cards FROM decks WHERE game_id = ${game.game_id} AND deleted_at IS NULL
        `,
      )
      const hands = await rowsOf<{ card: string }>(
        (sql) => sql`
          SELECT card FROM user_cards WHERE game_id = ${game.game_id} AND deleted_at IS NULL
        `,
      )
      const held = HOLDING_TAGS.has(game.phase._tag) ? [game.phase.card!] : []
      const all = [
        ...(decks[0]?.cards ?? []),
        ...hands.map((h) => h.card),
        ...game.discard_pile,
        ...held,
      ]
      expect([...all].sort(), game.game_id).toStrictEqual(sorted52)
    }
  })

  it("no hand has a negative card count and no slot index is negative (§4.5)", async () => {
    const counts = await rowsOf<{ n: string; min_index: number }>(
      (sql) => sql`
        SELECT COUNT(*) AS n, MIN("index") AS min_index FROM user_cards
        WHERE deleted_at IS NULL
      `,
    )
    expect(Number(counts[0]!.n)).toBeGreaterThan(0)
    expect(counts[0]!.min_index).toBeGreaterThanOrEqual(0)
  })

  it("seat_index values are contiguous from 0 (§4.5)", async () => {
    for (const game of await gameRows()) {
      const seats = await rowsOf<{ seat_index: number }>(
        (sql) => sql`
          SELECT seat_index FROM game_players
          WHERE game_id = ${game.game_id} AND deleted_at IS NULL
          ORDER BY seat_index
        `,
      )
      expect(
        seats.map((s) => s.seat_index),
        game.game_id,
      ).toStrictEqual(seats.map((_, i) => i))
      expect(seats.length).toBeGreaterThanOrEqual(2)
    }
  })

  it("final scores sum to the scores of all cards held at game end (§4.5)", async () => {
    let checked = 0
    for (const game of await gameRows()) {
      if (game.status !== "completed") continue
      const totals = await rowsOf<{ total: string | null }>(
        (sql) => sql`
          SELECT SUM(final_score) AS total FROM game_players
          WHERE game_id = ${game.game_id} AND deleted_at IS NULL
        `,
      )
      const hands = await rowsOf<{ card: string }>(
        (sql) => sql`
          SELECT card FROM user_cards WHERE game_id = ${game.game_id} AND deleted_at IS NULL
        `,
      )
      const held = hands.reduce((sum, h) => sum + score(h.card as CardSlug), 0)
      expect(Number(totals[0]!.total), game.game_id).toBe(held)
      checked++
    }
    expect(checked).toBe(RT_GAMES)
  })

  it("phase Ended ⟺ status completed (§4.5)", async () => {
    const games = await gameRows()
    expect(games.length).toBeGreaterThanOrEqual(RT_GAMES)
    for (const game of games) {
      expect(game.phase._tag === "Ended", game.game_id).toBe(game.status === "completed")
    }
  })
})
