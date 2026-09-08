import { createLobby, lobbyView, RoomRegistry, viewForEffect } from "@cambio/application"
import { encodeGameReply, encodeLeaveLobbyResponse, encodeLobbyResponse } from "@cambio/contracts"
import { GameId, GameRepository } from "@cambio/domain"
import { Effect, Either, Redacted, type Runtime, Schema } from "effect"
import type { FastifyInstance } from "fastify"

import type { AppConfig } from "../config.js"
import { grantsFor } from "../infra/topics.js"
import type { AppServices } from "../runtime.js"
import { makeRequireSession } from "./auth.js"
import { errorBody, lobbyErrorStatus, typedErrorBody } from "./errors.js"
import { runRoute } from "./run.js"

/**
 * Lobby lifecycle over HTTP (root plan C1.1–C1.3; CAM-17 adds the GET):
 *
 *   POST /lobbies                — createLobby (plain use case: it mints the id)
 *   POST /lobbies/:gameId/join   — RoomRegistry.join
 *   POST /lobbies/:gameId/leave  — RoomRegistry.leave
 *   POST /lobbies/:gameId/start  — RoomRegistry.start, GameConfig assembled
 *                                  here from AppConfig (ADR-0011: config,
 *                                  never a literal; StartGame.ts pins the
 *                                  assembly at the route layer)
 *   GET  /lobbies/:gameId        — the room-screen reload bootstrap (CAM-17
 *                                  B1–B3): a member of an OPEN lobby gets
 *                                  `{lobby, version, grants}`; everyone else
 *                                  gets the unknown-game 404, byte-identical
 *                                  — the no-existence-leak rule GET view
 *                                  follows.
 *
 * The issuer is always the session user. Create/join/get replies carry the
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
      // The session user is DB-fresh (the auth preHandler reloads it per
      // request), so the embedded name cannot be stale (C1).
      return run(reply, createLobby({ creator: user }), {
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

    app.get<{ Params: { gameId: string } }>(
      "/lobbies/:gameId",
      { preHandler: requireSession },
      async (request, reply) => {
        const user = request.sessionUser
        if (user === undefined) return reply.code(401).send(errorBody(401))
        const gameId = decodeGameId(request.params.gameId)
        // B3: malformed uuid refuses before any effect runs.
        if (Either.isLeft(gameId)) return reply.code(400).send(errorBody(400))
        // Read path, no actor (the GET-view precedent): the row is the
        // materialized authority; the actor's cache is an optimization.
        return run(
          reply,
          Effect.flatMap(GameRepository, (games) => games.loadLobby(gameId.right)),
          {
            statusOf: lobbyErrorStatus,
            onSuccess: ({ lobby, version }) => {
              if (lobby.status !== "open" || !lobby.members.some((m) => m.id === user.id)) {
                // Identical body to an unknown game — non-members, started
                // and abandoned lobbies all read as "not found" (B2): the
                // same typedErrorBody construction loadLobby's GameNotFound
                // takes through lobbyErrorStatus.
                return reply.code(404).send(typedErrorBody(404, { _tag: "GameNotFound" }))
              }
              return reply.send(
                encodeLobbyResponse({
                  lobby: lobbyView(lobby),
                  version,
                  // Own grants only (B1) — never another member's.
                  grants: grantsFor(topicSecret, gameId.right, user.id),
                }),
              )
            },
          },
        )
      },
    )

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
          ).pipe(
            // The one projection every route uses (C2, F5).
            Effect.flatMap(({ state, version }) =>
              Effect.map(viewForEffect(user.id, state), (view) => ({ view, version })),
            ),
          ),
          {
            statusOf: lobbyErrorStatus,
            // The reply is {view, version} — never the raw GameAdvanced (C6.1).
            onSuccess: ({ view, version }) => reply.send(encodeGameReply({ view, version })),
          },
        )
      },
    )
  }
