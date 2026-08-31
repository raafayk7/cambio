import { Option } from "effect"
import { isPowerRank, type PowerKind, rank } from "./Card.js"
import { type Command } from "./Command.js"
import {
  EmptyDiscard,
  EmptySlotTarget,
  GameAlreadyEnded,
  type GameError,
  InvalidGiveSlot,
  KeepRequiresEmptyHand,
  MustResolvePower,
  NoCardToDraw,
  NotYourTurn,
  PowerDiscardNotTakeable,
  SlamTooLate,
  SwapTargetsIdentical,
  UnknownPlayer,
  WindowStillOpen,
  WrongPeekTarget,
  WrongPhase,
} from "./GameError.js"
import {
  type GameState,
  handOf,
  occupiedSlots,
  seatOf,
  slotCard,
  type SlotRef,
} from "./GameState.js"
import { type Timestamp, type UserId } from "./Ids.js"

/**
 * The single source of legality (§4.2, C7.2): exactly one place answers "is
 * this move legal right now", as a function of `(phase, playerId, gameState)`
 * — the phase comes from `state.phase`, the player from the command. The
 * engine, route guards, UI enablement, and bots must all derive from here;
 * no rule check may exist anywhere else.
 */

const occupied = (state: GameState, ref: SlotRef): boolean =>
  Option.isSome(slotCard(state, ref))

/** Can this player draw at all — deck card, or a reshufflable discard (§1.7)? */
const drawable = (state: GameState): boolean =>
  state.deck.length > 0 || state.discard.length > 1

/** Does a drawn power have any valid target right now (ADR-0010)? */
export const powerHasValidTarget = (
  power: PowerKind,
  state: GameState,
  playerId: UserId,
): boolean => {
  switch (power) {
    case "7":
    case "8":
      return Option.match(handOf(state, playerId), {
        onNone: () => false,
        onSome: (hand) => hand.length > 0,
      })
    case "9":
    case "T":
      return state.players.some((p) => p.id !== playerId && p.hand.length > 0)
    case "J":
    case "Q":
      return occupiedSlots(state).length >= 2
  }
}

const wrongPhase = (command: Command, state: GameState): WrongPhase =>
  new WrongPhase({ commandTag: command._tag, phaseTag: state.phase._tag })

