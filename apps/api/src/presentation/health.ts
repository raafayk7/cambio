import { encodeHealthResponse } from "@cambio/contracts"
import { Effect, Runtime } from "effect"
import type { FastifyInstance } from "fastify"

import type { AppServices } from "../runtime.js"

/**
 * `GET /health`.
 *
 * Deliberately cheap and dependency-free: Render pings it to decide whether the
 * instance is up, and a health check that touches the database turns a slow
 * query into a restart loop. Readiness (which *would* check Postgres) is a
 * separate concern and does not exist yet.
 *
 * It runs through the Effect runtime rather than returning a literal so the
 * request → Effect → response path is exercised by the smoke test.
 */
export const healthRoutes =
  (runtime: Runtime.Runtime<AppServices>) => async (app: FastifyInstance) => {
    const runPromise = Runtime.runPromise(runtime)

    app.get("/health", async () =>
      runPromise(Effect.sync(() => encodeHealthResponse({ ok: true }))),
    )
  }
