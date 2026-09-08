import { describe, expect, it } from "@effect/vitest"
import { SeedPort } from "@cambio/application"
import { Effect } from "effect"

import { SeedLive } from "../src/infra/seed.js"

/** Statistical smoke for the entropy adapter — not a crypto proof. */
describe("SeedLive", () => {
  it.effect("yields non-negative 32-bit integers", () =>
    Effect.gen(function* () {
      const seeds = yield* SeedPort
      for (let i = 0; i < 100; i++) {
        const seed = yield* seeds.nextSeed
        expect(Number.isInteger(seed)).toBe(true)
        expect(seed).toBeGreaterThanOrEqual(0)
        expect(seed).toBeLessThan(2 ** 31)
      }
    }).pipe(Effect.provide(SeedLive)),
  )

  it.effect("successive draws differ (100 draws, no total collision)", () =>
    Effect.gen(function* () {
      const seeds = yield* SeedPort
      const drawn = new Set<number>()
      for (let i = 0; i < 100; i++) {
        drawn.add(yield* seeds.nextSeed)
      }
      // Collisions in 100 draws over 2^31 are astronomically unlikely; a
      // constant adapter would collapse to size 1.
      expect(drawn.size).toBeGreaterThan(90)
    }).pipe(Effect.provide(SeedLive)),
  )
})
