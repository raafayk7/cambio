import { describe, expect, it } from "@effect/vitest"
import { Either } from "effect"
import { applyCommand } from "../src/Engine.js"
import { decodeGameConfig } from "../src/GameConfig.js"
import { type GameState } from "../src/GameState.js"
import { prngStateFromSeed } from "../src/Prng.js"
import { card, slot, ts, uid } from "./fixtures.js"

const p0 = uid(0)
const p1 = uid(1)
const now = ts(1_000_000)
const config = decodeGameConfig({ slamWindowMs: 4000 })

const base: GameState = {
  players: [
    {
      id: p0,
      hand: [
        { slotIndex: slot(0), card: card("AS") },
        { slotIndex: slot(1), card: card("5D") },
      ],
    },
    { id: p1, hand: [{ slotIndex: slot(0), card: card("9C") }] },
  ],
  deck: [card("2S"), card("3S")],
  discard: [card("4S")],
  prng: prngStateFromSeed(1),
  phase: { _tag: "AwaitingDraw", playerId: p0 },
  config,
}

const resolving = (power: string, state: GameState = base): GameState => ({
  ...state,
  phase: { _tag: "ResolvingPower", playerId: p0, card: card(power) },
})

const apply = (state: GameState, command: Parameters<typeof applyCommand>[1], at = now) => {
  const result = applyCommand(state, command, at)
  if (Either.isLeft(result)) throw new Error(`illegal: ${result.left._tag}`)
  return result.right
}

const errorTag = (state: GameState, command: Parameters<typeof applyCommand>[1], at = now) => {
  const result = applyCommand(state, command, at)
  return Either.isLeft(result) ? result.left._tag : "LEGAL"
}

describe("7/8 — look at one of your own cards (C3.1)", () => {
  it("peeks, discards the power, opens the window at the power's rank", () => {
    const [after, events] = apply(resolving("7S"), {
      _tag: "PowerPeek",
      playerId: p0,
      target: { playerId: p0, slotIndex: slot(1) },
    })
    expect(events).toStrictEqual([
      {
        _tag: "CardPeeked",
        viewerId: p0,
        target: { playerId: p0, slotIndex: slot(1) },
        card: card("5D"),
      },
      { _tag: "PowerDiscarded", playerId: p0, card: card("7S") },
      { _tag: "SlamWindowOpened", turnPlayerId: p0, closesAt: ts(1_004_000), rank: "7" },
    ])
    expect(after.discard[0]).toBe(card("7S"))
    expect(after.phase._tag).toBe("SlamWindow")
    expect(after.players).toStrictEqual(base.players)
  })

  it("rejects peeking someone else's card", () => {
    expect(
      errorTag(resolving("8H"), {
        _tag: "PowerPeek",
        playerId: p0,
        target: { playerId: p1, slotIndex: slot(0) },
      }),
    ).toBe("WrongPeekTarget")
  })

  it("rejects peeking a hole", () => {
    expect(
      errorTag(resolving("7S"), {
        _tag: "PowerPeek",
        playerId: p0,
        target: { playerId: p0, slotIndex: slot(3) },
      }),
    ).toBe("EmptySlotTarget")
  })
})

describe("9/10 — look at another player's card (C3.2)", () => {
  it("peeks an opponent's occupied slot", () => {
    const [, events] = apply(resolving("TD"), {
      _tag: "PowerPeek",
      playerId: p0,
      target: { playerId: p1, slotIndex: slot(0) },
    })
    expect(events[0]).toStrictEqual({
      _tag: "CardPeeked",
      viewerId: p0,
      target: { playerId: p1, slotIndex: slot(0) },
      card: card("9C"),
    })
    expect(events[1]).toStrictEqual({ _tag: "PowerDiscarded", playerId: p0, card: card("TD") })
  })

  it("rejects peeking your own card", () => {
    expect(
      errorTag(resolving("9H"), {
        _tag: "PowerPeek",
        playerId: p0,
        target: { playerId: p0, slotIndex: slot(0) },
      }),
    ).toBe("WrongPeekTarget")
  })
})

