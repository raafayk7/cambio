import { describe, expect, it } from "@effect/vitest"
import { Either } from "effect"
import {
  decodeLobbyView,
  decodeLobbyViewEither,
  decodePlayerGameView,
  decodePlayerGameViewEither,
  encodeLobbyView,
  encodePlayerGameView,
} from "../src/GameView.js"

/**
 * CAM-17 schema pins for the frozen view shapes: C1 (`LobbyView.members` as
 * `{id, name}`), C2 (`ViewPlayer.name`), C4 (`config.slamWindowMs` on
 * `PlayerGameView`).
 */

const u0 = "00000000-0000-4000-8000-000000000000"
const u1 = "00000000-0000-4000-8000-000000000001"

const view = {
  players: [
    { id: u0, name: "Alice", hand: [0, 1] },
    { id: u1, name: "Bob", hand: [0, 2] },
  ],
  deckCount: 40,
  discard: ["5D"],
  phase: { _tag: "AwaitingDraw", playerId: u0 },
  config: { slamWindowMs: 5000 },
}

describe("PlayerGameView.config (C4)", () => {
  it("carries the started-with slamWindowMs and round-trips", () => {
    const decoded = decodePlayerGameView(view)
    expect(decoded.config).toEqual({ slamWindowMs: 5000 })
    expect(encodePlayerGameView(decoded)).toEqual(view)
  })

  it("rejects a view without config — the field is required, not optional", () => {
    const { config: _config, ...withoutConfig } = view
    expect(Either.isLeft(decodePlayerGameViewEither(withoutConfig))).toBe(true)
  })
})

describe("ViewPlayer.name (C2)", () => {
  it("every player carries a name and the view round-trips", () => {
    const decoded = decodePlayerGameView(view)
    expect(decoded.players.map((p) => p.name)).toEqual(["Alice", "Bob"])
    expect(encodePlayerGameView(decoded)).toEqual(view)
  })

  it("rejects a player without a name — regression pin for the pre-C2 shape", () => {
    const bare = {
      ...view,
      players: [
        { id: u0, hand: [0, 1] },
        { id: u1, hand: [0, 2] },
      ],
    }
    expect(Either.isLeft(decodePlayerGameViewEither(bare))).toBe(true)
  })
})

describe("LobbyView.members (C1)", () => {
  const g1 = "00000000-0000-4000-9000-000000000001"
  const lobby = {
    id: g1,
    members: [
      { id: u0, name: "Alice" },
      { id: u1, name: "Bob" },
    ],
    status: "open",
  }

  it("members are {id, name} objects and round-trip", () => {
    const decoded = decodeLobbyView(lobby)
    expect(decoded.members).toEqual([
      { id: u0, name: "Alice" },
      { id: u1, name: "Bob" },
    ])
    expect(encodeLobbyView(decoded)).toEqual(lobby)
  })

  it("rejects the pre-C1 bare-uuid member array — regression pin", () => {
    expect(Either.isLeft(decodeLobbyViewEither({ ...lobby, members: [u0, u1] }))).toBe(true)
  })
})
