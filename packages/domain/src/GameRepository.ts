import { Context, Data, type Effect } from "effect"
import { type GameEvent } from "./GameEvent.js"
import { type GameState } from "./GameState.js"
import { type GameId, type GameVersion, type Timestamp } from "./Ids.js"

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
  }
>() {}
