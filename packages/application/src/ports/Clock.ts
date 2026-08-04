import { Context, type Effect } from "effect"
import { type Timestamp } from "@cambio/domain"

/**
 * Clock port.
 *
 * The domain performs no I/O and never reads the clock — time is passed in
 * (§3.1). This port is how the application layer obtains it, and injecting it
 * is what makes the slam window testable without waiting in real time.
 *
 * Implementations live in `apps/api/src/infra`.
 */
export class ClockPort extends Context.Tag("@cambio/application/ClockPort")<
  ClockPort,
  {
    readonly now: Effect.Effect<Timestamp>
  }
>() {}
