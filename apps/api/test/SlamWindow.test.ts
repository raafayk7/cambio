import { describe, expect, it } from "@effect/vitest"
import { projectEvents, viewFor } from "@cambio/application"
import type { PlayerGameView } from "@cambio/contracts"
import { type Command, dealGame, decodeGameConfig, type GameState, UserId } from "@cambio/domain"
import { legalCandidates, ts } from "@cambio/domain/testing"
import { Either, Schema } from "effect"

import { apply, setupGame, toWire } from "./support/game-driver.js"
import {
  clearPublisherJournal,
  makeSettableClock,
  makeTestApp,
  publisherJournal,
  TEST_SEED,
} from "./support/http.js"
import { entitledSlugs, expectNoLeak, slugsIn } from "./support/leaks.js"

/**
 * CAM-7 — the slam window end-to-end (root plan C1.3/C1.4, C1.6, C2.1/C2.2,
 * C3.1/C3.2, C4.1, C4.2).
 *
 * Every test runs the real server over real Postgres with an INJECTED
 * settable ClockPort (M1) frozen at a fixed epoch, and replays the pure
 * engine locally on the server's absolute timeline (decision 5) — so
 * `closesAt` matches exactly between server and replay and views are
 * compared WITHOUT normalization: every equality below also re-proves the
 * clock injection reached the registry.
 *
 * Two-clock note (decision 4): the injected clock governs the engine and
 * lateness; the actor's close-timer sleeps on REAL time. Tests that must
 * keep the timer inert use BIG (600s of real time — interrupted at app
 * close); the one timer test uses SMALL plus a deadline-poll.
 *
 * Offline seed survey (decision 3, run at plan/implement time): under the
 * suite's chooser, TEST_SEED's FIRST window has a rank-matching card in
 * Bob's (seat 1) hand plus non-matching cards everywhere — all four §1.5
 * cells are reachable at window 0 with the default seed, so no per-cell
 * seed constants are needed.
 */

const toUserId = Schema.decodeUnknownSync(UserId)
const EPOCH = 1_700_000_000_000
const BIG = 600_000
const SMALL = 250

const rankOf = (slug: string) => slug.slice(0, slug.length - 1)

const PREFERENCE: ReadonlyArray<Command["_tag"]> = [
  "DiscardHeld",
  "DrawFromDeck",
  "PowerPeek",
  "PowerSwap",
  "SwapHeld",
  "TakeDiscard",
]
/** Slam-agnostic drive: slams are chosen deliberately from local truth, never here. */
const choose = (state: GameState, now: number): Command => {
  const candidates = legalCandidates(state, ts(now)).filter(
    (c) => c._tag !== "Slam" && c._tag !== "CloseSlamWindow" && c._tag !== "CallCambio",
  )
  for (const tag of PREFERENCE) {
    const found = candidates.find((c) => c._tag === tag)
    if (found !== undefined) return found
  }
  throw new Error(`no drive candidate in ${state.phase._tag}`)
}

type SlamCommand = Extract<Command, { readonly _tag: "Slam" }>

