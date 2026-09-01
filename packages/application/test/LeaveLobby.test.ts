import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { GameRepository, GameVersion, type Lobby } from "@cambio/domain"
import { gid, uid } from "@cambio/domain/testing"
import { leaveLobby } from "../src/use-cases/LeaveLobby.js"
import { makeGameRepoStub, makeJournal, makePublisherStub, opsOf } from "./support/stubs.js"

const seedLobby = (lobby: Lobby) =>
  GameRepository.pipe(
    Effect.flatMap((games) =>
      games.saveLobby({ gameId: lobby.id, lobby, expectedVersion: GameVersion.make(0) }),
    ),
  )

describe("leaveLobby (clause 3)", () => {
  it.effect("removes the member, preserving order, and publishes after persist", () => {
    const journal = makeJournal()
    const repo = makeGameRepoStub(journal)
    return seedLobby({ id: gid(1), members: [uid(0), uid(1), uid(2)], status: "open" }).pipe(
      Effect.map(() => journal.splice(0)),
      Effect.andThen(leaveLobby({ gameId: gid(1), userId: uid(1) })),
      Effect.map((result) => {
        expect(result.lobby.members).toEqual([uid(0), uid(2)])
        expect(result.lobby.status).toBe("open")
        expect(opsOf(journal)).toEqual(["loadLobby", "saveLobby", "publishLobby"])
      }),
      Effect.provide(Layer.mergeAll(repo.layer, makePublisherStub(journal).layer)),
    )
  })

  it.effect("leaving when not a member is NotInLobby; nothing saved or published", () => {
    const journal = makeJournal()
    const repo = makeGameRepoStub(journal)
    return seedLobby({ id: gid(1), members: [uid(0)], status: "open" }).pipe(
      Effect.map(() => journal.splice(0)),
      Effect.andThen(leaveLobby({ gameId: gid(1), userId: uid(1) }).pipe(Effect.either)),
      Effect.map((result) => {
        expect(result._tag).toBe("Left")
        if (result._tag === "Left") expect(result.left._tag).toBe("NotInLobby")
        expect(opsOf(journal)).toEqual(["loadLobby"])
      }),
      Effect.provide(Layer.mergeAll(repo.layer, makePublisherStub(journal).layer)),
    )
  })

  it.effect("the last member leaving saves the abandonment AND still publishes it", () => {
    const journal = makeJournal()
    const repo = makeGameRepoStub(journal)
    return seedLobby({ id: gid(1), members: [uid(0)], status: "open" }).pipe(
      Effect.map(() => journal.splice(0)),
      Effect.andThen(leaveLobby({ gameId: gid(1), userId: uid(0) })),
      Effect.map((result) => {
        expect(result.lobby).toEqual({ id: gid(1), members: [], status: "abandoned" })
        expect(opsOf(journal)).toEqual(["loadLobby", "saveLobby", "publishLobby"])
        expect(journal[2]).toMatchObject({
          op: "publishLobby",
          lobby: { status: "abandoned" },
        })
      }),
      Effect.provide(Layer.mergeAll(repo.layer, makePublisherStub(journal).layer)),
    )
  })
})
