import { describe, expect, it } from "@effect/vitest"
import { Either } from "effect"
import { isPowerRank, rank } from "../../src/Card.js"
import { dealGame } from "../../src/Deal.js"
import { applyCommand } from "../../src/Engine.js"
import { decodeGameConfig } from "../../src/GameConfig.js"
import { type GameState } from "../../src/GameState.js"
import { prngStateFromSeed } from "../../src/Prng.js"
import { card, slot, ts, uid } from "../fixtures.js"
import { legalCandidates } from "../../src/testing/candidates.js"
import { SimFailure, simulateGame } from "../../src/testing/driver.js"
import { makeDriverRng } from "../../src/testing/rng.js"

const config = decodeGameConfig({ slamWindowMs: 4000 })
const players3 = [uid(0), uid(1), uid(2)]

/** Hand-built states are plain data (cf. the ties test in ../EndToEnd.test.ts). */
const base = (
  players: GameState["players"],
  phase: GameState["phase"],
  over?: Partial<GameState>,
): GameState => ({
  players,
  deck: [card("KS")],
  discard: [card("2C")],
  prng: prngStateFromSeed(9),
  phase,
  config,
  ...over,
})

describe("driver rng (C1.1, ADR-0013)", () => {
  it("same seed yields the identical draw sequence", () => {
    const a = makeDriverRng(7)
    const b = makeDriverRng(7)
    const draws = (rng: typeof a) => Array.from({ length: 100 }, () => rng.int(52))
    expect(draws(b)).toStrictEqual(draws(a))
  })

  it("different seeds diverge", () => {
    const a = makeDriverRng(7)
    const b = makeDriverRng(8)
    const draws = (rng: typeof a) => Array.from({ length: 100 }, () => rng.int(52))
    expect(draws(b)).not.toStrictEqual(draws(a))
  })

  it("int(n) stays within [0, n)", () => {
    const rng = makeDriverRng(3)
    for (let i = 0; i < 500; i++) {
      const x = rng.int(5)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(5)
    }
  })

  it("pick returns elements of the list, deterministically", () => {
    const items = ["a", "b", "c", "d"] as const
    const a = makeDriverRng(11)
    const b = makeDriverRng(11)
    const picksA = Array.from({ length: 50 }, () => a.pick(items))
    const picksB = Array.from({ length: 50 }, () => b.pick(items))
    expect(picksB).toStrictEqual(picksA)
    for (const p of picksA) expect(items).toContain(p)
  })

  it("chance edges: certain and impossible", () => {
    const rng = makeDriverRng(5)
    for (let i = 0; i < 10; i++) {
      expect(rng.chance(1, 1)).toBe(true)
      expect(rng.chance(0, 5)).toBe(false)
    }
  })
})

