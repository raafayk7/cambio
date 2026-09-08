import { describe, expect, it } from "@effect/vitest"
import { Either } from "effect"
import { applyCommand } from "../src/Engine.js"
import { decodeGameConfig } from "../src/GameConfig.js"
import { allCards, type GameState } from "../src/GameState.js"
import { prngStateFromSeed } from "../src/Prng.js"
import { card, slot, ts, uid } from "./fixtures.js"

const p0 = uid(0)
const p1 = uid(1)
const inWindow = ts(1_001_000)
const closesAt = ts(1_004_000)

const base: GameState = {
  players: [
    {
      id: p0,
      hand: [
        { slotIndex: slot(0), card: card("AS") },
        { slotIndex: slot(1), card: card("5D") },
        { slotIndex: slot(2), card: card("4H") },
      ],
    },
    {
      id: p1,
      hand: [
        { slotIndex: slot(0), card: card("9C") },
        { slotIndex: slot(1), card: card("4C") },
      ],
    },
  ],
  deck: [card("2S"), card("3S")],
  discard: [card("4S")],
  prng: prngStateFromSeed(1),
  phase: { _tag: "SlamWindow", turnPlayerId: p0, closesAt, rank: "4" },
  config: decodeGameConfig({ slamWindowMs: 4000 }),
}

const apply = (state: GameState, command: Parameters<typeof applyCommand>[1], at = inWindow) => {
  const result = applyCommand(state, command, at)
  if (Either.isLeft(result)) throw new Error(`illegal: ${result.left._tag}`)
  return result.right
}

const errorTag = (state: GameState, command: Parameters<typeof applyCommand>[1], at = inWindow) => {
  const result = applyCommand(state, command, at)
  return Either.isLeft(result) ? result.left._tag : "LEGAL"
}

describe("slam outcomes (C4.3, C4.4)", () => {
  it("own card, correct: card to the pile, slot becomes a hole, indices unmoved", () => {
    const [after, events] = apply(base, {
      _tag: "Slam",
      playerId: p0,
      target: { playerId: p0, slotIndex: slot(2) },
      giveSlot: null,
    })
    expect(events).toStrictEqual([
      {
        _tag: "SlamSucceeded",
        slammerId: p0,
        target: { playerId: p0, slotIndex: slot(2) },
        card: card("4H"),
      },
    ])
    expect(after.players[0]!.hand.map((s) => s.slotIndex)).toStrictEqual([0, 1])
    expect(after.discard).toStrictEqual([card("4H"), card("4S")])
    expect(after.phase).toStrictEqual(base.phase)
  })

  it("slamming out a middle slot leaves a hole — other indices do not shift (C4.3, §4.3)", () => {
    const middleMatch: GameState = {
      ...base,
      players: [
        {
          id: p0,
          hand: [
            { slotIndex: slot(0), card: card("AS") },
            { slotIndex: slot(1), card: card("4H") },
            { slotIndex: slot(2), card: card("5D") },
          ],
        },
        base.players[1]!,
      ],
    }
    const [after] = apply(middleMatch, {
      _tag: "Slam",
      playerId: p0,
      target: { playerId: p0, slotIndex: slot(1) },
      giveSlot: null,
    })
    expect(after.players[0]!.hand).toStrictEqual([
      { slotIndex: slot(0), card: card("AS") },
      { slotIndex: slot(2), card: card("5D") },
    ])
  })

  it("own card, incorrect: card stays, penalty into the lowest free slot", () => {
    const [after, events] = apply(base, {
      _tag: "Slam",
      playerId: p0,
      target: { playerId: p0, slotIndex: slot(0) },
      giveSlot: null,
    })
    expect(events).toStrictEqual([
      {
        _tag: "SlamFailed",
        slammerId: p0,
        target: { playerId: p0, slotIndex: slot(0) },
        card: card("AS"),
      },
      { _tag: "PenaltyDrawn", playerId: p0, slotIndex: slot(3), card: card("2S") },
    ])
    expect(after.players[0]!.hand).toHaveLength(4)
    expect(after.deck).toStrictEqual([card("3S")])
    expect(after.discard).toStrictEqual([card("4S")])
  })

  it("opponent's card, correct: slammer's named give card fills the vacated slot", () => {
    const [after, events] = apply(base, {
      _tag: "Slam",
      playerId: p1,
      target: { playerId: p0, slotIndex: slot(2) },
      giveSlot: slot(1),
    })
    expect(events).toStrictEqual([
      {
        _tag: "SlamSucceeded",
        slammerId: p1,
        target: { playerId: p0, slotIndex: slot(2) },
        card: card("4H"),
      },
      {
        _tag: "CardGivenFromHand",
        slammerId: p1,
        fromSlot: slot(1),
        to: { playerId: p0, slotIndex: slot(2) },
      },
    ])
    expect(after.players[0]!.hand).toStrictEqual([
      { slotIndex: slot(0), card: card("AS") },
      { slotIndex: slot(1), card: card("5D") },
      { slotIndex: slot(2), card: card("4C") },
    ])
    expect(after.players[1]!.hand).toStrictEqual([{ slotIndex: slot(0), card: card("9C") }])
    expect([...allCards(after)].sort()).toStrictEqual([...allCards(base)].sort())
  })

  it("opponent's card, incorrect: card stays with its owner, slammer draws a penalty", () => {
    const [after, events] = apply(base, {
      _tag: "Slam",
      playerId: p1,
      target: { playerId: p0, slotIndex: slot(1) },
      giveSlot: slot(1),
    })
    expect(events[0]!._tag).toBe("SlamFailed")
    expect(events[1]).toStrictEqual({
      _tag: "PenaltyDrawn",
      playerId: p1,
      slotIndex: slot(2),
      card: card("2S"),
    })
    expect(after.players[0]!.hand).toStrictEqual(base.players[0]!.hand)
    expect(after.players[1]!.hand).toHaveLength(3)
  })
})

