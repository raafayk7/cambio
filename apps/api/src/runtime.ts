import type { ClockPort, IdGeneratorPort } from "@cambio/application"
import type { SqlClient } from "@effect/sql"
import { Layer } from "effect"

import { ClockLive } from "./infra/clock.js"
import { DatabaseLive } from "./infra/database.js"
import { IdGeneratorLive } from "./infra/ids.js"

/**
 * Everything the request-handling runtime can reach.
 *
 * Adding a service here is how a use case gets its dependencies; adding it
 * anywhere else is how the layering rots.
 */
export type AppServices = SqlClient.SqlClient | ClockPort | IdGeneratorPort

export const AppLayer = Layer.mergeAll(DatabaseLive, ClockLive, IdGeneratorLive)
