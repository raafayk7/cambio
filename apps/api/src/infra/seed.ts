import { randomInt } from "node:crypto"

import { SeedPort } from "@cambio/application"
import { Effect, Layer } from "effect"

/**
 * Entropy adapter for the `SeedPort` declared in `@cambio/application`.
 *
 * The domain has no randomness (§3.1) — `dealGame` shuffles from a supplied
 * numeric seed, and this is the single place that seed enters the system.
 * Crypto-strength because the seed IS the shuffle: a predictable seed is a
 * predictable deck (§5).
 */
export const SeedLive = Layer.succeed(SeedPort, {
  // randomInt's exclusive upper bound must fit a signed 48-bit range; 2^31
  // keeps the seed a positive 32-bit int, which the PCG seeding expects.
  nextSeed: Effect.sync(() => randomInt(0, 2 ** 31 - 1)),
})
