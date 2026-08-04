import { randomUUID } from "node:crypto"

import { IdGeneratorPort } from "@cambio/application"
import { GameId, UserId } from "@cambio/domain"
import { Effect, Layer } from "effect"

/**
 * Id generation adapter. The domain performs no randomness (§3.1), so this is
 * infrastructure.
 */
export const IdGeneratorLive = Layer.succeed(IdGeneratorPort, {
  nextUserId: Effect.sync(() => UserId.make(randomUUID())),
  nextGameId: Effect.sync(() => GameId.make(randomUUID())),
})
