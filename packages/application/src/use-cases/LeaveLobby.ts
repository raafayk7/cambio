import { Effect } from "effect"
import {
  type GameId,
  type GameNotFound,
  GameRepository,
  leaveLobby as removeMember,
  type LobbyNotJoinable,
  type NotInLobby,
  type StorageError,
  type UserId,
  type VersionConflict,
} from "@cambio/domain"
import { RealtimePublisherPort } from "../ports/RealtimePublisher.js"
import { type LobbyChanged } from "./JoinLobby.js"

/**
 * Leave a lobby (root plan clause 3): the pure transition abandons the lobby
 * when the last member leaves (user call: abandoned, never deleted — §7's
 * pg_cron reaps abandoned rows later). The abandonment still publishes, so
 * lobby watchers see it close.
 */

export interface LeaveLobbyInput {
  readonly gameId: GameId
  readonly userId: UserId
}

export const leaveLobby = (
  input: LeaveLobbyInput,
): Effect.Effect<
  LobbyChanged,
  GameNotFound | NotInLobby | LobbyNotJoinable | VersionConflict | StorageError,
  GameRepository | RealtimePublisherPort
> =>
  Effect.gen(function* () {
    const games = yield* GameRepository
    const publisher = yield* RealtimePublisherPort

    const { lobby, version } = yield* games.loadLobby(input.gameId)
    const next = yield* removeMember(lobby, input.userId)
    const newVersion = yield* games.saveLobby({
      gameId: input.gameId,
      lobby: next,
      expectedVersion: version,
    })
    yield* publisher.publishLobby(input.gameId, next)
    return { lobby: next, version: newVersion }
  })
