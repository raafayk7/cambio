import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { applyCommand, Timestamp } from "@cambio/domain"
import { gid, legalCandidates, uid } from "@cambio/domain/testing"
import { RealtimePublisherPort } from "../src/ports/RealtimePublisher.js"
import { RoomRegistry, RoomRegistryLive } from "../src/room/RoomRegistry.js"
import { choose, driveToSlamWindow, makeHarness, NOW, SEED } from "./support/registry.js"
import {
  makeGameRepoStub,
  makeJournal,
  makeSettableClock,
  opsOf,
  seedStub,
  usersStub,
} from "./support/stubs.js"

/**
 * CAM-7 — slam timing through the actor (root plan C1.3, C2.3, C4.2).
 *
 * Everything here leans on the registry harness's two-clock design: the
 * settable ClockPort is the lateness authority; TestClock (never advanced in
 * this file) keeps the timer fiber permanently asleep, so every close that
 * happens is the LAZY path — exactly §6's sleeping-server world.
 */
describe("SlamTiming (CAM-7 C1.3, C2.3, C4.2)", () => {
  it.effect(
    "a late Slam is SlamTooLate, never WrongPhase — the lazy close is skipped for slams (C1.3)",
    () => {
      const h = makeHarness()
      return Effect.gen(function* () {
        const registry = yield* RoomRegistry
        const state = yield* driveToSlamWindow(gid(1))
        if (state.phase._tag !== "SlamWindow") throw new Error("unreachable")
        const closesAt = state.phase.closesAt

        // Sanity: the same attempt is on offer while the window is open.
        const slams = legalCandidates(state, NOW).filter((c) => c._tag === "Slam")
        expect(slams.length).toBeGreaterThan(0)

        // The boundary itself is late: the window is half-open [open, closesAt).
        yield* Effect.sync(() => h.clock.set(closesAt))
        h.journal.splice(0)

        const late = yield* registry.execute(gid(1), slams[0]!).pipe(Effect.either)
        expect(late._tag).toBe("Left")
        if (late._tag === "Left") {
          // The phase is still SlamWindow (no close was ever processed): a
          // WrongPhase here would mean the actor closed the window before
          // judging the slam — the `:188` exemption is what's under test.
          expect(late.left._tag).toBe("SlamTooLate")
        }
        // The refused slam persisted and published nothing.
        expect(opsOf(h.journal)).toEqual([])
      }).pipe(Effect.provide(h.layer))
    },
  )

  it.effect(
    "lateness is read per envelope at processing time: the clock crossing closesAt mid-race fails only the later slam (C2.3)",
    () => {
      // A one-shot hook on the publisher advances the authority clock — the
      // publish happens inside envelope A's processing (after A's engine
      // decision, before envelope B is dequeued), so the crossing lands
      // exactly between the two lateness reads at ExecuteGameCommand's
      // per-envelope `clock.now`.
      const journal = makeJournal()
      const repo = makeGameRepoStub(journal)
      const clock = makeSettableClock(NOW)
      let advanceTo: number | null = null
      const hookedPublisher = Layer.succeed(RealtimePublisherPort, {
        publishGame: (gameId, state, events) =>
          Effect.sync(() => {
            journal.push({ op: "publishGame", gameId, state, events })
            if (advanceTo !== null) {
              clock.set(Timestamp.make(advanceTo))
              advanceTo = null
            }
          }),
        publishLobby: (gameId, lobby) =>
          Effect.sync(() => {
            journal.push({ op: "publishLobby", gameId, lobby })
          }),
      })
      const deps = Layer.mergeAll(
        repo.layer,
        hookedPublisher,
        clock.layer,
        seedStub(SEED),
        usersStub([uid(0), uid(1), uid(2), uid(3), uid(4)]),
      )
      const layer = Layer.merge(RoomRegistryLive.pipe(Layer.provide(deps)), deps)

      return Effect.gen(function* () {
        const registry = yield* RoomRegistry
        const state = yield* driveToSlamWindow(gid(1))
        if (state.phase._tag !== "SlamWindow") throw new Error("unreachable")
        const closesAt = state.phase.closesAt
        const lastInstant = Timestamp.make(closesAt - 1)
        yield* Effect.sync(() => clock.set(lastInstant))

        // Two attempts, both submitted while the window is open (C2.2 allows
        // any pairing, same player included). B's target validity is
        // irrelevant: lateness is checked before slot validation.
        const slams = legalCandidates(state, lastInstant).filter((c) => c._tag === "Slam")
        expect(slams.length).toBeGreaterThan(0)
        const slamA = slams[0]!
        const slamB = slams[1] ?? slamA

        journal.splice(0)
        advanceTo = closesAt // armed: fires inside A's publish

        const replyA = yield* registry.execute(gid(1), slamA)
        const pureA = applyCommand(state, slamA, lastInstant)
        if (pureA._tag === "Left") throw new Error("slam A should be legal in-window")
        expect(replyA.state).toEqual(pureA.right[0])
        expect(replyA.events).toEqual(pureA.right[1])

        const replyB = yield* registry.execute(gid(1), slamB).pipe(Effect.either)
        expect(replyB._tag).toBe("Left")
        if (replyB._tag === "Left") expect(replyB.left._tag).toBe("SlamTooLate")

        // Exactly A's batch landed; B left no trace.
        expect(opsOf(journal)).toEqual(["save", "publishGame"])
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect(
    "restart mid-window: the rebuilt actor arms no timer, rejects the late slam, and closes lazily on the next command (C4.2)",
    () => {
      const h = makeHarness()
      // Lifetime one: drive into the window, then the provide-scope closes —
      // the process death takes the actor AND its armed timer with it.
      const lifetimeOne = driveToSlamWindow(gid(1)).pipe(Effect.provide(h.layer))

      return Effect.gen(function* () {
        const state = yield* lifetimeOne
        if (state.phase._tag !== "SlamWindow") throw new Error("unreachable")
        const closesAt = state.phase.closesAt
        const past = Timestamp.make(closesAt + 1)

        // The window expires while nothing is alive.
        yield* Effect.sync(() => h.clock.set(past))

        // A slam that was legal in-window, submitted to the rebuilt world.
        const lateSlam = legalCandidates(state, NOW).find((c) => c._tag === "Slam")
        expect(lateSlam).toBeDefined()
        // The first legal post-close command, computed pure.
        const closed = applyCommand(state, { _tag: "CloseSlamWindow" }, past)
        if (closed._tag === "Left") throw new Error("close should be legal past closesAt")
        const probe = choose(closed.right[0], past)
        const pureProbe = applyCommand(closed.right[0], probe, past)
        if (pureProbe._tag === "Left") throw new Error("pure probe should be legal")

        h.journal.splice(0)
        // Lifetime two: a fresh registry over the same persisted rows. No
        // TestClock.adjust anywhere in this test — no timer may exist here
        // (bootstrap arms none; that absence is what forces the lazy path).
        yield* Effect.gen(function* () {
          const registry = yield* RoomRegistry

          const late = yield* registry.execute(gid(1), lateSlam!).pipe(Effect.either)
          expect(late._tag).toBe("Left")
          if (late._tag === "Left") expect(late.left._tag).toBe("SlamTooLate")
          // Bootstrap loaded the persisted SlamWindow; the refusal saved nothing.
          expect(opsOf(h.journal)).toEqual(["load"])

          const reply = yield* registry.execute(gid(1), probe)
          expect(reply.state).toEqual(pureProbe.right[0])
          expect(reply.events).toEqual(pureProbe.right[1])
        }).pipe(Effect.provide(h.layer))

        // Load, then the lazy close as its own persisted+published batch,
        // then the command's batch — §6's recovery story end to end.
        expect(opsOf(h.journal)).toEqual(["load", "save", "publishGame", "save", "publishGame"])
        const closeBatch = h.journal[1]!
        if (closeBatch.op !== "save") throw new Error("unreachable")
        expect(closeBatch.events.map((e) => e._tag)).toEqual(["SlamWindowClosed", "TurnAdvanced"])
      }).pipe(Effect.provide(h.deps))
    },
  )
})
