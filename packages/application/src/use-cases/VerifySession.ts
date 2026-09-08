import { Data, Effect } from "effect"
import { type StorageError, Timestamp, type UserNotFound, UserRepository } from "@cambio/domain"
import { ClockPort } from "../ports/Clock.js"
import { type SessionInvalid, SessionSignerPort } from "../ports/SessionSigner.js"
import { type SessionResult } from "./CreateTemporaryUser.js"

/**
 * Verify a session token and renew it (CAM-4, ADR-0018).
 *
 * Sequence: authenticity + shape via the signer port → expiry against
 * `ClockPort` (the signer is clock-free by design; see the port's doc) →
 * `findById` (the repository's soft-delete filter makes a deleted user
 * indistinguishable from a nonexistent one — ADR-0018 §4: no session) →
 * sign a renewed token, giving the 7-day sliding lifetime. Expiry gets its
 * own error so logs and tests can tell "stale" from "forged"; both map to
 * 401 at the edge.
 */

export class SessionExpired extends Data.TaggedError("SessionExpired")<{
  readonly expiresAt: Timestamp
}> {}

export interface VerifySessionInput {
  readonly token: string
  readonly ttlMillis: number
}

export const verifySession = (
  input: VerifySessionInput,
): Effect.Effect<
  SessionResult,
  SessionInvalid | SessionExpired | UserNotFound | StorageError,
  ClockPort | SessionSignerPort | UserRepository
> =>
  Effect.gen(function* () {
    const clock = yield* ClockPort
    const signer = yield* SessionSignerPort
    const users = yield* UserRepository

    const payload = yield* signer.verify(input.token)
    const now = yield* clock.now
    if (payload.expiresAt < now) {
      return yield* new SessionExpired({ expiresAt: payload.expiresAt })
    }

    const user = yield* users.findById(payload.userId)

    const expiresAt = Timestamp.make(now + input.ttlMillis)
    const token = yield* signer.sign({ userId: user.id, expiresAt })

    return { user, token, expiresAt }
  })
