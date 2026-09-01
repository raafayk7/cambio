import { describe, expect, it } from "@effect/vitest"
import { Effect, Either, Layer, Schema } from "effect"
import {
  StorageError,
  Timestamp,
  UserId,
  UserNotFound,
  UserRepository,
} from "@cambio/domain"
import { ClockPort } from "../src/ports/Clock.js"
import {
  SessionInvalid,
  type SessionPayload,
  SessionSignerPort,
} from "../src/ports/SessionSigner.js"
import { verifySession } from "../src/use-cases/VerifySession.js"

const NOW = Timestamp.make(1_700_000_000_000)
const TTL = 604_800_000
const UID = Schema.decodeUnknownSync(UserId)("00000000-0000-4000-8000-0000000000bb")
const USER = { id: UID, name: "Raafay" }

const clockStub = Layer.succeed(ClockPort, { now: Effect.succeed(NOW) })

/** Fake signer: verify decodes tokens this suite mints itself; sign transcribes. */
const signerStub = (payload: SessionPayload | "invalid") =>
  Layer.succeed(SessionSignerPort, {
    sign: (p) => Effect.succeed(`tok:${p.userId}:${p.expiresAt}`),
    verify: () =>
      payload === "invalid" ? Effect.fail(new SessionInvalid()) : Effect.succeed(payload),
  })

const repoStub = (
  findById: (typeof UserRepository.Service)["findById"],
  onConsult?: () => void,
) =>
  Layer.succeed(UserRepository, {
    create: () => Effect.die("create unused in this suite"),
    findById: (userId) => {
      onConsult?.()
      return findById(userId)
    },
  })

const liveUserRepo = repoStub(() => Effect.succeed(USER))

describe("verifySession", () => {
  it.effect("valid token + live user yields the user and a renewed session (C2.1, C3.1)", () =>
    verifySession({ token: "whatever", ttlMillis: TTL }).pipe(
      Effect.map((result) => {
        expect(result.user).toEqual(USER)
        expect(result.expiresAt).toBe(NOW + TTL)
        expect(result.token).toBe(`tok:${UID}:${NOW + TTL}`)
      }),
      Effect.provide(
        Layer.mergeAll(
          clockStub,
          signerStub({ userId: UID, expiresAt: Timestamp.make(NOW + 1000) }),
          liveUserRepo,
        ),
      ),
    ),
  )

  it.effect("a signer rejection passes through as SessionInvalid (C2.3)", () =>
    verifySession({ token: "garbage", ttlMillis: TTL }).pipe(
      Effect.either,
      Effect.map((result) => {
        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) expect(result.left._tag).toBe("SessionInvalid")
      }),
      Effect.provide(Layer.mergeAll(clockStub, signerStub("invalid"), liveUserRepo)),
    ),
  )

  it.effect(
    "an expired payload fails SessionExpired without consulting the repository (C2.4)",
    () => {
      let consulted = false
      const expiredAt = Timestamp.make(NOW - 1)
      return verifySession({ token: "expired", ttlMillis: TTL }).pipe(
        Effect.either,
        Effect.map((result) => {
          expect(Either.isLeft(result)).toBe(true)
          if (Either.isLeft(result)) {
            expect(result.left._tag).toBe("SessionExpired")
            if (result.left._tag === "SessionExpired") {
              expect(result.left.expiresAt).toBe(expiredAt)
            }
          }
          expect(consulted).toBe(false)
        }),
        Effect.provide(
          Layer.mergeAll(
            clockStub,
            signerStub({ userId: UID, expiresAt: expiredAt }),
            repoStub(
              () => Effect.succeed(USER),
              () => {
                consulted = true
              },
            ),
          ),
        ),
      )
    },
  )

  it.effect("an unknown or soft-deleted user passes through as UserNotFound (C2.5)", () =>
    verifySession({ token: "orphan", ttlMillis: TTL }).pipe(
      Effect.either,
      Effect.map((result) => {
        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) expect(result.left._tag).toBe("UserNotFound")
      }),
      Effect.provide(
        Layer.mergeAll(
          clockStub,
          signerStub({ userId: UID, expiresAt: Timestamp.make(NOW + 1000) }),
          repoStub((userId) => Effect.fail(new UserNotFound({ userId }))),
        ),
      ),
    ),
  )

  it.effect("a repository failure passes through as StorageError", () =>
    verifySession({ token: "whatever", ttlMillis: TTL }).pipe(
      Effect.either,
      Effect.map((result) => {
        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) expect(result.left._tag).toBe("StorageError")
      }),
      Effect.provide(
        Layer.mergeAll(
          clockStub,
          signerStub({ userId: UID, expiresAt: Timestamp.make(NOW + 1000) }),
          repoStub(() =>
            Effect.fail(new StorageError({ operation: "users.findById", cause: "down" })),
          ),
        ),
      ),
    ),
  )
})
