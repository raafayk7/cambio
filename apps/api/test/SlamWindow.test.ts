import { describe, expect, it } from "@effect/vitest"
import { projectEvents, viewFor } from "@cambio/application"
import type { PlayerGameView } from "@cambio/contracts"
import {
  applyCommand,
  type Command,
  dealGame,
  decodeGameConfig,
  type GameState,
  UserId,
} from "@cambio/domain"
import { legalCandidates, ts } from "@cambio/domain/testing"
import { Either, Schema } from "effect"

import { apply, setupGame, toWire } from "./support/game-driver.js"
import {
  clearPublisherJournal,
  makeSettableClock,
  makeTestApp,
  type PublishedEntry,
  publisherJournal,
  TEST_SEED,
} from "./support/http.js"
import { entitledSlugs, expectNoLeak, rulePublicSlugs, slugsIn } from "./support/leaks.js"

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

type GameEntry = Extract<PublishedEntry, { readonly _tag: "game" }>

/**
 * The event tags a slam ATTEMPT can persist. Used to assert race-free that a
 * refused slam left no trace: a due window's close batch may legally land at
 * any moment (the refused envelope re-arms a zero-duration timer), so
 * "journal is empty" would race — "no slam outcome anywhere" does not.
 */
const SLAM_OUTCOME_TAGS: ReadonlySet<string> = new Set([
  "SlamSucceeded",
  "SlamFailed",
  "PenaltyDrawn",
  "CardGivenFromHand",
  "CardGivenFromDeck",
  "DrawSkipped",
])
const expectNoSlamPersisted = (entries: ReadonlyArray<GameEntry>, context: string) => {
  for (const entry of entries) {
    expect(
      entry.events.map((e) => e._tag).filter((t) => SLAM_OUTCOME_TAGS.has(t)),
      `${context}: refused slam must persist nothing`,
    ).toEqual([])
  }
}

