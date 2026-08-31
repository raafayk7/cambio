/**
 * Rare-case and volume counters aggregated over simulated games (C5.1) —
 * the counting hooks ADR-0011 and ADR-0012 explicitly ask CAM-2 for.
 * Event-derived; `recordStep` lands in M5 (until then the driver carries an
 * empty instance and fills the volume fields itself).
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
