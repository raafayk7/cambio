import { describe, expect, it } from "@effect/vitest"
import { gid, uid } from "@cambio/domain/testing"

import { grantsFor, playerTopic, roomTopic } from "../src/infra/topics.js"

/**
 * ADR-0023's unit half (root C4.4): topics are deterministic (restart-stable
 * without persistence), distinct across games/players, and underivable
 * without the server secret.
 */

const SECRET = "test-topic-secret"

describe("topic derivation", () => {
  it("is deterministic: same inputs, same topics — restart stability", () => {
    expect(roomTopic(SECRET, gid(1))).toBe(roomTopic(SECRET, gid(1)))
    expect(playerTopic(SECRET, gid(1), uid(0))).toBe(playerTopic(SECRET, gid(1), uid(0)))
  })

  it("differs by game, by player, and by secret", () => {
    expect(roomTopic(SECRET, gid(1))).not.toBe(roomTopic(SECRET, gid(2)))
    expect(playerTopic(SECRET, gid(1), uid(0))).not.toBe(playerTopic(SECRET, gid(1), uid(1)))
    expect(roomTopic("other-secret", gid(1))).not.toBe(roomTopic(SECRET, gid(1)))
    expect(playerTopic("other-secret", gid(1), uid(0))).not.toBe(
      playerTopic(SECRET, gid(1), uid(0)),
    )
  })

  it("follows the ADR-0023 shapes with a non-trivial capability token", () => {
    const room = roomTopic(SECRET, gid(1))
    expect(room.startsWith(`game:${gid(1)}:`)).toBe(true)
    const roomToken = room.split(":").at(-1) ?? ""
    expect(roomToken.length).toBeGreaterThanOrEqual(20)

    const player = playerTopic(SECRET, gid(1), uid(0))
    expect(player.startsWith(`game:${gid(1)}:player:${uid(0)}:`)).toBe(true)
    const playerToken = player.split(":").at(-1) ?? ""
    expect(playerToken.length).toBeGreaterThanOrEqual(20)
    expect(playerToken).not.toBe(roomToken)
  })

  it("grantsFor bundles exactly the caller's two topics", () => {
    expect(grantsFor(SECRET, gid(1), uid(0))).toEqual({
      roomTopic: roomTopic(SECRET, gid(1)),
      playerTopic: playerTopic(SECRET, gid(1), uid(0)),
    })
  })
})
