import { describe, expect, it } from "@effect/vitest"
import { Either } from "effect"
import { rank } from "../src/Card.js"
import { applyCommand } from "../src/Engine.js"
import { decodeGameConfig } from "../src/GameConfig.js"
import { allCards, type GameState } from "../src/GameState.js"
import { legalCommandKinds } from "../src/Legality.js"
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

const apply = (state: GameState, command: Parameters<typeof applyCommand>[1], at = now) => {
  const result = applyCommand(state, command, at)
  if (Either.isLeft(result)) throw new Error(`illegal: ${result.left._tag}`)
  return result.right
}

const errorTag = (state: GameState, command: Parameters<typeof applyCommand>[1], at = now) => {
  const result = applyCommand(state, command, at)
  return Either.isLeft(result) ? result.left._tag : "LEGAL"
}

const partition = (state: GameState) => [...allCards(state)].sort()

describe("CallCambio (C2.2)", () => {
  it("ends the game immediately with scores and winners", () => {
    const [state, events] = apply(base, { _tag: "CallCambio", playerId: p0 })
    expect(state.phase).toStrictEqual({ _tag: "Ended", calledBy: p0 })
    expect(events).toStrictEqual([
      { _tag: "CambioCalled", playerId: p0 },
      {
        _tag: "GameEnded",
        calledBy: p0,
        scores: [
          { playerId: p0, total: 5 },
          { playerId: p1, total: 9 },
        ],
        winners: [p0],
      },
    ])
    expect(errorTag(state, { _tag: "DrawFromDeck", playerId: p1 })).toBe("GameAlreadyEnded")
  })
})

describe("TakeDiscard (C2.3)", () => {
  it("moves the top discard into held state, then a swap resolves the turn (C2.3, C2.6, C4.1)", () => {
    const [holding, takeEvents] = apply(base, { _tag: "TakeDiscard", playerId: p0 })
    expect(holding.phase).toStrictEqual({
      _tag: "HoldingCard",
      playerId: p0,
      card: card("4S"),
      source: "discard",
    })
    expect(holding.discard).toStrictEqual([])
    expect(takeEvents).toStrictEqual([{ _tag: "DiscardTaken", playerId: p0, card: card("4S") }])
    expect(partition(holding)).toStrictEqual(partition(base))

    const [after, swapEvents] = apply(holding, {
      _tag: "SwapHeld",
      playerId: p0,
      slotIndex: slot(0),
    })
    expect(after.players[0]!.hand).toStrictEqual([
      { slotIndex: slot(0), card: card("4S") },
      { slotIndex: slot(1), card: card("5D") },
    ])
    expect(after.discard).toStrictEqual([card("AS")])
    expect(after.phase).toStrictEqual({
      _tag: "SlamWindow",
      turnPlayerId: p0,
      closesAt: ts(1_000_000 + 4000),
      rank: "A",
    })
    expect(swapEvents).toStrictEqual([
      {
        _tag: "HeldSwapped",
        playerId: p0,
        slotIndex: slot(0),
        placed: card("4S"),
        discarded: card("AS"),
      },
      { _tag: "SlamWindowOpened", turnPlayerId: p0, closesAt: ts(1_004_000), rank: "A" },
    ])
    expect(partition(after)).toStrictEqual(partition(base))
  })

  it("never lets a taken discard go straight back (§1.3b)", () => {
    const [holding] = apply(base, { _tag: "TakeDiscard", playerId: p0 })
    expect(errorTag(holding, { _tag: "DiscardHeld", playerId: p0 })).toBe("WrongPhase")
  })

  it("becomes a keep for a zero-card player (C5.2, ADR-0009)", () => {
    const zero: GameState = {
      ...base,
      players: [{ id: p0, hand: [] }, base.players[1]!],
      discard: [card("4S"), card("2D")],
      phase: { _tag: "AwaitingDraw", playerId: p0 },
    }
    const [holding] = apply(zero, { _tag: "TakeDiscard", playerId: p0 })
    expect(errorTag(holding, { _tag: "SwapHeld", playerId: p0, slotIndex: slot(0) })).toBe(
      "EmptySlotTarget",
    )
    const [after, events] = apply(holding, { _tag: "KeepHeld", playerId: p0 })
    expect(after.players[0]!.hand).toStrictEqual([{ slotIndex: slot(0), card: card("4S") }])
    expect(events[0]).toStrictEqual({
      _tag: "HeldKept",
      playerId: p0,
      slotIndex: slot(0),
      card: card("4S"),
    })
    expect(after.phase._tag).toBe("SlamWindow")
    if (after.phase._tag === "SlamWindow") expect(after.phase.rank).toBe("2")
  })

  it("rejects keeps for players who still hold cards", () => {
    const [holding] = apply(base, { _tag: "TakeDiscard", playerId: p0 })
    expect(errorTag(holding, { _tag: "KeepHeld", playerId: p0 })).toBe("KeepRequiresEmptyHand")
  })

  it("skips the slam window when the keep empties the pile (ADR-0012)", () => {
    const zero: GameState = {
      ...base,
      players: [{ id: p0, hand: [] }, base.players[1]!],
      phase: { _tag: "AwaitingDraw", playerId: p0 },
    }
    const [holding] = apply(zero, { _tag: "TakeDiscard", playerId: p0 })
    const [after, events] = apply(holding, { _tag: "KeepHeld", playerId: p0 })
    expect(after.discard).toStrictEqual([])
    expect(after.phase).toStrictEqual({ _tag: "AwaitingDraw", playerId: p1 })
    expect(events).toStrictEqual([
      { _tag: "HeldKept", playerId: p0, slotIndex: slot(0), card: card("4S") },
      { _tag: "TurnAdvanced", playerId: p1 },
    ])
  })

  it("rejects taking from an empty pile (ADR-0012)", () => {
    const emptyPile: GameState = { ...base, discard: [] }
    expect(errorTag(emptyPile, { _tag: "TakeDiscard", playerId: p0 })).toBe("EmptyDiscard")
  })
})