export const checkCommand = (
  state: GameState,
  command: Command,
  now: Timestamp,
): Option.Option<GameError> => {
  const phase = state.phase

  if (phase._tag === "Ended") {
    return Option.some(new GameAlreadyEnded({ calledBy: phase.calledBy }))
  }

  if (command._tag !== "CloseSlamWindow" && Option.isNone(seatOf(state, command.playerId))) {
    return Option.some(new UnknownPlayer({ playerId: command.playerId }))
  }

  switch (command._tag) {
    case "CallCambio":
    case "TakeDiscard":
    case "DrawFromDeck": {
      if (phase._tag !== "AwaitingDraw") return Option.some(wrongPhase(command, state))
      if (phase.playerId !== command.playerId) {
        return Option.some(
          new NotYourTurn({ playerId: command.playerId, activePlayerId: phase.playerId }),
        )
      }
      if (command._tag === "TakeDiscard") {
        const top = state.discard[0]
        if (top === undefined) return Option.some(new EmptyDiscard())
        const topRank = rank(top)
        if (isPowerRank(topRank)) {
          return Option.some(new PowerDiscardNotTakeable({ rank: topRank }))
        }
      }
      if (command._tag === "DrawFromDeck" && !drawable(state)) {
        return Option.some(new NoCardToDraw())
      }
      return Option.none()
    }

    case "SwapHeld":
    case "DiscardHeld":
    case "KeepHeld": {
      if (phase._tag === "ResolvingPower" || phase._tag === "ResolvingQueenSwap") {
        return Option.some(
          phase.playerId === command.playerId
            ? new MustResolvePower({ power: rank(phase.card) as PowerKind })
            : wrongPhase(command, state),
        )
      }
      if (phase._tag !== "HoldingCard") return Option.some(wrongPhase(command, state))
      if (phase.playerId !== command.playerId) {
        return Option.some(
          new NotYourTurn({ playerId: command.playerId, activePlayerId: phase.playerId }),
        )
      }
      const hand = Option.getOrElse(handOf(state, command.playerId), () => [])
      if (command._tag === "SwapHeld") {
        const target = { playerId: command.playerId, slotIndex: command.slotIndex }
        return occupied(state, target)
          ? Option.none()
          : Option.some(new EmptySlotTarget({ target }))
      }
      if (command._tag === "DiscardHeld") {
        // A card taken from the discard must be swapped in — never discarded
        // straight back (§1.3b). Same phase shape, different legal move set.
        return phase.source === "deck"
          ? Option.none()
          : Option.some(wrongPhase(command, state))
      }
      return hand.length === 0
        ? Option.none()
        : Option.some(new KeepRequiresEmptyHand({ playerId: command.playerId }))
    }

    case "PowerPeek": {
      if (phase._tag !== "ResolvingPower") return Option.some(wrongPhase(command, state))
      if (phase.playerId !== command.playerId) {
        return Option.some(
          new NotYourTurn({ playerId: command.playerId, activePlayerId: phase.playerId }),
        )
      }
      const power = rank(phase.card)
      if (!isPowerRank(power) || power === "J") {
        return Option.some(wrongPhase(command, state))
      }
      if ((power === "7" || power === "8") && command.target.playerId !== command.playerId) {
        return Option.some(new WrongPeekTarget({ power, target: command.target }))
      }
      if ((power === "9" || power === "T") && command.target.playerId === command.playerId) {
        return Option.some(new WrongPeekTarget({ power, target: command.target }))
      }
      return occupied(state, command.target)
        ? Option.none()
        : Option.some(new EmptySlotTarget({ target: command.target }))
    }

    case "PowerSwap": {
      const jackHeld = phase._tag === "ResolvingPower" && rank(phase.card) === "J"
      if (!jackHeld && phase._tag !== "ResolvingQueenSwap") {
        return Option.some(wrongPhase(command, state))
      }
      if (phase.playerId !== command.playerId) {
        return Option.some(
          new NotYourTurn({ playerId: command.playerId, activePlayerId: phase.playerId }),
        )
      }
      if (!occupied(state, command.first)) {
        return Option.some(new EmptySlotTarget({ target: command.first }))
      }
      if (!occupied(state, command.second)) {
        return Option.some(new EmptySlotTarget({ target: command.second }))
      }
      if (
        command.first.playerId === command.second.playerId &&
        command.first.slotIndex === command.second.slotIndex
      ) {
        return Option.some(new SwapTargetsIdentical({ target: command.first }))
      }
      return Option.none()
    }

    case "Slam": {
      if (phase._tag !== "SlamWindow") return Option.some(wrongPhase(command, state))
      if (now >= phase.closesAt) {
        return Option.some(new SlamTooLate({ closesAt: phase.closesAt, at: now }))
      }
      if (!occupied(state, command.target)) {
        return Option.some(new EmptySlotTarget({ target: command.target }))
      }
      const hand = Option.getOrElse(handOf(state, command.playerId), () => [])
      const slammingOwn = command.target.playerId === command.playerId
      const giveRequired = !slammingOwn && hand.length > 0
      if (!giveRequired) {
        // Own-card slams and zero-card draw-then-give carry no give-slot (ADR-0009).
        return command.giveSlot === null
          ? Option.none()
          : Option.some(
              new InvalidGiveSlot({ playerId: command.playerId, giveSlot: command.giveSlot }),
            )
      }
      if (
        command.giveSlot === null ||
        !occupied(state, { playerId: command.playerId, slotIndex: command.giveSlot })
      ) {
        return Option.some(
          new InvalidGiveSlot({ playerId: command.playerId, giveSlot: command.giveSlot }),
        )
      }
      return Option.none()
    }

    case "CloseSlamWindow": {
      if (phase._tag !== "SlamWindow") return Option.some(wrongPhase(command, state))
      return now >= phase.closesAt
        ? Option.none()
        : Option.some(new WindowStillOpen({ closesAt: phase.closesAt, at: now }))
    }
  }
}

/**
 * The command kinds `playerId` could legally issue right now (C7.2) — for
 * future UI enablement and bot use. Derived from the same predicates as
 * `checkCommand`; listed in `Command` union order.
 */
export const legalCommandKinds = (
  state: GameState,
  playerId: UserId,
  now: Timestamp,
): ReadonlyArray<Command["_tag"]> => {
  const phase = state.phase
  if (phase._tag === "Ended" || Option.isNone(seatOf(state, playerId))) return []

  const kinds: Array<Command["_tag"]> = []

  if (phase._tag === "AwaitingDraw" && phase.playerId === playerId) {
    kinds.push("CallCambio")
    const top = state.discard[0]
    if (top !== undefined && !isPowerRank(rank(top))) kinds.push("TakeDiscard")
    if (drawable(state)) kinds.push("DrawFromDeck")
  }

  if (phase._tag === "HoldingCard" && phase.playerId === playerId) {
    const hand = Option.getOrElse(handOf(state, playerId), () => [])
    if (hand.length > 0) kinds.push("SwapHeld")
    if (phase.source === "deck") kinds.push("DiscardHeld")
    if (hand.length === 0) kinds.push("KeepHeld")
  }

  if (phase._tag === "ResolvingPower" && phase.playerId === playerId) {
    const power = rank(phase.card)
    if (isPowerRank(power) && power !== "J") kinds.push("PowerPeek")
    if (power === "J") kinds.push("PowerSwap")
  }

  if (phase._tag === "ResolvingQueenSwap" && phase.playerId === playerId) {
    kinds.push("PowerSwap")
  }

  if (phase._tag === "SlamWindow") {
    if (now < phase.closesAt && occupiedSlots(state).length > 0) kinds.push("Slam")
    if (now >= phase.closesAt) kinds.push("CloseSlamWindow")
  }

  return kinds
}
