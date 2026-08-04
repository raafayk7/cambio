import { NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"

import { AppConfig } from "./config.js"
import { verifyDatabaseConnection } from "./infra/database.js"
import { makeLogger } from "./infra/logger.js"
import { buildServer } from "./presentation/server.js"
import { AppLayer, type AppServices } from "./runtime.js"

/**
 * Entry point. The Effect runtime is created here and nowhere else; the Fastify
 * layer receives it and runs effects through it per request.
 */
const main = Effect.gen(function* () {
  const config = yield* AppConfig

  const logger = makeLogger({ level: config.logLevel, pretty: config.prettyLogs })

  // Fail fast rather than serving traffic against a database we cannot reach.
  yield* verifyDatabaseConnection
  logger.info("postgres connection verified")

  const runtime = yield* Effect.runtime<AppServices>()
  const app = yield* Effect.promise(() => buildServer({ config, logger, runtime }))

  yield* Effect.acquireRelease(
    Effect.tryPromise(() => app.listen({ port: config.port, host: config.host })).pipe(
      Effect.tap(() => Effect.sync(() => logger.info({ port: config.port }, "api listening"))),
    ),
    () =>
      Effect.promise(() => app.close()).pipe(
        Effect.tap(() => Effect.sync(() => logger.info("api stopped"))),
      ),
  )

  // Hold the scope open until the runtime is interrupted (SIGINT/SIGTERM).
  yield* Effect.never
}).pipe(Effect.scoped, Effect.provide(AppLayer))

NodeRuntime.runMain(main)
