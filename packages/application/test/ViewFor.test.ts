import { describe, expect, it } from "@effect/vitest"
import {
  decodeGameConfig,
  gameScores,
  type GameState,
  type Hand,
  type Phase,
  type UserId,
  winnersOf,
} from "@cambio/domain"
import { card, ts, uid } from "@cambio/domain/testing"
import { Schema } from "effect"
import {
  decodeLobbyViewEither,
  decodePlayerGameViewEither,
  LobbyView,
  PlayerGameView,
} from "@cambio/contracts"
import { Either } from "effect"
import { lobbyView, viewFor } from "../src/projection/ViewFor.js"
import { entitledSlugs, expectNoLeak } from "./support/leaks.js"
import { gid } from "@cambio/domain/testing"
import { type Lobby } from "@cambio/domain"

/**
 * C2 unit suite (ADR-0021): viewFor projects structural truth only. States
 * are hand-built — viewFor is pure and never validates partition invariants,
 * so fixtures optimize for legibility.
 */

const config = decodeGameConfig({ slamWindowMs: 5000 })

const p0 = uid(0)
const p1 = uid(1)
const outsider = uid(9)

const hand = (...slugs: ReadonlyArray<readonly [number, string]>): Hand =>
  slugs.map(([i, s]) => ({ slotIndex: i as Hand[number]["slotIndex"], card: card(s) }))

const makeState = (phase: Phase, overrides?: Partial<GameState>): GameState => ({
  players: [
    { id: p0, hand: hand([0, "AS"], [1, "7H"]) },
    { id: p1, hand: hand([0, "KD"], [2, "3C"]) },
  ],
  deck: [card("4C"), card("5C"), card("6C")],
  discard: [card("5D"), card("9S")],
  prng: [1, 2, 3, 4] as GameState["prng"],
  phase,
  config,
  ...overrides,
})

const encodeView = Schema.encodeSync(PlayerGameView)

/** Every viewFor output must survive the contracts codec round-trip (decision 5). */
const roundTrip = (state: GameState, viewer: UserId) => {
  const view = viewFor(viewer, state)
  const decoded = decodePlayerGameViewEither(encodeView(view))
  expect(Either.isRight(decoded)).toBe(true)
  return view
}

describe("structure (C2.1–C2.3, C2.6)", () => {
  it("hands are occupancy-only for everyone — the viewer's own included", () => {
    const view = roundTrip(makeState({ _tag: "AwaitingDraw", playerId: p0 }), p0)
    expect(view.players).toEqual([
      { id: p0, hand: [0, 1] },
      { id: p1, hand: [0, 2] },
    ])
  })

  it("holes stay holes: occupied indices are reported as-is, ascending", () => {
    const view = viewFor(p1, makeState({ _tag: "AwaitingDraw", playerId: p0 }))
    expect(view.players[1]?.hand).toEqual([0, 2])
  })

  it("the deck is a count; deck order and prng exist in no view", () => {
    const state = makeState({ _tag: "AwaitingDraw", playerId: p0 })
    for (const viewer of [p0, p1]) {
      const view = viewFor(viewer, state)
      expect(view.deckCount).toBe(3)
      expectNoLeak(view, entitledSlugs(state, viewer), `view for ${viewer}`)
    }
  })

  it("the discard pile is included as-is, top first", () => {
    const view = viewFor(p1, makeState({ _tag: "AwaitingDraw", playerId: p0 }))
    expect(view.discard).toEqual(["5D", "9S"])
  })

  it("seat order and the phase are present", () => {
    const view = viewFor(p1, makeState({ _tag: "AwaitingDraw", playerId: p0 }))
    expect(view.players.map((p) => p.id)).toEqual([p0, p1])
    expect(view.phase).toEqual({ _tag: "AwaitingDraw", playerId: p0 })
  })
})