describe("rank-only matching (C4.2)", () => {
  it("J does not match Q despite equal score", () => {
    const jackWindow: GameState = {
      ...base,
      discard: [card("JD")],
      phase: { _tag: "SlamWindow", turnPlayerId: p0, closesAt, rank: "J" },
      players: [{ id: p0, hand: [{ slotIndex: slot(0), card: card("QC") }] }, base.players[1]!],
    }
    const [, events] = apply(jackWindow, {
      _tag: "Slam",
      playerId: p0,
      target: { playerId: p0, slotIndex: slot(0) },
      giveSlot: null,
    })
    expect(events[0]!._tag).toBe("SlamFailed")
  })

  it("a power card on the pile is inert but slammable against (C3.6)", () => {
    const jackTop: GameState = {
      ...base,
      discard: [card("JD")],
      phase: { _tag: "SlamWindow", turnPlayerId: p0, closesAt, rank: "J" },
      players: [{ id: p0, hand: [{ slotIndex: slot(0), card: card("JC") }] }, base.players[1]!],
    }
    const [, events] = apply(jackTop, {
      _tag: "Slam",
      playerId: p0,
      target: { playerId: p0, slotIndex: slot(0) },
      giveSlot: null,
    })
    expect(events[0]!._tag).toBe("SlamSucceeded")
  })

  it("a black king matches a red king despite different scores", () => {
    const kingWindow: GameState = {
      ...base,
      discard: [card("KS")],
      phase: { _tag: "SlamWindow", turnPlayerId: p0, closesAt, rank: "K" },
      players: [{ id: p0, hand: [{ slotIndex: slot(0), card: card("KH") }] }, base.players[1]!],
    }
    const [, events] = apply(kingWindow, {
      _tag: "Slam",
      playerId: p0,
      target: { playerId: p0, slotIndex: slot(0) },
      giveSlot: null,
    })
    expect(events[0]!._tag).toBe("SlamSucceeded")
  })
})

describe("give-slot validation (Decision Log: upfront give)", () => {
  it("opponent slam with a hand requires a real, occupied give slot", () => {
    const slam = (giveSlot: ReturnType<typeof slot> | null) =>
      errorTag(base, {
        _tag: "Slam",
        playerId: p1,
        target: { playerId: p0, slotIndex: slot(2) },
        giveSlot,
      })
    expect(slam(null)).toBe("InvalidGiveSlot")
    expect(slam(slot(3))).toBe("InvalidGiveSlot")
    expect(slam(slot(1))).toBe("LEGAL")
  })

  it("own-card slams must not carry a give slot", () => {
    expect(
      errorTag(base, {
        _tag: "Slam",
        playerId: p0,
        target: { playerId: p0, slotIndex: slot(2) },
        giveSlot: slot(0),
      }),
    ).toBe("InvalidGiveSlot")
  })
})

