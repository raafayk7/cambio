import { ClockPort } from "@cambio/application"
import { Timestamp } from "@cambio/domain"
import { Effect, Layer } from "effect"

/**
 * System clock adapter for the `ClockPort` declared in `@cambio/application`.
 *
 * Absolute epoch millis, because timers cannot be the authority: a sleeping
 * Render instance fires no timers, so lateness is computed from the clock on
 * the next command rather than trusted to a live fiber (§6).
 */
export const ClockLive = Layer.succeed(ClockPort, {
  now: Effect.sync(() => Timestamp.make(Date.now())),
})
