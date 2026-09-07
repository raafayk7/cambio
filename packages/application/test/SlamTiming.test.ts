import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Exit, Fiber, Layer } from "effect"
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
 * Two-clock design: the settable ClockPort is the lateness authority;
 * TestClock (never advanced in this file) governs the timer fiber's sleep.
 * One wrinkle the fix cycle surfaced: `manageTimer` runs after EVERY
 * envelope, and once the window is past due it arms `sleep(0)` — which
 * fires even under TestClock. So after any refusal of a LATE slam, a close
 * may land at any moment via that zero-duration timer; assertions below are
 * written race-free against that (the journal reads identically whether the
 * timer or the lazy path closes — ADR-0020's equivalence).
 */

/** Event tags a slam attempt can persist — for "the refusal left no trace". */
const SLAM_OUTCOME_TAGS: ReadonlySet<string> = new Set([
  "SlamSucceeded",
  "SlamFailed",
  "PenaltyDrawn",
  "CardGivenFromHand",
  "CardGivenFromDeck",
  "DrawSkipped",
])
const expectNoSlamPersisted = (journal: ReturnType<typeof makeJournal>, context: string) => {
  for (const entry of journal) {
    if (entry.op === "save" || entry.op === "publishGame") {
      expect(
        entry.events.map((e) => e._tag).filter((t) => SLAM_OUTCOME_TAGS.has(t)),
        `${context}: refused slam must persist nothing`,
      ).toEqual([])
    }
  }
}
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
          // The phase is still SlamWindow (no close was processed before the
          // slam was judged): a WrongPhase here would mean the actor closed
          // the window first — the lazy-close exemption is what's under test.
          expect(late.left._tag).toBe("SlamTooLate")
        }
        // The refused slam persisted and published nothing. (Not an
        // exact-empty check: the refused envelope re-arms a zero-duration
        // timer for the now-due window, so a legitimate close batch may
        // land at any moment.)
        expectNoSlamPersisted(h.journal, "boundary slam")
      }).pipe(Effect.provide(h.layer))
    },
  )

  it.effect(
    "processing-time lateness: a slam submitted in-window but queued behind a slower command is SlamTooLate (C2.3)",
    () => {
      const journal = makeJournal()
      const repo = makeGameRepoStub(journal)
      const clock = makeSettableClock(NOW)
      // One-shot crossing: envelope A's publish PARKS on the gate until the
      // test has enqueued B, then moves the authority clock past closesAt —
      // so the crossing lands strictly between the two per-envelope clock
      // reads, with B already in the queue (submitted in-window).
      let crossing: {
        readonly closesAt: number
        readonly gate: Deferred.Deferred<void>
      } | null = null
      const hookedPublisher = Layer.succeed(RealtimePublisherPort, {
        publishGame: (gameId, state, events) =>
          Effect.gen(function* () {
            journal.push({ op: "publishGame", gameId, state, events })
            if (crossing !== null) {
              const { closesAt, gate } = crossing
              crossing = null
              yield* Deferred.await(gate)
              clock.set(Timestamp.make(closesAt))
            }
          }),
        publishLobby: (gameId, lobby, version) =>
          Effect.sync(() => {
            journal.push({ op: "publishLobby", gameId, lobby, version })
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
        const gate = yield* Deferred.make<void>()
        crossing = { closesAt, gate }

        // BOTH slams are enqueued while the clock reads closesAt - 1 (review
        // F1: this is what discriminates processing-time from arrival-time
        // stamping — an arrival-stamped B would be in-window and succeed).
        // A parks inside its publish on the gate; B joins the queue behind
        // it; only then does the gate open and the clock cross closesAt.
        const fiberA = yield* Effect.fork(registry.execute(gid(1), slamA))
        yield* Effect.yieldNow()
        const fiberB = yield* Effect.fork(registry.execute(gid(1), slamB))
        yield* Effect.yieldNow()
        yield* Effect.yieldNow()
        yield* Deferred.succeed(gate, void 0)

        const exitA = yield* Fiber.await(fiberA)
        const exitB = yield* Fiber.await(fiberB)

        const pureA = applyCommand(state, slamA, lastInstant)
        if (pureA._tag === "Left") throw new Error("slam A should be legal in-window")
        expect(Exit.isSuccess(exitA)).toBe(true)
        if (Exit.isSuccess(exitA)) {
          expect(exitA.value.state).toEqual(pureA.right[0])
          expect(exitA.value.events).toEqual(pureA.right[1])
        }
        // B was queued behind A and is judged at processing time: too late —
        // even though it was submitted while the window was open.
        expect(Exit.isFailure(exitB)).toBe(true)
        if (Exit.isFailure(exitB) && exitB.cause._tag === "Fail") {
          expect(exitB.cause.error._tag).toBe("SlamTooLate")
        }

        // A's batch landed first; B left no trace (a zero-duration timer
        // close may legally follow once the window became due).
        expect(opsOf(journal).slice(0, 2)).toEqual(["save", "publishGame"])
        expectNoSlamPersisted(journal.slice(2), "raced slam B")
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect(
    "restart mid-window: the late slam is refused and the window closes exactly once before the next command (C4.2)",
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
        // Lifetime two: a fresh registry over the same persisted rows.
        // CAM-26 (S1): the bootstrap load itself now arms a zero-duration
        // timer for the past-due window — it no longer arms nothing. But
        // the late slam is the bootstrapping envelope itself, so it is
        // judged against the still-open cached phase before that forked
        // timer fiber can be scheduled and enqueue its TimerClose (verified
        // by this test still observing SlamTooLate, not WrongPhase, below).
        // Once the late slam's envelope finishes, its own trailing
        // manageTimer re-arms (again zero-duration, since the phase is
        // still SlamWindow and still past due), so the close may arrive via
        // that timer or via the probe's lazy path — the journal sequence
        // below is identical either way (ADR-0020).
        yield* Effect.gen(function* () {
          const registry = yield* RoomRegistry

          const late = yield* registry.execute(gid(1), lateSlam!).pipe(Effect.either)
          expect(late._tag).toBe("Left")
          if (late._tag === "Left") expect(late.left._tag).toBe("SlamTooLate")

          const reply = yield* registry.execute(gid(1), probe)
          expect(reply.state).toEqual(pureProbe.right[0])
          expect(reply.events).toEqual(pureProbe.right[1])
        }).pipe(Effect.provide(h.layer))

        // Bootstrap load, then the close as its own persisted+published
        // batch, then the command's batch — §6's recovery story end to end;
        // the refusal itself persisted no slam outcome.
        expect(opsOf(h.journal)).toEqual(["load", "save", "publishGame", "save", "publishGame"])
        expectNoSlamPersisted(h.journal, "restart late slam")
        const closeBatch = h.journal[1]!
        if (closeBatch.op !== "save") throw new Error("unreachable")
        expect(closeBatch.events.map((e) => e._tag)).toEqual(["SlamWindowClosed", "TurnAdvanced"])
      }).pipe(Effect.provide(h.deps))
    },
  )
})
