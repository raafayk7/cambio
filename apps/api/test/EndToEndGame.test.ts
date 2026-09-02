import { describe, expect, it } from "@effect/vitest"
import { projectEvents, viewFor } from "@cambio/application"
import type { PlayerGameView } from "@cambio/contracts"
import {
  applyCommand,
  type Command,
  dealGame,
  decodeGameConfig,
  gameScores,
  type GameState,
  Timestamp,
  UserId,
  winnersOf,
} from "@cambio/domain"
import { legalCandidates, ts } from "@cambio/domain/testing"
import { Either, Schema } from "effect"

import {
  clearPublisherJournal,
  makeTestApp,
  publisherJournal,
  TEST_SEED,
} from "./support/http.js"
import { entitledSlugs, expectNoLeak, slugsIn } from "./support/leaks.js"

/**
 * The scripted full game over HTTP (root acceptance + C6.1): every command
 * flows through `POST /games/:gameId/commands`, every reply is checked
 * against a local replay of the pure engine (fixed `TEST_SEED`, decision 15),
 * and every payload — replies and the publisher journal — passes the no-leak
 * assertion for its recipient.
 *
 * `slamWindowMs: 1` makes every slam window lazily closed by the next
 * command (the actor's lazy close, pinned by CAM-5); the local replay
 * mirrors that by applying `CloseSlamWindow` at `closesAt`. A dedicated
 * suite below uses a 60s window to exercise a real `Slam` over HTTP.
 *
 * View comparison normalizes `SlamWindow.closesAt` — the only view field
 * derived from the server's real clock rather than the seed.
 */

const toUserId = Schema.decodeUnknownSync(UserId)

interface Player {
  readonly userId: string
  readonly cookie: string
}

const makePlayers = async (
  app: Awaited<ReturnType<typeof makeTestApp>>["app"],
  names: ReadonlyArray<string>,
): Promise<ReadonlyArray<Player>> => {
  const players: Array<Player> = []
  for (const name of names) {
    const res = await app.inject({ method: "POST", url: "/users", payload: { name } })
    expect(res.statusCode).toBe(201)
    players.push({
      userId: (res.json() as { userId: string }).userId,
      cookie: res.cookies.find((c) => c.name === "cambio_session")!.value,
    })
  }
  return players
}

/** Wire body for a domain command: the issuer field simply does not exist. */
const toWire = (command: Command): Record<string, unknown> => {
  switch (command._tag) {
    case "CallCambio":
    case "TakeDiscard":
    case "DrawFromDeck":
    case "DiscardHeld":
    case "KeepHeld":
      return { _tag: command._tag }
    case "SwapHeld":
      return { _tag: "SwapHeld", slotIndex: command.slotIndex }
    case "PowerPeek":
      return { _tag: "PowerPeek", target: command.target }
    case "PowerSwap":
      return { _tag: "PowerSwap", first: command.first, second: command.second }
    case "Slam":
      return { _tag: "Slam", target: command.target, giveSlot: command.giveSlot }
    case "CloseSlamWindow":
      throw new Error("CloseSlamWindow never goes over the wire")
    default:
      return command satisfies never
  }
}

const normalize = (view: PlayerGameView): PlayerGameView =>
  view.phase._tag === "SlamWindow"
    ? { ...view, phase: { ...view.phase, closesAt: 0 } }
    : view

const apply = (state: GameState, command: Command, at: number): GameState => {
  const result = applyCommand(state, command, ts(at))
  if (Either.isLeft(result)) {
    throw new Error(`local replay rejected ${command._tag}: ${result.left._tag}`)
  }
  return result.right[0]
}

/** A command a player issues over the wire — never the server-internal close. */
type IssuedCommand = Exclude<Command, { readonly _tag: "CloseSlamWindow" }>

/**
 * Deterministic policy: draw-first (a take-discard preference can cycle two
 * players forever without ever touching the deck), with one-shot detours so
 * the script covers TakeDiscard and SwapHeld, and Cambio only after both a
 * power has resolved and enough turns have passed.
 */