const makeWorld = async (slamWindowMs: number) => {
  const clock = makeSettableClock(EPOCH)
  const { app, runtime } = await makeTestApp({ slamWindowMs }, { clock: clock.layer })
  const { gameId, players, byId, startRes } = await setupGame(app, ["Alice", "Bob"])
  const dealt = dealGame(
    players.map((p) => toUserId(p.userId)),
    TEST_SEED,
    decodeGameConfig({ slamWindowMs }),
    ts(EPOCH),
  )
  if (Either.isLeft(dealt)) throw new Error("local deal failed")

  const world = {
    app,
    runtime,
    gameId,
    players,
    byId,
    state: dealt.right[0],
    now: EPOCH,
    lastVersion: (startRes.json() as { version: number }).version,
    /** Move BOTH clocks — the injected authority and the replay timeline. */
    setNow(t: number) {
      world.now = t
      clock.set(t)
    },
    /** Raw POST of a command as its issuer; no local mirroring. */
    post: (command: Command) =>
      app.inject({
        method: "POST",
        url: `/games/${gameId}/commands`,
        cookies: { cambio_session: byId.get((command as { playerId: string }).playerId)!.cookie },
        payload: toWire(command),
      }),
    /** POST + expect 200 + mirror locally + full reply-view equality (unnormalized). */
    step: async (command: Command) => {
      const res = await world.post(command)
      expect(res.statusCode, `${command._tag}`).toBe(200)
      world.state = apply(world.state, command, world.now)
      const body = res.json() as { view: PlayerGameView; version: number }
      expect(body.view, `view after ${command._tag}`).toEqual(
        viewFor(toUserId((command as { playerId: string }).playerId), world.state),
      )
      expectNoLeak(
        body,
        entitledSlugs(world.state, toUserId((command as { playerId: string }).playerId)),
        `reply to ${command._tag}`,
      )
      world.lastVersion = body.version
      return body
    },
    /** Drive turns (never slamming) until the phase is SlamWindow. */
    driveToWindow: async () => {
      for (let i = 0; i < 60 && world.state.phase._tag !== "SlamWindow"; i++) {
        await world.step(choose(world.state, world.now))
      }
      if (world.state.phase._tag !== "SlamWindow") throw new Error("never reached SlamWindow")
      return world.state.phase
    },
    /** Journal entries for THIS game only. */
    gameEntries: () =>
      publisherJournal.filter(
        (e): e is Extract<(typeof publisherJournal)[number], { _tag: "game" }> =>
          e._tag === "game" && e.gameId === gameId,
      ),
    close: async () => {
      await app.close()
      await runtime.dispose()
    },
  }
  // The deal happened under the frozen injected clock.
  expect((startRes.json() as { view: PlayerGameView }).view).toEqual(
    viewFor(toUserId(players[0]!.userId), world.state),
  )
  return world
}
type World = Awaited<ReturnType<typeof makeWorld>>

/** The occupied slots of `playerId` split by whether they match the window rank. */
const classify = (state: GameState, rank: string, playerId: string) => {
  const hand = state.players.find((p) => p.id === playerId)!.hand
  return {
    matching: hand.filter((h) => rankOf(h.card) === rank),
    other: hand.filter((h) => rankOf(h.card) !== rank),
  }
}

/** The legal Slam candidate for slammer→target (first give-slot fan-out entry). */
const slamCandidate = (
  world: World,
  slammerId: string,
  target: { playerId: string; slotIndex: number },
): SlamCommand => {
  const found = legalCandidates(world.state, ts(world.now)).find(
    (c): c is SlamCommand =>
      c._tag === "Slam" &&
      c.playerId === slammerId &&
      c.target.playerId === target.playerId &&
      c.target.slotIndex === target.slotIndex,
  )
  if (found === undefined) throw new Error("expected slam candidate missing")
  return found
}

/** Room-stream leak scan: only rule-public card values may appear (§1.5). */
const expectRoomRevealOnly = (
  entry: { events: ReadonlyArray<{ _tag: string }>; state: GameState },
  context: string,
) => {
  const projected = projectEvents(entry.events as never)
  const publicSlugs = new Set<string>()
  for (const event of entry.events as ReadonlyArray<Record<string, unknown> & { _tag: string }>) {
    switch (event._tag) {
      case "GameStarted":
        publicSlugs.add(event.firstDiscard as string)
        break
      case "DiscardTaken":
      case "HeldDiscarded":
      case "PowerDiscarded":
      case "SlamSucceeded":
      case "SlamFailed":
        publicSlugs.add(event.card as string)
        break
      case "HeldSwapped":
        publicSlugs.add(event.discarded as string)
        break
      default:
        break
    }
  }
  const leaks = slugsIn(projected.room).filter((s) => !publicSlugs.has(s))
  expect(leaks, `published room stream (${context})`).toEqual([])
  // No slam event ever produces a per-player private delivery (C3.2).
  const slamTags = new Set([
    "SlamWindowOpened",
    "SlamSucceeded",
    "SlamFailed",
    "PenaltyDrawn",
    "CardGivenFromHand",
    "CardGivenFromDeck",
    "DrawSkipped",
    "SlamWindowClosed",
  ])
  if (entry.events.every((e) => slamTags.has(e._tag))) {
    for (const [, events] of projected.perPlayer) {
      expect(events, `private deliveries (${context})`).toEqual([])
    }
  }
  return projected
}

