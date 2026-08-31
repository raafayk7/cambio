import { describe, expect, it } from "@effect/vitest"
import { Either } from "effect"
import { ALL_CARD_SLUGS } from "../../src/Card.js"
import { dealGame } from "../../src/Deal.js"
import { decodeGameConfig } from "../../src/GameConfig.js"
import { type GameEvent } from "../../src/GameEvent.js"
import { allCards, type GameState } from "../../src/GameState.js"
import { prngStateFromSeed } from "../../src/Prng.js"
import { card, slot, ts, uid } from "../fixtures.js"
import {
  cardPartitionViolations,
  endViolations,
  handIntegrityViolations,
  stepViolations,
} from "./invariants.js"

const config = decodeGameConfig({ slamWindowMs: 4000 })
const players3 = [uid(0), uid(1), uid(2)]
const FULL_DECK_SORTED = [...ALL_CARD_SLUGS].sort()

const healthy = (): GameState => Either.getOrThrow(dealGame(players3, 7, config, ts(0)))[0]

describe("card partition checker (C2.1, §4.5)", () => {
  it("accepts a freshly dealt state against the full deck", () => {
    const state = healthy()
    expect([...allCards(state)].sort()).toStrictEqual(FULL_DECK_SORTED)
    expect(cardPartitionViolations(state, FULL_DECK_SORTED)).toStrictEqual([])
  })

  it("rejects a duplicated card", () => {
    const state = healthy()
    const corrupt: GameState = { ...state, deck: [state.deck[0]!, ...state.deck] }
    expect(cardPartitionViolations(corrupt, FULL_DECK_SORTED)).not.toStrictEqual([])
  })

  it("rejects a dropped card", () => {
    const state = healthy()
    const corrupt: GameState = {
      ...state,
      players: state.players.map((p, seat) => (seat === 0 ? { ...p, hand: p.hand.slice(1) } : p)),
    }
    expect(cardPartitionViolations(corrupt, FULL_DECK_SORTED)).not.toStrictEqual([])
  })

  it("rejects a swap-for-duplicate that preserves the count (multiset check)", () => {
    const state = healthy()
    const corrupt: GameState = {
      ...state,
      deck: [state.deck[1]!, ...state.deck.slice(1)],
    }
    expect(cardPartitionViolations(corrupt, FULL_DECK_SORTED)).not.toStrictEqual([])
  })
})

describe("hand & seat integrity checker (C2.2, §4.5 restated)", () => {
  it("accepts a freshly dealt state", () => {
    expect(handIntegrityViolations(healthy(), players3)).toStrictEqual([])
  })

  it("rejects a duplicated slot index within a hand", () => {
    const state = healthy()
    const corrupt: GameState = {
      ...state,
      players: state.players.map((p, seat) =>
        seat === 0
          ? { ...p, hand: p.hand.map((s, i) => (i === 1 ? { ...s, slotIndex: slot(0) } : s)) }
          : p,
      ),
    }
    expect(handIntegrityViolations(corrupt, players3)).not.toStrictEqual([])
  })

  it("rejects unsorted slot indices", () => {
    const state = healthy()
    const corrupt: GameState = {
      ...state,
      players: state.players.map((p, seat) =>
        seat === 0 ? { ...p, hand: [...p.hand].reverse() } : p,
      ),
    }
    expect(handIntegrityViolations(corrupt, players3)).not.toStrictEqual([])
  })

  it("rejects roster drift: reordered, renamed, or extra players", () => {
    const state = healthy()
    const reordered: GameState = { ...state, players: [...state.players].reverse() }
    expect(handIntegrityViolations(reordered, players3)).not.toStrictEqual([])
    const renamed: GameState = {
      ...state,
      players: state.players.map((p, seat) => (seat === 2 ? { ...p, id: uid(9) } : p)),
    }
    expect(handIntegrityViolations(renamed, players3)).not.toStrictEqual([])
    const extra: GameState = {
      ...state,
      players: [...state.players, { id: uid(3), hand: [] }],
    }
    expect(handIntegrityViolations(extra, players3)).not.toStrictEqual([])
  })

  it("rejects rosters outside 2–5 players (§1.1)", () => {
    const state = healthy()
    const one = { ...state, players: state.players.slice(0, 1) }
    expect(handIntegrityViolations(one, players3.slice(0, 1))).not.toStrictEqual([])
  })

  it("stepViolations combines both checkers", () => {
    const state = healthy()
    expect(stepViolations(state, players3, FULL_DECK_SORTED)).toStrictEqual([])
    const corrupt: GameState = { ...state, deck: [state.deck[0]!, ...state.deck] }
    expect(stepViolations(corrupt, players3, FULL_DECK_SORTED)).not.toStrictEqual([])
  })
})

