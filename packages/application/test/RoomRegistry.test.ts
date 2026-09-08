import { describe, expect, it } from "@effect/vitest"
import { Cause, Effect, Exit, Fiber, TestClock } from "effect"
import { applyCommand, type Command, dealGame, Timestamp } from "@cambio/domain"
import { gid, legalCandidates, uid, user } from "@cambio/domain/testing"
import { RoomRegistry } from "../src/room/RoomRegistry.js"
import {
  choose,
  config,
  driveToSlamWindow,
  type Harness,
  makeHarness,
  NOW,
  SEED,
  seedLobby,
} from "./support/registry.js"
import { opsOf } from "./support/stubs.js"

/**
 * The per-room actor (root plan clauses 8–11, ADR-0020). The harness — and
 * the two-clock design it embodies — lives in `./support/registry.ts`
 * (shared with SlamTiming.test.ts since CAM-7).
 */

describe("RoomRegistry (clauses 8–11, ADR-0020)", () => {
  it.effect("routes commands through the actor and reuses the cache — no reloads", () => {
    const h = makeHarness()
    return Effect.gen(function* () {
      const registry = yield* RoomRegistry
      yield* seedLobby({ id: gid(1), members: [user(0), user(1)], status: "open" })
      const started = yield* registry.start(gid(1), { starterId: uid(1), config })
      h.journal.splice(0)

      const first = yield* registry.execute(gid(1), choose(started.state, NOW))
      const second = yield* registry.execute(gid(1), choose(first.state, NOW))
      expect(second.version).toBe(first.version + 1)
      // Started via the registry ⇒ the cache came from the start save: no
      // load at all, just save+publish per command.
      expect(opsOf(h.journal)).toEqual(["save", "publishGame", "save", "publishGame"])
    }).pipe(Effect.provide(h.layer))
  })

  it.effect(
    "slam race: serialized in enqueue order ≡ sequential A-then-B, deterministically, over 20 fresh rooms (clause 8)",
    () =>
      Effect.gen(function* () {
        // Clause 8 as amended after review: the queue guarantees the race
        // RESOLVES AS IF the two slams had been submitted sequentially in
        // enqueue order — each reply and the final log are exactly what the
        // engine gives A then B. (The engine may accept both: the window
        // stays open and every failed slam costs a penalty — no "exactly
        // one slam" prior.) So the expectation is computed PURE, from the
        // engine itself, and the raced outcome must equal it.
        const tagsOf = (events: ReadonlyArray<{ _tag: string }>) =>
          events.map((e) => e._tag).join("+")
        const expected = (() => {
          const dealt = dealGame([uid(0), uid(1)], SEED, config, NOW)
          if (dealt._tag === "Left") throw new Error("deal failed")
          let state = dealt.right[0]
          const log: Array<string> = dealt.right[1].map((e) => e._tag)
          for (let i = 0; i < 60 && state.phase._tag !== "SlamWindow"; i++) {
            const step = applyCommand(state, choose(state, NOW), NOW)
            if (step._tag === "Left") throw new Error("pure drive hit an illegal command")
            state = step.right[0]
            log.push(...step.right[1].map((e) => e._tag))
          }
          const slams = legalCandidates(state, NOW).filter((c) => c._tag === "Slam")
          const slamA = slams[0]!
          // A genuine cross-player race when the engine offers one.
          const slamB = slams.find((c) => c.playerId !== slamA.playerId) ?? slams[1] ?? slamA
          const afterA = applyCommand(state, slamA, NOW)
          const stateAfterA = afterA._tag === "Right" ? afterA.right[0] : state
          const afterB = applyCommand(stateAfterA, slamB, NOW)
          const tagOfPure = (r: typeof afterA): string =>
            r._tag === "Right" ? `ok:${tagsOf(r.right[1])}` : `err:${r.left._tag}`
          if (afterA._tag === "Right") log.push(...afterA.right[1].map((e) => e._tag))
          if (afterB._tag === "Right") log.push(...afterB.right[1].map((e) => e._tag))
          return {
            slamA,
            slamB,
            triple: `${tagOfPure(afterA)} | ${tagOfPure(afterB)} | ${log.join(",")}`,
          }
        })()
        expect(expected.slamB.playerId).not.toBe(expected.slamA.playerId) // cross-player race

        const outcomes: Array<string> = []
        for (let i = 0; i < 20; i++) {
          const h = makeHarness()
          const outcome = yield* Effect.gen(function* () {
            const registry = yield* RoomRegistry
            yield* driveToSlamWindow(gid(i))

            const fiberA = yield* Effect.fork(registry.execute(gid(i), expected.slamA))
            yield* Effect.yieldNow()
            const fiberB = yield* Effect.fork(registry.execute(gid(i), expected.slamB))
            const exitA = yield* Fiber.await(fiberA)
            const exitB = yield* Fiber.await(fiberB)

            const tagOf = (
              exit: Exit.Exit<{ events: ReadonlyArray<{ _tag: string }> }, { _tag: string }>,
            ): string =>
              Exit.isSuccess(exit)
                ? `ok:${tagsOf(exit.value.events)}`
                : exit.cause._tag === "Fail"
                  ? `err:${exit.cause.error._tag}`
                  : "defect"
            const row = h.repo.rows.get(gid(i))!
            return `${tagOf(exitA)} | ${tagOf(exitB)} | ${row.events.map((e) => e._tag).join(",")}`
          }).pipe(Effect.provide(h.layer))
          outcomes.push(outcome)
        }
        // Deterministic: every iteration produced the identical triple, and
        // that triple is the pure sequential A-then-B expectation — the
        // first-in-queue-wins guarantee, asserted against the engine's own
        // answer rather than any prior.
        expect(new Set(outcomes).size).toBe(1)
        expect(outcomes[0]).toBe(expected.triple)
      }),
  )

  it.effect(
    "VersionConflict: surfaced unchanged, cache reloaded eagerly in the same envelope (clause 6, CAM-26 S2)",
    () => {
      // CAM-26 changes what happens AFTER the conflict: the actor no longer
      // waits for a next command to happen to reload — it reloads eagerly,
      // in the SAME envelope, so a live window's timer is never left
      // stranded on a command that might never arrive (S2). The conflict
      // itself still surfaces unchanged and is never retried.
      const h = makeHarness()
      return Effect.gen(function* () {
        const registry = yield* RoomRegistry
        yield* seedLobby({ id: gid(1), members: [user(0), user(1)], status: "open" })
        const started = yield* registry.start(gid(1), { starterId: uid(0), config })

        // Something else bumped the row behind the actor's back.
        h.repo.poke(gid(1), 9)
        h.journal.splice(0)
        const cmd = choose(started.state, NOW)
        const conflicted = yield* registry.execute(gid(1), cmd).pipe(Effect.either)
        expect(conflicted._tag).toBe("Left")
        if (conflicted._tag === "Left") {
          expect(conflicted.left._tag).toBe("VersionConflict")
          if (conflicted.left._tag === "VersionConflict") {
            expect(conflicted.left.expected).toBe(started.version)
            expect(conflicted.left.actual).toBe(9)
          }
        }
        // Nothing is persisted or published by the conflict itself — but the
        // eager re-arm reload (S2) DOES appear in this same envelope's ops.
        expect(opsOf(h.journal)).toEqual(["load"])

        // Self-heal: the reload already primed the cache at version 9, so
        // the retry succeeds directly off the warm cache — no second load.
        h.journal.splice(0)
        const healed = yield* registry.execute(gid(1), cmd)
        expect(healed.version).toBe(10)
        expect(opsOf(h.journal)).toEqual(["save", "publishGame"])
      }).pipe(Effect.provide(h.layer))
    },
  )

  it.effect(
    "VersionConflict during an open window: eager reload keeps the timer armed, closing with no further command (S2, CAM-26)",
    () => {
      const h = makeHarness()
      return Effect.gen(function* () {
        const registry = yield* RoomRegistry
        const state = yield* driveToSlamWindow(gid(1))
        if (state.phase._tag !== "SlamWindow") throw new Error("unreachable")
        const closesAt = state.phase.closesAt
        // The only command legal during an open window is Slam itself
        // (checkCommand/legalCommandKinds — nothing else is on offer).
        const slam = legalCandidates(state, NOW).find((c) => c._tag === "Slam")
        expect(slam).toBeDefined()

        // Something else bumps the row's version behind the actor's back.
        h.repo.poke(gid(1), 999)
        h.journal.splice(0)

        const conflicted = yield* registry.execute(gid(1), slam!).pipe(Effect.either)
        expect(conflicted._tag).toBe("Left")
        if (conflicted._tag === "Left") expect(conflicted.left._tag).toBe("VersionConflict")
        // The conflicted envelope's own eager reload (S2) is what re-arms
        // the trailing manageTimer — proven below by NO further command.
        expect(opsOf(h.journal)).toEqual(["load"])

        h.journal.splice(0)
        yield* Effect.sync(() => h.clock.set(Timestamp.make(closesAt + 1)))
        yield* TestClock.adjust(config.slamWindowMs + 1000)
        for (let i = 0; i < 100 && h.journal.length < 2; i++) {
          yield* Effect.yieldNow()
        }
        expect(opsOf(h.journal)).toEqual(["save", "publishGame"])
        const closeBatch = h.journal[0]!
        if (closeBatch.op !== "save") throw new Error("unreachable")
        expect(closeBatch.events.map((e) => e._tag)).toEqual(["SlamWindowClosed", "TurnAdvanced"])
      }).pipe(Effect.provide(h.layer))
    },
  )

  it.effect(
    "eviction: a finished game's next command gets a fresh bootstrap and a typed error (clause 10)",
    () => {
      const h = makeHarness()
      return Effect.gen(function* () {
        const registry = yield* RoomRegistry
        yield* seedLobby({ id: gid(1), members: [user(0), user(1)], status: "open" })
        const started = yield* registry.start(gid(1), { starterId: uid(0), config })

        const cambio = legalCandidates(started.state, NOW).find((c) => c._tag === "CallCambio")
        expect(cambio).toBeDefined()
        const ended = yield* registry.execute(gid(1), cambio!)
        expect(ended.state.phase._tag).toBe("Ended")
        expect(yield* registry.roomCount).toBe(0) // the actor evicted itself

        // A later command finds a fresh actor whose
        // bootstrap loads from the repository — and whose reply is the
        // engine's typed error for a finished game, not a crash.
        h.journal.splice(0)
        const after = yield* registry
          .execute(gid(1), { _tag: "DrawFromDeck", playerId: uid(0) })
          .pipe(Effect.either)
        expect(opsOf(h.journal)).toEqual(["load"]) // fresh bootstrap, nothing persisted
        expect(after._tag).toBe("Left")
        if (after._tag === "Left") expect(after.left._tag).toBe("GameAlreadyEnded")
      }).pipe(Effect.provide(h.layer))
    },
  )

  it.effect(
    "eviction: abandoning a lobby removes its actor; a later join is a typed refusal, not a crash (clause 10)",
    () => {
      const h = makeHarness()
      return Effect.gen(function* () {
        const registry = yield* RoomRegistry
        yield* seedLobby({ id: gid(1), members: [user(0), user(1)], status: "open" })

        // A non-abandoning leave keeps the actor resident…
        yield* registry.leave(gid(1), uid(1))
        expect(yield* registry.roomCount).toBe(1)

        // …the abandoning leave evicts it (the observable clause 10 asks for).
        const left = yield* registry.leave(gid(1), uid(0))
        expect(left.lobby.status).toBe("abandoned")
        expect(yield* registry.roomCount).toBe(0)

        const rejoin = yield* registry.join(gid(1), uid(1)).pipe(Effect.either)
        expect(rejoin._tag).toBe("Left")
        if (rejoin._tag === "Left") expect(rejoin.left._tag).toBe("LobbyNotJoinable")
      }).pipe(Effect.provide(h.layer))
    },
  )

  it.effect(
    "a defect inside the actor fails the caller — never a hang — and the room keeps working (review finding 2)",
    () => {
      const h = makeHarness()
      return Effect.gen(function* () {
        const registry = yield* RoomRegistry
        yield* seedLobby({ id: gid(1), members: [user(0), user(1)], status: "open" })
        const started = yield* registry.start(gid(1), { starterId: uid(0), config })
        const cmd = choose(started.state, NOW)

        // The next save dies (simulating an adapter bug). The caller must
        // receive the defect as its reply, not await a dead room forever.
        h.repo.dieOnNextSave()
        const exit = yield* Effect.exit(registry.execute(gid(1), cmd))
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) {
          expect(Cause.dieOption(exit.cause)._tag).toBe("Some")
        }

        // Nothing was persisted, the actor survived the guarded defect, and
        // the same command now succeeds off the intact cache.
        h.journal.splice(0)
        const healed = yield* registry.execute(gid(1), cmd)
        expect(healed.version).toBe(started.version + 1)
        expect(opsOf(h.journal)).toEqual(["save", "publishGame"])
      }).pipe(Effect.provide(h.layer))
    },
  )

  it.effect(
    "restart reconstruction: a fresh registry over the same rows behaves identically (clause 9)",
    () => {
      // Two identical worlds over identical stub repos. World A runs setup AND
      // probe in one registry lifetime (never restarted). World B runs the
      // same setup, then its provide-scope closes — the restart — and the
      // probe runs on a second registry over the same rows.
      const hA = makeHarness()
      const hB = makeHarness()
      const setup = Effect.gen(function* () {
        const registry = yield* RoomRegistry
        yield* seedLobby({ id: gid(1), members: [user(0)], status: "open" })
        yield* registry.join(gid(1), uid(1))
        const started = yield* registry.start(gid(1), { starterId: uid(1), config })
        const one = yield* registry.execute(gid(1), choose(started.state, NOW))
        return choose(one.state, NOW) // the probe command both worlds will run
      })
      const probeOn = (probe: Command) =>
        RoomRegistry.pipe(Effect.flatMap((r) => r.execute(gid(1), probe)))
      return Effect.gen(function* () {
        // World A: one lifetime for setup + probe.
        const resultA = yield* Effect.gen(function* () {
          const probe = yield* setup
          const reply = yield* probeOn(probe)
          return { probe, reply }
        }).pipe(Effect.provide(hA.layer))

        // World B: setup lifetime ends, probe runs on a fresh registry.
        const probeB = yield* setup.pipe(Effect.provide(hB.layer))
        expect(probeB).toEqual(resultA.probe) // identical worlds so far
        hB.journal.splice(0)
        const replyB = yield* probeOn(probeB).pipe(Effect.provide(hB.layer))

        expect(opsOf(hB.journal)[0]).toBe("load") // the rebuild (§6)
        expect(replyB.state).toEqual(resultA.reply.state)
        expect(replyB.version).toBe(resultA.reply.version)
        expect(replyB.events).toEqual(resultA.reply.events)
        expect(hB.repo.rows.get(gid(1))!.events).toEqual(hA.repo.rows.get(gid(1))!.events)
      })
    },
  )

  it.effect(
    "restart reconstruction: a lobby room rebuilds from rows, not the fold (clause 9)",
    () => {
      const hA = makeHarness() // control: both joins in one lifetime
      const hB = makeHarness() // restarted between the joins
      return Effect.gen(function* () {
        const controlReply = yield* Effect.gen(function* () {
          const registry = yield* RoomRegistry
          yield* seedLobby({ id: gid(2), members: [user(0)], status: "open" })
          yield* registry.join(gid(2), uid(1))
          return yield* registry.join(gid(2), uid(2))
        }).pipe(Effect.provide(hA.layer))

        yield* Effect.gen(function* () {
          const registry = yield* RoomRegistry
          yield* seedLobby({ id: gid(2), members: [user(0)], status: "open" })
          yield* registry.join(gid(2), uid(1))
        }).pipe(Effect.provide(hB.layer))
        const restartedReply = yield* RoomRegistry.pipe(
          Effect.flatMap((r) => r.join(gid(2), uid(2))),
          Effect.provide(hB.layer),
        )

        expect(restartedReply.lobby).toEqual(controlReply.lobby)
        expect(restartedReply.version).toBe(controlReply.version)
      })
    },
  )

  it.effect(
    "timer vs lazy close are equivalent, and a stale timer is a silent no-op (clause 11)",
    () => {
      const lazy = makeHarness()
      const timed = makeHarness()

      /** One process lifetime per world; `useTimer` decides which close path runs. */
      const world = (h: Harness, useTimer: boolean) =>
        Effect.gen(function* () {
          const registry = yield* RoomRegistry
          const state = yield* driveToSlamWindow(gid(1))
          if (state.phase._tag !== "SlamWindow") throw new Error("unreachable")
          const closesAt = state.phase.closesAt
          const past = Timestamp.make(closesAt + 1)

          // The probe: the first legal command of the post-close state,
          // computed pure — accepted only once the window actually closed.
          const closed = applyCommand(state, { _tag: "CloseSlamWindow" }, past)
          if (closed._tag === "Left") throw new Error("close should be legal past closesAt")
          const probe = choose(closed.right[0], past)

          // Authority clock passes closesAt in both worlds.
          yield* Effect.sync(() => h.clock.set(past))
          h.journal.splice(0)
          if (useTimer) {
            // TestClock advances past the sleep — the timer fiber enqueues the
            // close itself before the probe arrives.
            yield* TestClock.adjust(config.slamWindowMs + 1000)
            for (let i = 0; i < 100 && h.journal.length < 2; i++) {
              yield* Effect.yieldNow()
            }
            // The timer path really ran: the close batch was persisted and
            // published BEFORE any probe existed — this is what separates the
            // timer world from the lazy fallback.
            expect(opsOf(h.journal)).toEqual(["save", "publishGame"])
          }
          const reply = yield* registry.execute(gid(1), probe)
          const journalOps: ReadonlyArray<string> = opsOf(h.journal)

          // Stale-timer check: whatever timer might still be armed fires into
          // a room whose window is gone — nothing persisted, nothing published.
          const before = h.journal.length
          yield* TestClock.adjust(config.slamWindowMs * 10)
          yield* Effect.yieldNow()
          expect(h.journal.length).toBe(before)

          return { reply, journalOps }
        }).pipe(Effect.provide(h.layer))

      return Effect.gen(function* () {
        const lazyResult = yield* world(lazy, false)
        // Lazy path: the actor injected the close as its own persisted +
        // published batch, then ran the probe.
        expect(lazyResult.journalOps).toEqual(["save", "publishGame", "save", "publishGame"])

        const timedResult = yield* world(timed, true)
        expect(timedResult.journalOps).toEqual(["save", "publishGame", "save", "publishGame"])

        // The optimization changed nothing: identical replies, states, logs.
        expect(timedResult.reply.state).toEqual(lazyResult.reply.state)
        expect(timedResult.reply.version).toBe(lazyResult.reply.version)
        expect(timedResult.reply.events).toEqual(lazyResult.reply.events)
        expect(timed.repo.rows.get(gid(1))!.events).toEqual(lazy.repo.rows.get(gid(1))!.events)
      })
    },
  )
})