/** Room-stream leak scan: only rule-public card values may appear (§1.5). */
const expectRoomRevealOnly = (entry: GameEntry, context: string) => {
  const projected = projectEvents(entry.events)
  const publicSlugs = rulePublicSlugs(entry.events)
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
      const handBefore = world.state.players[1]!.hand.length
      clearPublisherJournal()
      const body = await world.step(slam)
      if (body.view.phase._tag !== "SlamWindow") throw new Error("window should stay open")
      expect(body.view.phase.closesAt).toBe(EPOCH + BIG)

      // Hand shrank by one; the slammed slot is a hole (no shift).
      const handAfter = world.state.players[1]!.hand
      expect(handAfter.length).toBe(handBefore - 1)
      expect(handAfter.some((h) => h.slotIndex === matching[0]!.slotIndex)).toBe(false)

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
      const projectedGive = projectEvents(correctEntry.events).room.find(
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
      // The failed attempt's reveal also rides the room channel (§1.5 —
      // "correct or not"; review F3: assert presence, not just leak-freedom).
      const failReveal = projectedOwnFail.room.find((e) => e._tag === "SlamFailed")
      expect(failReveal).toMatchObject({ card: aliceOther[0]!.card })
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

  it("a late slam is 422 SlamTooLate, persists nothing, and the window closes exactly once (C1.3/C1.4)", async () => {
    const world = await makeWorld(BIG)
    try {
      const phase = await world.driveToWindow()
      // Legal while the window was open…
      const anySlam = legalCandidates(world.state, ts(world.now)).find(
        (c): c is SlamCommand => c._tag === "Slam",
      )
      expect(anySlam).toBeDefined()

      // …but the window expires before it arrives. The slam is judged
      // against the still-open stored phase (the lazy close is skipped for
      // Slam), so the refusal is SlamTooLate, never WrongPhase.
      world.setNow(phase.closesAt + 1)
      clearPublisherJournal()
      const res = await world.post(anySlam!)
      expect(res.statusCode).toBe(422)
      expect((res.json() as { error: { tag: string } }).error.tag).toBe("SlamTooLate")

      // The refused envelope re-arms the close timer with a ZERO duration
      // (the window is past due), so the actor may close the window at any
      // moment now — timer or the next command's lazy path, equivalently
      // (ADR-0020). Only race-free claims follow: the window closes exactly
      // once, before the next command's events, and the refusal itself
      // persisted no slam outcome.
      world.state = apply(world.state, { _tag: "CloseSlamWindow" }, world.now)
      await world.step(choose(world.state, world.now))
      const entries = world.gameEntries()
      expect(entries.length).toBe(2)
      expect(entries[0]!.events.map((e) => e._tag)).toEqual(["SlamWindowClosed", "TurnAdvanced"])
      expectNoSlamPersisted(entries, "late slam over HTTP")
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
      const orderIds = entries.map((e) => {
        const head = e.events[0]
        if (head === undefined || !("slammerId" in head)) {
          throw new Error(
            `journal batch without a slammer head: ${JSON.stringify(e.events.map((ev) => ev._tag))}`,
          )
        }
        return head.slammerId as string
      })
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

      // The engine's own answer for the loser: judged against the
      // post-winner state, whatever it says.
      const pureSecond = applyCommand(world.state, second, ts(world.now))
      const secondRes = responseFor(second)
      if (Either.isRight(pureSecond)) {
        world.state = pureSecond.right[0]
        expect(secondRes.statusCode).toBe(200)
        const secondBody = secondRes.json() as { view: PlayerGameView; version: number }
        expect(secondBody.view).toEqual(viewFor(toUserId(second.playerId), world.state))
        expect(secondBody.version).toBe(versionBefore + 2)
        expect(entries.length).toBe(2)
      } else {
        // The loser's refusal is the engine's typed answer for the
        // post-winner state, surfaced with its exact tag as an illegal-move
        // 422 (review F6: not just any 422).
        expect(secondRes.statusCode).toBe(422)
        expect((secondRes.json() as { error: { tag: string } }).error.tag).toBe(
          pureSecond.left._tag,
        )
        expect(entries.length).toBe(1)
      }

      // The persisted truth matches the replay — and leaks nothing.
      const viewRes = await world.app.inject({
        method: "GET",
        url: `/games/${world.gameId}/view`,
        cookies: { cambio_session: world.players[0]!.cookie },
      })
      const viewBody = viewRes.json() as { view: PlayerGameView; version: number }
      expect(viewBody.view).toEqual(viewFor(toUserId(alice), world.state))
      expectNoLeak(viewBody, entitledSlugs(world.state, toUserId(alice)), "post-race view")
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
      const viewBody = viewRes.json() as { view: PlayerGameView; version: number }
      expect(viewBody.view).toEqual(viewFor(toUserId(world.players[0]!.userId), world.state))
      expectNoLeak(
        viewBody,
        entitledSlugs(world.state, toUserId(world.players[0]!.userId)),
        "post-timer-close view",
      )
      await world.step(choose(world.state, world.now))
      expect(world.gameEntries().length).toBe(2) // close batch + command batch, nothing extra
    } finally {
      await world.close()
    }
  }, 30_000)

  it("restart mid-window over the same rows: late slam 422, window closed exactly once before the next command (C4.2)", async () => {
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
      const lateSlam = legalCandidates(frozen, ts(EPOCH)).find(
        (c): c is SlamCommand => c._tag === "Slam",
      )
      expect(lateSlam).toBeDefined()

      // (a) The rebuilt actor loads the persisted SlamWindow (its bootstrap
      // arms nothing) and judges the slam against the stored closesAt: too
      // late. The refused envelope then re-arms a zero-duration timer, so
      // the close below may arrive via that timer or via (b)'s lazy path —
      // ADR-0020 pins their equivalence and the journal reads the same
      // either way.
      clearPublisherJournal()
      const lateRes = await app.inject({
        method: "POST",
        url: `/games/${worldOne.gameId}/commands`,
        cookies: { cambio_session: worldOne.byId.get(lateSlam!.playerId)!.cookie },
        payload: toWire(lateSlam!),
      })
      expect(lateRes.statusCode).toBe(422)
      expect((lateRes.json() as { error: { tag: string } }).error.tag).toBe("SlamTooLate")

      // (b) The first legal post-close command runs against the closed window.
      let state = apply(frozen, { _tag: "CloseSlamWindow" }, phase.closesAt + 1)
      const command = choose(state, phase.closesAt + 1)
      const issuer = toUserId((command as { playerId: string }).playerId)
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
      expect(body.view).toEqual(viewFor(issuer, state))
      expectNoLeak(body, entitledSlugs(state, issuer), "restart command reply")

      // Exactly one close batch, before the command's; the refusal itself
      // persisted no slam outcome.
      const entries = publisherJournal.filter(
        (e): e is GameEntry => e._tag === "game" && e.gameId === worldOne.gameId,
      )
      expect(entries.length).toBe(2)
      expect(entries[0]!.events.map((e) => e._tag)).toEqual(["SlamWindowClosed", "TurnAdvanced"])
      expectNoSlamPersisted(entries, "restart late slam")
    } finally {
      await app.close()
      await runtime.dispose()
    }
  }, 30_000)
})
