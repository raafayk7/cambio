import { Effect } from "effect"
import {
  dealGame,
  type GameConfig,
  type GameError,
  type GameEvent,
  type GameId,
  type GameNotFound,
  GameRepository,
  type GameState,
  type GameVersion,
  type LobbyNotJoinable,
  type NotInLobby,
  startSeats,
  type StorageError,
  type UserId,
  type VersionConflict,
} from "@cambio/domain"
import { ClockPort } from "../ports/Clock.js"
import { RealtimePublisherPort } from "../ports/RealtimePublisher.js"
import { SeedPort } from "../ports/Seed.js"

/**
 * Start the game (root plan clause 4): any current member may start — no
 * host concept. Seats are the lobby's join order; the deal's seed comes from
 * `SeedPort` and `now` from `ClockPort`; the full `GameStarted` batch is
 * persisted in ONE save guarded by the lobby's current version (the
 * lobby→game transition, ADR-0019 — after it, seq 0 is `GameStarted`).
 * `dealGame` owns the 2–5 player rule (`BadPlayerCount`); the lobby model
 * deliberately doesn't duplicate it.
 *
 * `GameConfig` is a plain input — presentation assembles it from AppConfig
 * (CAM-6); a static value is not a capability, so no port.
 */

export interface StartGameInput {
  readonly gameId: GameId
  readonly starterId: UserId
  readonly config: GameConfig
}

/**
 * **Hidden-information warning (§5):** everything in here is full truth —
 * `state` carries every hand, the deck order, and the PRNG state; `events`
 * carry card identities. This is server-side plumbing only, exactly like
 * what crosses `RealtimePublisherPort`: nothing from a `GameAdvanced` may
 * reach a client unprojected. Routes reply with
 * `{view: viewFor(caller, state), version}` and never serialize this shape
 * (root plan C6.1).
 */
export interface GameAdvanced {
  readonly state: GameState
  readonly version: GameVersion
  readonly events: ReadonlyArray<GameEvent>
}

export const startGame = (
  input: StartGameInput,
): Effect.Effect<
  GameAdvanced,
  GameNotFound | NotInLobby | LobbyNotJoinable | GameError | VersionConflict | StorageError,
  GameRepository | ClockPort | SeedPort | RealtimePublisherPort
> =>
  Effect.gen(function* () {
    const games = yield* GameRepository
    const clock = yield* ClockPort
    const seeds = yield* SeedPort
    const publisher = yield* RealtimePublisherPort

    const { lobby, version } = yield* games.loadLobby(input.gameId)
    const seatOrder = yield* startSeats(lobby, input.starterId)
    const seed = yield* seeds.nextSeed
    const now = yield* clock.now
    const [state, events] = yield* dealGame(seatOrder, seed, input.config, now)
    const newVersion = yield* games.save({
      gameId: input.gameId,
      state,
      expectedVersion: version,
      newEvents: events,
      at: now,
    })
    yield* publisher.publishGame(input.gameId, state, events)
    return { state, version: newVersion, events }
  })
