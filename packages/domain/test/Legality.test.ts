import { describe, expect, it } from "@effect/vitest"
import { Either, Option } from "effect"
import { applyCommand } from "../src/Engine.js"
import { decodeGameConfig } from "../src/GameConfig.js"
import { type GameState } from "../src/GameState.js"
import { checkCommand, drawable, legalCommandKinds, powerHasValidTarget } from "../src/Legality.js"
import { prngStateFromSeed } from "../src/Prng.js"
import { card, slot, ts, uid } from "./fixtures.js"

const p0 = uid(0)
const p1 = uid(1)
const now = ts(1_000_000)

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
  config: decodeGameConfig({ slamWindowMs: 4000 }),
}

const errorTag = (state: GameState, command: Parameters<typeof checkCommand>[1]) => {
  const result = checkCommand(state, command, now)
  return Option.isSome(result) ? result.value._tag : "LEGAL"
}

describe("checkCommand", () => {
  it("rejects a non-active player's turn command (C2.1)", () => {
    expect(errorTag(base, { _tag: "DrawFromDeck", playerId: p1 })).toBe("NotYourTurn")
    expect(errorTag(base, { _tag: "CallCambio", playerId: p1 })).toBe("NotYourTurn")
  })

  it("rejects a command kind foreign to the phase (C4.7)", () => {
    expect(
      errorTag(base, {
        _tag: "Slam",
        playerId: p1,
        target: { playerId: p0, slotIndex: slot(0) },
        giveSlot: null,
      }),
    ).toBe("WrongPhase")
    expect(errorTag(base, { _tag: "CloseSlamWindow" })).toBe("WrongPhase")
    expect(errorTag(base, { _tag: "SwapHeld", playerId: p0, slotIndex: slot(0) })).toBe(
      "WrongPhase",
    )
  })

  it("rejects everything after Ended (C2.2)", () => {
    const ended: GameState = { ...base, phase: { _tag: "Ended", calledBy: p1 } }
    expect(errorTag(ended, { _tag: "DrawFromDeck", playerId: p0 })).toBe("GameAlreadyEnded")
    expect(errorTag(ended, { _tag: "CloseSlamWindow" })).toBe("GameAlreadyEnded")
  })

  it("rejects an unknown player outright", () => {
    expect(errorTag(base, { _tag: "DrawFromDeck", playerId: uid(9) })).toBe("UnknownPlayer")
  })

  it("rejects taking a power top discard (§1.3b)", () => {
    const powerTop: GameState = { ...base, discard: [card("JD")] }
    expect(errorTag(powerTop, { _tag: "TakeDiscard", playerId: p0 })).toBe(
      "PowerDiscardNotTakeable",
    )
    expect(errorTag(base, { _tag: "TakeDiscard", playerId: p0 })).toBe("LEGAL")
  })

  it("rejects swap ends that are not occupied slots (ADR-0010)", () => {
    const resolvingJack: GameState = {
      ...base,
      phase: { _tag: "ResolvingPower", playerId: p0, card: card("JS") },
    }
    expect(
      errorTag(resolvingJack, {
        _tag: "PowerSwap",
        playerId: p0,
        first: { playerId: p0, slotIndex: slot(0) },
        second: { playerId: p1, slotIndex: slot(3) },
      }),
    ).toBe("EmptySlotTarget")
    expect(
      errorTag(resolvingJack, {
        _tag: "PowerSwap",
        playerId: p0,
        first: { playerId: p0, slotIndex: slot(0) },
        second: { playerId: p1, slotIndex: slot(0) },
      }),
    ).toBe("LEGAL")
  })
})

describe("legalCommandKinds", () => {
  it("gives the active player exactly the three turn actions (C2.1)", () => {
    expect(legalCommandKinds(base, p0, now)).toStrictEqual([
      "CallCambio",
      "TakeDiscard",
      "DrawFromDeck",
    ])
  })

  it("drops TakeDiscard when the top is a power card", () => {
    const powerTop: GameState = { ...base, discard: [card("TD")] }
    expect(legalCommandKinds(powerTop, p0, now)).toStrictEqual(["CallCambio", "DrawFromDeck"])
  })

  it("gives everyone else nothing during AwaitingDraw", () => {
    expect(legalCommandKinds(base, p1, now)).toStrictEqual([])
  })

  it("gives nobody anything after Ended", () => {
    const ended: GameState = { ...base, phase: { _tag: "Ended", calledBy: p0 } }
    expect(legalCommandKinds(ended, p0, now)).toStrictEqual([])
    expect(legalCommandKinds(ended, p1, now)).toStrictEqual([])
  })
})

