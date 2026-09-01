import { verifySession } from "@cambio/application"
import type { User } from "@cambio/domain"
import { Effect, Either, Runtime } from "effect"
import type { FastifyReply, preHandlerAsyncHookHandler } from "fastify"

import type { AppConfig } from "../config.js"
import type { AppServices } from "../runtime.js"
import { errorBody, sessionErrorStatus } from "./errors.js"

/**
 * Session plumbing for protected routes (CAM-4, ADR-0018).
 *
 * Routes opt in per-route (`preHandler: makeRequireSession(...)`) rather
 * than via a global hook — with per-route opt-in, "is this route
 * authenticated?" is answered at the route definition, which is where
 * CAM-5's game routes will make that call too.
 *
 * Never log token values. Pino already redacts the cookie header
 * (`infra/logger.ts`); keep it that way.
 */

declare module "fastify" {
  interface FastifyRequest {
    /** Set by `makeRequireSession`; present only on routes behind it. */
    sessionUser?: User
  }
}

export const SESSION_COOKIE = "cambio_session"

/** httpOnly and Path=/ are ADR-0018 invariants; the rest follows config (C4.2). */
export const setSessionCookie = (reply: FastifyReply, token: string, config: AppConfig) => {
  void reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    path: "/",
    secure: config.sessionCookieSecure,
    sameSite: config.sessionCookieSameSite,
    maxAge: config.sessionTtlSeconds,
  })
}

/**
 * preHandler: cookie → `verifySession` → decorate `request.sessionUser` and
 * re-issue the renewed cookie (C3.1 — sliding renewal with zero per-route
 * code). Missing cookie → 401 immediately (C2.2); typed failures map via
 * `errors.ts` (C2.3–C2.5 → 401, storage → 500).
 */
export const makeRequireSession = (
  runtime: Runtime.Runtime<AppServices>,
  config: AppConfig,
): preHandlerAsyncHookHandler => {
  const runPromise = Runtime.runPromise(runtime)
  const ttlMillis = config.sessionTtlSeconds * 1000
  return async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE]
    if (token === undefined) {
      return reply.code(401).send(errorBody(401))
    }
    const result = await runPromise(Effect.either(verifySession({ token, ttlMillis })))
    if (Either.isLeft(result)) {
      const status = sessionErrorStatus(result.left)
      return reply.code(status).send(errorBody(status))
    }
    request.sessionUser = result.right.user
    setSessionCookie(reply, result.right.token, config)
  }
}
