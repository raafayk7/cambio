import { Effect } from "effect"
import {
  createLobby as newLobby,
  GameRepository,
  GameVersion,
  type Lobby,
  type StorageError,
  type User,
  type VersionConflict,
} from "@cambio/domain"
import { IdGeneratorPort } from "../ports/IdGenerator.js"
import { RealtimePublisherPort } from "../ports/RealtimePublisher.js"

/**
 * Create a lobby (root plan clause 1, ADR-0019): mint a GameId, persist a
 * one-member open lobby as the first version-guarded write, publish the
 * lobby update. The creator is the sole member; there is no host concept.
 * The full `User` comes in (CAM-17 C1) — the route's session user is
 * DB-fresh, so no lookup is needed to embed the display name.
 */

export interface CreateLobbyInput {
  readonly creator: User
}

export interface CreateLobbyResult {
  readonly lobby: Lobby
  readonly version: GameVersion
}

export const createLobby = (
  input: CreateLobbyInput,
): Effect.Effect<
  CreateLobbyResult,
  VersionConflict | StorageError,
  IdGeneratorPort | GameRepository | RealtimePublisherPort
> =>
  Effect.gen(function* () {
    const ids = yield* IdGeneratorPort
    const games = yield* GameRepository
    const publisher = yield* RealtimePublisherPort

    const gameId = yield* ids.nextGameId
    const lobby = newLobby(gameId, input.creator)
    const version = yield* games.saveLobby({
      gameId,
      lobby,
      expectedVersion: GameVersion.make(0),
    })
    yield* publisher.publishLobby(gameId, lobby, version)
    return { lobby, version }
  })
