import { createTemporaryUser } from "@cambio/application"
import { CreateUserRequest, encodeSessionUser } from "@cambio/contracts"
import { Effect, Either, Runtime, Schema } from "effect"
import type { FastifyInstance } from "fastify"

import type { AppConfig } from "../config.js"
import type { AppServices } from "../runtime.js"
import { makeRequireSession, setSessionCookie } from "./auth.js"
import { errorBody } from "./errors.js"

/**
 * `POST /users` — create a temporary user and issue the session (C1.*).
 * `GET /me` — whoami behind the auth hook (C2.*, C3.1).
 *
 * The body is decoded with the Either variant, not the throwing contract
 * helper: user input must surface as a 400 before any effect runs, never as
 * an exception (C1.3).
 */
export const usersRoutes =
  (runtime: Runtime.Runtime<AppServices>, config: AppConfig) => async (app: FastifyInstance) => {
    const runPromise = Runtime.runPromise(runtime)
    const decodeBody = Schema.decodeUnknownEither(CreateUserRequest)
    const ttlMillis = config.sessionTtlSeconds * 1000

    app.post("/users", async (request, reply) => {
      const body = decodeBody(request.body)
      if (Either.isLeft(body)) {
        return reply.code(400).send(errorBody(400))
      }
      const result = await runPromise(
        Effect.either(createTemporaryUser({ name: body.right.name, ttlMillis })),
      )
      if (Either.isLeft(result)) {
        return reply.code(500).send(errorBody(500))
      }
      setSessionCookie(reply, result.right.token, config)
      return reply.code(201).send(
        encodeSessionUser({
          userId: result.right.user.id,
          name: result.right.user.name,
        }),
      )
    })

    app.get("/me", { preHandler: makeRequireSession(runtime, config) }, async (request, reply) => {
      // Defensive: the preHandler always sets this or short-circuits.
      if (request.sessionUser === undefined) {
        return reply.code(401).send(errorBody(401))
      }
      return encodeSessionUser({
        userId: request.sessionUser.id,
        name: request.sessionUser.name,
      })
    })
  }