describe("DrawFromDeck (C2.4–5)", () => {
  it("moves the top deck card into held state, then discard-directly resolves", () => {
    const [holding, drawEvents] = apply(base, { _tag: "DrawFromDeck", playerId: p0 })
    expect(holding.phase).toStrictEqual({
      _tag: "HoldingCard",
      playerId: p0,
      card: card("2S"),
      source: "deck",
    })
    expect(holding.deck).toStrictEqual([card("3S")])
    expect(drawEvents).toStrictEqual([{ _tag: "CardDrawn", playerId: p0, card: card("2S") }])
    expect(partition(holding)).toStrictEqual(partition(base))

    const [after, events] = apply(holding, { _tag: "DiscardHeld", playerId: p0 })
    expect(after.discard).toStrictEqual([card("2S"), card("4S")])
    expect(after.phase).toStrictEqual({
      _tag: "SlamWindow",
      turnPlayerId: p0,
      closesAt: ts(1_004_000),
      rank: "2",
    })
    expect(events).toStrictEqual([
      { _tag: "HeldDiscarded", playerId: p0, card: card("2S") },
      { _tag: "SlamWindowOpened", turnPlayerId: p0, closesAt: ts(1_004_000), rank: "2" },
    ])
  })

  it("a drawn power with a valid target enters ResolvingPower (§1.3c)", () => {
    const powerDeck: GameState = { ...base, deck: [card("7S"), card("3S")] }
    const [holding, events] = apply(powerDeck, { _tag: "DrawFromDeck", playerId: p0 })
    expect(holding.phase).toStrictEqual({ _tag: "ResolvingPower", playerId: p0, card: card("7S") })
    expect(events).toStrictEqual([{ _tag: "CardDrawn", playerId: p0, card: card("7S") }])
    expect(errorTag(holding, { _tag: "SwapHeld", playerId: p0, slotIndex: slot(0) })).toBe(
      "MustResolvePower",
    )
    expect(errorTag(holding, { _tag: "DiscardHeld", playerId: p0 })).toBe("MustResolvePower")
    expect(errorTag(holding, { _tag: "KeepHeld", playerId: p0 })).toBe("MustResolvePower")
  })

  it("draws the last deck card, then eagerly reshuffles the pile (keeping its top) (C6.1, ADR-0040)", () => {
    const lastCard: GameState = {
      ...base,
      deck: [card("2D")],
      discard: [card("4S"), card("3H")],
    }
    const [after, events] = apply(lastCard, { _tag: "DrawFromDeck", playerId: p0 })
    expect(events.map((e) => e._tag)).toStrictEqual(["CardDrawn", "DeckReshuffled"])
    if (events[0]!._tag !== "CardDrawn") throw new Error("expected CardDrawn")
    expect(events[0]!.card).toBe(card("2D"))
    if (events[1]!._tag !== "DeckReshuffled") throw new Error("expected DeckReshuffled")
    expect(events[1]!.prng).toStrictEqual(after.prng)
    expect(after.discard).toStrictEqual([card("4S")])
    expect(after.deck).toStrictEqual([card("3H")])
    if (after.phase._tag !== "HoldingCard") throw new Error("expected HoldingCard")
    expect(after.phase.card).toBe(card("2D"))
    expect(partition(after)).toStrictEqual(partition(lastCard))
  })

  it("rejects a draw when no card exists anywhere (C6.2)", () => {
    const dry: GameState = { ...base, deck: [], discard: [card("4S")] }
    expect(errorTag(dry, { _tag: "DrawFromDeck", playerId: p0 })).toBe("NoCardToDraw")
  })
})

