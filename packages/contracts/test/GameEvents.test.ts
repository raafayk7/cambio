import { describe, expect, it } from "@effect/vitest"
import { Either } from "effect"
import {
  decodeLobbyUpdated,
  decodeLobbyUpdatedEither,
  encodeLobbyUpdated,
  LobbyUpdated,
} from "../src/GameEvents.js"

/**
 * C3 (CAM-17): the pre-game lobby broadcast is a TAGGED contract like every
 * other broadcast event — `_tag: "LobbyUpdated"` plus the room's version so
 * the client can discard broadcasts older than its last-seen state.
 */

const u0 = "00000000-0000-4000-8000-000000000000"
const u1 = "00000000-0000-4000-8000-000000000001"
const g1 = "00000000-0000-4000-9000-000000000001"

const wire = {
  _tag: "LobbyUpdated",
  lobby: {
    id: g1,
    members: [
      { id: u0, name: "Alice" },
      { id: u1, name: "Bob" },
    ],
    status: "open" as const,
  },
  version: 3,
}

describe("LobbyUpdated (C3)", () => {
  it("round-trips through decode/encode", () => {
    const decoded = decodeLobbyUpdated(wire)
    expect(encodeLobbyUpdated(decoded)).toEqual(wire)
  })

  it("the _tag literal is fixed to LobbyUpdated", () => {
    expect(LobbyUpdated.make({ lobby: wire.lobby, version: 3 })._tag).toBe("LobbyUpdated")
    const wrongTag = decodeLobbyUpdatedEither({ ...wire, _tag: "LobbyChanged" })
    expect(Either.isLeft(wrongTag)).toBe(true)
  })

  it("rejects the pre-C3 bare-LobbyView payload (no _tag, no version) — regression pin", () => {
    const bare = decodeLobbyUpdatedEither(wire.lobby)
    expect(Either.isLeft(bare)).toBe(true)
  })

  it("rejects a payload missing the version", () => {
    const { version: _version, ...withoutVersion } = wire
    expect(Either.isLeft(decodeLobbyUpdatedEither(withoutVersion))).toBe(true)
  })
})
