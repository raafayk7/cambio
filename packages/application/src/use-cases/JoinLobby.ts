import { Effect } from "effect"
import {
  type AlreadyInLobby,
  type GameId,
  type GameNotFound,
  GameRepository,
  type GameVersion,
  joinLobby as addMember,
  type Lobby,
  type LobbyFull,
  type LobbyNotJoinable,
  type StorageError,
  type UserId,
  type UserNotFound,
  UserRepository,
  type VersionConflict,
} from "@cambio/domain"
import { RealtimePublisherPort } from "../ports/RealtimePublisher.js"

/**
 * Join a lobby (root plan clause 2): load → validate the joiner exists
 * (`game_players` FKs to `users`, so the FK explosion becomes a typed
 * `UserNotFound` here instead of a StorageError at save) → pure domain
 * transition → version-guarded save → publish. Any refusal persists and
 * publishes nothing.
 */

export interface JoinLobbyInput {
  readonly gameId: GameId
  readonly userId: UserId
}

export interface LobbyChanged {
  readonly lobby: Lobby
  readonly version: GameVersion
}

export const joinLobby = (
  input: JoinLobbyInput,
): Effect.Effect<
  LobbyChanged,
  | GameNotFound
  | UserNotFound
  | LobbyFull
  | AlreadyInLobby
  | LobbyNotJoinable
  | VersionConflict
  | StorageError,
  GameRepository | UserRepository | RealtimePublisherPort
> =>
  Effect.gen(function* () {
    const games = yield* GameRepository
    const users = yield* UserRepository
    const publisher = yield* RealtimePublisherPort

    const { lobby, version } = yield* games.loadLobby(input.gameId)
    // The lookup's result now matters (CAM-17 C1): the joiner's display name
    // is embedded in the membership the transition appends.
    const joiner = yield* users.findById(input.userId)
    const next = yield* addMember(lobby, joiner)
    const newVersion = yield* games.saveLobby({
      gameId: input.gameId,
      lobby: next,
      expectedVersion: version,
    })
    yield* publisher.publishLobby(input.gameId, next, newVersion)
    return { lobby: next, version: newVersion }
  })
