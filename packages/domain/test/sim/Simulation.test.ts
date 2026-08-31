import { describe, expect, it } from "@effect/vitest"
import { beforeAll } from "vitest"
import { Either } from "effect"
import { score } from "../../src/Card.js"
import { applyCommand } from "../../src/Engine.js"
import { decodeGameConfig } from "../../src/GameConfig.js"
import { type GameState } from "../../src/GameState.js"
import { legalCommandKinds } from "../../src/Legality.js"
import { prngStateFromSeed } from "../../src/Prng.js"
import { card, slot, ts, uid } from "../fixtures.js"
import { emptyCounters, mergeCounters, formatSummary, recordStep } from "./counters.js"
import { type GameRun, playerCountFor, seedPair, simulateGame } from "./driver.js"
import { endViolations } from "./invariants.js"

/**
 * The batch (C2, C3, C5): `SIM_GAMES` seeded random complete games. Per-step
 * invariants (C2.1, C2.2) run inside `simulateGame` — a violation anywhere
 * throws `SimFailure` with gameSeed/driverSeed/step, which is the repro
 * recipe: replay with `simulateGame({ gameSeed, driverSeed, playerCount,
 * config })` in a scratch test and inspect `.trace`.
 *
 * Knobs (C6.2, both declared in turbo.json's test-task `env` — turbo's
 * strict env mode strips undeclared variables):
 *   SIM_GAMES — how many games to play (default 250; the deep run uses
 *               `SIM_GAMES=5000 pnpm --filter @cambio/domain test`)
 *   SIM_SEED  — base seed (default 20260831); game i uses seedPair(SIM_SEED, i)
 *
 * Games play once in `beforeAll`; the `it`s assert over the shared runs.
 */
const GAMES = Number(process.env.SIM_GAMES ?? "250")
const BASE_SEED = Number(process.env.SIM_SEED ?? "20260831")
const BATCH_TIMEOUT_MS = Math.max(120_000, GAMES * 120)
/** C5.2 counts are pinned against the default batch only — a rescaled or
 * reseeded run proves invariants, not rare-case reachability. */
const DEFAULT_BATCH = GAMES === 250 && BASE_SEED === 20260831

const config = decodeGameConfig({ slamWindowMs: 4000 })

const runs: Array<GameRun> = []

