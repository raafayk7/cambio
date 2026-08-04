import { Context, type Effect } from "effect"
import { type GameId, type UserId } from "@cambio/domain"

/**
 * Id generation port.
 *
 * The domain performs no randomness (§3.1), so identity minting is an
 * infrastructure concern. Implementations live in `apps/api/src/infra`.
 */
export class IdGeneratorPort extends Context.Tag("@cambio/application/IdGeneratorPort")<
  IdGeneratorPort,
  {
    readonly nextUserId: Effect.Effect<UserId>
    readonly nextGameId: Effect.Effect<GameId>
  }
>() {}
