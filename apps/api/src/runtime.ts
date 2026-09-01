import type { ClockPort, IdGeneratorPort, SessionSignerPort } from "@cambio/application"
import type { GameRepository, UserRepository } from "@cambio/domain"
import type { SqlClient } from "@effect/sql"
import { Layer } from "effect"

import { ClockLive } from "./infra/clock.js"
import { DatabaseLive } from "./infra/database.js"
import { GameRepositoryLive } from "./infra/game-repository.js"
import { IdGeneratorLive } from "./infra/ids.js"
import { SessionSignerLive } from "./infra/session-signer.js"
import { UserRepositoryLive } from "./infra/user-repository.js"

/**
 * Everything the request-handling runtime can reach.
 *
 * Adding a service here is how a use case gets its dependencies; adding it
 * anywhere else is how the layering rots.
 */
export type AppServices =
  | SqlClient.SqlClient
  | ClockPort
  | IdGeneratorPort
  | SessionSignerPort
  | GameRepository
  | UserRepository

export const AppLayer = Layer.mergeAll(
  ClockLive,
  IdGeneratorLive,
  SessionSignerLive,
  GameRepositoryLive,
  UserRepositoryLive,
).pipe(Layer.provideMerge(DatabaseLive))