describe("phase projection (C2.4)", () => {
  it("HoldingCard from deck: value for the holder only", () => {
    const state = makeState({ _tag: "HoldingCard", playerId: p0, card: card("QC"), source: "deck" })
    const holder = roundTrip(state, p0)
    expect(holder.phase).toEqual({
      _tag: "HoldingCard",
      playerId: p0,
      source: "deck",
      card: "QC",
    })
    const other = roundTrip(state, p1)
    expect(other.phase).toEqual({ _tag: "HoldingCard", playerId: p0, source: "deck" })
    expect(Object.keys(other.phase)).not.toContain("card")
  })

  it("HoldingCard from discard: value for everyone — it came off the public pile", () => {
    const state = makeState({
      _tag: "HoldingCard",
      playerId: p0,
      card: card("5D"),
      source: "discard",
    })
    for (const viewer of [p0, p1]) {
      const view = viewFor(viewer, state)
      expect(view.phase).toEqual({
        _tag: "HoldingCard",
        playerId: p0,
        source: "discard",
        card: "5D",
      })
    }
  })

  it("ResolvingPower: value for the holder only", () => {
    const state = makeState({ _tag: "ResolvingPower", playerId: p0, card: card("9C") })
    expect(viewFor(p0, state).phase).toEqual({ _tag: "ResolvingPower", playerId: p0, card: "9C" })
    expect(viewFor(p1, state).phase).toEqual({ _tag: "ResolvingPower", playerId: p0 })
  })

  it("ResolvingQueenSwap: value for the holder only", () => {
    const state = makeState({ _tag: "ResolvingQueenSwap", playerId: p1, card: card("QH") })
    expect(viewFor(p1, state).phase).toEqual({
      _tag: "ResolvingQueenSwap",
      playerId: p1,
      card: "QH",
    })
    expect(viewFor(p0, state).phase).toEqual({ _tag: "ResolvingQueenSwap", playerId: p1 })
  })

  it("SlamWindow is fully public", () => {
    const state = makeState({
      _tag: "SlamWindow",
      turnPlayerId: p0,
      closesAt: ts(90_000),
      rank: "9",
    })
    for (const viewer of [p0, p1]) {
      expect(viewFor(viewer, state).phase).toEqual({
        _tag: "SlamWindow",
        turnPlayerId: p0,
        closesAt: 90_000,
        rank: "9",
      })
    }
  })

  it("AwaitingDraw carries no values and no reveal", () => {
    const view = viewFor(p0, makeState({ _tag: "AwaitingDraw", playerId: p1 }))
    expect(view.phase).toEqual({ _tag: "AwaitingDraw", playerId: p1 })
    expect(view.reveal).toBeUndefined()
  })
})

describe("endgame reveal (C2.5)", () => {
  it("Ended: all hands revealed, totals match gameScores, winners match winnersOf", () => {
    const state = makeState({ _tag: "Ended", calledBy: p1 })
    const view = roundTrip(state, p0)
    expect(view.phase).toEqual({ _tag: "Ended", calledBy: p1 })
    expect(view.reveal).toBeDefined()
    expect(view.reveal?.hands).toEqual([
      {
        playerId: p0,
        cards: [
          { slotIndex: 0, card: "AS" },
          { slotIndex: 1, card: "7H" },
        ],
      },
      {
        playerId: p1,
        cards: [
          { slotIndex: 0, card: "KD" },
          { slotIndex: 2, card: "3C" },
        ],
      },
    ])
    const scores = gameScores(state)
    expect(view.reveal?.scores).toEqual(scores.map((s) => ({ playerId: s.playerId, total: s.total })))
    expect(view.reveal?.winners).toEqual(winnersOf(scores))
  })

  it("ties are representable: equal totals produce a plural winner set", () => {
    const state = makeState({ _tag: "Ended", calledBy: p0 }, {
      players: [
        { id: p0, hand: hand([0, "AS"]) },
        { id: p1, hand: hand([0, "AC"]) },
      ],
    })
    const view = viewFor(p1, state)
    expect(view.reveal?.winners).toEqual([p0, p1])
  })

  it("the reveal is identical for every viewer — the endgame is public by rule", () => {
    const state = makeState({ _tag: "Ended", calledBy: p1 })
    expect(viewFor(p0, state)).toEqual(viewFor(p1, state))
  })
})

describe("non-participant viewers", () => {
  it("a non-participant gets the same structural view — access control is the route's job", () => {
    const state = makeState({ _tag: "HoldingCard", playerId: p0, card: card("QC"), source: "deck" })
    const view = viewFor(outsider, state)
    expect(view.phase).toEqual({ _tag: "HoldingCard", playerId: p0, source: "deck" })
    expectNoLeak(view, entitledSlugs(state, outsider), "outsider view")
  })
})

describe("lobbyView (C2.7)", () => {
  it("is fully public and round-trips the contracts codec", () => {
    const lobby: Lobby = { id: gid(1), members: [p0, p1], status: "open" }
    const view = lobbyView(lobby)
    expect(view).toEqual({ id: gid(1), members: [p0, p1], status: "open" })
    const decoded = decodeLobbyViewEither(Schema.encodeSync(LobbyView)(view))
    expect(Either.isRight(decoded)).toBe(true)
  })
})
