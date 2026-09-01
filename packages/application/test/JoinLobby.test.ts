import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import {
  createLobby as newLobby,
  dealGame,
  decodeGameConfig,
  GameRepository,
  GameVersion,
  type Lobby,
  type UserId,
} from "@cambio/domain"
import { gid, ts, uid } from "@cambio/domain/testing"
import { joinLobby } from "../src/use-cases/JoinLobby.js"
import {
  makeGameRepoStub,
  makeJournal,
  makePublisherStub,
  opsOf,
  usersStub,
} from "./support/stubs.js"

const config = decodeGameConfig({ slamWindowMs: 4000 })
const KNOWN_USERS = [uid(0), uid(1), uid(2), uid(3), uid(4), uid(5)]

/** Seed the stub repo, then wipe the journal so assertions see only the use case. */
const seeded = (
  journal: ReturnType<typeof makeJournal>,
  seed: Effect.Effect<void, unknown, GameRepository>,
) => seed.pipe(Effect.map(() => journal.splice(0)))

const seedLobby = (lobby: Lobby) =>
  GameRepository.pipe(
    Effect.flatMap((games) =>
      games.saveLobby({ gameId: lobby.id, lobby, expectedVersion: GameVersion.make(0) }),
    ),
  )

const layers = (
  journal: ReturnType<typeof makeJournal>,
  repo: ReturnType<typeof makeGameRepoStub>,
) => Layer.mergeAll(repo.layer, makePublisherStub(journal).layer, usersStub(KNOWN_USERS))

describe("joinLobby (clause 2)", () => {
  it.effect("appends in join order, saves at the loaded version, publishes after persist", () => {
    const journal = makeJournal()
    const repo = makeGameRepoStub(journal)
    return seeded(journal, seedLobby(newLobby(gid(1), uid(0)))).pipe(
      Effect.andThen(joinLobby({ gameId: gid(1), userId: uid(1) })),
      Effect.map((result) => {
        expect(result.lobby.members).toEqual([uid(0), uid(1)])
        expect(result.version).toBe(2)
        expect(opsOf(journal)).toEqual(["loadLobby", "saveLobby", "publishLobby"])
      }),
      Effect.provide(layers(journal, repo)),
    )
  })

  const refusal = (
    name: string,
    seed: Effect.Effect<void, unknown, GameRepository>,
    joiner: UserId,
    expectedTag: string,
    targetGame = gid(1),
  ) =>
    it.effect(`${name} ⇒ ${expectedTag}, nothing saved, nothing published`, () => {
      const journal = makeJournal()
      const repo = makeGameRepoStub(journal)
      return seeded(journal, seed).pipe(
        Effect.andThen(joinLobby({ gameId: targetGame, userId: joiner }).pipe(Effect.either)),
        Effect.map((result) => {
          expect(result._tag).toBe("Left")
          if (result._tag === "Left") expect(result.left._tag).toBe(expectedTag)
          expect(
            opsOf(journal).filter((op) => op === "saveLobby" || op === "publishLobby"),
          ).toEqual([])
        }),
        Effect.provide(layers(journal, repo)),
      )
    })

  refusal(
    "a full lobby",
    seedLobby({ id: gid(1), members: [uid(0), uid(1), uid(2), uid(3), uid(4)], status: "open" }),
    uid(5),
    "LobbyFull",
  )

  refusal("joining twice", seedLobby(newLobby(gid(1), uid(1))), uid(1), "AlreadyInLobby")

  refusal(
    "an abandoned lobby",
    seedLobby({ id: gid(1), members: [], status: "abandoned" }),
    uid(1),
    "LobbyNotJoinable",
  )

  refusal(
    "a started lobby",
    GameRepository.pipe(
      Effect.flatMap((games) =>
        Effect.gen(function* () {
          const dealt = dealGame([uid(0), uid(1)], 7, config, ts(0))
          if (dealt._tag === "Left") throw new Error("deal failed")
          const [state, events] = dealt.right
          yield* games.save({
            gameId: gid(1),
            state,
            expectedVersion: GameVersion.make(0),
            newEvents: events,
            at: ts(0),
          })
        }),
      ),
    ),
    uid(2),
    "LobbyNotJoinable",
  )

  refusal("a nonexistent game", Effect.void, uid(1), "GameNotFound", gid(9))

  refusal(
    "an unknown user",
    seedLobby(newLobby(gid(1), uid(0))),
    "00000000-0000-4000-8000-00000000beef" as UserId,
    "UserNotFound",
  )
})