describe("SlamWindow e2e (CAM-7)", () => {
  it("own/correct: the §1.5 reveal rides the room channel and the hand shrinks (C3.1/C3.2)", async () => {
    const world = await makeWorld(BIG)
    try {
      const phase = await world.driveToWindow()
      // Offline survey: seat 1 (Bob) holds the matching card at window 0.
      const owner = world.players[1]!.userId
      const { matching } = classify(world.state, phase.rank, owner)
      expect(matching.length, "survey: Bob holds a matching card").toBeGreaterThan(0)

      // The reply's closesAt equals the replay's — the injected clock reached
      // the registry (M1's folded frozen-clock probe).
      const slam = slamCandidate(world, owner, {
        playerId: owner,
        slotIndex: matching[0]!.slotIndex,
      })
      expect(slam.giveSlot).toBeNull() // own-card slams carry no give
      clearPublisherJournal()
      const body = await world.step(slam)
      if (body.view.phase._tag !== "SlamWindow") throw new Error("window should stay open")
      expect(body.view.phase.closesAt).toBe(EPOCH + BIG)

      // Hand shrank; the slammed slot is a hole in the replayed truth.
      expect(world.state.players[1]!.hand.length).toBe(matching.length === 1 ? 3 : 4 - 1)

      const entries = world.gameEntries()
      expect(entries.length).toBe(1)
      expect(entries[0]!.events.map((e) => e._tag)).toEqual(["SlamSucceeded"])
      const projected = expectRoomRevealOnly(entries[0]!, "own/correct")
      const reveal = projected.room.find((e) => e._tag === "SlamSucceeded")
      // The momentary public reveal: the card value IS on the room channel.
      expect(reveal).toMatchObject({ card: matching[0]!.card })
    } finally {
      await world.close()
    }
  }, 30_000)

  it("opponent/correct with give, then two incorrect attempts by the same player (C3.1/C3.2/C2.2)", async () => {
    const world = await makeWorld(BIG)
    try {
      const phase = await world.driveToWindow()
      const alice = world.players[0]!.userId
      const bob = world.players[1]!.userId
      const bobCards = classify(world.state, phase.rank, bob)
      expect(bobCards.matching.length, "survey: Bob holds the matching card").toBeGreaterThan(0)

      // Attempt 1 — opponent/correct: Alice slams Bob's matching card and her
      // named give card fills the vacated slot.
      const giveTarget = { playerId: bob, slotIndex: bobCards.matching[0]!.slotIndex }
      const oppCorrect = slamCandidate(world, alice, giveTarget)
      expect(oppCorrect.giveSlot).not.toBeNull() // opponent slams must name a give
      clearPublisherJournal()
      await world.step(oppCorrect)
      const correctEntry = world.gameEntries().at(-1)!
      expect(correctEntry.events.map((e) => e._tag)).toEqual(["SlamSucceeded", "CardGivenFromHand"])
      expectRoomRevealOnly(correctEntry, "opponent/correct")
      // The give is value-free on the room stream: identity follows the slot
      // movement, no card field at all (ADR-0009 discipline).
      const projectedGive = projectEvents(correctEntry.events as never).room.find(
        (e) => e._tag === "CardGivenFromHand",
      )
      expect(projectedGive).toMatchObject({ fromSlot: oppCorrect.giveSlot, to: giveTarget })
      expect(projectedGive).not.toHaveProperty("card")

      // Attempts 2+3 — both incorrect, both by Alice, same window (C2.2):
      // own then opponent's. Each costs a penalty drawn unseen (ADR-0022).
      const aliceOther = classify(world.state, phase.rank, alice).other
      expect(aliceOther.length).toBeGreaterThan(0)
      const ownIncorrect = slamCandidate(world, alice, {
        playerId: alice,
        slotIndex: aliceOther[0]!.slotIndex,
      })
      clearPublisherJournal()
      await world.step(ownIncorrect)
      const ownFail = world.gameEntries().at(-1)!
      expect(ownFail.events.map((e) => e._tag)).toEqual(["SlamFailed", "PenaltyDrawn"])
      const projectedOwnFail = expectRoomRevealOnly(ownFail, "own/incorrect")
      // PenaltyDrawn is slot-only: unseen by everyone, the slammer included.
      const penalty = projectedOwnFail.room.find((e) => e._tag === "PenaltyDrawn")
      expect(penalty).toBeDefined()
      expect(penalty).not.toHaveProperty("card")

      const bobOther = classify(world.state, phase.rank, bob).other
      expect(bobOther.length).toBeGreaterThan(0)
      const oppIncorrect = slamCandidate(world, alice, {
        playerId: bob,
        slotIndex: bobOther[0]!.slotIndex,
      })
      clearPublisherJournal()
      await world.step(oppIncorrect)
      const oppFail = world.gameEntries().at(-1)!
      expect(oppFail.events.map((e) => e._tag)).toEqual(["SlamFailed", "PenaltyDrawn"])
      expectRoomRevealOnly(oppFail, "opponent/incorrect")
      // Incorrect opponent slam: the target card stays with its owner.
      expect(
        world.state.players
          .find((p) => p.id === bob)!
          .hand.some((h) => h.slotIndex === bobOther[0]!.slotIndex),
      ).toBe(true)

      // closesAt never moved across three attempts (C1.1 observed e2e).
      if (world.state.phase._tag !== "SlamWindow") throw new Error("window should stay open")
      expect(world.state.phase.closesAt).toBe(EPOCH + BIG)
    } finally {
      await world.close()
    }
  }, 30_000)

  it("a late slam is 422 SlamTooLate and closes nothing (C1.3/C1.4)", async () => {
    const world = await makeWorld(BIG)
    try {
      const phase = await world.driveToWindow()
      // Legal while the window was open…
      const anySlam = legalCandidates(world.state, ts(world.now)).find(
        (c): c is SlamCommand => c._tag === "Slam",
      )
      expect(anySlam).toBeDefined()

      // …but the window expires before it arrives.
      world.setNow(phase.closesAt + 1)
      clearPublisherJournal()
      const res = await world.post(anySlam!)
      expect(res.statusCode).toBe(422)
      expect((res.json() as { error: { tag: string } }).error.tag).toBe("SlamTooLate")

      // A late Slam triggers no close (the actor's exemption): nothing was
      // persisted or published, and the stored phase is still SlamWindow.
      expect(world.gameEntries()).toEqual([])
      const viewRes = await world.app.inject({
        method: "GET",
        url: `/games/${world.gameId}/view`,
        cookies: { cambio_session: world.players[0]!.cookie },
      })
      expect(viewRes.statusCode).toBe(200)
      const view = (viewRes.json() as { view: PlayerGameView }).view
      expect(view.phase._tag).toBe("SlamWindow")
      if (view.phase._tag === "SlamWindow") expect(view.phase.closesAt).toBe(phase.closesAt)
    } finally {
      await world.close()
    }
  }, 30_000)

  it("concurrent slams over HTTP resolve exactly as the sequential replay in processing order (C2.1)", async () => {
    const world = await makeWorld(BIG)
    try {
      await world.driveToWindow()
      const alice = world.players[0]!.userId
      const bob = world.players[1]!.userId
      const slams = legalCandidates(world.state, ts(world.now)).filter(
        (c): c is SlamCommand => c._tag === "Slam",
      )
      const slamA = slams.find((c) => c.playerId === alice)!
      const slamB = slams.find((c) => c.playerId === bob)!
      expect(slamA).toBeDefined()
      expect(slamB).toBeDefined() // a genuine cross-player race

      clearPublisherJournal()
      const versionBefore = world.lastVersion
      const [resA, resB] = await Promise.all([world.post(slamA), world.post(slamB)])

      // Processing order is the actor's, not ours: read it back from the
      // journal (each successful slam is one save+publish batch whose events
      // carry the slammerId).
      const entries = world.gameEntries()
      expect(entries.length).toBeGreaterThan(0)
      const orderIds = entries.map(
        (e) => (e.events[0] as { slammerId?: string }).slammerId ?? "unknown",
      )
      const ordered = orderIds[0] === alice ? ([slamA, slamB] as const) : ([slamB, slamA] as const)
      const responseFor = (slam: SlamCommand) => (slam === slamA ? resA : resB)

      // Sequential replay in that order: first is judged against the window
      // state, second against the post-first state — no "exactly one wins"
      // prior; the engine's own answer is the expectation.
      const first = ordered[0]
      const second = ordered[1]
      world.state = apply(world.state, first, world.now)
      const firstRes = responseFor(first)
      expect(firstRes.statusCode).toBe(200)
      const firstBody = firstRes.json() as { view: PlayerGameView; version: number }
      expect(firstBody.view).toEqual(viewFor(toUserId(first.playerId), world.state))
      expect(firstBody.version).toBe(versionBefore + 1)

      const secondPure = legalCandidates(world.state, ts(world.now)).some(
        (c) =>
          c._tag === "Slam" &&
          c.playerId === second.playerId &&
          c.target.playerId === second.target.playerId &&
          c.target.slotIndex === second.target.slotIndex &&
          c.giveSlot === second.giveSlot,
      )
      const secondRes = responseFor(second)
      if (secondPure) {
        world.state = apply(world.state, second, world.now)
        expect(secondRes.statusCode).toBe(200)
        const secondBody = secondRes.json() as { view: PlayerGameView; version: number }
        expect(secondBody.view).toEqual(viewFor(toUserId(second.playerId), world.state))
        expect(secondBody.version).toBe(versionBefore + 2)
        expect(entries.length).toBe(2)
      } else {
        // The loser's refusal is the engine's typed answer for the post-winner
        // state, surfaced as an illegal-move 422.
        expect(secondRes.statusCode).toBe(422)
        expect(entries.length).toBe(1)
      }

      // The persisted truth matches the replay.
      const viewRes = await world.app.inject({
        method: "GET",
        url: `/games/${world.gameId}/view`,
        cookies: { cambio_session: world.players[0]!.cookie },
      })
      expect((viewRes.json() as { view: PlayerGameView }).view).toEqual(
        viewFor(toUserId(alice), world.state),
      )
    } finally {
      await world.close()
    }
  }, 30_000)

  it("sleeping server: the next command lazily closes the expired window as its own batch (C4.1)", async () => {
    const world = await makeWorld(BIG)
    try {
      const phase = await world.driveToWindow()
      // The window expires while no close fiber can fire (BIG real-time timer).
      world.setNow(phase.closesAt + 1)
      world.state = apply(world.state, { _tag: "CloseSlamWindow" }, world.now)

      clearPublisherJournal()
      const versionBefore = world.lastVersion
      const body = await world.step(choose(world.state, world.now))

      // First the close batch — persisted and published on its own — then the
      // command's batch; the reply version reflects both saves.
      const entries = world.gameEntries()
      expect(entries.length).toBe(2)
      expect(entries[0]!.events.map((e) => e._tag)).toEqual(["SlamWindowClosed", "TurnAdvanced"])
      expect(body.version).toBe(versionBefore + 2)
    } finally {
      await world.close()
    }
  }, 30_000)

  it("the timer-fired close arrives through the same persist+publish path, unprompted (C1.6)", async () => {
    const world = await makeWorld(SMALL)
    try {
      const phase = await world.driveToWindow()
      // The timer armed at window-open sleeps ~SMALL ms of REAL time; the
      // authority clock must be past closesAt when it fires for the close to
      // be due (closeIfDue re-validates against ClockPort, never trusts the
      // timer).
      clearPublisherJournal()
      world.setNow(phase.closesAt + 1)

      // Deadline-poll — never a bare sleep-and-assert: generous against CI
      // stalls, far under the suite timeout.
      const deadline = Date.now() + 10_000
      let closeEntries = world.gameEntries()
      while (closeEntries.length === 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25))
        closeEntries = world.gameEntries()
      }
      expect(
        closeEntries.length,
        "timer-fired close published within the 10s deadline",
      ).toBeGreaterThan(0)
      expect(closeEntries[0]!.events.map((e) => e._tag)).toEqual([
        "SlamWindowClosed",
        "TurnAdvanced",
      ])
      expect(closeEntries.length).toBe(1) // exactly one close, no duplicate

      // Equivalence with the lazy world: the same close the lazy path would
      // have produced, and the game continues identically.
      world.state = apply(world.state, { _tag: "CloseSlamWindow" }, world.now)
      const viewRes = await world.app.inject({
        method: "GET",
        url: `/games/${world.gameId}/view`,
        cookies: { cambio_session: world.players[0]!.cookie },
      })
      expect((viewRes.json() as { view: PlayerGameView }).view).toEqual(
        viewFor(toUserId(world.players[0]!.userId), world.state),
      )
      await world.step(choose(world.state, world.now))
      expect(world.gameEntries().length).toBe(2) // close batch + command batch, nothing extra
    } finally {
      await world.close()
    }
  }, 30_000)

  it("restart mid-window over the same rows: late slam 422, then a lazy close on the next command (C4.2)", async () => {
    const worldOne = await makeWorld(BIG)
    let phase: Extract<GameState["phase"], { _tag: "SlamWindow" }>
    let frozen: GameState
    try {
      phase = await worldOne.driveToWindow()
      frozen = worldOne.state
    } finally {
      // The process dies mid-window; the armed timer dies with it.
      await worldOne.close()
    }

    // A second process wakes up after closesAt, over the same database rows
    // and the same session cookies (the signer secret is shared; the clocks
    // stay far inside the session TTL).
    const clockTwo = makeSettableClock(phase.closesAt + 1)
    const { app, runtime } = await makeTestApp({ slamWindowMs: BIG }, { clock: clockTwo.layer })
    try {
      const alice = worldOne.players[0]!
      const lateSlam = legalCandidates(frozen, ts(EPOCH)).find(
        (c): c is SlamCommand => c._tag === "Slam",
      )
      expect(lateSlam).toBeDefined()

      // (a) The rebuilt actor loads the persisted SlamWindow, arms no timer,
      // and judges the slam against the stored closesAt: too late.
      clearPublisherJournal()
      const lateRes = await app.inject({
        method: "POST",
        url: `/games/${worldOne.gameId}/commands`,
        cookies: { cambio_session: worldOne.byId.get(lateSlam!.playerId)!.cookie },
        payload: toWire(lateSlam!),
      })
      expect(lateRes.statusCode).toBe(422)
      expect((lateRes.json() as { error: { tag: string } }).error.tag).toBe("SlamTooLate")
      expect(publisherJournal.filter((e) => e._tag === "game")).toEqual([])

      // (b) The first legal post-close command lazily closes, then runs.
      let state = apply(frozen, { _tag: "CloseSlamWindow" }, phase.closesAt + 1)
      const command = choose(state, phase.closesAt + 1)
      const res = await app.inject({
        method: "POST",
        url: `/games/${worldOne.gameId}/commands`,
        cookies: {
          cambio_session: worldOne.byId.get((command as { playerId: string }).playerId)!.cookie,
        },
        payload: toWire(command),
      })
      expect(res.statusCode).toBe(200)
      state = apply(state, command, phase.closesAt + 1)
      const body = res.json() as { view: PlayerGameView; version: number }
      expect(body.view).toEqual(
        viewFor(toUserId((command as { playerId: string }).playerId), state),
      )

      const entries = publisherJournal.filter(
        (e): e is Extract<(typeof publisherJournal)[number], { _tag: "game" }> => e._tag === "game",
      )
      expect(entries.length).toBe(2)
      expect(entries[0]!.events.map((e) => e._tag)).toEqual(["SlamWindowClosed", "TurnAdvanced"])
      void alice
    } finally {
      await app.close()
      await runtime.dispose()
    }
  }, 30_000)
})
