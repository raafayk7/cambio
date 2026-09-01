import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import {
  type Command,
  dealGame,
  decodeGameConfig,
  GameRepository,
  GameVersion,
  type GameState,
  Timestamp,
} from "@cambio/domain"
import { gid, ts, uid } from "@cambio/domain/testing"
import { executeGameCommand } from "../src/use-cases/ExecuteGameCommand.js"
import {
  makeGameRepoStub,
  makeJournal,
  makePublisherStub,
  makeSettableClock,
  opsOf,
} from "./support/stubs.js"

const config = decodeGameConfig({ slamWindowMs: 4000 })
const NOW = Timestamp.make(1_700_000_000_000)
const members = [uid(0), uid(1)]

/** A freshly dealt 2-player game — phase AwaitingDraw(uid(0)). */
const dealt = (): GameState => {
  const result = dealGame(members, 7, config, ts(0))
  if (result._tag === "Left") throw new Error("deal failed")
  return result.right[0]
}

const draw = (playerId: ReturnType<typeof uid>): Command => ({ _tag: "DrawFromDeck", playerId })

const seedGame = (state: GameState) =>
  GameRepository.pipe(
    Effect.flatMap((games) =>
      games.save({
        gameId: gid(1),
        state,
        expectedVersion: GameVersion.make(0),
        newEvents: [],
        at: ts(0),
      }),
    ),
  )

const layers = (journal: ReturnType<typeof makeJournal>, repo: ReturnType<typeof makeGameRepoStub>) =>
  Layer.mergeAll(repo.layer, makePublisherStub(journal).layer, makeSettableClock(NOW).layer)

describe("executeGameCommand (clauses 5–7)", () => {
  it.effect("a legal command: whole batch in ONE save, then ONE publish with the post-command state", () => {
    const journal = makeJournal()
    const repo = makeGameRepoStub(journal)
    const state = dealt()
    return seedGame(state).pipe(
      Effect.map(() => journal.splice(0)),
      Effect.andThen(executeGameCommand({ gameId: gid(1), command: draw(uid(0)) })),
      Effect.map((result) => {
        expect(opsOf(journal)).toEqual(["load", "save", "publishGame"])
        expect(result.state.phase._tag).toBe("HoldingCard")
        expect(result.version).toBe(2)
        expect(result.events.length).toBeGreaterThan(0)
        // The publish carries exactly the persisted batch and the new state.
        expect(journal[2]).toMatchObject({ op: "publishGame", state: result.state })
        if (journal[2]!.op === "publishGame") expect(journal[2].events).toEqual(result.events)
        if (journal[1]!.op === "save") expect(journal[1].events).toEqual(result.events)
      }),
      Effect.provide(layers(journal, repo)),
    )
  })

  it.effect("an illegal command is its typed GameError; nothing persisted, nothing published", () => {
    const journal = makeJournal()
    const repo = makeGameRepoStub(journal)
    return seedGame(dealt()).pipe(
      Effect.map(() => journal.splice(0)),
      Effect.andThen(
        executeGameCommand({ gameId: gid(1), command: draw(uid(1)) }).pipe(Effect.either),
      ),
      Effect.map((result) => {
        expect(result._tag).toBe("Left")
        if (result._tag === "Left") expect(result.left._tag).toBe("NotYourTurn")
        expect(opsOf(journal)).toEqual(["load"])
      }),
      Effect.provide(layers(journal, repo)),
    )
  })

  it.effect("a stale cached version surfaces the repo's VersionConflict unchanged; no publish", () => {
    const journal = makeJournal()
    const repo = makeGameRepoStub(journal)
    const state = dealt()
    return seedGame(state).pipe(
      Effect.map(() => journal.splice(0)),
      Effect.andThen(
        executeGameCommand({
          gameId: gid(1),
          command: draw(uid(0)),
          cached: { state, version: GameVersion.make(9) }, // stale — live is 1
        }).pipe(Effect.either),
      ),
      Effect.map((result) => {
        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          expect(result.left._tag).toBe("VersionConflict")
          if (result.left._tag === "VersionConflict") {
            expect(result.left.expected).toBe(9)
            expect(result.left.actual).toBe(1)
          }
        }
        expect(opsOf(journal)).not.toContain("publishGame")
      }),
      Effect.provide(layers(journal, repo)),
    )
  })

  it.effect("cached present ⇒ no load; absent ⇒ exactly one load (decision 10)", () => {
    const journal = makeJournal()
    const repo = makeGameRepoStub(journal)
    const state = dealt()
    return seedGame(state).pipe(
      Effect.map(() => journal.splice(0)),
      Effect.andThen(
        executeGameCommand({
          gameId: gid(1),
          command: draw(uid(0)),
          cached: { state, version: GameVersion.make(1) },
        }),
      ),
      Effect.map(() => {
        expect(opsOf(journal)).toEqual(["save", "publishGame"])
      }),
      Effect.provide(layers(journal, repo)),
    )
  })
})
