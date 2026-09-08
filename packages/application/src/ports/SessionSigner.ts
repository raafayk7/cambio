import { Context, Data, type Effect, Schema } from "effect"
import { Timestamp, UserId } from "@cambio/domain"

/**
 * Session signing port (ADR-0018).
 *
 * Sessions are stateless: an HMAC-signed `{ userId, expiresAt }` in an
 * httpOnly cookie, no sessions table. Signing needs `node:crypto`, which the
 * import boundaries (ADR-0017) forbid in this package — so the capability is
 * a port. Implementations live in `apps/api/src/infra`.
 *
 * `verify` proves authenticity and shape only; expiry is the caller's
 * business (the verify-session use case checks it against `ClockPort`),
 * which keeps implementations clock-free and deterministic under test.
 */

export const SessionPayload = Schema.Struct({
  userId: UserId,
  expiresAt: Timestamp,
})
export type SessionPayload = typeof SessionPayload.Type

/** The token is not authentic or not payload-shaped. Deliberately field-less:
 *  distinguishing forgery from corruption would only help an attacker. */
export class SessionInvalid extends Data.TaggedError("SessionInvalid") {}

export class SessionSignerPort extends Context.Tag("@cambio/application/SessionSignerPort")<
  SessionSignerPort,
  {
    readonly sign: (payload: SessionPayload) => Effect.Effect<string>
    readonly verify: (token: string) => Effect.Effect<SessionPayload, SessionInvalid>
  }
>() {}
