import { Effect, Layer, Ref } from "effect"
import {
  GameNotFound,
  GameRepository,
  GameVersion,
  Timestamp,
  UserNotFound,
  UserRepository,
  VersionConflict,
  type GameEvent,
  type GameId,
  type GameState,
  type Lobby,
  type UserId,
} from "@cambio/domain"
import { ClockPort } from "../../src/ports/Clock.js"
import { IdGeneratorPort } from "../../src/ports/IdGenerator.js"
import { RealtimePublisherPort } from "../../src/ports/RealtimePublisher.js"
import { SeedPort } from "../../src/ports/Seed.js"

/**
 * The shared stub kit for CAM-5's stub-layer suites (root plan clause 12).
 *
 * One ordered journal is shared by the repository and publisher stubs —
 * ordering assertions (persist before publish, nothing persisted on refusal)
 * read the journal, not call counts.
 */

export type JournalEntry =
  | { readonly op: "save"; readonly gameId: GameId; readonly events: ReadonlyArray<GameEvent> }
  | { readonly op: "saveLobby"; readonly gameId: GameId; readonly lobby: Lobby }
  | { readonly op: "load"; readonly gameId: GameId }
  | { readonly op: "loadLobby"; readonly gameId: GameId }
  | {
      readonly op: "publishGame"
      readonly gameId: GameId
      readonly state: GameState
      readonly events: ReadonlyArray<GameEvent>
    }
  | { readonly op: "publishLobby"; readonly gameId: GameId; readonly lobby: Lobby }

export const makeJournal = (): Array<JournalEntry> => []

/** The ops only, for compact ordering assertions. */
export const opsOf = (journal: ReadonlyArray<JournalEntry>): ReadonlyArray<string> =>
  journal.map((e) => e.op)

interface GameRow {
  version: GameVersion
  lobby: Lobby | null
  state: GameState | null
  events: Array<GameEvent>
}

/**
 * In-memory `GameRepository` honoring the real version guards for both
 * `save` and `saveLobby` — the actor suites depend on genuine
 * `VersionConflict`s. One row per gameId, exactly like the `games` table:
 * a `save` over a lobby row is the lobby→game transition, after which
 * `loadLobby` projects `status: "started"` (seat order = players order) and
 * `load`/`getEvents` see a game. Undealt rows are invisible to
 * `load`/`getEvents` (`GameNotFound`), mirroring the adapter's ADR-0019
 * guard.
 */
export const makeGameRepoStub = (journal: Array<JournalEntry>) => {
  const rows = new Map<string, GameRow>()

  const guard = (gameId: GameId, expected: GameVersion): Effect.Effect<GameRow, VersionConflict> => {
    const row = rows.get(gameId)
    if (expected === 0) {
      if (row !== undefined) {
        return Effect.fail(new VersionConflict({ gameId, expected, actual: row.version }))
      }
      const fresh: GameRow = { version: GameVersion.make(0), lobby: null, state: null, events: [] }
      rows.set(gameId, fresh)
      return Effect.succeed(fresh)
    }
    if (row === undefined) {
      return Effect.fail(new VersionConflict({ gameId, expected, actual: null }))
    }
    if (row.version !== expected) {
      return Effect.fail(new VersionConflict({ gameId, expected, actual: row.version }))
    }
    return Effect.succeed(row)
  }

  const layer = Layer.succeed(GameRepository, {
    save: (input) =>
      guard(input.gameId, input.expectedVersion).pipe(
        Effect.map((row) => {
          row.version = GameVersion.make(input.expectedVersion + 1)
          row.state = input.state
          row.events.push(...input.newEvents)
          journal.push({ op: "save", gameId: input.gameId, events: input.newEvents })
          return row.version
        }),
      ),
    saveLobby: (input) =>
      input.lobby.status === "started"
        ? Effect.die("saveLobby cannot write status 'started' (ADR-0019)")
        : guard(input.gameId, input.expectedVersion).pipe(
            Effect.map((row) => {
              row.version = GameVersion.make(input.expectedVersion + 1)
              row.lobby = input.lobby
              journal.push({ op: "saveLobby", gameId: input.gameId, lobby: input.lobby })
              return row.version
            }),
          ),
    load: (gameId) => {
      journal.push({ op: "load", gameId })
      const row = rows.get(gameId)
      return row?.state == null
        ? Effect.fail(new GameNotFound({ gameId }))
        : Effect.succeed({ state: row.state, version: row.version })
    },
    getEvents: (gameId) => {
      const row = rows.get(gameId)
      return row?.state == null
        ? Effect.fail(new GameNotFound({ gameId }))
        : Effect.succeed([...row.events])
    },
    loadLobby: (gameId) => {
      journal.push({ op: "loadLobby", gameId })
      const row = rows.get(gameId)
      if (row === undefined) return Effect.fail(new GameNotFound({ gameId }))
      if (row.state !== null) {
        const lobby: Lobby = {
          id: gameId,
          members: row.state.players.map((p) => p.id),
          status: "started",
        }
        return Effect.succeed({ lobby, version: row.version })
      }
      if (row.lobby === null) return Effect.fail(new GameNotFound({ gameId }))
      return Effect.succeed({ lobby: row.lobby, version: row.version })
    },
  })

  return {
    rows,
    layer,
    /** Mutate the stored version behind a caller's back — conflict tests. */
    poke: (gameId: GameId, version: number): void => {
      const row = rows.get(gameId)
      if (row === undefined) throw new Error(`poke: no row for ${gameId}`)
      row.version = GameVersion.make(version)
    },
  }
}

/** Recording publisher sharing the repo's journal (clause 7 ordering). */
export const makePublisherStub = (journal: Array<JournalEntry>) => {
  const layer = Layer.succeed(RealtimePublisherPort, {
    publishGame: (gameId, state, events) =>
      Effect.sync(() => {
        journal.push({ op: "publishGame", gameId, state, events })
      }),
    publishLobby: (gameId, lobby) =>
      Effect.sync(() => {
        journal.push({ op: "publishLobby", gameId, lobby })
      }),
  })
  return { layer }
}

/**
 * Settable authority clock: a `Ref`-backed `ClockPort`. Distinct from the
 * TestClock that governs `Effect.sleep` — §6's "the process may have been
 * asleep at closesAt" is exactly the gap between the two.
 */
export const makeSettableClock = (start: Timestamp) => {
  const ref = Effect.runSync(Ref.make<Timestamp>(start))
  return {
    layer: Layer.succeed(ClockPort, { now: Ref.get(ref) }),
    set: (t: Timestamp): void => Effect.runSync(Ref.set(ref, t)),
  }
}

export const seedStub = (seed: number) =>
  Layer.succeed(SeedPort, { nextSeed: Effect.succeed(seed) })

/** Sequential GameIds from the shared `gid` fixture shape. */
export const makeIdsStub = (mint: (n: number) => GameId) => {
  let n = 0
  return Layer.succeed(IdGeneratorPort, {
    nextUserId: Effect.die("nextUserId unused in this suite"),
    nextGameId: Effect.sync(() => mint(n++)),
  })
}

/** Every listed user exists (name `u<i>`); anyone else is UserNotFound. */
export const usersStub = (existing: ReadonlyArray<UserId>) =>
  Layer.succeed(UserRepository, {
    create: () => Effect.die("create unused in this suite"),
    findById: (userId: UserId) =>
      existing.includes(userId)
        ? Effect.succeed({ id: userId, name: `u${existing.indexOf(userId)}` })
        : Effect.fail(new UserNotFound({ userId })),
  })