describe("end-state checker (C2.3, C2.4, §1.8)", () => {
  const roster = [uid(0), uid(1)]
  // 2S scores 2; KH scores −2 — negative totals representable, red king wins.
  const finalState: GameState = {
    players: [
      { id: uid(0), hand: [{ slotIndex: slot(0), card: card("2S") }] },
      { id: uid(1), hand: [{ slotIndex: slot(1), card: card("KH") }] },
    ],
    deck: [],
    discard: [card("4S")],
    prng: prngStateFromSeed(1),
    phase: { _tag: "Ended", calledBy: uid(1) },
    config,
  }
  const goodEnd: GameEvent = {
    _tag: "GameEnded",
    calledBy: uid(1),
    scores: [
      { playerId: uid(0), total: 2 },
      { playerId: uid(1), total: -2 },
    ],
    winners: [uid(1)],
  }
  const events: ReadonlyArray<GameEvent> = [{ _tag: "CambioCalled", playerId: uid(1) }, goodEnd]

  it("accepts a consistent ended run", () => {
    expect(endViolations(finalState, events, roster)).toStrictEqual([])
  })

  it("rejects Ended phase without a GameEnded event, and vice versa", () => {
    expect(endViolations(finalState, [events[0]!], roster)).not.toStrictEqual([])
    const notEnded: GameState = {
      ...finalState,
      phase: { _tag: "AwaitingDraw", playerId: uid(0) },
    }
    expect(endViolations(notEnded, events, roster)).not.toStrictEqual([])
  })

  it("rejects GameEnded that is not the final event, or emitted twice", () => {
    const trailing: ReadonlyArray<GameEvent> = [
      ...events,
      { _tag: "TurnAdvanced", playerId: uid(0) },
    ]
    expect(endViolations(finalState, trailing, roster)).not.toStrictEqual([])
    const doubled: ReadonlyArray<GameEvent> = [...events, goodEnd]
    expect(endViolations(finalState, doubled, roster)).not.toStrictEqual([])
  })

  it("rejects doctored scores (independent recomputation, C2.4)", () => {
    const doctored: ReadonlyArray<GameEvent> = [
      events[0]!,
      {
        ...goodEnd,
        scores: [
          { playerId: uid(0), total: 1 },
          { playerId: uid(1), total: -2 },
        ],
      },
    ]
    expect(endViolations(finalState, doctored, roster)).not.toStrictEqual([])
  })

  it("rejects doctored winners (not the min-score set)", () => {
    const doctored: ReadonlyArray<GameEvent> = [events[0]!, { ...goodEnd, winners: [uid(0)] }]
    expect(endViolations(finalState, doctored, roster)).not.toStrictEqual([])
  })

  it("scores a zero-card hand as 0 and keeps ties plural (§1.6, §1.8)", () => {
    const tied: GameState = {
      ...finalState,
      players: [
        { id: uid(0), hand: [] },
        { id: uid(1), hand: [{ slotIndex: slot(0), card: card("AS") }] },
      ],
    }
    const tiedEnd: GameEvent = {
      _tag: "GameEnded",
      calledBy: uid(1),
      scores: [
        { playerId: uid(0), total: 0 },
        { playerId: uid(1), total: 0 },
      ],
      winners: [uid(0), uid(1)],
    }
    expect(endViolations(tied, [tiedEnd], roster)).toStrictEqual([])
  })
})
