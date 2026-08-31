import { Utils } from "effect"

/**
 * The simulation driver's own randomness (ADR-0013): a second, independently
 * seeded `Utils.PCGRandom` stream, separate from `GameState.prng`, so
 * command-choice randomness never perturbs the game's shuffle stream — a game
 * seed alone reproduces the same deal under any policy. Integer draws only;
 * platform-stable and fully deterministic per seed (C1.1).
 */
export interface DriverRng {
  /** Uniform integer in `[0, maxExclusive)`. */
  readonly int: (maxExclusive: number) => number
  /** Uniform element of a non-empty list (caller guarantees non-empty). */
  readonly pick: <A>(items: ReadonlyArray<A>) => A
  /** True with probability `numerator / denominator`. */
  readonly chance: (numerator: number, denominator: number) => boolean
}

export const makeDriverRng = (seed: number): DriverRng => {
  const rng = new Utils.PCGRandom(seed)
  const int = (maxExclusive: number): number => rng.integer(maxExclusive)
  return {
    int,
    pick: (items) => items[int(items.length)]!,
    chance: (numerator, denominator) => int(denominator) < numerator,
  }
}