describe("zero-card slammer — draw-then-give (ADR-0009)", () => {
  it("draws the deck top and gives it unseen into the vacated slot", () => {
    const zeroSlammer: GameState = {
      ...base,
      players: [base.players[0]!, { id: p1, hand: [] }],
    }
    const [after, events] = apply(zeroSlammer, {
      _tag: "Slam",
      playerId: p1,
      target: { playerId: p0, slotIndex: slot(2) },
      giveSlot: null,
    })
    expect(events).toStrictEqual([
      {
        _tag: "SlamSucceeded",
        slammerId: p1,
        target: { playerId: p0, slotIndex: slot(2) },
        card: card("4H"),
      },
      {
        _tag: "CardGivenFromDeck",
        slammerId: p1,
        to: { playerId: p0, slotIndex: slot(2) },
        card: card("2S"),
      },
    ])
    expect(after.players[0]!.hand.find((s) => s.slotIndex === slot(2))!.card).toBe(card("2S"))
    expect(after.players[1]!.hand).toStrictEqual([])
    expect(after.deck).toStrictEqual([card("3S")])
  })

  it("a give-draw that itself takes the last deck card reshuffles after the give (ADR-0040)", () => {
    // The slam's own landing doesn't reshuffle here (deck still has the one
    // card the give-draw is about to take); the give-draw empties it, and
    // only then is the (now 2-card) pile reshufflable.
    const zeroSlammerLastCard: GameState = {
      ...base,
      deck: [card("2S")],
      players: [base.players[0]!, { id: p1, hand: [] }],
    }
    const [after, events] = apply(zeroSlammerLastCard, {
      _tag: "Slam",
      playerId: p1,
      target: { playerId: p0, slotIndex: slot(2) },
      giveSlot: null,
    })
    expect(events).toStrictEqual([
      {
        _tag: "SlamSucceeded",
        slammerId: p1,
        target: { playerId: p0, slotIndex: slot(2) },
        card: card("4H"),
      },
      {
        _tag: "CardGivenFromDeck",
        slammerId: p1,
        to: { playerId: p0, slotIndex: slot(2) },
        card: card("2S"),
      },
      { _tag: "DeckReshuffled", deck: after.deck, prng: after.prng },
    ])
    expect(after.discard).toStrictEqual([card("4H")])
    expect(after.deck).toStrictEqual([card("4S")])
  })
})

describe("exhaustion during slams (C4.5, ADR-0011)", () => {
  it("a penalty draw that takes the last deck card reshuffles the pile after (minus top) (ADR-0040)", () => {
    // One-card deck: the penalty draw itself empties it. Reshuffling
    // beforehand (the old lazy timing) would pin an unreachable state under
    // the resting invariant (deck empty ⟹ discard ≤ 1) — see Legality.test.ts.
    const lastCard: GameState = { ...base, deck: [card("2D")], discard: [card("4S"), card("3H")] }
    const [after, events] = apply(lastCard, {
      _tag: "Slam",
      playerId: p0,
      target: { playerId: p0, slotIndex: slot(0) },
      giveSlot: null,
    })
    expect(events).toStrictEqual([
      {
        _tag: "SlamFailed",
        slammerId: p0,
        target: { playerId: p0, slotIndex: slot(0) },
        card: card("AS"),
      },
      { _tag: "PenaltyDrawn", playerId: p0, slotIndex: slot(3), card: card("2D") },
      { _tag: "DeckReshuffled", deck: after.deck, prng: after.prng },
    ])
    expect(after.discard).toStrictEqual([card("4S")])
    expect(after.deck).toStrictEqual([card("3H")])
  })

  it("skips the penalty when no card exists anywhere (dedicated ADR-0011 test)", () => {
    const dry: GameState = { ...base, deck: [], discard: [card("4S")] }
    const [after, events] = apply(dry, {
      _tag: "Slam",
      playerId: p0,
      target: { playerId: p0, slotIndex: slot(0) },
      giveSlot: null,
    })
    expect(events).toStrictEqual([
      {
        _tag: "SlamFailed",
        slammerId: p0,
        target: { playerId: p0, slotIndex: slot(0) },
        card: card("AS"),
      },
      { _tag: "DrawSkipped", playerId: p0, kind: "penalty" },
    ])
    expect(after.players[0]!.hand).toHaveLength(3)
  })

  it("a zero-card give is satisfied by reshuffling the old top under the slammed card", () => {
    const dryGive: GameState = {
      ...base,
      deck: [],
      discard: [card("4S")],
      players: [base.players[0]!, { id: p1, hand: [] }],
    }
    const [after, events] = apply(dryGive, {
      _tag: "Slam",
      playerId: p1,
      target: { playerId: p0, slotIndex: slot(2) },
      giveSlot: null,
    })
    expect(events.map((e) => e._tag)).toStrictEqual([
      "SlamSucceeded",
      "DeckReshuffled",
      "CardGivenFromDeck",
    ])
    expect(after.discard).toStrictEqual([card("4H")])
    expect(after.players[0]!.hand.find((s) => s.slotIndex === slot(2))!.card).toBe(card("4S"))
  })
})

