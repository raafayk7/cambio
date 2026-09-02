import { describe, expect, it } from "@effect/vitest"
import { decodeGameConfig, type GameEvent } from "@cambio/domain"
import { playerCountFor, seedPair, simulateGame } from "@cambio/domain/testing"
import { projectEvents } from "../src/projection/EventProjection.js"
import { viewFor } from "../src/projection/ViewFor.js"
import { entitledSlugs, expectNoLeak, slugsIn } from "./support/leaks.js"

/**
 * The adversarial sweep (root plan C2/C3 negatives, C3.5): drive complete
 * seeded games and, at every intermediate state, project every player's view
 * and assert it contains nothing beyond the independently-computed entitled
 * set — all phases included, rare ones (queen swaps, fizzles, reshuffles)
 * reached by volume. Then project the full event log and assert the room
 * stream carries only rule-public values and private payloads reach exactly
 * the entitled player.
 *
 * Knobs: `VIEW_GAMES` (default 6), `VIEW_SEED` (default 4200) — the
 * `RT_GAMES`/`RT_SEED` precedent.
 */

const GAMES = Number(process.env["VIEW_GAMES"] ?? 6)
const SEED_BASE = Number(process.env["VIEW_SEED"] ?? 4200)

const config = decodeGameConfig({ slamWindowMs: 4000 })

/** Card values that are public in an event stream, by rule (C3.2). */
const publicSlugsOf = (events: ReadonlyArray<GameEvent>): ReadonlySet<string> => {
  const publicSlugs = new Set<string>()
  for (const event of events) {
    switch (event._tag) {
      case "GameStarted":
        publicSlugs.add(event.firstDiscard)
        break
      case "DiscardTaken":
      case "HeldDiscarded":
      case "PowerDiscarded":
        publicSlugs.add(event.card)
        break
      case "HeldSwapped":
        publicSlugs.add(event.discarded)
        break
      case "SlamSucceeded":
      case "SlamFailed":
        publicSlugs.add(event.card)
        break
      default:
        break
    }
  }
  return publicSlugs
}

describe(`adversarial projection sweep (${GAMES} games, seed base ${SEED_BASE})`, () => {
  it("no player's view at any step contains an unentitled value; event projections stay channel-clean", () => {
    let statesChecked = 0
    let viewsChecked = 0
    for (let i = 0; i < GAMES; i++) {
      const [gameSeed, driverSeed] = seedPair(SEED_BASE, i)
      const run = simulateGame({
        gameSeed,
        driverSeed,
        playerCount: playerCountFor(i),
        config,
        onStep: (state) => {
          statesChecked++
          for (const player of state.players) {
            const view = viewFor(player.id, state)
            expectNoLeak(view, entitledSlugs(state, player.id), `game ${i} viewer ${player.id}`)
            viewsChecked++
          }
        },
      })

      // Event-stream discipline over the full game log (C3, C3.5).
      const out = projectEvents(run.events)
      const publicSlugs = publicSlugsOf(run.events)
      const roomLeaks = slugsIn(out.room).filter((s) => !publicSlugs.has(s))
      expect(roomLeaks, `game ${i}: room channel leaked non-public values`).toEqual([])

      // GameEnded is public — but the room stream must never carry the deal.
      const started = run.events[0]
      if (started?._tag === "GameStarted") {
        const dealtSlugs = started.hands.flat().map((s) => s.card)
        const roomSlugs = new Set(slugsIn(out.room))
        for (const dealt of dealtSlugs) {
          // A dealt card may only surface in the room stream once a rule made
          // it public (discard/slam); that is exactly the publicSlugs check
          // above — here we pin the deal itself never leaks wholesale.
          if (!publicSlugs.has(dealt)) {
            expect(roomSlugs.has(dealt), `game ${i}: dealt ${dealt} leaked`).toBe(false)
          }
        }
      }

      // Private payloads reach exactly the entitled player (C3.4).
      const drawnBy = new Map<string, Array<string>>()
      const peekedBy = new Map<string, Array<string>>()
      for (const event of run.events) {
        if (event._tag === "CardDrawn") {
          drawnBy.set(event.playerId, [...(drawnBy.get(event.playerId) ?? []), event.card])
        }
        if (event._tag === "CardPeeked") {
          peekedBy.set(event.viewerId, [...(peekedBy.get(event.viewerId) ?? []), event.card])
        }
      }
      for (const [playerId, privates] of out.perPlayer) {
        for (const priv of privates) {
          if (priv._tag === "PrivateCardDrawn") {
            expect(drawnBy.get(playerId) ?? [], `game ${i}: stray private draw`).toContain(
              priv.card,
            )
          } else {
            expect(peekedBy.get(playerId) ?? [], `game ${i}: stray private peek`).toContain(
              priv.card,
            )
          }
        }
      }
      // ...and conversely, every entitled delivery happened.
      for (const [playerId, cards] of drawnBy) {
        const delivered = (out.perPlayer.get(playerId as never) ?? [])
          .filter((e) => e._tag === "PrivateCardDrawn")
          .map((e) => e.card)
        expect(delivered, `game ${i}: missing private draws for ${playerId}`).toEqual(cards)
      }
    }
    expect(statesChecked).toBeGreaterThan(0)
    expect(viewsChecked).toBeGreaterThan(0)
  })
})