const choose = (
  state: GameState,
  at: number,
  turnsSoFar: number,
  seen: ReadonlySet<string>,
): IssuedCommand => {
  const candidates = legalCandidates(state, ts(at)).filter(
    (c): c is IssuedCommand => c._tag !== "Slam" && c._tag !== "CloseSlamWindow",
  )
  if (candidates.length === 0) throw new Error(`no candidates in ${state.phase._tag}`)
  const find = (tag: Command["_tag"]) => candidates.find((c) => c._tag === tag)

  const powerSeen = seen.has("PowerPeek") || seen.has("PowerSwap")
  if (turnsSoFar >= 16 && powerSeen) {
    const cambio = find("CallCambio")
    if (cambio !== undefined) return cambio
  }
  const power = find("PowerPeek") ?? find("PowerSwap")
  if (power !== undefined) return power
  if (!seen.has("TakeDiscard")) {
    const take = find("TakeDiscard")
    if (take !== undefined) return take
  }
  if (!seen.has("SwapHeld")) {
    const swap = find("SwapHeld")
    if (swap !== undefined) return swap
  }
  const priority: ReadonlyArray<Command["_tag"]> = [
    "DiscardHeld",
    "SwapHeld",
    "KeepHeld",
    "DrawFromDeck",
  ]
  for (const tag of priority) {
    const found = find(tag)
    if (found !== undefined) return found
  }
  return candidates[0]!
}

