import type { PlayerGameView, Rank } from "@cambio/contracts"
import { describe, expect, it } from "vitest"

import {
  affordancesFor,
  isOccupiedSlot,
  isPowerRank,
  rankOfSlug,
  slamGiveSlotRequired,
} from "../src/containers/game/affordances.js"

/**
 * H1/T1-T3 (CAM-18, frontend plan step 10) — every table here is written
 * FROM `.claude/skills/cambio-rules/SKILL.md`, never from memory: the power
 * set {7,8,9,10,J,Q}, "a power card on the discard cannot be taken", the
 * slam give-slot rule (ADR-0009), and the `ViewPhase` → affordance table
 * carried in `docs/plans/frontend/CAM-18.md`.
 */

const ME = "11111111-1111-4111-8111-111111111111"
const OPPONENT = "22222222-2222-4222-8222-222222222222"

function view(overrides: Partial<PlayerGameView> = {}): PlayerGameView {
  return {
    players: [
      { id: ME, name: "Raafay", hand: [0, 1, 2, 3] },
      { id: OPPONENT, name: "Nadia", hand: [0, 1] },
    ],
    deckCount: 40,
    discard: ["KH"],
    phase: { _tag: "AwaitingDraw", playerId: ME },
    config: { slamWindowMs: 8000 },
    ...overrides,
  }
}

describe("rankOfSlug", () => {
  it("extracts the rank from a two-character wire slug", () => {
    expect(rankOfSlug("AS")).toBe("A")
    expect(rankOfSlug("KH")).toBe("K")
  })

  it("extracts the wire's single-character rank for ten (T)", () => {
    expect(rankOfSlug("TD")).toBe("T")
  })
})

describe("isPowerRank", () => {
  it("is true for exactly the power set — 7, 8, 9, 10 (T), J, Q", () => {
    const powerRanks: ReadonlyArray<Rank> = ["7", "8", "9", "T", "J", "Q"]
    expect(powerRanks.map(isPowerRank)).toEqual([true, true, true, true, true, true])
  })

  it("is false for every non-power rank — A, 2-6, K", () => {
    const nonPowerRanks: ReadonlyArray<Rank> = ["A", "2", "3", "4", "5", "6", "K"]
    expect(nonPowerRanks.map(isPowerRank)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ])
  })
})

describe("slamGiveSlotRequired", () => {
  it("is never required for an own-card slam, even with a full hand", () => {
    expect(slamGiveSlotRequired(ME, ME, [0, 1, 2, 3])).toBe(false)
  })

  it("is required for an opponent-card slam when the slammer holds cards", () => {
    expect(slamGiveSlotRequired(ME, OPPONENT, [0, 1])).toBe(true)
  })

  it("is not required for an opponent-card slam by a zero-card slammer (ADR-0009 draw-then-give)", () => {
    expect(slamGiveSlotRequired(ME, OPPONENT, [])).toBe(false)
  })
})

describe("affordancesFor — AwaitingDraw", () => {
  it("holder: Call Cambio always, Take discard iff the top is non-power, Draw iff drawable", () => {
    const result = affordancesFor(view({ discard: ["KH"], deckCount: 40 }), ME)
    expect(result).toMatchObject({
      holder: true,
      callCambio: true,
      takeDiscard: true,
      drawFromDeck: true,
    })
  })

  it("holder: Take discard is disabled when the top is a power card", () => {
    const result = affordancesFor(view({ discard: ["7H"] }), ME)
    expect(result).toMatchObject({ takeDiscard: false })
  })

  it("holder: Draw is disabled with an empty deck and a single-card discard pile", () => {
    const result = affordancesFor(view({ deckCount: 0, discard: ["KH"] }), ME)
    expect(result).toMatchObject({ drawFromDeck: false })
  })

  it("holder: Draw stays enabled with an empty deck if the discard has more than its top (reshuffle fuel)", () => {
    const result = affordancesFor(view({ deckCount: 0, discard: ["KH", "3S"] }), ME)
    expect(result).toMatchObject({ drawFromDeck: true })
  })

  it("non-holder: nothing", () => {
    expect(
      affordancesFor(view({ phase: { _tag: "AwaitingDraw", playerId: OPPONENT } }), ME),
    ).toEqual({ phase: "AwaitingDraw", holder: false })
  })
})

