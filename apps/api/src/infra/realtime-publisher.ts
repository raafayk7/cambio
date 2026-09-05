import { projectEvents, lobbyView, RealtimePublisherPort } from "@cambio/application"
import type { LobbyUpdated } from "@cambio/contracts"
import { Effect, Layer, Redacted } from "effect"

import { AppConfig } from "../config.js"
import { signRealtimeJwt } from "./realtime-jwt.js"
import { playerTopic, roomTopic } from "./topics.js"

/**
 * Supabase Realtime Broadcast publisher (ADR-0023/0024) — the
 * `RealtimePublisherPort` adapter.
 *
 * Everything arriving here is full truth; nothing leaves unprojected. The
 * projection is `projectEvents`/`lobbyView` from `@cambio/application` — the
 * payloads this adapter sends are exactly their outputs, which are already
 * wire shapes (`@cambio/contracts` unions with no encode transforms), so
 * they serialize to JSON as-is.
 *
 * Transport is the Realtime REST broadcast endpoint: one batched
 * `POST /api/broadcast` per publish call, authenticated with a self-signed
 * HS256 JWT. No SDK — a `fetch` wrapper. The port has no error channel:
 * delivery failures are logged and swallowed, because a persisted command
 * must never fail on realtime. Topics come from `topics.ts` and are
 * capabilities — never log them.
 */

export interface BroadcastMessage {
  readonly topic: string
  readonly event: string
  readonly payload: unknown
}

/** Injectable for unit tests; the live one is `makeFetchTransport`. */
export type BroadcastTransport = (
  messages: ReadonlyArray<BroadcastMessage>,
) => Effect.Effect<void, Error>

export const makeFetchTransport = (options: {
  readonly realtimeUrl: string
  readonly jwtSecret: string
}): BroadcastTransport => {
  return (messages) =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(`${options.realtimeUrl}/api/broadcast`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${signRealtimeJwt(options.jwtSecret)}`,
          },
          body: JSON.stringify({ messages }),
        })
        if (!response.ok) {
          throw new Error(`broadcast rejected: HTTP ${response.status}`)
        }
      },
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    })
}

export const makeRealtimePublisher = (
  topicSecret: string,
  transport: BroadcastTransport,
): typeof RealtimePublisherPort.Service => {
  // Failures never escape: the port has no error channel by design.
  const deliver = (messages: ReadonlyArray<BroadcastMessage>): Effect.Effect<void> =>
    messages.length === 0
      ? Effect.void
      : transport(messages).pipe(
          Effect.catchAll((error) =>
            Effect.logWarning(`realtime publish failed (dropped): ${error.message}`),
          ),
          Effect.catchAllDefect((defect) =>
            Effect.logWarning(`realtime publish defect (dropped): ${String(defect)}`),
          ),
        )

  return {
    publishGame: (gameId, _state, events) =>
      Effect.suspend(() => {
        const projected = projectEvents(events)
        const room = roomTopic(topicSecret, gameId)
        const messages: Array<BroadcastMessage> = projected.room.map((event) => ({
          topic: room,
          event: event._tag,
          payload: event,
        }))
        for (const [playerId, privates] of projected.perPlayer) {
          const topic = playerTopic(topicSecret, gameId, playerId)
          for (const event of privates) {
            messages.push({ topic, event: event._tag, payload: event })
          }
        }
        return deliver(messages)
      }),
    publishLobby: (gameId, lobby, version) =>
      Effect.suspend(() => {
        // Tagged like every other broadcast (C3): event name = payload._tag,
        // and the version rides along for the client's staleness guard.
        const payload: LobbyUpdated = {
          _tag: "LobbyUpdated",
          lobby: lobbyView(lobby),
          version,
        }
        return deliver([{ topic: roomTopic(topicSecret, gameId), event: payload._tag, payload }])
      }),
  }
}

export const RealtimePublisherLive = Layer.effect(
  RealtimePublisherPort,
  Effect.map(AppConfig, (config) =>
    makeRealtimePublisher(
      Redacted.value(config.topicSecret),
      makeFetchTransport({
        realtimeUrl: config.realtimeUrl,
        jwtSecret: Redacted.value(config.realtimeJwtSecret),
      }),
    ),
  ),
)