describe("end-to-end scripted game (acceptance, C6.1)", () => {
  it("plays a full game over HTTP; every reply and published payload is leak-free", async () => {
    const { app, runtime } = await makeTestApp({ slamWindowMs: 1 })
    try {
      const [alice, bob] = await makePlayers(app, ["Alice", "Bob"])
      const byId = new Map([
        [alice!.userId, alice!],
        [bob!.userId, bob!],
      ])

      const created = (
        await app.inject({
          method: "POST",
          url: "/lobbies",
          cookies: { cambio_session: alice!.cookie },
        })
      ).json() as { lobby: { id: string } }
      const gameId = created.lobby.id
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/lobbies/${gameId}/join`,
            cookies: { cambio_session: bob!.cookie },
          })
        ).statusCode,
      ).toBe(200)

      clearPublisherJournal()
      const startRes = await app.inject({
        method: "POST",
        url: `/lobbies/${gameId}/start`,
        cookies: { cambio_session: alice!.cookie },
      })
      expect(startRes.statusCode).toBe(200)

      // Local replay of the server's deal — pure, same seed, same game.
      const dealt = dealGame(
        [toUserId(alice!.userId), toUserId(bob!.userId)],
        TEST_SEED,
        decodeGameConfig({ slamWindowMs: 1 }),
        ts(0),
      )
      if (Either.isLeft(dealt)) throw new Error("local deal failed")
      let state = dealt.right[0]

      const startBody = startRes.json() as { view: PlayerGameView; version: number }
      expect(normalize(startBody.view)).toEqual(
        normalize(viewFor(toUserId(alice!.userId), state)),
      )

      let at = 0
      let turns = 0
      const commandTags = new Set<string>()
      for (let step = 0; step < 400 && state.phase._tag !== "Ended"; step++) {
        at += 5000
        if (state.phase._tag === "SlamWindow") {
          // The 1ms window is expired; the server lazy-closes before the next
          // command — mirror it locally, no HTTP call.
          const closesAt = state.phase.closesAt
          state = apply(state, { _tag: "CloseSlamWindow" }, Math.max(at, closesAt))
          turns++
          continue
        }
        const command = choose(state, at, turns, commandTags)
        commandTags.add(command._tag)
        const actor = byId.get(command.playerId)!
        const res = await app.inject({
          method: "POST",
          url: `/games/${gameId}/commands`,
          cookies: { cambio_session: actor.cookie },
          payload: toWire(command),
        })
        expect(res.statusCode, `${command._tag} at step ${step}`).toBe(200)
        state = apply(state, command, at)

        const body = res.json() as { view: PlayerGameView; version: number }
        expect(Object.keys(body).sort(), "reply envelope shape").toEqual(["version", "view"])
        expect(normalize(body.view), `view after ${command._tag}`).toEqual(
          normalize(viewFor(command.playerId, state)),
        )
        expectNoLeak(
          body,
          entitledSlugs(state, command.playerId),
          `reply to ${command._tag}`,
        )
      }

      expect(state.phase._tag).toBe("Ended")
      // Script breadth: the game exercised a draw, a resolution, and a power.
      expect(commandTags.has("DrawFromDeck")).toBe(true)
      expect(
        commandTags.has("PowerPeek") || commandTags.has("PowerSwap"),
        `power exercised (saw: ${[...commandTags].join(", ")})`,
      ).toBe(true)

      // The final reply's reveal matches the pure scoring.
      const scores = gameScores(state)
      const finalView = viewFor(toUserId(alice!.userId), state)
      expect(finalView.reveal?.scores).toEqual(
        scores.map((s) => ({ playerId: s.playerId, total: s.total })),
      )
      expect(finalView.reveal?.winners).toEqual(winnersOf(scores))

      // Publisher journal: full-truth in (server-side), and the projected
      // room stream for every entry carries only rule-public values.
      const gameEntries = publisherJournal.filter((e) => e._tag === "game")
      expect(gameEntries.length).toBeGreaterThan(0)
      for (const entry of gameEntries) {
        const projected = projectEvents(entry.events)
        const publicSlugs = new Set<string>()
        for (const event of entry.events) {
          switch (event._tag) {
            case "GameStarted":
              publicSlugs.add(event.firstDiscard)
              break
            case "DiscardTaken":
            case "HeldDiscarded":
            case "PowerDiscarded":
            case "SlamSucceeded":
            case "SlamFailed":
              publicSlugs.add(event.card)
              break
            case "HeldSwapped":
              publicSlugs.add(event.discarded)
              break
            default:
              break
          }
        }
        const leaks = slugsIn(projected.room).filter((s) => !publicSlugs.has(s))
        expect(leaks, "published room stream").toEqual([])
      }
    } finally {
      await app.close()
      await runtime.dispose()
    }
  }, 60_000)
})

describe("a real Slam over HTTP (large window)", () => {
  it("a slam inside an open window round-trips with a leak-free reply", async () => {
    const { app, runtime } = await makeTestApp({ slamWindowMs: 60_000 })
    try {
      const [alice, bob] = await makePlayers(app, ["Alice", "Bob"])
      const byId = new Map([
        [alice!.userId, alice!],
        [bob!.userId, bob!],
      ])
      const created = (
        await app.inject({
          method: "POST",
          url: "/lobbies",
          cookies: { cambio_session: alice!.cookie },
        })
      ).json() as { lobby: { id: string } }
      const gameId = created.lobby.id
      await app.inject({
        method: "POST",
        url: `/lobbies/${gameId}/join`,
        cookies: { cambio_session: bob!.cookie },
      })
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/lobbies/${gameId}/start`,
            cookies: { cambio_session: alice!.cookie },
          })
        ).statusCode,
      ).toBe(200)

      const dealt = dealGame(
        [toUserId(alice!.userId), toUserId(bob!.userId)],
        TEST_SEED,
        decodeGameConfig({ slamWindowMs: 60_000 }),
        ts(0),
      )
      if (Either.isLeft(dealt)) throw new Error("local deal failed")
      let state = dealt.right[0]

      // Play turns until a slam window opens, then slam inside it.
      let at = 0
      for (let step = 0; step < 40 && state.phase._tag !== "SlamWindow"; step++) {
        at += 50
        const command = choose(state, at, 0, new Set())
        const actor = byId.get(command.playerId)!
        const res = await app.inject({
          method: "POST",
          url: `/games/${gameId}/commands`,
          cookies: { cambio_session: actor.cookie },
          payload: toWire(command),
        })
        expect(res.statusCode, command._tag).toBe(200)
        state = apply(state, command, at)
      }
      expect(state.phase._tag).toBe("SlamWindow")
      if (state.phase._tag !== "SlamWindow") return

      const inWindow = Timestamp.make(state.phase.closesAt - 1)
      const slam = legalCandidates(state, inWindow).find(
        (c): c is Extract<Command, { readonly _tag: "Slam" }> => c._tag === "Slam",
      )
      expect(slam, "a legal slam candidate exists").toBeDefined()
      const actor = byId.get(slam!.playerId)!
      const res = await app.inject({
        method: "POST",
        url: `/games/${gameId}/commands`,
        cookies: { cambio_session: actor.cookie },
        payload: toWire(slam!),
      })
      expect(res.statusCode).toBe(200)
      state = apply(state, slam!, inWindow)

      const body = res.json() as { view: PlayerGameView; version: number }
      expect(normalize(body.view)).toEqual(normalize(viewFor(slam!.playerId, state)))
      expectNoLeak(body, entitledSlugs(state, slam!.playerId), "slam reply")
    } finally {
      await app.close()
      await runtime.dispose()
    }
  }, 60_000)
})