describe("candidate enumeration (C1.2)", () => {
  it("fresh deal: exactly the active player's turn actions", () => {
    const [initial] = Either.getOrThrow(dealGame(players3, 42, config, ts(0)))
    const candidates = legalCandidates(initial, ts(1))
    for (const c of candidates) {
      if (c._tag === "CloseSlamWindow")
        throw new Error("close is a clock action, never a candidate")
      expect(c.playerId).toBe(uid(0))
    }
    const top = initial.discard[0]!
    const expected = isPowerRank(rank(top))
      ? ["CallCambio", "DrawFromDeck"]
      : ["CallCambio", "TakeDiscard", "DrawFromDeck"]
    expect(candidates.map((c) => c._tag)).toStrictEqual(expected)
  })

  it("holding a deck card with a non-empty hand: one SwapHeld per slot, plus DiscardHeld", () => {
    const state = base(
      [
        {
          id: uid(0),
          hand: [
            { slotIndex: slot(0), card: card("2S") },
            { slotIndex: slot(2), card: card("3S") },
          ],
        },
        { id: uid(1), hand: [{ slotIndex: slot(0), card: card("4S") }] },
      ],
      { _tag: "HoldingCard", playerId: uid(0), card: card("5S"), source: "deck" },
    )
    expect(legalCandidates(state, ts(1))).toStrictEqual([
      { _tag: "SwapHeld", playerId: uid(0), slotIndex: slot(0) },
      { _tag: "SwapHeld", playerId: uid(0), slotIndex: slot(2) },
      { _tag: "DiscardHeld", playerId: uid(0) },
    ])
  })

  it("holding a discard-source card: swap only — never discarded straight back (§1.3b)", () => {
    const state = base(
      [
        { id: uid(0), hand: [{ slotIndex: slot(1), card: card("2S") }] },
        { id: uid(1), hand: [{ slotIndex: slot(0), card: card("4S") }] },
      ],
      { _tag: "HoldingCard", playerId: uid(0), card: card("5S"), source: "discard" },
    )
    expect(legalCandidates(state, ts(1))).toStrictEqual([
      { _tag: "SwapHeld", playerId: uid(0), slotIndex: slot(1) },
    ])
  })

  it("holding with an empty hand: keep (and discard when deck-sourced) (§1.6, ADR-0009)", () => {
    const deckSource = base(
      [
        { id: uid(0), hand: [] },
        { id: uid(1), hand: [{ slotIndex: slot(0), card: card("4S") }] },
      ],
      { _tag: "HoldingCard", playerId: uid(0), card: card("5S"), source: "deck" },
    )
    expect(legalCandidates(deckSource, ts(1))).toStrictEqual([
      { _tag: "DiscardHeld", playerId: uid(0) },
      { _tag: "KeepHeld", playerId: uid(0) },
    ])
    const discardSource = base(
      [
        { id: uid(0), hand: [] },
        { id: uid(1), hand: [{ slotIndex: slot(0), card: card("4S") }] },
      ],
      { _tag: "HoldingCard", playerId: uid(0), card: card("5S"), source: "discard" },
    )
    expect(legalCandidates(discardSource, ts(1))).toStrictEqual([
      { _tag: "KeepHeld", playerId: uid(0) },
    ])
  })

  it("resolving 7/8 peeks own slots; 9/T peeks others'; Q peeks anywhere (§1.4)", () => {
    const hands: GameState["players"] = [
      {
        id: uid(0),
        hand: [
          { slotIndex: slot(0), card: card("2S") },
          { slotIndex: slot(3), card: card("3S") },
        ],
      },
      { id: uid(1), hand: [{ slotIndex: slot(1), card: card("4S") }] },
    ]
    const at = ts(1)
    const own = legalCandidates(
      base(hands, { _tag: "ResolvingPower", playerId: uid(0), card: card("7S") }),
      at,
    )
    expect(own).toStrictEqual([
      { _tag: "PowerPeek", playerId: uid(0), target: { playerId: uid(0), slotIndex: slot(0) } },
      { _tag: "PowerPeek", playerId: uid(0), target: { playerId: uid(0), slotIndex: slot(3) } },
    ])
    const other = legalCandidates(
      base(hands, { _tag: "ResolvingPower", playerId: uid(0), card: card("9S") }),
      at,
    )
    expect(other).toStrictEqual([
      { _tag: "PowerPeek", playerId: uid(0), target: { playerId: uid(1), slotIndex: slot(1) } },
    ])
    const queen = legalCandidates(
      base(hands, { _tag: "ResolvingPower", playerId: uid(0), card: card("QS") }),
      at,
    )
    expect(queen.map((c) => (c._tag === "PowerPeek" ? c.target : c))).toStrictEqual([
      { playerId: uid(0), slotIndex: slot(0) },
      { playerId: uid(0), slotIndex: slot(3) },
      { playerId: uid(1), slotIndex: slot(1) },
    ])
  })

  it("J and the Queen's swap step: every unordered pair of distinct occupied slots (ADR-0010)", () => {
    const hands: GameState["players"] = [
      {
        id: uid(0),
        hand: [
          { slotIndex: slot(0), card: card("2S") },
          { slotIndex: slot(3), card: card("3S") },
        ],
      },
      { id: uid(1), hand: [{ slotIndex: slot(1), card: card("4S") }] },
    ]
    const refs = [
      { playerId: uid(0), slotIndex: slot(0) },
      { playerId: uid(0), slotIndex: slot(3) },
      { playerId: uid(1), slotIndex: slot(1) },
    ]
    const expected = [
      { _tag: "PowerSwap", playerId: uid(0), first: refs[0]!, second: refs[1]! },
      { _tag: "PowerSwap", playerId: uid(0), first: refs[0]!, second: refs[2]! },
      { _tag: "PowerSwap", playerId: uid(0), first: refs[1]!, second: refs[2]! },
    ]
    const jack = legalCandidates(
      base(hands, { _tag: "ResolvingPower", playerId: uid(0), card: card("JS") }),
      ts(1),
    )
    expect(jack).toStrictEqual(expected)
    const queenSwap = legalCandidates(
      base(hands, { _tag: "ResolvingQueenSwap", playerId: uid(0), card: card("QS") }),
      ts(1),
    )
    expect(queenSwap).toStrictEqual(expected)
  })

  it("open slam window: every seated player slams, give-slot fan-out per §1.5/ADR-0009", () => {
    const state = base(
      [
        {
          id: uid(0),
          hand: [
            { slotIndex: slot(0), card: card("2S") },
            { slotIndex: slot(2), card: card("3S") },
          ],
        },
        { id: uid(1), hand: [{ slotIndex: slot(0), card: card("4S") }] },
      ],
      { _tag: "SlamWindow", turnPlayerId: uid(0), closesAt: ts(5000), rank: "2" },
    )
    const p0s0 = { playerId: uid(0), slotIndex: slot(0) }
    const p0s2 = { playerId: uid(0), slotIndex: slot(2) }
    const p1s0 = { playerId: uid(1), slotIndex: slot(0) }
    expect(legalCandidates(state, ts(4999))).toStrictEqual([
      { _tag: "Slam", playerId: uid(0), target: p0s0, giveSlot: null },
      { _tag: "Slam", playerId: uid(0), target: p0s2, giveSlot: null },
      { _tag: "Slam", playerId: uid(0), target: p1s0, giveSlot: slot(0) },
      { _tag: "Slam", playerId: uid(0), target: p1s0, giveSlot: slot(2) },
      { _tag: "Slam", playerId: uid(1), target: p0s0, giveSlot: slot(0) },
      { _tag: "Slam", playerId: uid(1), target: p0s2, giveSlot: slot(0) },
      { _tag: "Slam", playerId: uid(1), target: p1s0, giveSlot: null },
    ])
  })

  it("closed window and Ended games yield no candidates", () => {
    const window = base(
      [
        { id: uid(0), hand: [{ slotIndex: slot(0), card: card("2S") }] },
        { id: uid(1), hand: [{ slotIndex: slot(0), card: card("4S") }] },
      ],
      { _tag: "SlamWindow", turnPlayerId: uid(0), closesAt: ts(5000), rank: "2" },
    )
    expect(legalCandidates(window, ts(5000))).toStrictEqual([])
    const ended = base(
      [
        { id: uid(0), hand: [{ slotIndex: slot(0), card: card("2S") }] },
        { id: uid(1), hand: [{ slotIndex: slot(0), card: card("4S") }] },
      ],
      { _tag: "Ended", calledBy: uid(0) },
    )
    expect(legalCandidates(ended, ts(1))).toStrictEqual([])
  })
})

