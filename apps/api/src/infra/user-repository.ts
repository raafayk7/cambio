import { SqlClient } from "@effect/sql"
import { Effect, Layer, Schema } from "effect"

import { StorageError, User, UserNotFound, UserRepository } from "@cambio/domain"

/**
 * `UserRepository` adapter (§4.3 `users`, root plan C4.1). The row-mapping
 * reference for this package: reads filter `deleted_at IS NULL` in SQL, rows
 * decode through a Schema at the boundary, and every SQL failure surfaces as
 * a typed `StorageError` — nothing throws across the layer.
 */

const UserRow = Schema.Struct({
  user_id: Schema.String,
  user_name: Schema.String,
})

const storage =
  (operation: string) =>
  (cause: unknown): StorageError =>
    new StorageError({ operation, cause })

export const UserRepositoryLive = Layer.effect(
  UserRepository,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const decodeUser = (row: unknown) =>
      Schema.decodeUnknown(UserRow)(row).pipe(
        Effect.flatMap((r) => Schema.decodeUnknown(User)({ id: r.user_id, name: r.user_name })),
        Effect.mapError(storage("users.decode")),
      )

    return {
      create: (user: User) =>
        sql`
          INSERT INTO users (user_id, user_name)
          VALUES (${user.id}, ${user.name})
        `.pipe(Effect.asVoid, Effect.mapError(storage("users.create"))),

      findById: (userId) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT user_id, user_name FROM users
            WHERE user_id = ${userId} AND deleted_at IS NULL
          `.pipe(Effect.mapError(storage("users.findById")))
          if (rows.length === 0) return yield* Effect.fail(new UserNotFound({ userId }))
          return yield* decodeUser(rows[0])
        }),
    }
  }),
)
