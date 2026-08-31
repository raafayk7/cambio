import { describe, expect, it } from "@effect/vitest"
import { decodeGameEvent, encodeGameEvent, type GameEvent } from "../src/GameEvent.js"
import { card, slot, ts, uid } from "./fixtures.js"

const p0 = uid(0)
const p1 = uid(1)

describe("GameEvent", () => {
  it("round-trips each member of the union", () => {
    const events: ReadonlyArray<GameEvent> = [
      {
        _tag: "GameStarted",
        at: ts(1_700_000_000_000),
        seed: 42,
        players: [p0, p1],
        config: { slamWindowMs: 4000 },
        hands: [
          [
            { slotIndex: slot(0), card: card("AS") },
            { slotIndex: slot(1), card: card("2H") },
          ],
          [
            { slotIndex: slot(0), card: card("3C") },
            { slotIndex: slot(1), card: card("4D") },
          ],
        ],
        deck: [card("5S"), card("6S")],
        firstDiscard: card("7D"),
      },
      { _tag: "CambioCalled", playerId: p0 },
      {
        _tag: "GameEnded",
        calledBy: p0,
        scores: [
          { playerId: p0, total: -2 },
          { playerId: p1, total: 5 },
        ],
        winners: [p0],
      },
      { _tag: "CardDrawn", playerId: p0, card: card("9C") },
      { _tag: "DiscardTaken", playerId: p0, card: card("5H") },
      { _tag: "HeldSwapped", playerId: p0, slotIndex: slot(1), placed: card("5H"), discarded: card("KS") },
      { _tag: "HeldKept", playerId: p0, slotIndex: slot(0), card: card("5H") },
      { _tag: "HeldDiscarded", playerId: p0, card: card("6D") },
      { _tag: "CardPeeked", viewerId: p0, target: { playerId: p1, slotIndex: slot(2) }, card: card("QD") },
      {
        _tag: "CardsBlindSwapped",
        by: p0,
        first: { playerId: p0, slotIndex: slot(0) },
        second: { playerId: p1, slotIndex: slot(3) },
      },
      { _tag: "PowerFizzled", playerId: p0, power: "9" },
      { _tag: "PowerDiscarded", playerId: p0, card: card("8C") },
      { _tag: "SlamWindowOpened", turnPlayerId: p0, closesAt: ts(1_700_000_004_000), rank: "8" },
      { _tag: "SlamSucceeded", slammerId: p1, target: { playerId: p0, slotIndex: slot(0) }, card: card("8H") },
      { _tag: "SlamFailed", slammerId: p1, target: { playerId: p0, slotIndex: slot(1) }, card: card("2C") },
      { _tag: "PenaltyDrawn", playerId: p1, slotIndex: slot(4), card: card("TC") },
      { _tag: "CardGivenFromHand", slammerId: p1, fromSlot: slot(2), to: { playerId: p0, slotIndex: slot(0) } },
      { _tag: "CardGivenFromDeck", slammerId: p1, to: { playerId: p0, slotIndex: slot(0) }, card: card("JS") },
      { _tag: "DrawSkipped", playerId: p1, kind: "penalty" },
      { _tag: "DeckReshuffled", deck: [card("2S"), card("9D")] },
      { _tag: "SlamWindowClosed" },
      { _tag: "TurnAdvanced", playerId: p1 },
    ]

    expect(new Set(events.map((e) => e._tag)).size).toBe(22)
    for (const event of events) {
      expect(decodeGameEvent(encodeGameEvent(event))).toStrictEqual(event)
    }
  })

  it("rejects an unknown tag", () => {
    expect(() => decodeGameEvent({ _tag: "Nope" })).toThrow()
  })
})