describe("game driver (C1)", () => {
  const params = { gameSeed: 101, driverSeed: 202, playerCount: 3, config }

  it("replaying the same seeds yields the identical game (C1.1)", () => {
    const a = simulateGame(params)
    const b = simulateGame(params)
    expect(b.trace).toStrictEqual(a.trace)
    expect(b.events).toStrictEqual(a.events)
    expect(b.finalState).toStrictEqual(a.finalState)
    expect(b.counters).toStrictEqual(a.counters)
    const c = simulateGame({ ...params, driverSeed: 203 })
    expect(c.events[0]).toStrictEqual(a.events[0])
    expect(c.trace).not.toStrictEqual(a.trace)
  })

  it("onStep reports the running event count, ending at events.length (CAM-3 M3)", () => {
    const counts: Array<number> = []
    const run = simulateGame({
      ...params,
      onStep: (_state, _now, _step, eventCount) => counts.push(eventCount),
    })
    expect(counts.length).toBe(run.steps)
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]!).toBeGreaterThan(counts[i - 1]!)
    }
    expect(counts[counts.length - 1]).toBe(run.events.length)
  })

  it("the simulated clock is monotone and window actions respect closesAt (C1.3)", () => {
    const run = simulateGame(params)
    let [state] = Either.getOrThrow(dealGame(players3, params.gameSeed, config, ts(0)))
    let previous = ts(0)
    for (const record of run.trace) {
      expect(record.at).toBeGreaterThanOrEqual(previous)
      if (state.phase._tag === "SlamWindow") {
        if (record.command._tag === "Slam") {
          expect(record.at).toBeLessThan(state.phase.closesAt)
        } else {
          expect(record.command._tag).toBe("CloseSlamWindow")
          expect(record.at).toBe(state.phase.closesAt)
        }
      }
      state = Either.getOrThrow(applyCommand(state, record.command, record.at))[0]
      previous = record.at
    }
    expect(state).toStrictEqual(run.finalState)
  })

  it("a full random game reaches Ended within the step cap (C3.1)", () => {
    const run = simulateGame(params)
    expect(run.finalState.phase._tag).toBe("Ended")
    expect(run.steps).toBeLessThan(5000)
  })

  it("per-step invariant violations surface as SimFailure naming the violation and seeds (C2.1)", () => {
    const [state] = Either.getOrThrow(dealGame(players3, 11, config, ts(0)))
    const corrupt: GameState = { ...state, deck: [state.deck[0]!, ...state.deck] }
    let caught: unknown
    try {
      simulateGame({
        gameSeed: 11,
        driverSeed: 12,
        playerCount: 3,
        config,
        initial: { state: corrupt, roster: players3 },
      })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(SimFailure)
    const failure = caught as SimFailure
    expect(failure.message).toContain("partition")
    expect(failure.message).toContain("gameSeed=11")
    expect(failure.message).toContain("driverSeed=12")
  })

  it("hitting the step cap fails with full repro info (C1.4, C1.5)", () => {
    let caught: unknown
    try {
      simulateGame({ ...params, stepCap: 3 })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(SimFailure)
    const failure = caught as SimFailure
    expect(failure.message).toContain("gameSeed=101")
    expect(failure.message).toContain("driverSeed=202")
    expect(failure.message).toContain("step 3")
    expect(failure.step).toBe(3)
    expect(failure.trace).toHaveLength(3)
  })
})