describe("eager reshuffle re-arms on a slam landing (ADR-0040, C9)", () => {
  // Deck empty, single-card discard: unreshufflable at rest. The slam's
  // landing card is the re-arm — own-slam and give-from-hand never open a
  // window (slams don't), so the reshuffle must be composed at these
  // returns directly, not via openWindowOrAdvance.
  const rearmBase: GameState = { ...base, deck: [], discard: [card("4S")] }

  it("own-slam re-arms the reshuffle — no window follows", () => {
    const [after, events] = apply(rearmBase, {
      _tag: "Slam",
      playerId: p0,
      target: { playerId: p0, slotIndex: slot(2) },
      giveSlot: null,
    })
    expect(events).toStrictEqual([
      {
        _tag: "SlamSucceeded",
        slammerId: p0,
        target: { playerId: p0, slotIndex: slot(2) },
        card: card("4H"),
      },
      { _tag: "DeckReshuffled", deck: after.deck, prng: after.prng },
    ])
    expect(after.discard).toStrictEqual([card("4H")])
    expect(after.deck).toStrictEqual([card("4S")])
    expect(after.phase).toStrictEqual(rearmBase.phase)
  })

  it("give-from-hand re-arms the reshuffle before the give event — no window follows", () => {
    const [after, events] = apply(rearmBase, {
      _tag: "Slam",
      playerId: p1,
      target: { playerId: p0, slotIndex: slot(2) },
      giveSlot: slot(1),
    })
    expect(events).toStrictEqual([
      {
        _tag: "SlamSucceeded",
        slammerId: p1,
        target: { playerId: p0, slotIndex: slot(2) },
        card: card("4H"),
      },
      { _tag: "DeckReshuffled", deck: after.deck, prng: after.prng },
      {
        _tag: "CardGivenFromHand",
        slammerId: p1,
        fromSlot: slot(1),
        to: { playerId: p0, slotIndex: slot(2) },
      },
    ])
    expect(after.discard).toStrictEqual([card("4H")])
    expect(after.deck).toStrictEqual([card("4S")])
    expect(after.players[0]!.hand.find((s) => s.slotIndex === slot(2))!.card).toBe(card("4C"))
  })
})

describe("slam window recovery (S7, CAM-26)", () => {
  it("false opponent slam, then CloseSlamWindow: window closes and the next player can draw", () => {
    const [afterSlam] = apply(base, {
      _tag: "Slam",
      playerId: p1,
      target: { playerId: p0, slotIndex: slot(1) },
      giveSlot: slot(1),
    })
    // window discipline: a failed slam never moves closesAt or the phase
    expect(afterSlam.phase).toStrictEqual(base.phase)

    const [afterClose, closeEvents] = apply(afterSlam, { _tag: "CloseSlamWindow" }, closesAt)
    expect(closeEvents.map((e) => e._tag)).toStrictEqual(["SlamWindowClosed", "TurnAdvanced"])
    expect(afterClose.phase).toStrictEqual({ _tag: "AwaitingDraw", playerId: p1 })

    expect(errorTag(afterClose, { _tag: "DrawFromDeck", playerId: p1 }, closesAt)).toBe("LEGAL")
    const [afterDraw, drawEvents] = apply(
      afterClose,
      { _tag: "DrawFromDeck", playerId: p1 },
      closesAt,
    )
    // the earlier penalty draw already consumed 2S, so this draws 3S — a
    // non-power rank, landing in HoldingCard rather than ResolvingPower
    expect(drawEvents.map((e) => e._tag)).toStrictEqual(["CardDrawn"])
    expect(afterDraw.phase).toStrictEqual({
      _tag: "HoldingCard",
      playerId: p1,
      card: card("3S"),
      source: "deck",
    })
  })
})

describe("window discipline (C4.2, C4.6–7, ADR-0011)", () => {
  it("anyone may slam, several times, and closesAt never moves", () => {
    const [afterFirst] = apply(base, {
      _tag: "Slam",
      playerId: p0,
      target: { playerId: p0, slotIndex: slot(2) },
      giveSlot: null,
    })
    expect(afterFirst.phase).toStrictEqual(base.phase)
    const [afterSecond] = apply(afterFirst, {
      _tag: "Slam",
      playerId: p1,
      target: { playerId: p1, slotIndex: slot(1) },
      giveSlot: null,
    })
    expect(afterSecond.phase).toStrictEqual(base.phase)
    expect(afterSecond.discard[0]).toBe(card("4C"))
  })

  it("rejects slams at or after closesAt (§6)", () => {
    expect(
      errorTag(
        base,
        {
          _tag: "Slam",
          playerId: p0,
          target: { playerId: p0, slotIndex: slot(2) },
          giveSlot: null,
        },
        closesAt,
      ),
    ).toBe("SlamTooLate")
  })

  it("rejects slamming a hole", () => {
    expect(
      errorTag(base, {
        _tag: "Slam",
        playerId: p0,
        target: { playerId: p1, slotIndex: slot(4) },
        giveSlot: null,
      }),
    ).toBe("EmptySlotTarget")
  })
})
