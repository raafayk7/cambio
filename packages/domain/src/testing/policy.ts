import { Option } from "effect"
import { rank } from "../Card.js"
import { type Command } from "../Command.js"
import { type GameState, handOf, slotCard } from "../GameState.js"
import { type DriverRng } from "./rng.js"

/**
 * The driver's command-selection policy. Knobs are plain data so tuning (M3)
 * never touches logic. Two jobs beyond uniform choice:
 *
 * - **Termination pressure (C1.4):** the chance of a legal `CallCambio`
 *   rises with the turn count and becomes certain at `forceCallTurn`, so
 *   every game ends within the step cap.
 * - **Rare-case reachability (C5.2):** informed slams shrink hands toward
 *   zero (unlocking the ADR-0009/0010/0012 paths) and empty-handed players
 *   are biased toward taking the discard (ADR-0009 keeps, ADR-0012 skips).
 */
export interface PolicyKnobs {
  /** Turn at which a legal CallCambio is taken unconditionally (C1.4 backstop). */
  readonly forceCallTurn: number
  /** Turn at which the call probability starts ramping. */
  readonly callRampStart: number
  /** p(call) = (turnCount − callRampStart) / callRampDenominator, clamped by the backstop. */
  readonly callRampDenominator: number
  /** Chance a window produces another slam attempt at all. */
  readonly slamAttemptNum: number
  readonly slamAttemptDen: number
  /** Chance an attempt is "informed" — targets a true rank match (shrinks hands). */
  readonly informedSlamNum: number
  readonly informedSlamDen: number
  /** Hard cap on slam attempts per window (windows never reset closesAt — ADR-0011). */
  readonly maxSlamsPerWindow: number
  /** Chance an empty-handed active player takes a takeable discard (ADR-0009 keep). */
  readonly zeroCardTakeNum: number
  readonly zeroCardTakeDen: number
}

// Tuned in M3 against the batch probe: the first cut (call ramp from turn 8,
// 1/2 informed) ended games in ~18 turns with hands inflated by ~8 penalty
// draws per game — zero-card states (the ADR-0009/0010/0012 gateway) were
// reached once in 250 games. Longer games + mostly-informed slams that
// prefer the slammer's own matches drain hands instead.
export const defaultKnobs: PolicyKnobs = {
  forceCallTurn: 128,
  callRampStart: 24,
  callRampDenominator: 128,
  slamAttemptNum: 4,
  slamAttemptDen: 5,
  informedSlamNum: 3,
  informedSlamDen: 4,
  maxSlamsPerWindow: 3,
  zeroCardTakeNum: 4,
  zeroCardTakeDen: 5,
}

/** Choose the active player's action in any non-window phase. */
export const chooseTurnCommand = (
  state: GameState,
  candidates: ReadonlyArray<Command>,
  rng: DriverRng,
  turnCount: number,
  knobs: PolicyKnobs,
): Command => {
  const call = candidates.find((c) => c._tag === "CallCambio")
  if (call !== undefined) {
    if (turnCount >= knobs.forceCallTurn) return call
    const ramp = turnCount - knobs.callRampStart
    if (ramp > 0 && rng.chance(ramp, knobs.callRampDenominator)) return call
  }
  const take = candidates.find((c) => c._tag === "TakeDiscard")
  if (take !== undefined && take._tag === "TakeDiscard") {
    const hand = Option.getOrElse(handOf(state, take.playerId), () => [])
    if (hand.length === 0 && rng.chance(knobs.zeroCardTakeNum, knobs.zeroCardTakeDen)) {
      return take
    }
  }
  // CallCambio is reachable only via the ramp/backstop above — uniform choice
  // would end ~a third of games on turn one and starve every rare path.
  const uniform = candidates.filter((c) => c._tag !== "CallCambio")
  return uniform.length === 0 ? call! : rng.pick(uniform)
}

/**
 * Choose a slam inside an open window, or `none` to let the driver jump the
 * clock to `closesAt` and close it.
 */
export const chooseSlam = (
  state: GameState,
  slams: ReadonlyArray<Command>,
  rng: DriverRng,
  slamsThisWindow: number,
  knobs: PolicyKnobs,
): Option.Option<Command> => {
  if (slams.length === 0 || slamsThisWindow >= knobs.maxSlamsPerWindow) return Option.none()
  if (!rng.chance(knobs.slamAttemptNum, knobs.slamAttemptDen)) return Option.none()
  if (
    state.phase._tag === "SlamWindow" &&
    rng.chance(knobs.informedSlamNum, knobs.informedSlamDen)
  ) {
    const windowRank = state.phase.rank
    const informed = slams.filter(
      (c) =>
        c._tag === "Slam" &&
        Option.match(slotCard(state, c.target), {
          onNone: () => false,
          onSome: (target) => rank(target) === windowRank,
        }),
    )
    // Prefer slamming one's own match: it shrinks the slammer's hand (the
    // gateway to every ADR-0009/0010/0012 rare path) and is correct play.
    const own = informed.filter((c) => c._tag === "Slam" && c.target.playerId === c.playerId)
    if (own.length > 0) return Option.some(rng.pick(own))
    if (informed.length > 0) return Option.some(rng.pick(informed))
    // An informed player with nothing to slam passes — falling back to a
    // blind slam here made penalties inflate every hand faster than informed
    // slams could drain them (M3 probe).
    return Option.none()
  }
  return Option.some(rng.pick(slams))
}
