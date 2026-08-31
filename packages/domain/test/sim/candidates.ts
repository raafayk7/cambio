import { Option } from "effect"
import { rank } from "../../src/Card.js"
import { type Command } from "../../src/Command.js"
import { type GameState, handOf, occupiedSlots } from "../../src/GameState.js"
import { type Timestamp, type UserId } from "../../src/Ids.js"
import { legalCommandKinds } from "../../src/Legality.js"

/**
 * Every fully-instantiated legal command any seated player could issue right
 * now (C1.2): tags come from `legalCommandKinds` (the single source of
 * legality), arguments are filled from state helpers. Enumeration order is
 * fixed — players in seat order, targets in `occupiedSlots` (seat, slot)
 * order — so the driver's choices are deterministic by construction.
 *
 * `CloseSlamWindow` is deliberately excluded: it carries no issuer and the
 * driver treats window-closing as a clock action (jump `now` to `closesAt`
 * and close), never a per-player choice.
 */
export const legalCandidates = (state: GameState, now: Timestamp): ReadonlyArray<Command> =>
  state.players.flatMap((p) =>
    legalCommandKinds(state, p.id, now).flatMap((tag) => fill(state, p.id, tag)),
  )

const fill = (
  state: GameState,
  playerId: UserId,
  tag: Command["_tag"],
): ReadonlyArray<Command> => {
  switch (tag) {
    case "CallCambio":
      return [{ _tag: "CallCambio", playerId }]
    case "TakeDiscard":
      return [{ _tag: "TakeDiscard", playerId }]
    case "DrawFromDeck":
      return [{ _tag: "DrawFromDeck", playerId }]
    case "DiscardHeld":
      return [{ _tag: "DiscardHeld", playerId }]
    case "KeepHeld":
      return [{ _tag: "KeepHeld", playerId }]
    case "SwapHeld": {
      const hand = Option.getOrElse(handOf(state, playerId), () => [])
      return hand.map((s) => ({ _tag: "SwapHeld", playerId, slotIndex: s.slotIndex }))
    }
    case "PowerPeek": {
      // legalCommandKinds only lists PowerPeek in ResolvingPower with a non-J power.
      const phase = state.phase as Extract<GameState["phase"], { _tag: "ResolvingPower" }>
      const power = rank(phase.card)
      const targets = occupiedSlots(state).filter((ref) =>
        power === "7" || power === "8"
          ? ref.playerId === playerId
          : power === "9" || power === "T"
            ? ref.playerId !== playerId
            : true,
      )
      return targets.map((target) => ({ _tag: "PowerPeek", playerId, target }))
    }
    case "PowerSwap": {
      const refs = occupiedSlots(state)
      const out: Array<Command> = []
      for (let i = 0; i < refs.length; i++) {
        for (let j = i + 1; j < refs.length; j++) {
          out.push({ _tag: "PowerSwap", playerId, first: refs[i]!, second: refs[j]! })
        }
      }
      return out
    }
    case "Slam": {
      const own = Option.getOrElse(handOf(state, playerId), () => [])
      return occupiedSlots(state).flatMap((target): ReadonlyArray<Command> => {
        // Own-card slams and zero-card draw-then-give carry no give-slot (ADR-0009).
        const noGive = target.playerId === playerId || own.length === 0
        return noGive
          ? [{ _tag: "Slam", playerId, target, giveSlot: null }]
          : own.map((s) => ({ _tag: "Slam", playerId, target, giveSlot: s.slotIndex }))
      })
    }
    case "CloseSlamWindow":
      return []
  }
}
