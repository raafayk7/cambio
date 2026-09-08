import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import {
  allCards,
  decodeGameState,
  encodeGameState,
  type GameState,
  handOf,
  lowestFreeSlot,
  occupiedSlots,
  seatOf,
  slotCard,
} from "../src/GameState.js"
import { decodeGameConfig } from "../src/GameConfig.js"
import { prngStateFromSeed } from "../src/Prng.js"
import { card, slot, uid } from "./fixtures.js"

const p0 = uid(0)
const p1 = uid(1)

const state: GameState = {
  players: [
    {
      id: p0,
      hand: [
        { slotIndex: slot(0), card: card("AS") },
        { slotIndex: slot(2), card: card("7H") },
        { slotIndex: slot(3), card: card("KD") },
      ],
    },
    { id: p1, hand: [{ slotIndex: slot(1), card: card("QC") }] },
  ],
  deck: [card("2S"), card("3S")],
  discard: [card("4S")],
  prng: prngStateFromSeed(1),
  phase: { _tag: "AwaitingDraw", playerId: p0 },
  config: decodeGameConfig({ slamWindowMs: 4000 }),
}

describe("GameState", () => {
  it("round-trips through the schema", () => {
    expect(decodeGameState(encodeGameState(state))).toStrictEqual(state)
  })

  it("seatOf finds seats by array position", () => {
    expect(seatOf(state, p0)).toStrictEqual(Option.some(0))
    expect(seatOf(state, p1)).toStrictEqual(Option.some(1))
    expect(Option.isNone(seatOf(state, uid(9)))).toBe(true)
  })

  it("handOf returns the player's hand", () => {
    expect(handOf(state, p1)).toStrictEqual(Option.some(state.players[1]!.hand))
    expect(Option.isNone(handOf(state, uid(9)))).toBe(true)
  })

  it("lowestFreeSlot fills holes first and grows past four (§4.3)", () => {
    expect(lowestFreeSlot([])).toBe(0)
    expect(lowestFreeSlot(state.players[0]!.hand)).toBe(1)
    expect(
      lowestFreeSlot([
        { slotIndex: slot(0), card: card("AS") },
        { slotIndex: slot(1), card: card("2S") },
        { slotIndex: slot(2), card: card("3S") },
        { slotIndex: slot(3), card: card("4S") },
      ]),
    ).toBe(4)
  })

  it("slotCard distinguishes occupied slots from holes", () => {
    expect(slotCard(state, { playerId: p0, slotIndex: slot(2) })).toStrictEqual(
      Option.some(card("7H")),
    )
    expect(Option.isNone(slotCard(state, { playerId: p0, slotIndex: slot(1) }))).toBe(true)
    expect(Option.isNone(slotCard(state, { playerId: uid(9), slotIndex: slot(0) }))).toBe(true)
  })

  it("occupiedSlots lists every (player, slot) pair", () => {
    expect(occupiedSlots(state)).toStrictEqual([
      { playerId: p0, slotIndex: slot(0) },
      { playerId: p0, slotIndex: slot(2) },
      { playerId: p0, slotIndex: slot(3) },
      { playerId: p1, slotIndex: slot(1) },
    ])
  })

  it("allCards concatenates deck, discard, and hands (§4.5 workhorse)", () => {
    expect([...allCards(state)].sort()).toStrictEqual(
      [card("2S"), card("3S"), card("4S"), card("AS"), card("7H"), card("KD"), card("QC")].sort(),
    )
  })
})
