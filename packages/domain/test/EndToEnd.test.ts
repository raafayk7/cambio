import { describe, expect, it } from "@effect/vitest"
import { Either, Option } from "effect"
import { ALL_CARD_SLUGS, rank } from "../src/Card.js"
import { type Command } from "../src/Command.js"
import { dealGame } from "../src/Deal.js"
import { applyCommand } from "../src/Engine.js"
import { decodeGameConfig } from "../src/GameConfig.js"
import { type GameEvent } from "../src/GameEvent.js"
import { allCards, type GameState, handOf, occupiedSlots } from "../src/GameState.js"
import { Timestamp } from "../src/Ids.js"
import { legalCommandKinds } from "../src/Legality.js"
import { gameScores, winnersOf } from "../src/Scoring.js"
import { prngStateFromSeed } from "../src/Prng.js"
import { card, slot, ts, uid } from "./fixtures.js"

const config = decodeGameConfig({ slamWindowMs: 4000 })
const players = [uid(0), uid(1), uid(2)]
const FULL_DECK_SORTED = [...ALL_CARD_SLUGS].sort()

/**
 * Deterministic full-game driver (C8, root acceptance criteria). Decisions
 * are a pure function of the current state plus what has already been
 * covered, so the whole run is replayable: same seed, same commands, same
 * game. The driver deliberately covers a discard take, a held swap, a
 * direct discard, power resolutions, one failed and one successful slam, a
 * reshuffle, and a Cambio call.
 */
interface Trace {
  readonly commands: ReadonlyArray<Command>
  readonly events: ReadonlyArray<GameEvent>
  readonly finalState: GameState
  readonly steps: number
}

const lowestOccupied = (state: GameState, playerId: (typeof players)[number]) => {
  const hand = Option.getOrElse(handOf(state, playerId), () => [])
  return hand.length > 0 ? hand[0]!.slotIndex : undefined
}

const drive = (seed: number): Trace => {
  const [initialState, dealEvents] = Either.getOrThrow(dealGame(players, seed, config, ts(0)))
  let state = initialState
  const commands: Command[] = []
  const events: GameEvent[] = [...dealEvents]
  const seen = new Set<string>(dealEvents.map((e) => e._tag))
  let steps = 0

  const next = (command: Command, now: Timestamp): void => {
    const result = applyCommand(state, command, now)
    if (Either.isLeft(result)) {
      throw new Error(`illegal ${command._tag} at step ${steps}: ${result.left._tag}`)
    }
    commands.push(command)
    events.push(...result.right[1])
    for (const e of result.right[1]) seen.add(e._tag)
    state = result.right[0]
    // The 52-card partition holds after every single step (§4.5).
    expect([...allCards(state)].sort(), `partition after step ${steps}`).toStrictEqual(
      FULL_DECK_SORTED,
    )
  }

  while (state.phase._tag !== "Ended" && steps < 5000) {
    steps++
    const phase = state.phase
    const now = ts(1000 * steps)

    switch (phase._tag) {
      case "AwaitingDraw": {
        const kinds = legalCommandKinds(state, phase.playerId, now)
        if (seen.has("DeckReshuffled") && phase.playerId === players[0]) {
          next({ _tag: "CallCambio", playerId: phase.playerId }, now)
        } else if (!seen.has("DiscardTaken") && kinds.includes("TakeDiscard")) {
          next({ _tag: "TakeDiscard", playerId: phase.playerId }, now)
        } else if (kinds.includes("DrawFromDeck")) {
          next({ _tag: "DrawFromDeck", playerId: phase.playerId }, now)
        } else {
          next({ _tag: "CallCambio", playerId: phase.playerId }, now)
        }
        break
      }

      case "HoldingCard": {
        const own = lowestOccupied(state, phase.playerId)
        if (own === undefined) {
          next({ _tag: "KeepHeld", playerId: phase.playerId }, now)
        } else if (phase.source === "discard" || !seen.has("HeldSwapped")) {
          next({ _tag: "SwapHeld", playerId: phase.playerId, slotIndex: own }, now)
        } else {
          next({ _tag: "DiscardHeld", playerId: phase.playerId }, now)
        }
        break
      }

      case "ResolvingPower":
      case "ResolvingQueenSwap": {
        const power = rank(phase.card)
        if (phase._tag === "ResolvingPower" && (power === "7" || power === "8")) {
          next(
            {
              _tag: "PowerPeek",
              playerId: phase.playerId,
              target: {
                playerId: phase.playerId,
                slotIndex: lowestOccupied(state, phase.playerId)!,
              },
            },
            now,
          )
        } else if (phase._tag === "ResolvingPower" && (power === "9" || power === "T")) {
          const victim = state.players.find((p) => p.id !== phase.playerId && p.hand.length > 0)!
          next(
            {
              _tag: "PowerPeek",
              playerId: phase.playerId,
              target: { playerId: victim.id, slotIndex: victim.hand[0]!.slotIndex },
            },
            now,
          )
        } else if (phase._tag === "ResolvingPower" && power === "Q") {
          const anyTarget = occupiedSlots(state)[0]!
          next({ _tag: "PowerPeek", playerId: phase.playerId, target: anyTarget }, now)
        } else {
          const [first, second] = occupiedSlots(state)
          next({ _tag: "PowerSwap", playerId: phase.playerId, first: first!, second: second! }, now)
        }
        break
      }

      case "SlamWindow": {
        const inWindow = Timestamp.make(phase.closesAt - 1)
        const own = occupiedSlots(state).filter((ref) => ref.playerId === phase.turnPlayerId)
        const mismatch = own.find(
          (ref) =>
            rank(
              state.players
                .find((p) => p.id === ref.playerId)!
                .hand.find((s) => s.slotIndex === ref.slotIndex)!.card,
            ) !== phase.rank,
        )
        const match = occupiedSlots(state).find(
          (ref) =>
            rank(
              state.players
                .find((p) => p.id === ref.playerId)!
                .hand.find((s) => s.slotIndex === ref.slotIndex)!.card,
            ) === phase.rank,
        )
        if (!seen.has("SlamFailed") && mismatch !== undefined) {
          next(
            { _tag: "Slam", playerId: phase.turnPlayerId, target: mismatch, giveSlot: null },
            inWindow,
          )
        } else if (!seen.has("SlamSucceeded") && match !== undefined) {
          next({ _tag: "Slam", playerId: match.playerId, target: match, giveSlot: null }, inWindow)
        } else {
          next({ _tag: "CloseSlamWindow" }, phase.closesAt)
        }
        break
      }
    }
  }

  return { commands, events, finalState: state, steps }
}