describe("counter derivation (C5.1)", () => {
  const holding = (source: "deck" | "discard"): GameState => ({
    players: [
      { id: uid(0), hand: [] },
      { id: uid(1), hand: [{ slotIndex: slot(0), card: card("3S") }] },
    ],
    deck: [card("KS")],
    discard: [],
    prng: prngStateFromSeed(1),
    phase: { _tag: "HoldingCard", playerId: uid(0), card: card("2S"), source },
    config,
  })

  it("derives keeps, the ADR-0012 skip, and the close path correctly", () => {
    let c = emptyCounters()
    // Discard-source keep whose turn advances with no window: the ADR-0012 shape.
    c = recordStep(c, holding("discard"), { _tag: "KeepHeld", playerId: uid(0) }, [
      { _tag: "HeldKept", playerId: uid(0), slotIndex: slot(0), card: card("2S") },
      { _tag: "TurnAdvanced", playerId: uid(1) },
    ])
    expect(c.zeroCardKeeps).toBe(1)
    expect(c.discardSourceKeeps).toBe(1)
    expect(c.emptyDiscardSkips).toBe(1)
    // Deck-source keep with a window: keep counted, no discard-keep, no skip.
    c = recordStep(c, holding("deck"), { _tag: "KeepHeld", playerId: uid(0) }, [
      { _tag: "HeldKept", playerId: uid(0), slotIndex: slot(0), card: card("2S") },
      { _tag: "SlamWindowOpened", turnPlayerId: uid(0), closesAt: ts(4000), rank: "2" },
    ])
    expect(c.zeroCardKeeps).toBe(2)
    expect(c.discardSourceKeeps).toBe(1)
    expect(c.emptyDiscardSkips).toBe(1)
    // The ordinary close emits SlamWindowClosed + TurnAdvanced: not a skip.
    c = recordStep(c, holding("deck"), { _tag: "CloseSlamWindow" }, [
      { _tag: "SlamWindowClosed" },
      { _tag: "TurnAdvanced", playerId: uid(1) },
    ])
    expect(c.emptyDiscardSkips).toBe(1)
  })

  it("derives fizzle shapes, skipped draws, gives, and volume counters", () => {
    let c = emptyCounters()
    const before = holding("deck")
    const drawn = { _tag: "DrawFromDeck", playerId: uid(0) } as const
    c = recordStep(c, before, drawn, [{ _tag: "PowerFizzled", playerId: uid(0), power: "7" }])
    c = recordStep(c, before, drawn, [{ _tag: "PowerFizzled", playerId: uid(0), power: "8" }])
    c = recordStep(c, before, drawn, [{ _tag: "PowerFizzled", playerId: uid(0), power: "9" }])
    c = recordStep(c, before, drawn, [{ _tag: "PowerFizzled", playerId: uid(0), power: "T" }])
    c = recordStep(c, before, drawn, [{ _tag: "PowerFizzled", playerId: uid(0), power: "J" }])
    c = recordStep(c, before, drawn, [{ _tag: "PowerFizzled", playerId: uid(0), power: "Q" }])
    expect(c.fizzlesPeekOwn).toBe(2)
    expect(c.fizzlesPeekOther).toBe(2)
    expect(c.fizzlesJack).toBe(1)
    expect(c.fizzlesQueen).toBe(1)
    c = recordStep(c, before, drawn, [
      { _tag: "DrawSkipped", playerId: uid(0), kind: "penalty" },
      { _tag: "DrawSkipped", playerId: uid(0), kind: "give" },
      {
        _tag: "CardGivenFromHand",
        slammerId: uid(0),
        fromSlot: slot(0),
        to: { playerId: uid(1), slotIndex: slot(0) },
      },
      {
        _tag: "CardGivenFromDeck",
        slammerId: uid(0),
        to: { playerId: uid(1), slotIndex: slot(0) },
        card: card("2S"),
      },
      {
        _tag: "SlamSucceeded",
        slammerId: uid(0),
        target: { playerId: uid(1), slotIndex: slot(0) },
        card: card("2S"),
      },
      {
        _tag: "SlamFailed",
        slammerId: uid(0),
        target: { playerId: uid(1), slotIndex: slot(0) },
        card: card("2S"),
      },
      { _tag: "PenaltyDrawn", playerId: uid(0), slotIndex: slot(0), card: card("2S") },
      {
        _tag: "CardPeeked",
        viewerId: uid(0),
        target: { playerId: uid(1), slotIndex: slot(0) },
        card: card("2S"),
      },
      {
        _tag: "CardsBlindSwapped",
        by: uid(0),
        first: { playerId: uid(0), slotIndex: slot(0) },
        second: { playerId: uid(1), slotIndex: slot(0) },
      },
      { _tag: "DeckReshuffled", deck: [card("KS")] },
    ])
    expect(c.drawSkippedPenalty).toBe(1)
    expect(c.drawSkippedGive).toBe(1)
    expect(c.givesFromHand).toBe(1)
    expect(c.givesFromDeck).toBe(1)
    expect(c.slamsSucceeded).toBe(1)
    expect(c.slamsFailed).toBe(1)
    expect(c.penaltiesDrawn).toBe(1)
    expect(c.peeks).toBe(1)
    expect(c.blindSwaps).toBe(1)
    expect(c.reshuffles).toBe(1)
  })

  it("mergeCounters sums fields and formatSummary is one line", () => {
    const a = { ...emptyCounters(), games: 1, steps: 10, reshuffles: 2 }
    const b = { ...emptyCounters(), games: 2, steps: 5, reshuffles: 1 }
    const merged = mergeCounters(a, b)
    expect(merged.games).toBe(3)
    expect(merged.steps).toBe(15)
    expect(merged.reshuffles).toBe(3)
    const line = formatSummary(merged)
    expect(line.startsWith("[sim]")).toBe(true)
    expect(line).not.toContain("\n")
    expect(line).toContain("games=3")
  })
})

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
        const draw = applyCommand(run.finalState, { _tag: "DrawFromDeck", playerId: player }, after)
        expect(Either.isLeft(draw) && draw.left._tag).toBe("GameAlreadyEnded")
        const slam = applyCommand(
          run.finalState,
          {
            _tag: "Slam",
            playerId: player,
            target: { playerId: player, slotIndex: slot(0) },
            giveSlot: null,
          },
          after,
        )
        expect(Either.isLeft(slam) && slam.left._tag).toBe("GameAlreadyEnded")
      }
    }
  })

  it("every game reaches Ended within the step cap (C3.1)", () => {
    for (const run of runs) {
      expect(run.finalState.phase._tag).toBe("Ended")
      expect(run.steps).toBeLessThan(5000)
    }
  })

  it("no reachable state is stuck (C3.2)", () => {
    // The check lives in the driver's loop: outside a slam window a non-empty
    // candidate set is required (violation ⇒ SimFailure); inside one, closing
    // at `closesAt` is always available by construction. No assertion here —
    // or anywhere — compares state-before to state-after for inequality: a
    // legal command may leave state unchanged (ADR-0011 skipped draws).
    expect(runs).toHaveLength(GAMES)
  })

  it("prints one summary line per run (C5.1)", () => {
    const merged = runs.map((r) => r.counters).reduce(mergeCounters, emptyCounters())
    console.log(formatSummary(merged))
    expect(merged.games).toBe(GAMES)
  })

  it.skipIf(!DEFAULT_BATCH)(
    "the default run reaches the batch-reachable ADR rare cases (C5.2)",
    () => {
      // Deterministic: fixed default seeds. The J-fizzle, Q-fizzle, and
      // ADR-0012 empty-discard shapes need states this policy cannot reach in
      // 250 games — they are asserted from seeded scenarios in Coverage.test.ts.
      // No assertion on drawSkipped: ADR-0011 predicted it near-impossible; the
      // counter exists to check that prediction (root plan, Validation).
      const merged = runs.map((r) => r.counters).reduce(mergeCounters, emptyCounters())
      expect(merged.discardSourceKeeps, "ADR-0009 zero-card discard keep").toBeGreaterThan(0)
      expect(merged.zeroCardKeeps, "zero-card keeps").toBeGreaterThan(0)
      expect(
        merged.givesFromDeck + merged.drawSkippedGive,
        "ADR-0009/0011 zero-card slammer give",
      ).toBeGreaterThan(0)
      expect(merged.fizzlesPeekOwn, "ADR-0010 7/8 fizzle").toBeGreaterThan(0)
      expect(merged.fizzlesPeekOther, "ADR-0010 9/T fizzle").toBeGreaterThan(0)
      expect(merged.reshuffles, "§1.7 reshuffles").toBeGreaterThan(0)
    },
  )

  it("GameEnded scores match an independent recomputation (C2.4, §1.8)", () => {
    // The recomputation is local — per card via score(), min-filtered here —
    // never via gameScores/winnersOf, which the engine itself uses.
    for (const run of runs) {
      const ended = run.events.at(-1)!
      if (ended._tag !== "GameEnded") throw new Error("last event must be GameEnded")
      const recomputed = run.finalState.players.map((p) => ({
        playerId: p.id,
        total: p.hand.reduce((sum, s) => sum + score(s.card), 0),
      }))
      expect([...ended.scores]).toStrictEqual(recomputed)
      const min = Math.min(...recomputed.map((s) => s.total))
      expect([...ended.winners]).toStrictEqual(
        recomputed.filter((s) => s.total === min).map((s) => s.playerId),
      )
      expect(ended.winners.length).toBeGreaterThan(0)
    }
  })
})
