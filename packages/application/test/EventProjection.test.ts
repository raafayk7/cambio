import { describe, expect, it } from "@effect/vitest"
import { type GameEvent, type Hand } from "@cambio/domain"
import { card, slot, ts, uid } from "@cambio/domain/testing"
import { Either, Schema } from "effect"
import {
  decodePlayerGameEventEither,
  decodeRoomGameEventEither,
  PlayerGameEvent,
  RoomGameEvent,
} from "@cambio/contracts"
import { projectEvents } from "../src/projection/EventProjection.js"
import { slugsIn } from "./support/leaks.js"

/**
 * C3 unit suite: one test per domain event variant pinning its channel
 * classification and projected shape. Totality over all 22 variants is
 * compile-time (`satisfies never` in the implementation — a 23rd domain
 * event must break that build).
 */

const p0 = uid(0)
const p1 = uid(1)

const encodeRoom = Schema.encodeSync(RoomGameEvent)
const encodePlayer = Schema.encodeSync(PlayerGameEvent)

/** Project one event and round-trip every output through the contracts codecs. */
const project = (event: GameEvent) => {
  const out = projectEvents([event])
  for (const room of out.room) {
    expect(Either.isRight(decodeRoomGameEventEither(encodeRoom(room)))).toBe(true)
  }
  for (const events of out.perPlayer.values()) {
    for (const priv of events) {
      expect(Either.isRight(decodePlayerGameEventEither(encodePlayer(priv)))).toBe(true)
    }
  }
  return out
}

const noPrivate = (out: ReturnType<typeof projectEvents>) => {
  expect([...out.perPlayer.values()].flat()).toEqual([])
}

const hand = (...slugs: ReadonlyArray<readonly [number, string]>): Hand =>
  slugs.map(([i, s]) => ({ slotIndex: slot(i), card: card(s) }))

describe("C3.3 — value-stripped for everyone", () => {
  it("GameStarted: players, deck count, config — no card value at all (ADR-0039: hands/deck/prng/seed/discard gone)", () => {
    const out = project({
      _tag: "GameStarted",
      at: ts(0),
      seed: 42,
      players: [p0, p1],
      config: { slamWindowMs: 5000 },
      hands: [hand([0, "AS"], [1, "2H"]), hand([0, "KD"], [1, "3C"])],
      deck: [card("4C"), card("5C")],
      prng: [1, 2, 3, 4],
    })
    expect(out.room).toEqual([
      {
        _tag: "GameStarted",
        players: [p0, p1],
        deckCount: 2,
        config: { slamWindowMs: 5000 },
      },
    ])
    expect(slugsIn(out.room)).toEqual([])
    noPrivate(out)
  })

  it("HeldSwapped: slot + the discarded (public) card; the placed value is gone", () => {
    const out = project({
      _tag: "HeldSwapped",
      playerId: p0,
      slotIndex: slot(1),
      placed: card("QC"),
      discarded: card("7H"),
    })
    expect(out.room).toEqual([{ _tag: "HeldSwapped", playerId: p0, slotIndex: 1, discarded: "7H" }])
    expect(slugsIn(out.room)).toEqual(["7H"])
    noPrivate(out)
  })

  it("HeldKept: slot only — the keeper saw the value at draw time", () => {
    const out = project({ _tag: "HeldKept", playerId: p0, slotIndex: slot(0), card: card("QC") })
    expect(out.room).toEqual([{ _tag: "HeldKept", playerId: p0, slotIndex: 0 }])
    expect(slugsIn(out.room)).toEqual([])
    noPrivate(out)
  })

  it("PenaltyDrawn: slot only — unseen by everyone, the slammer included (ADR-0022)", () => {
    const out = project({
      _tag: "PenaltyDrawn",
      playerId: p0,
      slotIndex: slot(2),
      card: card("KS"),
    })
    expect(out.room).toEqual([{ _tag: "PenaltyDrawn", playerId: p0, slotIndex: 2 }])
    expect(slugsIn(out.room)).toEqual([])
    noPrivate(out)
  })

  it("CardGivenFromDeck: slot movement only — given unseen (ADR-0009)", () => {
    const out = project({
      _tag: "CardGivenFromDeck",
      slammerId: p0,
      to: { playerId: p1, slotIndex: slot(1) },
      card: card("6C"),
    })
    expect(out.room).toEqual([
      { _tag: "CardGivenFromDeck", slammerId: p0, to: { playerId: p1, slotIndex: 1 } },
    ])
    expect(slugsIn(out.room)).toEqual([])
    noPrivate(out)
  })

  it("DeckReshuffled: a count — the new order is the shuffled future", () => {
    const out = project({
      _tag: "DeckReshuffled",
      deck: [card("4C"), card("5C"), card("6C")],
      prng: [5, 6, 7, 8],
    })
    expect(out.room).toEqual([{ _tag: "DeckReshuffled", deckCount: 3 }])
    noPrivate(out)
  })
})

describe("C3.4 — split into private value + value-free room event", () => {
  it("CardDrawn: the drawer's channel gets the value; the room learns a draw happened", () => {
    const out = project({ _tag: "CardDrawn", playerId: p0, card: card("QC") })
    expect(out.room).toEqual([{ _tag: "CardDrawn", playerId: p0 }])
    expect(out.perPlayer.get(p0)).toEqual([{ _tag: "PrivateCardDrawn", card: "QC" }])
    expect(out.perPlayer.get(p1)).toBeUndefined()
  })

  it("CardPeeked: the viewer's channel gets the value; the room learns a peek occurred", () => {
    const out = project({
      _tag: "CardPeeked",
      viewerId: p1,
      target: { playerId: p0, slotIndex: slot(0) },
      card: card("AS"),
    })
    expect(out.room).toEqual([
      { _tag: "CardPeeked", viewerId: p1, target: { playerId: p0, slotIndex: 0 } },
    ])
    expect(out.perPlayer.get(p1)).toEqual([
      { _tag: "PrivateCardPeeked", target: { playerId: p0, slotIndex: 0 }, card: "AS" },
    ])
    expect(out.perPlayer.get(p0)).toBeUndefined()
  })
})

