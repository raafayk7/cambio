import { Context, Data, type Effect } from "effect"
import { type GameEvent } from "./GameEvent.js"
import { type GameState } from "./GameState.js"
import { type GameId, type GameVersion, type Timestamp } from "./Ids.js"
import { type Lobby } from "./Lobby.js"

/**
 * The aggregate repository port (ADR-0015): the game — `games`,
 * `game_players`, `decks`, `user_cards`, `card_peeks`, `game_events` — is
 * persisted as one unit. `save` writes the state **and** appends its events
 * in a single transaction, so a state row without its events cannot exist
 * (§6: the log is the recovery mechanism). Declared in `domain` because what
 * can be stored is domain vocabulary; the `@effect/sql-pg` adapter lives in
 * `apps/api/src/infra/`.
 */

export class GameNotFound extends Data.TaggedError("GameNotFound")<{
  readonly gameId: GameId
}> {}

export class VersionConflict extends Data.TaggedError("VersionConflict")<{
  readonly gameId: GameId
  readonly expected: GameVersion
  /** The live row's version, or null when no live row exists. */
  readonly actual: GameVersion | null
}> {}

/** Any storage-layer failure, surfaced as a value — adapters never throw. */
export class StorageError extends Data.TaggedError("StorageError")<{
  readonly operation: string
  readonly cause: unknown
}> {}

export interface SaveLobbyInput {
  readonly gameId: GameId
  /**
   * The lobby to persist. `status: "started"` is never a valid input here —
   * that transition is `save` with the `GameStarted` batch (ADR-0019); the
   * adapter treats it as a defect, not a typed outcome.
   */
  readonly lobby: Lobby
  /** The version the caller loaded; `GameVersion 0` means first save (insert). */
  readonly expectedVersion: GameVersion
}

export interface SaveGameInput {
  readonly gameId: GameId
  readonly state: GameState
  /** The version the caller loaded; `GameVersion 0` means first save (insert). */
  readonly expectedVersion: GameVersion
  /** Events produced since that version — appended atomically with the state. */
  readonly newEvents: ReadonlyArray<GameEvent>
  /** Stamp for `game_events.at` — payloads carry no timestamps (GameEvent.ts). */
  readonly at: Timestamp
}

export class GameRepository extends Context.Tag("@cambio/domain/GameRepository")<
  GameRepository,
  {
    /** Returns the new version so callers can chain saves without a reload. */
    readonly save: (
      input: SaveGameInput,
    ) => Effect.Effect<GameVersion, VersionConflict | StorageError>
    readonly load: (
      gameId: GameId,
    ) => Effect.Effect<
      { readonly state: GameState; readonly version: GameVersion },
      GameNotFound | StorageError
    >
    /** The complete ordered event stream, decoded — the fold's input (§6). */
    readonly getEvents: (
      gameId: GameId,
    ) => Effect.Effect<ReadonlyArray<GameEvent>, GameNotFound | StorageError>
    /**
     * Persist a lobby (ADR-0019): rows are the lobby's authority — the event
     * log never contains lobby history, so this writes `games`
     * (`status 'lobby'`/`'abandoned'`) + `game_players` only, under the same
     * `games.version` guard as `save`. Membership rows mirror `lobby.members`
     * (join order = `seat_index`, compacted; absentees soft-deleted).
     */
    readonly saveLobby: (
      input: SaveLobbyInput,
    ) => Effect.Effect<GameVersion, VersionConflict | StorageError>
    /**
     * Load a lobby from rows. An `in_progress`/`completed` row projects to
     * `status: "started"` (members in seat order) so pre-game transitions can
     * refuse it as a pure domain decision; a never-dealt row is invisible to
     * `load`/`getEvents` (those fail `GameNotFound` — a lobby is not a game).
     */
    readonly loadLobby: (
      gameId: GameId,
    ) => Effect.Effect<
      { readonly lobby: Lobby; readonly version: GameVersion },
      GameNotFound | StorageError
    >
  }
>() {}
