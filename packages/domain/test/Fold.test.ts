import { describe, expect, it } from "@effect/vitest"
import { beforeAll } from "vitest"
import { Either } from "effect"
import { dealGame } from "../src/Deal.js"
import { foldEvents, type FoldError } from "../src/Fold.js"
import { decodeGameConfig } from "../src/GameConfig.js"
import { type GameEvent } from "../src/GameEvent.js"
import { type GameState } from "../src/GameState.js"
import { type GameRun, playerCountFor, seedPair, simulateGame } from "../src/testing/driver.js"
import { card, slot, ts, uid } from "./fixtures.js"

/**
 * `foldEvents` (C2.2, C5.1, ADR-0014): the pure event-log fold. Error cases
 * and the transcription proof are unit-shaped; the equivalence property runs
 * over the same seeded batch as the simulation suite (shared SIM_GAMES /
 * SIM_SEED knobs, declared in turbo.json's test-task env).
 */
const config = decodeGameConfig({ slamWindowMs: 4000 })

const GAMES = Number(process.env.SIM_GAMES ?? "250")
const BASE_SEED = Number(process.env.SIM_SEED ?? "20260831")
const BATCH_TIMEOUT_MS = Math.max(120_000, GAMES * 120)
/** Whole-command prefix samples: every 7th step boundary. */
const SAMPLE_EVERY = 7

const dealt = (): readonly [GameState, ReadonlyArray<GameEvent>] =>
  Either.getOrThrow(dealGame([uid(0), uid(1), uid(2)], 42, config, ts(0)))

const leftOf = (events: ReadonlyArray<GameEvent>): FoldError => {
  const result = foldEvents(events)
  if (Either.isRight(result)) throw new Error("expected the fold to fail")
  return result.left
}

describe("foldEvents error channel (C2.2)", () => {
  it("an empty stream is EmptyEventLog, not a throw", () => {
    expect(leftOf([])._tag).toBe("EmptyEventLog")
  })

  it("a stream not starting with GameStarted is MissingGameStarted", () => {
    const error = leftOf([{ _tag: "CambioCalled", playerId: uid(0) }])
    if (error._tag !== "MissingGameStarted") throw new Error("wrong tag")
    expect(error.firstTag).toBe("CambioCalled")
  })

  it("a second GameStarted mid-stream is InconsistentEvent", () => {
    const [, events] = dealt()
    const error = leftOf([...events, ...events])
    if (error._tag !== "InconsistentEvent") throw new Error("wrong tag")
    expect(error.index).toBe(1)
    expect(error.tag).toBe("GameStarted")
  })

  it("a CardDrawn that disagrees with the accumulated deck top is InconsistentEvent", () => {
    const [state, events] = dealt()
    const notTop = state.deck[1]!
    const error = leftOf([...events, { _tag: "CardDrawn", playerId: uid(0), card: notTop }])
    if (error._tag !== "InconsistentEvent") throw new Error("wrong tag")
    expect(error.tag).toBe("CardDrawn")
    expect(error.reason).toContain(notTop)
  })

  it("a CardsBlindSwapped naming an unoccupied slot is InconsistentEvent", () => {
    const [, events] = dealt()
    const error = leftOf([
      ...events,
      {
        _tag: "CardsBlindSwapped",
        by: uid(0),
        first: { playerId: uid(0), slotIndex: slot(0) },
        second: { playerId: uid(1), slotIndex: slot(9) },
      },
    ])
    if (error._tag !== "InconsistentEvent") throw new Error("wrong tag")
    expect(error.tag).toBe("CardsBlindSwapped")
  })

  it("any event after GameEnded is InconsistentEvent", () => {
    const [, events] = dealt()
    const error = leftOf([
      ...events,
      { _tag: "CambioCalled", playerId: uid(0) },
      { _tag: "GameEnded", calledBy: uid(0), scores: [], winners: [] },
      { _tag: "TurnAdvanced", playerId: uid(1) },
    ])
    if (error._tag !== "InconsistentEvent") throw new Error("wrong tag")
    expect(error.tag).toBe("TurnAdvanced")
    expect(error.reason).toContain("GameEnded")
  })
})

describe("transcription, not recomputation (C2.2, ADR-0014)", () => {
  it("carries a DeckReshuffled deck order and prng no shuffle would produce, verbatim", () => {
    const [, events] = dealt()
    const impossibleDeck = [card("AS"), card("AS"), card("AS")]
    const impossiblePrng = [1, 2, 3, 4] as const
    const folded = Either.getOrThrow(
      foldEvents([
        ...events,
        { _tag: "DeckReshuffled", deck: impossibleDeck, prng: impossiblePrng },
      ]),
    )
    expect(folded.deck).toStrictEqual(impossibleDeck)
    expect(folded.prng).toStrictEqual(impossiblePrng)
  })

  it("the folded deal carries GameStarted's payload verbatim — hands, deck, discard, prng", () => {
    const [state, events] = dealt()
    const folded = Either.getOrThrow(foldEvents(events))
    expect(folded).toStrictEqual(state)
  })
})

interface Sample {
  readonly state: GameState
  readonly eventCount: number
}

interface FoldRun {
  readonly run: GameRun
  readonly samples: ReadonlyArray<Sample>
}

const foldRuns: Array<FoldRun> = []

beforeAll(() => {
  for (let i = 0; i < GAMES; i++) {
    const [gameSeed, driverSeed] = seedPair(BASE_SEED, i)
    const samples: Array<Sample> = []
    const run = simulateGame({
      gameSeed,
      driverSeed,
      playerCount: playerCountFor(i),
      config,
      onStep: (state, _now, step, eventCount) => {
        if (step % SAMPLE_EVERY === 0) samples.push({ state, eventCount })
      },
    })
    foldRuns.push({ run, samples })
  }
}, BATCH_TIMEOUT_MS)

describe(`fold ≡ live state over the harness batch (${GAMES} games, C5.1)`, () => {
  it("folding the full event log reproduces the final state — phase and prng included (C5.1, ADR-0014)", () => {
    expect(foldRuns).toHaveLength(GAMES)
    for (const { run } of foldRuns) {
      const folded = Either.getOrThrow(foldEvents(run.events))
      expect(folded.phase).toStrictEqual(run.finalState.phase)
      expect(folded.prng).toStrictEqual(run.finalState.prng)
      expect(folded).toStrictEqual(run.finalState)
    }
  })

  it("folding a step-boundary prefix reproduces the intermediate state (C5.1)", () => {
    let sampleCount = 0
    for (const { run, samples } of foldRuns) {
      for (const sample of samples) {
        const folded = Either.getOrThrow(foldEvents(run.events.slice(0, sample.eventCount)))
        expect(folded).toStrictEqual(sample.state)
        sampleCount++
      }
    }
    expect(sampleCount).toBeGreaterThan(0)
  })
})
