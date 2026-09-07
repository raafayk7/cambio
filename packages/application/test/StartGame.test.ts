import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import {
  dealGame,
  decodeGameConfig,
  GameRepository,
  GameVersion,
  type Lobby,
  Timestamp,
  type UserId,
} from "@cambio/domain"
import { gid, uid, user } from "@cambio/domain/testing"
import { startGame } from "../src/use-cases/StartGame.js"
import {
  makeGameRepoStub,
  makeJournal,
  makePublisherStub,
  makeSettableClock,
  opsOf,
  seedStub,
} from "./support/stubs.js"

const config = decodeGameConfig({ slamWindowMs: 4000 })
const NOW = Timestamp.make(1_700_000_000_000)
const SEED = 424242

const seedLobby = (lobby: Lobby, expectedVersion = GameVersion.make(0)) =>
  GameRepository.pipe(
    Effect.flatMap((games) => games.saveLobby({ gameId: lobby.id, lobby, expectedVersion })),
  )

const layers = (
  journal: ReturnType<typeof makeJournal>,
  repo: ReturnType<typeof makeGameRepoStub>,
) =>
  Layer.mergeAll(
    repo.layer,
    makePublisherStub(journal).layer,
    makeSettableClock(NOW).layer,
    seedStub(SEED),
  )

describe("startGame (clause 4)", () => {
  it.effect(
    "any member starts: seats = join order, whole GameStarted batch in ONE save, then publish",
    () => {
      const journal = makeJournal()
      const repo = makeGameRepoStub(journal)
      const members = [user(0), user(1), user(2)]
      const seats = members.map((m) => m.id)
      return seedLobby({ id: gid(1), members, status: "open" }).pipe(
        Effect.map(() => journal.splice(0)),
        // uid(1), not the creator — no host concept.
        Effect.andThen(startGame({ gameId: gid(1), starterId: uid(1), config })),
        Effect.map((result) => {
          expect(result.state.players.map((p) => p.id)).toEqual(seats)
          expect(result.state.config).toEqual(config)
          expect(result.version).toBe(2) // the lobby's v1 consumed by the deal save
          expect(result.events.map((e) => e._tag)).toEqual(["GameStarted"])
          expect(opsOf(journal)).toEqual(["loadLobby", "save", "publishGame"])
          // Deterministic deal: stubbed seed + clock reproduce it exactly.
          const dealt = dealGame(seats, SEED, config, NOW)
          expect(dealt._tag).toBe("Right")
          if (dealt._tag === "Right") expect(result.state).toEqual(dealt.right[0])
        }),
        Effect.provide(layers(journal, repo)),
      )
    },
  )

  const refusal = (name: string, lobby: Lobby, starter: UserId, expectedTag: string) =>
    it.effect(`${name} ⇒ ${expectedTag}, nothing saved, nothing published`, () => {
      const journal = makeJournal()
      const repo = makeGameRepoStub(journal)
      return seedLobby(lobby).pipe(
        Effect.map(() => journal.splice(0)),
        Effect.andThen(
          startGame({ gameId: gid(1), starterId: starter, config }).pipe(Effect.either),
        ),
        Effect.map((result) => {
          expect(result._tag).toBe("Left")
          if (result._tag === "Left") expect(result.left._tag).toBe(expectedTag)
          expect(opsOf(journal).filter((op) => op !== "loadLobby")).toEqual([])
        }),
        Effect.provide(layers(journal, repo)),
      )
    })

  // Passed through from dealGame — the single source of the 2–4 rule.
  refusal(
    "a 1-member lobby",
    { id: gid(1), members: [user(0)], status: "open" },
    uid(0),
    "BadPlayerCount",
  )

  refusal(
    "a non-member starter",
    { id: gid(1), members: [user(0), user(1)], status: "open" },
    uid(2),
    "NotInLobby",
  )

  refusal(
    "an abandoned lobby",
    { id: gid(1), members: [], status: "abandoned" },
    uid(0),
    "LobbyNotJoinable",
  )

  it.effect("an already-started lobby cannot start again", () => {
    const journal = makeJournal()
    const repo = makeGameRepoStub(journal)
    const members = [user(0), user(1)]
    return seedLobby({ id: gid(1), members, status: "open" }).pipe(
      Effect.andThen(startGame({ gameId: gid(1), starterId: uid(0), config })),
      Effect.map(() => journal.splice(0)),
      Effect.andThen(startGame({ gameId: gid(1), starterId: uid(0), config }).pipe(Effect.either)),
      Effect.map((result) => {
        expect(result._tag).toBe("Left")
        if (result._tag === "Left") expect(result.left._tag).toBe("LobbyNotJoinable")
        expect(opsOf(journal).filter((op) => op !== "loadLobby")).toEqual([])
      }),
      Effect.provide(layers(journal, repo)),
    )
  })
})
