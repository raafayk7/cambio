import { describe, expect, it } from "@effect/vitest"
import { gameScores, handTotal, winnersOf } from "../src/Scoring.js"
import { decodeGameConfig } from "../src/GameConfig.js"
import { type GameState } from "../src/GameState.js"
import { prngStateFromSeed } from "../src/Prng.js"
import { card, slot, uid } from "./fixtures.js"

const p0 = uid(0)
const p1 = uid(1)
const p2 = uid(2)

describe("handTotal (§1.2)", () => {
  it("sums per-card scores; red kings can pull a total negative", () => {
    expect(
      handTotal([
        { slotIndex: slot(0), card: card("KD") },
        { slotIndex: slot(1), card: card("KH") },
        { slotIndex: slot(2), card: card("3C") },
      ]),
    ).toBe(-1)
  })

  it("scores an empty hand 0 — beatable by any negative total (§1.6)", () => {
    expect(handTotal([])).toBe(0)
  })
})

describe("gameScores and winnersOf (§1.8)", () => {
  const state: GameState = {
    players: [
      { id: p0, hand: [{ slotIndex: slot(0), card: card("KD") }] },
      { id: p1, hand: [] },
      {
        id: p2,
        hand: [
          { slotIndex: slot(0), card: card("AS") },
          { slotIndex: slot(1), card: card("2C") },
        ],
      },
    ],
    deck: [],
    discard: [card("4S")],
    prng: prngStateFromSeed(1),
    phase: { _tag: "AwaitingDraw", playerId: p0 },
    config: decodeGameConfig({ slamWindowMs: 4000 }),
  }

  it("scores every player in seat order", () => {
    expect(gameScores(state)).toStrictEqual([
      { playerId: p0, total: -2 },
      { playerId: p1, total: 0 },
      { playerId: p2, total: 2 },
    ])
  })

  it("a zero-card hand loses to a negative total (C5.1)", () => {
    expect(winnersOf(gameScores(state))).toStrictEqual([p0])
  })

  it("returns every player sharing the minimum — ties are representable", () => {
    expect(
      winnersOf([
        { playerId: p0, total: 3 },
        { playerId: p1, total: 3 },
        { playerId: p2, total: 7 },
      ]),
    ).toStrictEqual([p0, p1])
  })
})
