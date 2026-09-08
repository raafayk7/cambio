import { Effect } from "effect"
import {
  applyCommand,
  type Command,
  type GameError,
  type GameId,
  type GameNotFound,
  GameRepository,
  type GameState,
  type GameVersion,
  type StorageError,
  type VersionConflict,
} from "@cambio/domain"
import { ClockPort } from "../ports/Clock.js"
import { RealtimePublisherPort } from "../ports/RealtimePublisher.js"
import { type GameAdvanced } from "./StartGame.js"

/**
 * Execute one in-game command (root plan clause 5): load → pure engine
 * decision → whole-batch persist → publish. One use case for every command
 * variant — the domain `Command` union already encodes the verbs (root plan
 * Decision Log). An illegal command yields its typed `GameError` and
 * persists/publishes nothing; the engine's whole event batch goes into ONE
 * save (the promise CAM-3's fold and `final_score` write depend on).
 */

export interface ExecuteGameCommandInput {
  readonly gameId: GameId
  readonly command: Command
  /**
   * The actor's snapshot (ADR-0020's cached state); absent ⇒ load from the
   * repository — what any non-actor caller gets. Nothing else differs.
   */
  readonly cached?: { readonly state: GameState; readonly version: GameVersion }
}

export const executeGameCommand = (
  input: ExecuteGameCommandInput,
): Effect.Effect<
  GameAdvanced,
  GameError | GameNotFound | VersionConflict | StorageError,
  GameRepository | ClockPort | RealtimePublisherPort
> =>
  Effect.gen(function* () {
    const games = yield* GameRepository
    const clock = yield* ClockPort
    const publisher = yield* RealtimePublisherPort

    const { state, version } = input.cached ?? (yield* games.load(input.gameId))
    const now = yield* clock.now
    const [next, events] = yield* applyCommand(state, input.command, now)
    const newVersion = yield* games.save({
      gameId: input.gameId,
      state: next,
      expectedVersion: version,
      newEvents: events,
      at: now,
    })
    yield* publisher.publishGame(input.gameId, next, events)
    return { state: next, version: newVersion, events }
  })
