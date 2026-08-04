import cors from "@fastify/cors"
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify"
import type { Runtime } from "effect"
import type { Logger } from "pino"

import type { AppConfig } from "../config.js"
import type { AppServices } from "../runtime.js"
import { healthRoutes } from "./health.js"

/**
 * Builds the Fastify instance.
 *
 * The presentation layer's whole job is mapping requests to commands and
 * projections back to responses. It holds no game state and makes no rules
 * decisions.
 */
export const buildServer = async (options: {
  readonly config: AppConfig
  readonly logger: Logger
  readonly runtime: Runtime.Runtime<AppServices>
}): Promise<FastifyInstance> => {
  // Widened to Fastify's own logger interface so the instance keeps Fastify's
  // default generics — otherwise every plugin signature has to be re-typed
  // around pino's concrete Logger.
  const loggerInstance: FastifyBaseLogger = options.logger

  const app = Fastify({ loggerInstance })

  await app.register(cors, {
    origin: options.config.webOrigin,
    credentials: true,
  })

  await app.register(healthRoutes(options.runtime))

  return app
}
