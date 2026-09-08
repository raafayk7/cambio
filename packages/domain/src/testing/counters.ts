import { type Command } from "../Command.js"
import { type GameEvent } from "../GameEvent.js"
import { type GameState } from "../GameState.js"

/**
 * Rare-case and volume counters aggregated over simulated games (C5.1) —
 * the counting hooks ADR-0011 and ADR-0012 explicitly ask CAM-2 for.
 * Everything is derived from the events of each accepted command (plus the
 * pre-command phase, for the discard-source keep); `games`/`steps`/`turns`
 * are filled by the driver.
 */
export interface SimCounters {
  readonly games: number
  readonly steps: number
  readonly turns: number
  readonly slamsSucceeded: number
  readonly slamsFailed: number
  readonly penaltiesDrawn: number
  readonly peeks: number
  readonly blindSwaps: number
  readonly reshuffles: number
  /** ADR-0010 fizzles by shape: 7/8 (own-hand empty), 9/T (all opponents empty), J, Q. */
  readonly fizzlesPeekOwn: number
  readonly fizzlesPeekOther: number
  readonly fizzlesJack: number
  readonly fizzlesQueen: number
  /** ADR-0011 skipped draws — predicted near-impossible; counted to check that. */
  readonly drawSkippedPenalty: number
  readonly drawSkippedGive: number
  /** ADR-0009: keeps into an empty hand (all `HeldKept`), split out by discard source. */
  readonly zeroCardKeeps: number
  readonly discardSourceKeeps: number
  /** Successful opponent slams: the §1.5 give vs the ADR-0009 draw-then-give. */
  readonly givesFromHand: number
  readonly givesFromDeck: number
  /** ADR-0012: turns that advanced with no slam window (empty discard pile). */
  readonly emptyDiscardSkips: number
}

export const emptyCounters = (): SimCounters => ({
  games: 0,
  steps: 0,
  turns: 0,
  slamsSucceeded: 0,
  slamsFailed: 0,
  penaltiesDrawn: 0,
  peeks: 0,
  blindSwaps: 0,
  reshuffles: 0,
  fizzlesPeekOwn: 0,
  fizzlesPeekOther: 0,
  fizzlesJack: 0,
  fizzlesQueen: 0,
  drawSkippedPenalty: 0,
  drawSkippedGive: 0,
  zeroCardKeeps: 0,
  discardSourceKeeps: 0,
  givesFromHand: 0,
  givesFromDeck: 0,
  emptyDiscardSkips: 0,
})

type MutableCounters = { -readonly [K in keyof SimCounters]: SimCounters[K] }

const countEvent = (
  next: MutableCounters,
  event: GameEvent,
  stateBefore: GameState,
  command: Command,
): void => {
  switch (event._tag) {
    case "SlamSucceeded":
      next.slamsSucceeded++
      return
    case "SlamFailed":
      next.slamsFailed++
      return
    case "PenaltyDrawn":
      next.penaltiesDrawn++
      return
    case "CardPeeked":
      next.peeks++
      return
    case "CardsBlindSwapped":
      next.blindSwaps++
      return
    case "DeckReshuffled":
      next.reshuffles++
      return
    case "PowerFizzled":
      if (event.power === "7" || event.power === "8") next.fizzlesPeekOwn++
      else if (event.power === "9" || event.power === "T") next.fizzlesPeekOther++
      else if (event.power === "J") next.fizzlesJack++
      else next.fizzlesQueen++
      return
    case "DrawSkipped":
      if (event.kind === "penalty") next.drawSkippedPenalty++
      else next.drawSkippedGive++
      return
    case "HeldKept":
      next.zeroCardKeeps++
      if (
        command._tag === "KeepHeld" &&
        stateBefore.phase._tag === "HoldingCard" &&
        stateBefore.phase.source === "discard"
      ) {
        next.discardSourceKeeps++
      }
      return
    case "CardGivenFromHand":
      next.givesFromHand++
      return
    case "CardGivenFromDeck":
      next.givesFromDeck++
      return
    // Deliberately uncounted — listed explicitly so a future GameEvent case
    // fails to compile here instead of going silently uncounted.
    case "GameStarted":
    case "CambioCalled":
    case "GameEnded":
    case "CardDrawn":
    case "DiscardTaken":
    case "HeldSwapped":
    case "HeldDiscarded":
    case "PowerDiscarded":
    case "SlamWindowOpened":
    case "TurnAdvanced":
    case "SlamWindowClosed":
      return
    default:
      return event satisfies never
  }
}

/** Fold one accepted command's events into the counters. */
export const recordStep = (
  counters: SimCounters,
  stateBefore: GameState,
  command: Command,
  events: ReadonlyArray<GameEvent>,
): SimCounters => {
  const next: MutableCounters = { ...counters }
  for (const event of events) countEvent(next, event, stateBefore, command)
  // ADR-0012: the skip path advances the turn with no window ever closing —
  // the ordinary path emits SlamWindowClosed + TurnAdvanced together.
  if (
    events.some((e) => e._tag === "TurnAdvanced") &&
    !events.some((e) => e._tag === "SlamWindowClosed")
  ) {
    next.emptyDiscardSkips++
  }
  return next
}

export const mergeCounters = (a: SimCounters, b: SimCounters): SimCounters => {
  const out: MutableCounters = { ...a }
  for (const key of Object.keys(out) as Array<keyof SimCounters>) {
    out[key] = a[key] + b[key]
  }
  return out
}

/** The single C5.1 summary line (root plan decision log: one console.log). */
export const formatSummary = (c: SimCounters): string =>
  `[sim] games=${c.games} steps=${c.steps} turns=${c.turns} ` +
  `slams=${c.slamsSucceeded}ok/${c.slamsFailed}fail penalties=${c.penaltiesDrawn} ` +
  `peeks=${c.peeks} blindSwaps=${c.blindSwaps} reshuffles=${c.reshuffles} ` +
  `fizzles={78:${c.fizzlesPeekOwn},9T:${c.fizzlesPeekOther},J:${c.fizzlesJack},Q:${c.fizzlesQueen}} ` +
  `drawSkipped={penalty:${c.drawSkippedPenalty},give:${c.drawSkippedGive}} ` +
  `keeps={zero:${c.zeroCardKeeps},discard:${c.discardSourceKeeps}} ` +
  `gives={hand:${c.givesFromHand},deck:${c.givesFromDeck}} ` +
  `emptyDiscardSkips=${c.emptyDiscardSkips}`
