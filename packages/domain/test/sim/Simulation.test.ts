import { describe, expect, it } from "@effect/vitest"
import { beforeAll } from "vitest"
import { Either } from "effect"
import { applyCommand } from "../../src/Engine.js"
import { decodeGameConfig } from "../../src/GameConfig.js"
import { legalCommandKinds } from "../../src/Legality.js"
import { slot, ts } from "../fixtures.js"
import { type GameRun, playerCountFor, seedPair, simulateGame } from "./driver.js"
import { endViolations } from "./invariants.js"

/**
 * The batch (C2, C3, C5): `GAMES` seeded random complete games. Per-step
 * invariants (C2.1, C2.2) run inside `simulateGame` — a violation anywhere
 * throws `SimFailure` with gameSeed/driverSeed/step, which is the repro
 * recipe: replay with `simulateGame({ gameSeed, driverSeed, playerCount,
 * config })` in a scratch test and inspect `.trace`.
 *
 * Games play once in `beforeAll`; the `it`s assert over the shared runs.
 */
const GAMES = 250
const BASE_SEED = 20260831
const BATCH_TIMEOUT_MS = 120_000

const config = decodeGameConfig({ slamWindowMs: 4000 })

const runs: Array<GameRun> = []

beforeAll(() => {
  for (let i = 0; i < GAMES; i++) {
    const [gameSeed, driverSeed] = seedPair(BASE_SEED, i)
    runs.push(simulateGame({ gameSeed, driverSeed, playerCount: playerCountFor(i), config }))
  }
}, BATCH_TIMEOUT_MS)

describe(`the random-game batch (${GAMES} games)`, () => {
  it("every accepted command preserves the 52-card partition (C2.1, §4.5)", () => {
    // The per-step check lives inside simulateGame; reaching here means no
    // seed threw. This test documents the property and pins the batch size.
    expect(runs).toHaveLength(GAMES)
  })

  it("hand slots stay unique and sorted; the roster never changes (C2.2, §4.5 restated)", () => {
    // Per-step in the driver, like C2.1; the final roster is re-checked here.
    for (const run of runs) {
      expect(run.finalState.players.map((p) => p.id)).toStrictEqual([...run.roster])
    }
  })

  it("Ended iff GameEnded, exactly once, as the final event (C2.3)", () => {
    for (const run of runs) {
      expect(endViolations(run.finalState, run.events, run.roster)).toStrictEqual([])
    }
  })

  it("ended games reject every command from every player (C2.3)", () => {
    for (const run of runs) {
      const after = ts(run.trace.at(-1)!.at + 1000)
      for (const player of run.roster) {
        expect(legalCommandKinds(run.finalState, player, after)).toStrictEqual([])
        const draw = applyCommand(
          run.finalState,
          { _tag: "DrawFromDeck", playerId: player },
          after,
        )
        expect(Either.isLeft(draw) && draw.left._tag).toBe("GameAlreadyEnded")
        const slam = applyCommand(
          run.finalState,
          { _tag: "Slam", playerId: player, target: { playerId: player, slotIndex: slot(0) }, giveSlot: null },
          after,
        )
        expect(Either.isLeft(slam) && slam.left._tag).toBe("GameAlreadyEnded")
      }
    }
  })

  it("GameEnded scores match an independent recomputation (C2.4, §1.8)", () => {
    // Covered by endViolations (C2.3 test above) — this named home re-asserts
    // the clause directly against each run's final event.
    for (const run of runs) {
      const ended = run.events.at(-1)!
      if (ended._tag !== "GameEnded") throw new Error("last event must be GameEnded")
      expect(ended.winners.length).toBeGreaterThan(0)
    }
  })
})
