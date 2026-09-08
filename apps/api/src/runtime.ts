import type {
  ClockPort,
  IdGeneratorPort,
  RealtimePublisherPort,
  RoomRegistry,
  SeedPort,
  SessionSignerPort,
} from "@cambio/application"
import { RoomRegistryLive } from "@cambio/application"
import type { GameRepository, UserRepository } from "@cambio/domain"
import type { SqlClient } from "@effect/sql"
import { Layer } from "effect"

import { ClockLive } from "./infra/clock.js"
import { DatabaseLive } from "./infra/database.js"
import { GameRepositoryLive } from "./infra/game-repository.js"
import { IdGeneratorLive } from "./infra/ids.js"
import { RealtimePublisherLive } from "./infra/realtime-publisher.js"
import { SeedLive } from "./infra/seed.js"
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
  | SeedPort
  | RealtimePublisherPort
  | GameRepository
  | UserRepository
  | RoomRegistry

const PortsLive = Layer.mergeAll(
  ClockLive,
  IdGeneratorLive,
  SessionSignerLive,
  SeedLive,
  RealtimePublisherLive,
  GameRepositoryLive,
  UserRepositoryLive,
)

// RoomRegistryLive is scoped: actors fork into the layer scope, and the
// server entry's `Effect.scoped` bounds their lifetime (ADR-0020).
export const AppLayer = Layer.mergeAll(
  PortsLive,
  RoomRegistryLive.pipe(Layer.provide(PortsLive)),
).pipe(Layer.provideMerge(DatabaseLive))
