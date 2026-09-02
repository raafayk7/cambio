import { createHmac } from "node:crypto"

import type { ChannelGrants } from "@cambio/contracts"
import type { GameId, UserId } from "@cambio/domain"

/**
 * Channel-topic capabilities (ADR-0023): each topic embeds an unguessable
 * secret, and knowing the topic is the authorization. Secrets are
 * HMAC-SHA256 over the ids with `TOPIC_SECRET`, truncated base64url —
 * deterministic, so topics survive API restarts without persistence, and
 * underivable without the server secret.
 *
 * Both consumers — the realtime publisher and the route grant builders — go
 * through these three functions; there is no other derivation. Topic secrets
 * must never be logged.
 */

const TOPIC_TOKEN_BYTES = 16

const capability = (secret: string, message: string): string =>
  createHmac("sha256", secret)
    .update(message)
    .digest()
    .subarray(0, TOPIC_TOKEN_BYTES)
    .toString("base64url")

/** The game's public room channel — identical grant for every participant. */
export const roomTopic = (secret: string, gameId: GameId): string =>
  `game:${gameId}:${capability(secret, `room:${gameId}`)}`

/** One player's private channel. Handed only to that player (C4.4). */
export const playerTopic = (secret: string, gameId: GameId, userId: UserId): string =>
  `game:${gameId}:player:${userId}:${capability(secret, `player:${gameId}:${userId}`)}`

/** The contracts `ChannelGrants` for one caller. */
export const grantsFor = (secret: string, gameId: GameId, userId: UserId): ChannelGrants => ({
  roomTopic: roomTopic(secret, gameId),
  playerTopic: playerTopic(secret, gameId, userId),
})