describe("powerHasValidTarget (ADR-0010)", () => {
  const emptyHands: GameState = {
    ...base,
    players: [
      { id: p0, hand: [] },
      { id: p1, hand: [] },
    ],
  }

  it("7/8 need the drawer's own hand non-empty", () => {
    expect(powerHasValidTarget("7", base, p0)).toBe(true)
    expect(powerHasValidTarget("8", emptyHands, p0)).toBe(false)
  })

  it("9/10 need some opponent non-empty", () => {
    expect(powerHasValidTarget("9", base, p0)).toBe(true)
    const loneOpponentEmpty: GameState = {
      ...base,
      players: [base.players[0]!, { id: p1, hand: [] }],
    }
    expect(powerHasValidTarget("T", loneOpponentEmpty, p0)).toBe(false)
  })

  it("J/Q need at least two occupied slots in the whole game", () => {
    expect(powerHasValidTarget("J", base, p0)).toBe(true)
    const oneSlot: GameState = {
      ...base,
      players: [
        { id: p0, hand: [{ slotIndex: slot(0), card: card("AS") }] },
        { id: p1, hand: [] },
      ],
    }
    expect(powerHasValidTarget("Q", oneSlot, p0)).toBe(false)
    expect(powerHasValidTarget("J", oneSlot, p0)).toBe(false)
  })
})

describe("drawable (§1.7, CAM-10 — DrawFromDeck legality; ADR-0040 note below)", () => {
  // Under ADR-0040's resting invariant (deck empty ⟹ discard ≤ 1), a
  // deck-empty-with-reshufflable-discard state is unreachable at rest.
  // `drawable` keeps its `deck > 0 || discard > 1` disjunction anyway
  // (root plan Decision Log): it is the legality answer to "can a draw
  // succeed", including for hand-built states, and it is deliberately
  // NOT the eager-reshuffle trigger — Engine.ts's `eagerReshuffle` guards
  // with its own inline predicate ("deck empty AND discard reshufflable").
  // Do not collapse either predicate into the other: "simplifying"
  // `drawable` to `deck > 0` reads as safe from the invariant but the two
  // predicates answer different questions (see the Engine.ts docstring).
  it("is true when the deck has a card, regardless of discard length", () => {
    expect(drawable({ ...base, deck: [card("2S")], discard: [] })).toBe(true)
    expect(drawable({ ...base, deck: [card("2S")], discard: [card("4S")] })).toBe(true)
  })

  it("is true when the deck is empty but the discard has more than its top card (unreachable at rest, ADR-0040)", () => {
    expect(drawable({ ...base, deck: [], discard: [card("4S"), card("5S")] })).toBe(true)
  })

  it("is false when the deck is empty and the discard has at most its top card", () => {
    expect(drawable({ ...base, deck: [], discard: [card("4S")] })).toBe(false)
    expect(drawable({ ...base, deck: [], discard: [] })).toBe(false)
  })
})

describe("applyCommand routing (C7.3)", () => {
  it("returns the checkCommand error and leaves state untouched", () => {
    const before = structuredClone(base)
    const command = { _tag: "DrawFromDeck", playerId: p1 } as const
    const result = applyCommand(base, command, now)
    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) {
      expect(result.left._tag).toBe("NotYourTurn")
    }
    expect(base).toStrictEqual(before)
    const again = checkCommand(base, command, now)
    expect(Option.isSome(again)).toBe(true)
  })

  it("legal commands also leave the input state untouched (C7.3)", () => {
    const before = structuredClone(base)
    const result = applyCommand(base, { _tag: "DrawFromDeck", playerId: p0 }, now)
    expect(Either.isRight(result)).toBe(true)
    expect(base).toStrictEqual(before)
  })
})
