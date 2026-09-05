import { RoomRegistry, toDomainCommand, viewForEffect } from "@cambio/application"
import { decodeWireCommandEither, encodeGameReply, encodeViewResponse } from "@cambio/contracts"
import { GameId, GameNotFound, GameRepository, seatOf } from "@cambio/domain"
import { Effect, Either, Option, Redacted, type Runtime, Schema } from "effect"
import type { FastifyInstance } from "fastify"

import type { AppConfig } from "../config.js"
import { grantsFor } from "../infra/topics.js"
import type { AppServices } from "../runtime.js"
import { makeRequireSession } from "./auth.js"
import { commandErrorStatus, errorBody } from "./errors.js"
import { runRoute } from "./run.js"

/**
 * The game surface (root plan C1.4–C1.6):
 *
 *   POST /games/:gameId/commands — decode the 9-variant wire union, inject
 *                                  the session user as issuer, run through
 *                                  the room actor. `CloseSlamWindow` is not
 *                                  on the wire; a spoofed `playerId` in the
 *                                  body is dropped at decode (C1.5).
 *   GET  /games/:gameId/view     — the caller's viewFor snapshot + version +
 *                                  their channel grants. Non-participants
 *                                  get the same 404 body as an unknown game
 *                                  — no existence leak (C1.6).
 *
 * Replies are `{view, version}` — never the raw `GameAdvanced` (C6.1).
 */
export const gamesRoutes =
  (runtime: Runtime.Runtime<AppServices>, config: AppConfig) => async (app: FastifyInstance) => {
    const requireSession = makeRequireSession(runtime, config)
    const run = runRoute(runtime)
    const topicSecret = Redacted.value(config.topicSecret)
    const decodeGameId = Schema.decodeUnknownEither(GameId)

    app.post<{ Params: { gameId: string } }>(
      "/games/:gameId/commands",
      { preHandler: requireSession },
      async (request, reply) => {
        const user = request.sessionUser
        if (user === undefined) return reply.code(401).send(errorBody(401))
        const gameId = decodeGameId(request.params.gameId)
        if (Either.isLeft(gameId)) return reply.code(400).send(errorBody(400))
        const wire = decodeWireCommandEither(request.body)
        if (Either.isLeft(wire)) return reply.code(400).send(errorBody(400))
        const command = toDomainCommand(user.id, wire.right)
        return run(
          reply,
          Effect.flatMap(RoomRegistry, (rooms) => rooms.execute(gameId.right, command)).pipe(
            // The one projection every route uses (C2, F5).
            Effect.flatMap(({ state, version }) =>
              Effect.map(viewForEffect(user.id, state), (view) => ({ view, version })),
            ),
          ),
          {
            statusOf: commandErrorStatus,
            onSuccess: ({ view, version }) => reply.send(encodeGameReply({ view, version })),
          },
        )
      },
    )

    app.get<{ Params: { gameId: string } }>(
      "/games/:gameId/view",
      { preHandler: requireSession },
      async (request, reply) => {
        const user = request.sessionUser
        if (user === undefined) return reply.code(401).send(errorBody(401))
        const gameId = decodeGameId(request.params.gameId)
        if (Either.isLeft(gameId)) return reply.code(400).send(errorBody(400))
        // A read needs no actor serialization: the state row is the
        // materialized authority (ADR-0014/0020); the actor's cache is an
        // optimization, not the source of truth.
        return run(
          reply,
          Effect.flatMap(GameRepository, (games) => games.load(gameId.right)).pipe(
            // 404-before-names (C2): membership is decided on the state
            // FIRST — names of a game the caller cannot see are never
            // fetched. A non-participant fails with the SAME typed
            // `GameNotFound` the unknown-game path produces, so both take
            // one route through `statusOf` to a byte-identical 404 body —
            // no existence leak, no sentinel branch.
            Effect.flatMap(({ state, version }) =>
              Effect.gen(function* () {
                if (Option.isNone(seatOf(state, user.id))) {
                  return yield* Effect.fail(new GameNotFound({ gameId: gameId.right }))
                }
                const view = yield* viewForEffect(user.id, state)
                return { view, version }
              }),
            ),
          ),
          {
            statusOf: commandErrorStatus,
            onSuccess: ({ view, version }) =>
              reply.send(
                encodeViewResponse({
                  view,
                  version,
                  grants: grantsFor(topicSecret, gameId.right, user.id),
                }),
              ),
          },
        )
      },
    )
  }
