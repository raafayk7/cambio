import cookie from "@fastify/cookie"
import cors from "@fastify/cors"
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify"
import type { Runtime } from "effect"
import type { Logger } from "pino"

import type { AppConfig } from "../config.js"
import type { AppServices } from "../runtime.js"
import { unhandledErrorResponse } from "./errors.js"
import { healthRoutes } from "./health.js"
import { usersRoutes } from "./users.js"

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

  // Every error that escapes a route lands here: log it server-side, send a
  // curated body. Without this, defects fall through to Fastify's default
  // handler, whose `{ message: err.message }` body is unreviewed output.
  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "unhandled route error")
    const { status, body } = unhandledErrorResponse(error.statusCode)
    return reply.code(status).send(body)
  })

  await app.register(cors, {
    origin: options.config.webOrigin,
    credentials: true,
  })

  // Parse/serialize only — no `secret` option: token authenticity is the
  // session signer's job, not the cookie plugin's (ADR-0018 §2).
  await app.register(cookie)

  await app.register(healthRoutes(options.runtime))
  await app.register(usersRoutes(options.runtime, options.config))

  return app
}
