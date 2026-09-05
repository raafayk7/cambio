import { playerNames, RoomRegistry, toDomainCommand, viewFor } from "@cambio/application"
import { decodeWireCommandEither, encodeGameReply, encodeViewResponse } from "@cambio/contracts"
import { GameId, GameRepository, seatOf, type UserId } from "@cambio/domain"
import { Effect, Either, Option, Redacted, type Runtime, Schema } from "effect"
import type { FastifyInstance } from "fastify"

import type { AppConfig } from "../config.js"
import { grantsFor } from "../infra/topics.js"
import type { AppServices } from "../runtime.js"
import { makeRequireSession } from "./auth.js"
import { commandErrorStatus, errorBody, typedErrorBody } from "./errors.js"
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
            // C2: names ride beside the state for viewFor's projection.
            Effect.flatMap(({ state, version }) =>
              Effect.map(playerNames(state), (names) => ({ state, version, names })),
            ),
          ),
          {
            statusOf: commandErrorStatus,
            onSuccess: ({ state, version, names }) =>
              reply.send(encodeGameReply({ view: viewFor(user.id, state, names), version })),
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
            // fetched; `names: null` marks the refusal for onSuccess.
            Effect.flatMap(({ state, version }) =>
              Option.isNone(seatOf(state, user.id))
                ? Effect.succeed({
                    state,
                    version,
                    names: null as ReadonlyMap<UserId, string> | null,
                  })
                : Effect.map(playerNames(state), (names) => ({
                    state,
                    version,
                    names: names as ReadonlyMap<UserId, string> | null,
                  })),
            ),
          ),
          {
            statusOf: commandErrorStatus,
            onSuccess: ({ state, version, names }) => {
              if (names === null) {
                // Identical body to an unknown game — no existence leak.
                return reply.code(404).send(typedErrorBody(404, { _tag: "GameNotFound" }))
              }
              return reply.send(
                encodeViewResponse({
                  view: viewFor(user.id, state, names),
                  version,
                  grants: grantsFor(topicSecret, gameId.right, user.id),
                }),
              )
            },
          },
        )
      },
    )
  }
