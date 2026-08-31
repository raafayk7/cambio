import { describe, expect, it } from "@effect/vitest"
import { ALL_CARD_SLUGS, type CardSlug } from "../../src/Card.js"
import { decodeGameConfig } from "../../src/GameConfig.js"
import { type GameState } from "../../src/GameState.js"
import { prngStateFromSeed } from "../../src/Prng.js"
import { card, slot, uid } from "../fixtures.js"
import { simulateGame } from "./driver.js"
import { defaultKnobs } from "./policy.js"

/**
 * Seeded scenarios for the C5.2 rare-case shapes the tuned default batch
 * cannot reach (J/Q fizzles need fewer than two occupied slots in the whole
 * game; the ADR-0012 skip needs a zero-card keep to drain a one-card pile).
 * Each starts `simulateGame` from a constructed full-partition mid-game
 * state via `params.initial`, with slams disabled so the scripted opening
 * moves are undisturbed, and asserts its counters from that run. Fixed
 * seeds make each run deterministic.
 */
const config = decodeGameConfig({ slamWindowMs: 4000 })
const noSlams = { ...defaultKnobs, slamAttemptNum: 0 }

/** All 52 cards minus the explicitly placed ones, in ALL_CARD_SLUGS order. */
const rest = (placed: ReadonlyArray<CardSlug>): ReadonlyArray<CardSlug> => {
  const used = new Set<string>(placed)
  return ALL_CARD_SLUGS.filter((slug) => !used.has(slug)).map((slug) => card(slug))
}

describe("seeded rare-case scenarios (C5.2)", () => {
  it("reaches every ADR-0010 fizzle shape, including J and Q (ADR-0010)", () => {
    // 2 players; p1 empty-handed; only one occupied slot in the whole game.
    // Deck stacked so the opening turns are forced draws (discard tops are
    // power cards, so TakeDiscard is never legal early):
    //   t1 p0 draws JS → 1 occupied slot < 2 → J fizzles
    //   t2 p1 draws 8S → own hand empty      → 7/8 fizzles
    //   t3 p0 draws 9S → opponent hand empty → 9/T fizzles
    //   t4 p1 draws QS → 1 occupied slot < 2 → Q fizzles
    const placed = [card("2S"), card("JC"), card("JS"), card("8S"), card("9S"), card("QS")]
    const state: GameState = {
      players: [
        { id: uid(0), hand: [{ slotIndex: slot(0), card: card("2S") }] },
        { id: uid(1), hand: [] },
      ],
      deck: [card("JS"), card("8S"), card("9S"), card("QS"), ...rest(placed)],
      discard: [card("JC")],
      prng: prngStateFromSeed(31),
      phase: { _tag: "AwaitingDraw", playerId: uid(0) },
      config,
    }
    const run = simulateGame({
      gameSeed: 900_001,
      driverSeed: 900_002,
      playerCount: 2,
      config,
      knobs: noSlams,
      initial: { state, roster: [uid(0), uid(1)] },
    })
    expect(run.finalState.phase._tag).toBe("Ended")
    expect(run.counters.fizzlesJack, "J fizzle (ADR-0010)").toBeGreaterThan(0)
    expect(run.counters.fizzlesQueen, "Q fizzle (ADR-0010)").toBeGreaterThan(0)
    expect(run.counters.fizzlesPeekOwn, "7/8 fizzle (ADR-0010)").toBeGreaterThan(0)
    expect(run.counters.fizzlesPeekOther, "9/T fizzle (ADR-0010)").toBeGreaterThan(0)
  })

  it("reaches the empty-discard window skip via a zero-card keep (ADR-0012)", () => {
    // p0 has no cards and faces a one-card, non-power discard pile: the
    // zero-card-take bias makes p0 take it as a keep (ADR-0009), leaving the
    // pile empty — no slam window opens and the turn advances directly.
    const placed = [card("2S"), card("3S"), card("4S"), card("5S"), card("6S")]
    const state: GameState = {
      players: [
        { id: uid(0), hand: [] },
        {
          id: uid(1),
          hand: [
            { slotIndex: slot(0), card: card("3S") },
            { slotIndex: slot(1), card: card("4S") },
            { slotIndex: slot(2), card: card("5S") },
            { slotIndex: slot(3), card: card("6S") },
          ],
        },
      ],
      deck: [...rest(placed)],
      discard: [card("2S")],
      prng: prngStateFromSeed(32),
      phase: { _tag: "AwaitingDraw", playerId: uid(0) },
      config,
    }
    const run = simulateGame({
      gameSeed: 900_003,
      driverSeed: 900_004,
      playerCount: 2,
      config,
      knobs: noSlams,
      initial: { state, roster: [uid(0), uid(1)] },
    })
    expect(run.finalState.phase._tag).toBe("Ended")
    expect(run.counters.emptyDiscardSkips, "empty-discard skip (ADR-0012)").toBeGreaterThan(0)
    expect(run.counters.discardSourceKeeps, "zero-card discard keep (ADR-0009)").toBeGreaterThan(0)
  })
})
