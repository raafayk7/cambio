import { createLobby, lobbyView, RoomRegistry, viewFor } from "@cambio/application"
import {
  encodeGameReply,
  encodeLeaveLobbyResponse,
  encodeLobbyResponse,
} from "@cambio/contracts"
import { GameId } from "@cambio/domain"
import { Effect, Either, Redacted, type Runtime, Schema } from "effect"
import type { FastifyInstance } from "fastify"

import type { AppConfig } from "../config.js"
import { grantsFor } from "../infra/topics.js"
import type { AppServices } from "../runtime.js"
import { makeRequireSession } from "./auth.js"
import { errorBody, lobbyErrorStatus } from "./errors.js"
import { runRoute } from "./run.js"

/**
 * Lobby lifecycle over HTTP (root plan C1.1–C1.3):
 *
 *   POST /lobbies                — createLobby (plain use case: it mints the id)
 *   POST /lobbies/:gameId/join   — RoomRegistry.join
 *   POST /lobbies/:gameId/leave  — RoomRegistry.leave
 *   POST /lobbies/:gameId/start  — RoomRegistry.start, GameConfig assembled
 *                                  here from AppConfig (ADR-0011: config,
 *                                  never a literal; StartGame.ts pins the
 *                                  assembly at the route layer)
 *
 * The issuer is always the session user. Create/join replies carry the
 * caller's channel grants (ADR-0023) — and only the caller's: another
 * player's private topic never appears in any response (C4.4).
 */
export const lobbiesRoutes =
  (runtime: Runtime.Runtime<AppServices>, config: AppConfig) => async (app: FastifyInstance) => {
    const requireSession = makeRequireSession(runtime, config)
    const run = runRoute(runtime)
    const topicSecret = Redacted.value(config.topicSecret)
    const decodeGameId = Schema.decodeUnknownEither(GameId)

    app.post("/lobbies", { preHandler: requireSession }, async (request, reply) => {
      const user = request.sessionUser
      if (user === undefined) return reply.code(401).send(errorBody(401))
      return run(reply, createLobby({ creatorId: user.id }), {
        statusOf: lobbyErrorStatus,
        onSuccess: ({ lobby, version }) =>
          reply.code(201).send(
            encodeLobbyResponse({
              lobby: lobbyView(lobby),
              version,
              grants: grantsFor(topicSecret, lobby.id, user.id),
            }),
          ),
      })
    })

    app.post<{ Params: { gameId: string } }>(
      "/lobbies/:gameId/join",
      { preHandler: requireSession },
      async (request, reply) => {
        const user = request.sessionUser
        if (user === undefined) return reply.code(401).send(errorBody(401))
        const gameId = decodeGameId(request.params.gameId)
        if (Either.isLeft(gameId)) return reply.code(400).send(errorBody(400))
        return run(
          reply,
          Effect.flatMap(RoomRegistry, (rooms) => rooms.join(gameId.right, user.id)),
          {
            statusOf: lobbyErrorStatus,
            onSuccess: ({ lobby, version }) =>
              reply.send(
                encodeLobbyResponse({
                  lobby: lobbyView(lobby),
                  version,
                  grants: grantsFor(topicSecret, gameId.right, user.id),
                }),
              ),
          },
        )
      },
    )

    app.post<{ Params: { gameId: string } }>(
      "/lobbies/:gameId/leave",
      { preHandler: requireSession },
      async (request, reply) => {
        const user = request.sessionUser
        if (user === undefined) return reply.code(401).send(errorBody(401))
        const gameId = decodeGameId(request.params.gameId)
        if (Either.isLeft(gameId)) return reply.code(400).send(errorBody(400))
        return run(
          reply,
          Effect.flatMap(RoomRegistry, (rooms) => rooms.leave(gameId.right, user.id)),
          {
            statusOf: lobbyErrorStatus,
            // No grants: the caller just gave theirs up (C1.2).
            onSuccess: ({ lobby, version }) =>
              reply.send(encodeLeaveLobbyResponse({ lobby: lobbyView(lobby), version })),
          },
        )
      },
    )

    app.post<{ Params: { gameId: string } }>(
      "/lobbies/:gameId/start",
      { preHandler: requireSession },
      async (request, reply) => {
        const user = request.sessionUser
        if (user === undefined) return reply.code(401).send(errorBody(401))
        const gameId = decodeGameId(request.params.gameId)
        if (Either.isLeft(gameId)) return reply.code(400).send(errorBody(400))
        return run(
          reply,
          Effect.flatMap(RoomRegistry, (rooms) =>
            rooms.start(gameId.right, {
              starterId: user.id,
              config: { slamWindowMs: config.slamWindowMs },
            }),
          ),
          {
            statusOf: lobbyErrorStatus,
            // The reply is {view, version} — never the raw GameAdvanced (C6.1).
            onSuccess: ({ state, version }) =>
              reply.send(encodeGameReply({ view: viewFor(user.id, state), version })),
          },
        )
      },
    )
  }
