import { Context, type Effect } from "effect"

/**
 * Seed port.
 *
 * `dealGame` shuffles from a caller-supplied numeric seed — the domain has no
 * entropy (§3.1). This port is where that entropy enters the application
 * layer. It is deliberately separate from `IdGeneratorPort`: identity and
 * randomness are different capabilities (root plan Decision Log), and a
 * stubbed fixed seed is what makes StartGame's deal deterministic in tests.
 *
 * Implementations live in `apps/api/src/infra` (arriving with CAM-6).
 */
export class SeedPort extends Context.Tag("@cambio/application/SeedPort")<
  SeedPort,
  {
    readonly nextSeed: Effect.Effect<number>
  }
>() {}
