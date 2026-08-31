/**
 * The CAM-2 simulation harness, published as `@cambio/domain/testing`
 * (ADR-0016) so server-side test suites (persistence round-trips, use-case
 * tests) can drive seeded randomized games without reaching into test files.
 * Pure and `effect`-only, like everything under `src/`. Deliberately NOT
 * re-exported from the main `"."` barrel.
 */
export * from "./candidates.js"
export * from "./counters.js"
export * from "./driver.js"
export * from "./fixtures.js"
export * from "./fuzz.js"
export * from "./invariants.js"
export * from "./policy.js"
export * from "./rng.js"
