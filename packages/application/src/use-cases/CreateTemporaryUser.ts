import { Effect } from "effect"
import { type StorageError, Timestamp, type User, UserRepository } from "@cambio/domain"
import { ClockPort } from "../ports/Clock.js"
import { IdGeneratorPort } from "../ports/IdGenerator.js"
import { SessionSignerPort } from "../ports/SessionSigner.js"

/**
 * Create a temporary user and issue their session (CAM-4, ADR-0018).
 *
 * The name arrives already validated by the contracts schema at the edge;
 * this use case only sequences: mint id → persist → sign `{ userId,
 * expiresAt }`. The TTL is a plain input supplied by presentation from
 * config — a static value, not a capability, so no port.
 */

export interface CreateTemporaryUserInput {
  readonly name: string
  readonly ttlMillis: number
}

/** Shared result shape of the session-issuing use cases. */
export interface SessionResult {
  readonly user: User
  readonly token: string
  readonly expiresAt: Timestamp
}

export const createTemporaryUser = (
  input: CreateTemporaryUserInput,
): Effect.Effect<
  SessionResult,
  StorageError,
  ClockPort | IdGeneratorPort | SessionSignerPort | UserRepository
> =>
  Effect.gen(function* () {
    const ids = yield* IdGeneratorPort
    const clock = yield* ClockPort
    const signer = yield* SessionSignerPort
    const users = yield* UserRepository

    const id = yield* ids.nextUserId
    const user: User = { id, name: input.name }
    yield* users.create(user)

    const now = yield* clock.now
    const expiresAt = Timestamp.make(now + input.ttlMillis)
    const token = yield* signer.sign({ userId: id, expiresAt })

    return { user, token, expiresAt }
  })
