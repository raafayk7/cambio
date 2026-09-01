import { Effect } from "effect"
import {
  createLobby as newLobby,
  GameRepository,
  GameVersion,
  type Lobby,
  type StorageError,
  type UserId,
  type VersionConflict,
} from "@cambio/domain"
import { IdGeneratorPort } from "../ports/IdGenerator.js"
import { RealtimePublisherPort } from "../ports/RealtimePublisher.js"

/**
 * Create a lobby (root plan clause 1, ADR-0019): mint a GameId, persist a
 * one-member open lobby as the first version-guarded write, publish the
 * lobby update. The creator is the sole member; there is no host concept.
 */

export interface CreateLobbyInput {
  readonly creatorId: UserId
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
    const lobby = newLobby(gameId, input.creatorId)
    const version = yield* games.saveLobby({
      gameId,
      lobby,
      expectedVersion: GameVersion.make(0),
    })
    yield* publisher.publishLobby(gameId, lobby)
    return { lobby, version }
  })
