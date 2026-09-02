import { describe, expect, it } from "@effect/vitest"
import { type GameEvent, type GameState, decodeGameConfig } from "@cambio/domain"
import { card, gid, slot, ts, uid } from "@cambio/domain/testing"
import { Effect } from "effect"

import { type BroadcastMessage, makeRealtimePublisher } from "../src/infra/realtime-publisher.js"
import { playerTopic, roomTopic } from "../src/infra/topics.js"

/**
 * Unit suite over the injectable transport (root C4.1–C4.3): one publish ⇒
 * one batched transport call, payloads are exactly the projections on the
 * derived topics, and transport failure never escapes the port.
 */

const SECRET = "publisher-test-secret"
const p0 = uid(0)
const p1 = uid(1)
const game = gid(1)

/** viewFor-irrelevant here: the publisher projects events, not state. */
const dummyState = {} as GameState

const makeRecorder = () => {
  const calls: Array<ReadonlyArray<BroadcastMessage>> = []
  const transport = (messages: ReadonlyArray<BroadcastMessage>) =>
    Effect.sync(() => {
      calls.push(messages)
    })
  return { calls, transport }
}

const events: ReadonlyArray<GameEvent> = [
  { _tag: "CardDrawn", playerId: p0, card: card("QC") },
  {
    _tag: "CardPeeked",
    viewerId: p1,
    target: { playerId: p0, slotIndex: slot(0) },
    card: card("AS"),
  },
  { _tag: "TurnAdvanced", playerId: p1 },
]

describe("publishGame (C4.1)", () => {
  it.effect("one call, one batch: room messages + per-player messages on derived topics", () =>
    Effect.gen(function* () {
      const { calls, transport } = makeRecorder()
      const publisher = makeRealtimePublisher(SECRET, transport)

      yield* publisher.publishGame(game, dummyState, events)

      expect(calls).toHaveLength(1)
      const batch = calls[0]!
      const room = roomTopic(SECRET, game)
      expect(batch).toEqual([
        { topic: room, event: "CardDrawn", payload: { _tag: "CardDrawn", playerId: p0 } },
        {
          topic: room,
          event: "CardPeeked",
          payload: {
            _tag: "CardPeeked",
            viewerId: p1,
            target: { playerId: p0, slotIndex: 0 },
          },
        },
        { topic: room, event: "TurnAdvanced", payload: { _tag: "TurnAdvanced", playerId: p1 } },
        {
          topic: playerTopic(SECRET, game, p0),
          event: "PrivateCardDrawn",
          payload: { _tag: "PrivateCardDrawn", card: "QC" },
        },
        {
          topic: playerTopic(SECRET, game, p1),
          event: "PrivateCardPeeked",
          payload: {
            _tag: "PrivateCardPeeked",
            target: { playerId: p0, slotIndex: 0 },
            card: "AS",
          },
        },
      ])
    }),
  )

  it.effect("no messages, no transport call", () =>
    Effect.gen(function* () {
      const { calls, transport } = makeRecorder()
      const publisher = makeRealtimePublisher(SECRET, transport)
      yield* publisher.publishGame(game, dummyState, [])
      expect(calls).toHaveLength(0)
    }),
  )
})

describe("publishLobby", () => {
  it.effect("publishes the public lobby view on the room topic", () =>
    Effect.gen(function* () {
      const { calls, transport } = makeRecorder()
      const publisher = makeRealtimePublisher(SECRET, transport)
      yield* publisher.publishLobby(game, { id: game, members: [p0, p1], status: "open" })
      expect(calls).toEqual([
        [
          {
            topic: roomTopic(SECRET, game),
            event: "LobbyUpdated",
            payload: { id: game, members: [p0, p1], status: "open" },
          },
        ],
      ])
    }),
  )
})

describe("failure containment (C4.3)", () => {
  it.effect("a failing transport is swallowed — the effect still succeeds void", () =>
    Effect.gen(function* () {
      const publisher = makeRealtimePublisher(SECRET, () =>
        Effect.fail(new Error("connection refused")),
      )
      const result = yield* publisher.publishGame(game, dummyState, events)
      expect(result).toBeUndefined()
    }),
  )

  it.effect("a defective transport is swallowed too", () =>
    Effect.gen(function* () {
      const publisher = makeRealtimePublisher(SECRET, () => Effect.die(new Error("boom")))
      const result = yield* publisher.publishLobby(game, {
        id: game,
        members: [p0],
        status: "open",
      })
      expect(result).toBeUndefined()
    }),
  )
})

describe("engine-shaped batch (C4.1's projection wiring)", () => {
  it.effect("a GameStarted batch reaches the room value-stripped", () =>
    Effect.gen(function* () {
      const { calls, transport } = makeRecorder()
      const publisher = makeRealtimePublisher(SECRET, transport)
      const started: GameEvent = {
        _tag: "GameStarted",
        at: ts(0),
        seed: 7,
        players: [p0, p1],
        config: decodeGameConfig({ slamWindowMs: 5000 }),
        hands: [
          [{ slotIndex: slot(0), card: card("AS") }],
          [{ slotIndex: slot(0), card: card("KD") }],
        ],
        deck: [card("4C"), card("5C")],
        firstDiscard: card("5D"),
        prng: [1, 2, 3, 4],
      }
      yield* publisher.publishGame(game, dummyState, [started])
      expect(calls[0]).toEqual([
        {
          topic: roomTopic(SECRET, game),
          event: "GameStarted",
          payload: {
            _tag: "GameStarted",
            players: [p0, p1],
            firstDiscard: "5D",
            deckCount: 2,
            config: { slamWindowMs: 5000 },
          },
        },
      ])
    }),
  )
})