describe("C3.2 — public with value, by rule", () => {
  it("DiscardTaken keeps its card — it came off the public pile", () => {
    const out = project({ _tag: "DiscardTaken", playerId: p0, card: card("5D") })
    expect(out.room).toEqual([{ _tag: "DiscardTaken", playerId: p0, card: "5D" }])
    noPrivate(out)
  })

  it("HeldDiscarded keeps its card — it lands face-up", () => {
    const out = project({ _tag: "HeldDiscarded", playerId: p0, card: card("6C") })
    expect(out.room).toEqual([{ _tag: "HeldDiscarded", playerId: p0, card: "6C" }])
    noPrivate(out)
  })

  it("PowerDiscarded keeps its card — it lands face-up", () => {
    const out = project({ _tag: "PowerDiscarded", playerId: p0, card: card("9C") })
    expect(out.room).toEqual([{ _tag: "PowerDiscarded", playerId: p0, card: "9C" }])
    noPrivate(out)
  })

  it("SlamSucceeded keeps its card — the reveal is part of the cost (§1.5)", () => {
    const out = project({
      _tag: "SlamSucceeded",
      slammerId: p1,
      target: { playerId: p0, slotIndex: slot(0) },
      card: card("9S"),
    })
    expect(out.room).toEqual([
      { _tag: "SlamSucceeded", slammerId: p1, target: { playerId: p0, slotIndex: 0 }, card: "9S" },
    ])
    noPrivate(out)
  })

  it("SlamFailed keeps its card — failed slams reveal too (§1.5)", () => {
    const out = project({
      _tag: "SlamFailed",
      slammerId: p1,
      target: { playerId: p0, slotIndex: slot(1) },
      card: card("7H"),
    })
    expect(out.room).toEqual([
      { _tag: "SlamFailed", slammerId: p1, target: { playerId: p0, slotIndex: 1 }, card: "7H" },
    ])
    noPrivate(out)
  })
})

describe("C3.1 — pass-throughs (already value-free)", () => {
  const cases: ReadonlyArray<readonly [GameEvent, Record<string, unknown>]> = [
    [
      { _tag: "CambioCalled", playerId: p0 },
      { _tag: "CambioCalled", playerId: p0 },
    ],
    [
      {
        _tag: "GameEnded",
        calledBy: p0,
        scores: [
          { playerId: p0, total: -1 },
          { playerId: p1, total: 4 },
        ],
        winners: [p0],
      },
      {
        _tag: "GameEnded",
        calledBy: p0,
        scores: [
          { playerId: p0, total: -1 },
          { playerId: p1, total: 4 },
        ],
        winners: [p0],
      },
    ],
    [
      {
        _tag: "CardsBlindSwapped",
        by: p0,
        first: { playerId: p0, slotIndex: slot(0) },
        second: { playerId: p1, slotIndex: slot(1) },
      },
      {
        _tag: "CardsBlindSwapped",
        by: p0,
        first: { playerId: p0, slotIndex: 0 },
        second: { playerId: p1, slotIndex: 1 },
      },
    ],
    [
      { _tag: "PowerFizzled", playerId: p0, power: "J" },
      { _tag: "PowerFizzled", playerId: p0, power: "J" },
    ],
    [
      { _tag: "SlamWindowOpened", turnPlayerId: p0, closesAt: ts(5000), rank: "9" },
      { _tag: "SlamWindowOpened", turnPlayerId: p0, closesAt: 5000, rank: "9" },
    ],
    [
      {
        _tag: "CardGivenFromHand",
        slammerId: p1,
        fromSlot: slot(0),
        to: { playerId: p0, slotIndex: slot(1) },
      },
      {
        _tag: "CardGivenFromHand",
        slammerId: p1,
        fromSlot: 0,
        to: { playerId: p0, slotIndex: 1 },
      },
    ],
    [
      { _tag: "DrawSkipped", playerId: p0, kind: "penalty" },
      { _tag: "DrawSkipped", playerId: p0, kind: "penalty" },
    ],
    [{ _tag: "SlamWindowClosed" }, { _tag: "SlamWindowClosed" }],
    [
      { _tag: "TurnAdvanced", playerId: p1 },
      { _tag: "TurnAdvanced", playerId: p1 },
    ],
  ]

  it("each lands on the room channel unchanged, with no private counterpart", () => {
    for (const [event, expected] of cases) {
      const out = project(event)
      expect(out.room, event._tag).toEqual([expected])
      noPrivate(out)
    }
  })
})

describe("batching", () => {
  it("a step's events project in order, each to its channel", () => {
    const out = projectEvents([
      { _tag: "CardDrawn", playerId: p0, card: card("QC") },
      { _tag: "TurnAdvanced", playerId: p1 },
    ])
    expect(out.room.map((e) => e._tag)).toEqual(["CardDrawn", "TurnAdvanced"])
    expect(out.perPlayer.get(p0)).toEqual([{ _tag: "PrivateCardDrawn", card: "QC" }])
  })
})
