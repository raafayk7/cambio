import { beforeAll, afterAll, describe, expect, it } from "@effect/vitest"
import { type GameEvent } from "@cambio/domain"
import { card, gid, uid } from "@cambio/domain/testing"
import { RealtimeClient, type RealtimeChannel } from "@supabase/realtime-js"
import { Effect } from "effect"

import { signRealtimeJwt } from "../src/infra/realtime-jwt.js"
import {
  makeFetchTransport,
  makeRealtimePublisher,
} from "../src/infra/realtime-publisher.js"
import { playerTopic, roomTopic } from "../src/infra/topics.js"

/**
 * Container-backed integration (root C4.2, C5.3): publish through the real
 * REST endpoint of the compose `supabase/realtime` service, subscribe over a
 * real websocket, and assert delivery lands on the intended topics only.
 *
 * HARD-FAILS when the container is down (root Decision Log — the gate never
 * silently shrinks): `beforeAll` throws if the health endpoint is
 * unreachable. Start it with:
 *   docker compose -f docker/docker-compose.yml up -d
 *
 * Literal constants, not .env (vitest does not load .env — the
 * `TEST_DATABASE_URL` precedent in support/db.ts). They mirror the dev-only
 * values in docker/docker-compose.yml.
 */

const REALTIME_URL = "http://realtime-dev.localhost:4000"
const REALTIME_WS = "ws://realtime-dev.localhost:4000/socket"
const JWT_SECRET = "cambio-dev-realtime-jwt-secret-0123456789"
const TOPIC_SECRET = "integration-test-topic-secret"

const p0 = uid(0)
const p1 = uid(1)
const game = gid(901)

interface Received {
  readonly event: string
  readonly payload: unknown
}

const subscribe = async (
  client: RealtimeClient,
  topic: string,
  sink: Array<Received>,
): Promise<RealtimeChannel> => {
  const channel = client.channel(topic)
  channel.on("broadcast", { event: "*" }, (message) => {
    sink.push({ event: message.event, payload: message.payload })
  })
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`subscribe timeout for ${topic}`)), 10_000)
    channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer)
        resolve()
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timer)
        reject(err ?? new Error(`subscribe ${status} for ${topic}`))
      }
    })
  })
  return channel
}

const waitFor = async (predicate: () => boolean, ms: number): Promise<void> => {
  const deadline = Date.now() + ms
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

let client: RealtimeClient

beforeAll(async () => {
  // Hard-fail, no skip: an unreachable container fails the suite loudly.
  let health: Response
  try {
    health = await fetch(`${REALTIME_URL}/api/tenants/realtime-dev/health`, {
      headers: { authorization: `Bearer ${signRealtimeJwt(JWT_SECRET)}` },
    })
  } catch (cause) {
    throw new Error(
      `Realtime container unreachable at ${REALTIME_URL} — ` +
        `run: docker compose -f docker/docker-compose.yml up -d`,
      { cause },
    )
  }
  if (!health.ok) {
    throw new Error(`Realtime health returned HTTP ${health.status} — container misconfigured?`)
  }
  client = new RealtimeClient(REALTIME_WS, {
    params: { apikey: signRealtimeJwt(JWT_SECRET) },
  })
})

afterAll(async () => {
  await client?.removeAllChannels()
  client?.disconnect()
})

describe("realtime broadcast integration", () => {
  it("delivers room and private messages to their topics — and nothing to the wrong player", async () => {
    const roomSink: Array<Received> = []
    const p0Sink: Array<Received> = []
    const p1Sink: Array<Received> = []

    const channels = await Promise.all([
      subscribe(client, roomTopic(TOPIC_SECRET, game), roomSink),
      subscribe(client, playerTopic(TOPIC_SECRET, game, p0), p0Sink),
      subscribe(client, playerTopic(TOPIC_SECRET, game, p1), p1Sink),
    ])

    const publisher = makeRealtimePublisher(
      TOPIC_SECRET,
      makeFetchTransport({ realtimeUrl: REALTIME_URL, jwtSecret: JWT_SECRET }),
    )
    const events: ReadonlyArray<GameEvent> = [
      { _tag: "CardDrawn", playerId: p0, card: card("QC") },
      { _tag: "TurnAdvanced", playerId: p1 },
    ]
    await Effect.runPromise(publisher.publishGame(game, {} as never, events))

    await waitFor(() => roomSink.length >= 2 && p0Sink.length >= 1, 10_000)

    expect(roomSink).toEqual([
      { event: "CardDrawn", payload: { _tag: "CardDrawn", playerId: p0 } },
      { event: "TurnAdvanced", payload: { _tag: "TurnAdvanced", playerId: p1 } },
    ])
    expect(p0Sink).toEqual([
      { event: "PrivateCardDrawn", payload: { _tag: "PrivateCardDrawn", card: "QC" } },
    ])
    // The non-entitled player's channel stays silent — give stragglers a beat.
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(p1Sink).toEqual([])

    await Promise.all(channels.map((c) => c.unsubscribe()))
  })

  it("publishLobby lands the public lobby view on the room topic", async () => {
    const roomSink: Array<Received> = []
    const channel = await subscribe(client, roomTopic(TOPIC_SECRET, gid(902)), roomSink)

    const publisher = makeRealtimePublisher(
      TOPIC_SECRET,
      makeFetchTransport({ realtimeUrl: REALTIME_URL, jwtSecret: JWT_SECRET }),
    )
    await Effect.runPromise(
      publisher.publishLobby(gid(902), { id: gid(902), members: [p0], status: "open" }),
    )

    await waitFor(() => roomSink.length >= 1, 10_000)
    expect(roomSink).toEqual([
      {
        event: "LobbyUpdated",
        payload: { id: gid(902), members: [p0], status: "open" },
      },
    ])
    await channel.unsubscribe()
  })
})
