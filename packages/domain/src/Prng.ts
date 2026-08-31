import { Schema, Utils } from "effect"

/**
 * Seeded, serializable randomness for the rules engine.
 *
 * The domain performs no I/O and reads no entropy: all randomness flows from
 * a numeric seed through `Utils.PCGRandom`, whose state is carried in
 * `GameState` so mid-game shuffles stay deterministic (§3.1, HANDOFF §12).
 * This module is the only place a `PCGRandom` is constructed, and no instance
 * ever escapes a function — callers see only values.
 */

/** Mirrors `Utils.PCGRandomState`. */
export const PrngState = Schema.Tuple(Schema.Number, Schema.Number, Schema.Number, Schema.Number)
export type PrngState = typeof PrngState.Type

export const prngStateFromSeed = (seed: number): PrngState => new Utils.PCGRandom(seed).getState()

/**
 * Fisher–Yates shuffle driven by the given PRNG state; returns the permuted
 * copy and the advanced state. The input array is never mutated.
 */
export const shuffle = <A>(
  items: ReadonlyArray<A>,
  state: PrngState,
): readonly [ReadonlyArray<A>, PrngState] => {
  const rng = new Utils.PCGRandom(0)
  rng.setState([state[0], state[1], state[2], state[3]])
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.integer(i + 1)
    const a = out[i]!
    out[i] = out[j]!
    out[j] = a
  }
  return [out, rng.getState()]
}
