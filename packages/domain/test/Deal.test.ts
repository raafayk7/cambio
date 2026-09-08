import { describe, expect, it } from "@effect/vitest"
import { Either } from "effect"
import { ALL_CARD_SLUGS } from "../src/Card.js"
import { dealGame } from "../src/Deal.js"
import { applyCommand } from "../src/Engine.js"
import { decodeGameConfig } from "../src/GameConfig.js"
import { allCards } from "../src/GameState.js"
import { legalCommandKinds } from "../src/Legality.js"
import { ts, uid } from "./fixtures.js"

const config = decodeGameConfig({ slamWindowMs: 4000 })
const now = ts(1_700_000_000_000)

const dealt = (n: number, seed = 42) => {
  const result = dealGame(
    Array.from({ length: n }, (_, i) => uid(i)),
    seed,
    config,
    now,
  )
  if (Either.isLeft(result)) throw new Error(`deal failed: ${result.left._tag}`)
  return result.right
}

describe("dealGame", () => {
  it("rejects player counts outside 2–4 (C1.1, §1.1)", () => {
    for (const n of [0, 1, 5, 6]) {
      const result = dealGame(
        Array.from({ length: n }, (_, i) => uid(i)),
        1,
        config,
        now,
      )
      expect(Either.isLeft(result)).toBe(true)
      if (Either.isLeft(result)) {
        expect(result.left._tag).toBe("BadPlayerCount")
      }
    }
  })

  it("deals 4 cards to slots 0–3 per player, empty discard, rest as deck (C1.2, §1.1, ADR-0039)", () => {
    for (const n of [2, 3, 4]) {
      const [state] = dealt(n)
      expect(state.players).toHaveLength(n)
      for (const player of state.players) {
        expect(player.hand).toHaveLength(4)
        expect(player.hand.map((s) => s.slotIndex)).toStrictEqual([0, 1, 2, 3])
      }
      expect(state.discard).toStrictEqual([])
      expect(state.deck).toHaveLength(52 - 4 * n)
    }
  })

  it("partitions all 52 slugs with no duplicates (C1.4, §4.5)", () => {
    const [state] = dealt(4)
    const cards = allCards(state)
    expect(cards).toHaveLength(52)
    expect(new Set(cards).size).toBe(52)
    expect([...cards].sort()).toStrictEqual([...ALL_CARD_SLUGS].sort())
  })

  it("starts at AwaitingDraw for seat 0 — no opening peek (C1.3, §1.1)", () => {
    const [state, events] = dealt(3)
    expect(state.phase).toStrictEqual({ _tag: "AwaitingDraw", playerId: uid(0) })
    expect(events.map((e) => e._tag)).toStrictEqual(["GameStarted"])
  })

  it("is deterministic and the GameStarted event matches the state (C1.3, C8.1)", () => {
    const a = dealt(3)
    const b = dealt(3)
    expect(a).toStrictEqual(b)

    const [state, events] = a
    const started = events[0]!
    if (started._tag !== "GameStarted") throw new Error("expected GameStarted")
    expect(started.hands).toStrictEqual(state.players.map((p) => p.hand))
    expect(started.deck).toStrictEqual(state.deck)
    expect(started).not.toHaveProperty("firstDiscard")
    expect(started.players).toStrictEqual(state.players.map((p) => p.id))
    expect(started.at).toBe(now)
    expect(started.seed).toBe(42)
    expect(started.prng).toStrictEqual(state.prng)
  })

  it("differs across seeds", () => {
    expect(dealt(3, 1)[0].deck).not.toStrictEqual(dealt(3, 2)[0].deck)
  })

  it("opening state (empty discard, ADR-0039): TakeDiscard is illegal, only draw-or-call is legal (C2)", () => {
    const [state] = dealt(2)
    const p0 = state.players[0]!.id
    const result = applyCommand(state, { _tag: "TakeDiscard", playerId: p0 }, now)
    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) expect(result.left._tag).toBe("EmptyDiscard")
    expect(legalCommandKinds(state, p0, now)).toStrictEqual(["CallCambio", "DrawFromDeck"])
  })
})
