import { describe, expect, it } from "@effect/vitest"
import { Effect, Either, Layer, Schema } from "effect"
import {
  StorageError,
  Timestamp,
  type User,
  UserId,
  UserNotFound,
  UserRepository,
} from "@cambio/domain"
import { ClockPort } from "../src/ports/Clock.js"
import { IdGeneratorPort } from "../src/ports/IdGenerator.js"
import { SessionSignerPort } from "../src/ports/SessionSigner.js"
import { createTemporaryUser } from "../src/use-cases/CreateTemporaryUser.js"

const NOW = Timestamp.make(1_700_000_000_000)
const TTL = 604_800_000
const MINTED = Schema.decodeUnknownSync(UserId)("00000000-0000-4000-8000-0000000000aa")

const clockStub = Layer.succeed(ClockPort, { now: Effect.succeed(NOW) })

const idsStub = Layer.succeed(IdGeneratorPort, {
  nextUserId: Effect.succeed(MINTED),
  nextGameId: Effect.die("no games in this suite"),
})

/** Fake signer: token is a readable transcript of what was signed. */
const signerStub = Layer.succeed(SessionSignerPort, {
  sign: (p) => Effect.succeed(`tok:${p.userId}:${p.expiresAt}`),
  verify: () => Effect.die("verify unused in this suite"),
})

const recordingRepo = () => {
  const created: Array<User> = []
  const layer = Layer.succeed(UserRepository, {
    create: (user) =>
      Effect.sync(() => {
        created.push(user)
      }),
    findById: (userId) => Effect.fail(new UserNotFound({ userId })),
  })
  return { created, layer }
}

const failingRepo = Layer.succeed(UserRepository, {
  create: () => Effect.fail(new StorageError({ operation: "users.create", cause: "down" })),
  findById: (userId) => Effect.fail(new UserNotFound({ userId })),
})

describe("createTemporaryUser", () => {
  it.effect("creates the user with the minted id and given name (C1.1)", () => {
    const repo = recordingRepo()
    return createTemporaryUser({ name: "Raafay", ttlMillis: TTL }).pipe(
      Effect.map((result) => {
        expect(result.user).toEqual({ id: MINTED, name: "Raafay" })
        expect(repo.created).toEqual([{ id: MINTED, name: "Raafay" }])
      }),
      Effect.provide(Layer.mergeAll(clockStub, idsStub, signerStub, repo.layer)),
    )
  })

  it.effect("expiry is now + ttl and the token signs exactly that payload (C1.2)", () =>
    createTemporaryUser({ name: "Raafay", ttlMillis: TTL }).pipe(
      Effect.map((result) => {
        expect(result.expiresAt).toBe(NOW + TTL)
        expect(result.token).toBe(`tok:${MINTED}:${NOW + TTL}`)
      }),
      Effect.provide(
        Layer.mergeAll(clockStub, idsStub, signerStub, recordingRepo().layer),
      ),
    ),
  )

  it.effect("a failing repository surfaces as a typed StorageError, nothing thrown", () =>
    createTemporaryUser({ name: "Raafay", ttlMillis: TTL }).pipe(
      Effect.either,
      Effect.map((result) => {
        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result)) {
          expect(result.left._tag).toBe("StorageError")
        }
      }),
      Effect.provide(Layer.mergeAll(clockStub, idsStub, signerStub, failingRepo)),
    ),
  )
})
