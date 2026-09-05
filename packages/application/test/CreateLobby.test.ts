import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { gid, user } from "@cambio/domain/testing"
import { createLobby } from "../src/use-cases/CreateLobby.js"
import {
  makeGameRepoStub,
  makeIdsStub,
  makeJournal,
  makePublisherStub,
  opsOf,
} from "./support/stubs.js"

describe("createLobby (clause 1)", () => {
  it.effect(
    "persists a one-member open lobby under the minted id, then publishes (clauses 1, 7)",
    () => {
      const journal = makeJournal()
      const repo = makeGameRepoStub(journal)
      return createLobby({ creator: user(0) }).pipe(
        Effect.map((result) => {
          expect(result.lobby).toEqual({ id: gid(0), members: [user(0)], status: "open" })
          expect(result.version).toBe(1)
          // Persist before publish, and nothing else.
          expect(opsOf(journal)).toEqual(["saveLobby", "publishLobby"])
          // C3: the publish carries the just-persisted version — the one the
          // use case returns (kills a newVersion→version swap in the publish).
          expect(journal[1]).toMatchObject({
            op: "publishLobby",
            gameId: gid(0),
            version: result.version,
          })
        }),
        Effect.provide(
          Layer.mergeAll(makeIdsStub(gid), repo.layer, makePublisherStub(journal).layer),
        ),
      )
    },
  )
})