describe("CloseSlamWindow (C4.6)", () => {
  const window: GameState = {
    ...base,
    phase: { _tag: "SlamWindow", turnPlayerId: p1, closesAt: ts(1_004_000), rank: "4" },
  }

  it("rejects a close while the window is open (ADR-0011)", () => {
    expect(errorTag(window, { _tag: "CloseSlamWindow" }, ts(1_003_999))).toBe("WindowStillOpen")
  })

  it("closes at/after closesAt and advances the turn, wrapping seats (§1.6)", () => {
    const [after, events] = apply(window, { _tag: "CloseSlamWindow" }, ts(1_004_000))
    expect(after.phase).toStrictEqual({ _tag: "AwaitingDraw", playerId: p0 })
    expect(events).toStrictEqual([
      { _tag: "SlamWindowClosed" },
      { _tag: "TurnAdvanced", playerId: p0 },
    ])
  })

  it("advances onto a zero-card seat — zero-card players are not skipped (C4.6, §1.6)", () => {
    const zeroNext: GameState = {
      ...window,
      players: [base.players[0]!, { id: p1, hand: [] }],
      phase: { _tag: "SlamWindow", turnPlayerId: p0, closesAt: ts(1_004_000), rank: "4" },
    }
    const [after, events] = apply(zeroNext, { _tag: "CloseSlamWindow" }, ts(1_004_000))
    expect(after.phase).toStrictEqual({ _tag: "AwaitingDraw", playerId: p1 })
    expect(events[1]).toStrictEqual({ _tag: "TurnAdvanced", playerId: p1 })
  })
})

describe("exhausted-deck turn options (C6.2)", () => {
  it("Cambio and a legal take remain available when no draw is possible", () => {
    const dry: GameState = { ...base, deck: [], discard: [card("4S")] }
    expect(legalCommandKinds(dry, p0, now)).toStrictEqual(["CallCambio", "TakeDiscard"])
  })
})

describe("eager reshuffle re-arms on a discard landing (ADR-0040, C9)", () => {
  // Deck empty, single-card discard: unreshufflable at rest (the resting
  // invariant, ADR-0040). A held card landing on the pile is the re-arm
  // case — it makes the pile reshufflable, and the reshuffle must fire
  // from the landing site, before any slam window opens.
  const rearmBase: GameState = {
    ...base,
    deck: [],
    discard: [card("4S")],
    phase: { _tag: "HoldingCard", playerId: p0, card: card("5D"), source: "deck" },
  }

  it("HeldDiscarded's landing re-arms the reshuffle before the window opens", () => {
    const [after, events] = apply(rearmBase, { _tag: "DiscardHeld", playerId: p0 })
    expect(events.map((e) => e._tag)).toStrictEqual([
      "HeldDiscarded",
      "DeckReshuffled",
      "SlamWindowOpened",
    ])
    expect(after.discard).toStrictEqual([card("5D")])
    expect(after.deck).toStrictEqual([card("4S")])
    if (after.phase._tag !== "SlamWindow") throw new Error("expected SlamWindow")
    expect(after.phase.rank).toBe(rank(card("5D")))
  })

  it("SwapHeld's displaced-card landing re-arms the reshuffle before the window opens", () => {
    const [after, events] = apply(rearmBase, {
      _tag: "SwapHeld",
      playerId: p0,
      slotIndex: slot(0),
    })
    expect(events.map((e) => e._tag)).toStrictEqual([
      "HeldSwapped",
      "DeckReshuffled",
      "SlamWindowOpened",
    ])
    // The displaced card (AS, slot 0's prior occupant) is the retained top.
    expect(after.discard).toStrictEqual([card("AS")])
    expect(after.deck).toStrictEqual([card("4S")])
    if (after.phase._tag !== "SlamWindow") throw new Error("expected SlamWindow")
    expect(after.phase.rank).toBe(rank(card("AS")))
  })

  it("the obligatory-power fizzle's landing re-arms the reshuffle before the window opens", () => {
    // A 7/8 with no hand cards is the only power that can be drawn with a
    // non-empty deck yet fizzle unconditionally (ADR-0010) — give p0 an
    // empty hand so the drawn 7 has no peek target.
    const fizzleBase: GameState = {
      ...base,
      players: [{ id: p0, hand: [] }, base.players[1]!],
      deck: [card("7D")],
      discard: [card("4S")],
      phase: { _tag: "AwaitingDraw", playerId: p0 },
    }
    const [after, events] = apply(fizzleBase, { _tag: "DrawFromDeck", playerId: p0 })
    expect(events.map((e) => e._tag)).toStrictEqual([
      "CardDrawn",
      "PowerFizzled",
      "PowerDiscarded",
      "DeckReshuffled",
      "SlamWindowOpened",
    ])
    expect(after.discard).toStrictEqual([card("7D")])
    expect(after.deck).toStrictEqual([card("4S")])
    if (after.phase._tag !== "SlamWindow") throw new Error("expected SlamWindow")
    expect(after.phase.rank).toBe(rank(card("7D")))
  })
})
