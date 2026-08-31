import { afterAll, describe, expect, it } from "@effect/vitest"
import { SqlClient } from "@effect/sql"
import { Effect, Either, Schema } from "effect"

import { UserId, UserRepository, type User } from "@cambio/domain"

import { makeTestRuntime } from "./support/db.js"

/** C4.1: the minimal users adapter — codec boundary, soft-delete filter, typed errors. */

const runtime = makeTestRuntime()
afterAll(() => runtime.dispose())

const user = (n: number, name: string): User => ({
  id: Schema.decodeUnknownSync(UserId)(`00000000-0000-4000-9000-${String(n).padStart(12, "0")}`),
  name,
})

describe("UserRepositoryLive (C4.1)", () => {
  it("create + findById round-trips a user (C4.1)", async () => {
    const alice = user(1, "alice")
    const found = await runtime.runPromise(
      Effect.gen(function* () {
        const users = yield* UserRepository
        yield* users.create(alice)
        return yield* users.findById(alice.id)
      }),
    )
    expect(found).toStrictEqual(alice)
  })

  it("findById of an unknown id fails with UserNotFound (C4.1)", async () => {
    const ghost = user(999, "ghost")
    const result = await runtime.runPromise(
      UserRepository.pipe(
        Effect.flatMap((users) => users.findById(ghost.id)),
        Effect.either,
      ),
    )
    if (Either.isRight(result)) throw new Error("expected UserNotFound")
    expect(result.left._tag).toBe("UserNotFound")
  })

  it("a soft-deleted user is not found (C4.1, C3.6 discipline)", async () => {
    const bob = user(2, "bob")
    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const users = yield* UserRepository
        const sql = yield* SqlClient.SqlClient
        yield* users.create(bob)
        yield* sql`UPDATE users SET deleted_at = now() WHERE user_id = ${bob.id}`
        return yield* Effect.either(users.findById(bob.id))
      }),
    )
    if (Either.isRight(result)) throw new Error("expected UserNotFound")
    expect(result.left._tag).toBe("UserNotFound")
  })
})