describe("affordancesFor — HoldingCard", () => {
  it("holder, deck source, non-empty hand: swap and discard, never keep", () => {
    const result = affordancesFor(
      view({ phase: { _tag: "HoldingCard", playerId: ME, source: "deck", card: "3S" } }),
      ME,
    )
    expect(result).toMatchObject({ swap: true, discardHeld: true, keep: false })
  })

  it("holder, deck source, empty hand: keep only", () => {
    const result = affordancesFor(
      view({
        players: [
          { id: ME, name: "Raafay", hand: [] },
          { id: OPPONENT, name: "Nadia", hand: [0, 1] },
        ],
        phase: { _tag: "HoldingCard", playerId: ME, source: "deck", card: "3S" },
      }),
      ME,
    )
    expect(result).toMatchObject({ swap: false, discardHeld: true, keep: true })
  })

  it("holder, discard source: swap available, but discard-back is never offered (rule §1(b))", () => {
    const result = affordancesFor(
      view({ phase: { _tag: "HoldingCard", playerId: ME, source: "discard", card: "3S" } }),
      ME,
    )
    expect(result).toMatchObject({ swap: true, discardHeld: false })
  })

  it("non-holder: nothing", () => {
    expect(
      affordancesFor(
        view({ phase: { _tag: "HoldingCard", playerId: OPPONENT, source: "deck", card: "3S" } }),
        ME,
      ),
    ).toEqual({ phase: "HoldingCard", holder: false })
  })
})

describe("affordancesFor — ResolvingPower", () => {
  it("7 and 8 target one own occupied slot (peek-own)", () => {
    for (const card of ["7H", "8H"] as const) {
      const result = affordancesFor(
        view({ phase: { _tag: "ResolvingPower", playerId: ME, card } }),
        ME,
      )
      expect(result).toMatchObject({ holder: true, targeting: { kind: "peek-own" } })
    }
  })

  it("9 and 10 (T) target one opponent occupied slot (peek-other)", () => {
    for (const card of ["9H", "TH"] as const) {
      const result = affordancesFor(
        view({ phase: { _tag: "ResolvingPower", playerId: ME, card } }),
        ME,
      )
      expect(result).toMatchObject({ holder: true, targeting: { kind: "peek-other" } })
    }
  })

  it("J targets two distinct occupied slots across any players (swap-two)", () => {
    const result = affordancesFor(
      view({ phase: { _tag: "ResolvingPower", playerId: ME, card: "JH" } }),
      ME,
    )
    expect(result).toMatchObject({ holder: true, targeting: { kind: "swap-two" } })
  })

  it("Q is a peek first (queen-peek), any occupied slot", () => {
    const result = affordancesFor(
      view({ phase: { _tag: "ResolvingPower", playerId: ME, card: "QH" } }),
      ME,
    )
    expect(result).toMatchObject({ holder: true, targeting: { kind: "queen-peek" } })
  })

  it("non-holder: nothing (no card field — pinned by ViewFor.test.ts)", () => {
    expect(
      affordancesFor(view({ phase: { _tag: "ResolvingPower", playerId: OPPONENT } }), ME),
    ).toEqual({ phase: "ResolvingPower", holder: false })
  })
})

describe("affordancesFor — ResolvingQueenSwap", () => {
  it("holder: swap-two targeting, memory only — no card carried", () => {
    const result = affordancesFor(view({ phase: { _tag: "ResolvingQueenSwap", playerId: ME } }), ME)
    expect(result).toEqual({
      phase: "ResolvingQueenSwap",
      holder: true,
      targeting: { kind: "swap-two" },
    })
  })

  it("non-holder: nothing", () => {
    expect(
      affordancesFor(view({ phase: { _tag: "ResolvingQueenSwap", playerId: OPPONENT } }), ME),
    ).toEqual({ phase: "ResolvingQueenSwap", holder: false })
  })
})

describe("affordancesFor — out of this milestone's scope", () => {
  it("SlamWindow and Ended map to a bare phase marker, for any viewer", () => {
    expect(
      affordancesFor(
        view({ phase: { _tag: "SlamWindow", turnPlayerId: ME, closesAt: 0, rank: "K" } }),
        ME,
      ),
    ).toEqual({ phase: "SlamWindow" })
    expect(affordancesFor(view({ phase: { _tag: "Ended", calledBy: ME } }), OPPONENT)).toEqual({
      phase: "Ended",
    })
  })
})

describe("isOccupiedSlot", () => {
  it("is true for an occupied slot and false for a hole or an unknown player", () => {
    const v = view()
    expect(isOccupiedSlot(v, { playerId: ME, slotIndex: 0 })).toBe(true)
    expect(isOccupiedSlot(v, { playerId: OPPONENT, slotIndex: 5 })).toBe(false)
    expect(isOccupiedSlot(v, { playerId: "nobody", slotIndex: 0 })).toBe(false)
  })
})