describe("Poke (S1, S3, S4, S5 — CAM-26, ADR-0037)", () => {
  it.effect(
    "poke closes a cold, past-due window — bootstrap, judge the clock, close (S1+S3+S5)",
    () => {
      const h = makeHarness()
      // Lifetime one: drive into the window, then the provide-scope closes —
      // the actor and its armed timer die with the process (§6 restart
      // idiom, shared with the SlamTiming restart test).
      const lifetimeOne = driveToSlamWindow(gid(1)).pipe(Effect.provide(h.layer))
      return Effect.gen(function* () {
        const state = yield* lifetimeOne
        if (state.phase._tag !== "SlamWindow") throw new Error("unreachable")
        const past = Timestamp.make(state.phase.closesAt + 1)
        yield* Effect.sync(() => h.clock.set(past))

        h.journal.splice(0)
        // Lifetime two: a fresh registry over the same persisted rows. No
        // command is ever sent to it — only the reply-less poke.
        yield* Effect.gen(function* () {
          const registry = yield* RoomRegistry
          yield* registry.poke(gid(1))
          // Poke has no reply — poll the journal race-free until the close
          // batch lands (bootstrap load, then the close's own save+publish).
          for (let i = 0; i < 100 && h.journal.length < 3; i++) {
            yield* Effect.yieldNow()
          }
        }).pipe(Effect.provide(h.layer))

        expect(opsOf(h.journal)).toEqual(["load", "save", "publishGame"])
        const closeBatch = h.journal[1]!
        if (closeBatch.op !== "save") throw new Error("unreachable")
        expect(closeBatch.events.map((e) => e._tag)).toEqual(["SlamWindowClosed", "TurnAdvanced"])
      }).pipe(Effect.provide(h.deps))
    },
  )

  it.effect("poke on a still-open window: bootstraps and arms, closes nothing yet (S4)", () => {
    const h = makeHarness()
    const lifetimeOne = driveToSlamWindow(gid(1)).pipe(Effect.provide(h.layer))
    return Effect.gen(function* () {
      const state = yield* lifetimeOne
      if (state.phase._tag !== "SlamWindow") throw new Error("unreachable")
      const closesAt = state.phase.closesAt
      // Clock is left at NOW — the window is still open.

      h.journal.splice(0)
      yield* Effect.gen(function* () {
        const registry = yield* RoomRegistry
        yield* registry.poke(gid(1))
        for (let i = 0; i < 100 && h.journal.length < 1; i++) {
          yield* Effect.yieldNow()
        }
        expect(opsOf(h.journal)).toEqual(["load"])

        // The poke armed a timer off the bootstrapped cache: advancing past
        // the remaining duration closes the window with no further envelope
        // sent by the test — proof the poke itself re-armed, not just read.
        yield* Effect.sync(() => h.clock.set(Timestamp.make(closesAt + 1)))
        h.journal.splice(0)
        yield* TestClock.adjust(config.slamWindowMs + 1000)
        for (let i = 0; i < 100 && h.journal.length < 2; i++) {
          yield* Effect.yieldNow()
        }
        expect(opsOf(h.journal)).toEqual(["save", "publishGame"])
      }).pipe(Effect.provide(h.layer))
    }).pipe(Effect.provide(h.deps))
  })

  it.effect(
    "poke on an ended game: bootstraps, evicts, persists and publishes nothing (S4)",
    () => {
      const h = makeHarness()
      return Effect.gen(function* () {
        const registry = yield* RoomRegistry
        yield* seedLobby({ id: gid(1), members: [user(0), user(1)], status: "open" })
        const started = yield* registry.start(gid(1), { starterId: uid(0), config })
        const cambio = legalCandidates(started.state, NOW).find((c) => c._tag === "CallCambio")
        expect(cambio).toBeDefined()
        const ended = yield* registry.execute(gid(1), cambio!)
        expect(ended.state.phase._tag).toBe("Ended")
        expect(yield* registry.roomCount).toBe(0) // the actor already evicted itself

        // A poke against the (now gone) actor creates a fresh cold one,
        // whose bootstrap sees the Ended phase and evicts straight away.
        h.journal.splice(0)
        yield* registry.poke(gid(1))
        for (let i = 0; i < 100 && h.journal.length < 1; i++) {
          yield* Effect.yieldNow()
        }
        expect(opsOf(h.journal)).toEqual(["load"])

        let count = yield* registry.roomCount
        for (let i = 0; i < 100 && count !== 0; i++) {
          yield* Effect.yieldNow()
          count = yield* registry.roomCount
        }
        expect(count).toBe(0)
      }).pipe(Effect.provide(h.layer))
    },
  )

  it.effect(
    "poke on an unknown/lobby-only game id: tolerated, nothing persisted, no lingering actor (S4)",
    () => {
      const h = makeHarness()
      return Effect.gen(function* () {
        const registry = yield* RoomRegistry
        // No lobby or game row exists for gid(1) at all — `games.load` fails
        // exactly as it does for a lobby-only room (the route never pokes
        // one in practice; the handler tolerates it defensively regardless).
        h.journal.splice(0)
        yield* registry.poke(gid(1))
        for (let i = 0; i < 100 && h.journal.length < 1; i++) {
          yield* Effect.yieldNow()
        }
        expect(opsOf(h.journal)).toEqual(["load"])

        let count = yield* registry.roomCount
        for (let i = 0; i < 100 && count !== 0; i++) {
          yield* Effect.yieldNow()
          count = yield* registry.roomCount
        }
        expect(count).toBe(0)
      }).pipe(Effect.provide(h.layer))
    },
  )

  it.effect(
    "a second poke on an already-armed window is a no-op — idempotent by construction",
    () => {
      const h = makeHarness()
      return Effect.gen(function* () {
        const registry = yield* RoomRegistry
        const state = yield* driveToSlamWindow(gid(1))
        if (state.phase._tag !== "SlamWindow") throw new Error("unreachable")

        // First poke bootstraps nothing new (the actor is already resident
        // and armed from driveToSlamWindow's own Start/Execute calls).
        h.journal.splice(0)
        yield* registry.poke(gid(1))
        yield* Effect.yieldNow()
        yield* Effect.yieldNow()
        expect(opsOf(h.journal)).toEqual([]) // already warm, still not due — nothing to do

        yield* registry.poke(gid(1))
        yield* Effect.yieldNow()
        yield* Effect.yieldNow()
        expect(opsOf(h.journal)).toEqual([]) // still idempotent
      }).pipe(Effect.provide(h.layer))
    },
  )
})
