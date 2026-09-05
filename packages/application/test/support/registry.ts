import {
  type Command,
  decodeGameConfig,
  GameRepository,
  type GameId,
  type GameState,
  GameVersion,
  type Lobby,
  Timestamp,
} from "@cambio/domain"
import { legalCandidates, uid, user } from "@cambio/domain/testing"
import { Effect, Layer } from "effect"
import { RoomRegistry, RoomRegistryLive } from "../../src/room/RoomRegistry.js"
import {
  makeGameRepoStub,
  makeJournal,
  makePublisherStub,
  makeSettableClock,
  seedStub,
  usersStub,
} from "./stubs.js"

/**
 * Shared actor-test harness (extracted from RoomRegistry.test.ts for CAM-7,
 * backend plan decision 8) — the two-clock design lives here: the Ref-backed
 * ClockPort is the authority the engine sees; Effect's TestClock governs
 * `Effect.sleep` in the timer fiber. §6's "the process may have been asleep
 * at closesAt" is exactly the gap between them.
 *
 * Registry lifetime discipline: `RoomRegistryLive` is scoped, so EVERY
 * `Effect.provide(h.layer)` builds a fresh registry whose actors die when
 * that provide's scope closes. One provide = one process lifetime; a second
 * provide over the same repo stub IS the simulated restart.
 */

export const config = decodeGameConfig({ slamWindowMs: 4000 })
export const NOW = Timestamp.make(1_700_000_000_000)
export const SEED = 424242
export const KNOWN_USERS = [uid(0), uid(1), uid(2), uid(3), uid(4)]

export const makeHarness = () => {
  const journal = makeJournal()
  const repo = makeGameRepoStub(journal)
  const clock = makeSettableClock(NOW)
  const deps = Layer.mergeAll(
    repo.layer,
    makePublisherStub(journal).layer,
    clock.layer,
    seedStub(SEED),
    usersStub(KNOWN_USERS),
  )
  const layer = Layer.merge(RoomRegistryLive.pipe(Layer.provide(deps)), deps)
  return { journal, repo, clock, deps, layer }
}
export type Harness = ReturnType<typeof makeHarness>

/**
 * Deterministic rule-agnostic command chooser: preference order only, all
 * arguments from `legalCandidates` (the single source of legality — no rule
 * priors invented here).
 */
const PREFERENCE: ReadonlyArray<Command["_tag"]> = [
  "DiscardHeld",
  "DrawFromDeck",
  "PowerPeek",
  "PowerSwap",
  "SwapHeld",
  "TakeDiscard",
]
export const choose = (state: GameState, now: Timestamp): Command => {
  const candidates = legalCandidates(state, now)
  for (const tag of PREFERENCE) {
    const found = candidates.find((c) => c._tag === tag)
    if (found !== undefined) return found
  }
  throw new Error(`no preferred candidate in phase ${state.phase._tag}`)
}

/** Seed a lobby row directly (createLobby-the-use-case is outside the registry). */
export const seedLobby = (lobby: Lobby) =>
  GameRepository.pipe(
    Effect.flatMap((games) =>
      games.saveLobby({ gameId: lobby.id, lobby, expectedVersion: GameVersion.make(0) }),
    ),
  )

/** Start a 2-player game through the registry and drive it into SlamWindow. */
export const driveToSlamWindow = (gameId: GameId) =>
  Effect.gen(function* () {
    const registry = yield* RoomRegistry
    yield* seedLobby({ id: gameId, members: [user(0), user(1)], status: "open" })
    const started = yield* registry.start(gameId, { starterId: uid(0), config })
    let state = started.state
    for (let i = 0; i < 60 && state.phase._tag !== "SlamWindow"; i++) {
      const result = yield* registry.execute(gameId, choose(state, NOW))
      state = result.state
    }
    if (state.phase._tag !== "SlamWindow") throw new Error("never reached SlamWindow")
    return state
  })