describe("a full scripted game (C8, seed 42)", () => {
  const trace = drive(42)

  it("terminates by Cambio call with a consistent Ended phase", () => {
    expect(trace.steps).toBeLessThan(5000)
    expect(trace.finalState.phase._tag).toBe("Ended")
  })

  it("covers every required mechanic in one game", () => {
    const tags = new Set(trace.events.map((e) => e._tag))
    for (const required of [
      "GameStarted",
      "DiscardTaken",
      "HeldSwapped",
      "HeldDiscarded",
      "CardPeeked",
      "CardsBlindSwapped",
      "PowerDiscarded",
      "SlamFailed",
      "PenaltyDrawn",
      "SlamSucceeded",
      "DeckReshuffled",
      "SlamWindowOpened",
      "SlamWindowClosed",
      "TurnAdvanced",
      "CambioCalled",
      "GameEnded",
    ]) {
      expect(tags, `event ${required} occurred`).toContain(required)
    }
  })

  it("reports final scores that match an independent recomputation (§1.8)", () => {
    const ended = trace.events.at(-1)!
    if (ended._tag !== "GameEnded") throw new Error("last event must be GameEnded")
    const recomputed = gameScores(trace.finalState)
    expect(ended.scores).toStrictEqual(recomputed)
    expect(ended.winners).toStrictEqual(winnersOf(recomputed))
    expect(ended.winners.length).toBeGreaterThan(0)
  })

  it("is deterministic: replaying yields the identical game (C8.1)", () => {
    const replay = drive(42)
    expect(replay.commands).toStrictEqual(trace.commands)
    expect(replay.events).toStrictEqual(trace.events)
    expect(replay.finalState).toStrictEqual(trace.finalState)
  })

  it("enumerates sane legal moves after the deal (C7.2)", () => {
    const [initial] = Either.getOrThrow(dealGame(players, 42, config, ts(0)))
    const active = legalCommandKinds(initial, players[0]!, ts(1))
    expect(active[0]).toBe("CallCambio")
    expect(active).toContain("DrawFromDeck")
    expect(legalCommandKinds(initial, players[1]!, ts(1))).toStrictEqual([])
  })
})

describe("ties (§1.8)", () => {
  it("returns every lowest-score player as a winner", () => {
    const tied: GameState = {
      players: [
        { id: players[0]!, hand: [{ slotIndex: slot(0), card: card("2S") }] },
        { id: players[1]!, hand: [{ slotIndex: slot(0), card: card("2H") }] },
        { id: players[2]!, hand: [{ slotIndex: slot(0), card: card("9D") }] },
      ],
      deck: [],
      discard: [card("4S")],
      prng: prngStateFromSeed(1),
      phase: { _tag: "AwaitingDraw", playerId: players[1]! },
      config,
    }
    const result = applyCommand(tied, { _tag: "CallCambio", playerId: players[1]! }, ts(5))
    const [, events] = Either.getOrThrow(result)
    const ended = events[1]!
    if (ended._tag !== "GameEnded") throw new Error("expected GameEnded")
    expect(ended.winners).toStrictEqual([players[0]!, players[1]!])
  })
})
