import { type Command } from "../../src/Command.js"
import { type GameState, type SlotRef } from "../../src/GameState.js"
import { type SlotIndex, type UserId } from "../../src/Ids.js"
import { slot, uid } from "../fixtures.js"
import { type DriverRng } from "./rng.js"

/**
 * Structurally-valid but mostly-illegal command generation (C4.1) and
 * per-tag argument sampling for the C4.2 cross-check. Field pools
 * deliberately include bad values: a non-roster player (`uid(99)`), slot
 * indices up to 7 (hands start at 0–3), and arbitrary give-slots — so the
 * generator reaches wrong-player, wrong-phase, empty-slot, and
 * unknown-player rejections on every phase.
 */

// A Record keyed by the full tag union: a future Command case fails to
// compile here instead of silently dropping out of fuzz coverage.
const TAG_SET: Record<Command["_tag"], true> = {
  CallCambio: true,
  TakeDiscard: true,
  DrawFromDeck: true,
  SwapHeld: true,
  DiscardHeld: true,
  KeepHeld: true,
  PowerPeek: true,
  PowerSwap: true,
  Slam: true,
  CloseSlamWindow: true,
}
const TAGS = Object.keys(TAG_SET) as ReadonlyArray<Command["_tag"]>

/** A fixed non-roster player: the UnknownPlayer path. */
const OUTSIDER = uid(99)

const randPlayer = (state: GameState, rng: DriverRng): UserId =>
  rng.pick([...state.players.map((p) => p.id), OUTSIDER])

const randSlot = (rng: DriverRng): SlotIndex => slot(rng.int(8))

const randRef = (state: GameState, rng: DriverRng): SlotRef => ({
  playerId: randPlayer(state, rng),
  slotIndex: randSlot(rng),
})

const randGiveSlot = (rng: DriverRng): SlotIndex | null =>
  rng.chance(1, 2) ? null : randSlot(rng)

const fillTag = (
  state: GameState,
  playerId: UserId,
  tag: Command["_tag"],
  rng: DriverRng,
): Command => {
  switch (tag) {
    case "CallCambio":
      return { _tag: "CallCambio", playerId }
    case "TakeDiscard":
      return { _tag: "TakeDiscard", playerId }
    case "DrawFromDeck":
      return { _tag: "DrawFromDeck", playerId }
    case "SwapHeld":
      return { _tag: "SwapHeld", playerId, slotIndex: randSlot(rng) }
    case "DiscardHeld":
      return { _tag: "DiscardHeld", playerId }
    case "KeepHeld":
      return { _tag: "KeepHeld", playerId }
    case "PowerPeek":
      return { _tag: "PowerPeek", playerId, target: randRef(state, rng) }
    case "PowerSwap":
      return {
        _tag: "PowerSwap",
        playerId,
        first: randRef(state, rng),
        second: randRef(state, rng),
      }
    case "Slam":
      return { _tag: "Slam", playerId, target: randRef(state, rng), giveSlot: randGiveSlot(rng) }
    case "CloseSlamWindow":
      return { _tag: "CloseSlamWindow" }
  }
}

/** One random command of a random tag, fields drawn from the bad-value pools. */
export const randomCommand = (state: GameState, rng: DriverRng): Command =>
  fillTag(state, randPlayer(state, rng), rng.pick(TAGS), rng)

/** `n` random fillings of one tag for one player (C4.2 rejection sampling). */
export const sampleFillings = (
  state: GameState,
  playerId: UserId,
  tag: Command["_tag"],
  rng: DriverRng,
  n: number,
): ReadonlyArray<Command> =>
  tag === "CloseSlamWindow"
    ? [{ _tag: "CloseSlamWindow" }]
    : Array.from({ length: n }, () => fillTag(state, playerId, tag, rng))
