import { NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"

import { DatabaseLive } from "./database.js"
import { migrate } from "./migrate.js"

/** CLI entry for `pnpm --filter @cambio/api migrate` (DATABASE_URL). */
NodeRuntime.runMain(migrate.pipe(Effect.provide(DatabaseLive), Effect.scoped))