describe("J — blind-swap any two player-held cards (C3.3)", () => {
  it("exchanges the two cards and stays blind (no identities in the event)", () => {
    const [after, events] = apply(resolving("JS"), {
      _tag: "PowerSwap",
      playerId: p0,
      first: { playerId: p0, slotIndex: slot(0) },
      second: { playerId: p1, slotIndex: slot(0) },
    })
    expect(after.players[0]!.hand.find((s) => s.slotIndex === slot(0))!.card).toBe(card("9C"))
    expect(after.players[1]!.hand.find((s) => s.slotIndex === slot(0))!.card).toBe(card("AS"))
    expect(events).toStrictEqual([
      {
        _tag: "CardsBlindSwapped",
        by: p0,
        first: { playerId: p0, slotIndex: slot(0) },
        second: { playerId: p1, slotIndex: slot(0) },
      },
      { _tag: "PowerDiscarded", playerId: p0, card: card("JS") },
      { _tag: "SlamWindowOpened", turnPlayerId: p0, closesAt: ts(1_004_000), rank: "J" },
    ])
  })

  it("may swap two cards of the same player (§1.4)", () => {
    const [after] = apply(resolving("JS"), {
      _tag: "PowerSwap",
      playerId: p0,
      first: { playerId: p0, slotIndex: slot(0) },
      second: { playerId: p0, slotIndex: slot(1) },
    })
    expect(after.players[0]!.hand.map((s) => s.card)).toStrictEqual([card("5D"), card("AS")])
  })

  it("rejects naming the same slot twice — a swap needs two cards", () => {
    expect(
      errorTag(resolving("JS"), {
        _tag: "PowerSwap",
        playerId: p0,
        first: { playerId: p0, slotIndex: slot(0) },
        second: { playerId: p0, slotIndex: slot(0) },
      }),
    ).toBe("SwapTargetsIdentical")
  })
})

describe("Q — look at any one card, then blind-swap (C3.4)", () => {
  it("peeks (any occupied slot), then owes the swap", () => {
    const [mid, peekEvents] = apply(resolving("QH"), {
      _tag: "PowerPeek",
      playerId: p0,
      target: { playerId: p1, slotIndex: slot(0) },
    })
    expect(mid.phase).toStrictEqual({ _tag: "ResolvingQueenSwap", playerId: p0, card: card("QH") })
    expect(peekEvents).toStrictEqual([
      {
        _tag: "CardPeeked",
        viewerId: p0,
        target: { playerId: p1, slotIndex: slot(0) },
        card: card("9C"),
      },
    ])

    expect(
      errorTag(mid, {
        _tag: "PowerPeek",
        playerId: p0,
        target: { playerId: p0, slotIndex: slot(0) },
      }),
    ).toBe("WrongPhase")

    const [after, swapEvents] = apply(mid, {
      _tag: "PowerSwap",
      playerId: p0,
      first: { playerId: p1, slotIndex: slot(0) },
      second: { playerId: p0, slotIndex: slot(1) },
    })
    expect(after.players[1]!.hand[0]!.card).toBe(card("5D"))
    expect(after.players[0]!.hand.find((s) => s.slotIndex === slot(1))!.card).toBe(card("9C"))
    expect(swapEvents[1]).toStrictEqual({ _tag: "PowerDiscarded", playerId: p0, card: card("QH") })
    expect(after.phase._tag).toBe("SlamWindow")
  })

  it("cannot swap before peeking", () => {
    expect(
      errorTag(resolving("QH"), {
        _tag: "PowerSwap",
        playerId: p0,
        first: { playerId: p0, slotIndex: slot(0) },
        second: { playerId: p1, slotIndex: slot(0) },
      }),
    ).toBe("WrongPhase")
  })
})

describe("fizzles — no valid target (C3.5, ADR-0010)", () => {
  const drawInto = (deckTop: string, state: GameState) =>
    apply(
      { ...state, deck: [card(deckTop), ...state.deck] },
      { _tag: "DrawFromDeck", playerId: p0 },
    )

  it("7/8 fizzle when the drawer's hand is empty", () => {
    const zeroSelf: GameState = { ...base, players: [{ id: p0, hand: [] }, base.players[1]!] }
    const [after, events] = drawInto("7C", zeroSelf)
    expect(events.map((e) => e._tag)).toStrictEqual([
      "CardDrawn",
      "PowerFizzled",
      "PowerDiscarded",
      "SlamWindowOpened",
    ])
    expect(after.discard[0]).toBe(card("7C"))
    expect(after.phase._tag).toBe("SlamWindow")
  })

  it("9/10 fizzle when every opponent is empty", () => {
    const zeroOthers: GameState = { ...base, players: [base.players[0]!, { id: p1, hand: [] }] }
    const [, events] = drawInto("9D", zeroOthers)
    expect(events[1]).toStrictEqual({ _tag: "PowerFizzled", playerId: p0, power: "9" })
  })

  it("J and Q fizzle whole with fewer than two occupied slots — no partial Queen", () => {
    const oneSlot: GameState = {
      ...base,
      players: [
        { id: p0, hand: [{ slotIndex: slot(0), card: card("AS") }] },
        { id: p1, hand: [] },
      ],
    }
    const [, jackEvents] = drawInto("JD", oneSlot)
    expect(jackEvents[1]).toStrictEqual({ _tag: "PowerFizzled", playerId: p0, power: "J" })

    const [afterQueen, queenEvents] = drawInto("QD", oneSlot)
    expect(queenEvents.map((e) => e._tag)).toStrictEqual([
      "CardDrawn",
      "PowerFizzled",
      "PowerDiscarded",
      "SlamWindowOpened",
    ])
    expect(afterQueen.phase._tag).toBe("SlamWindow")
  })
})
