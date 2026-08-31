import { Context, Data, type Effect, Schema } from "effect"
import { type StorageError } from "./GameRepository.js"
import { UserId } from "./Ids.js"

/**
 * The users port (§4.3 `users`): minimal on purpose — temporary/anonymous
 * users are a name and an id. CAM-4 (temp-user auth) builds on this.
 */

export const User = Schema.Struct({
  id: UserId,
  name: Schema.String,
})
export type User = typeof User.Type

export class UserNotFound extends Data.TaggedError("UserNotFound")<{
  readonly userId: UserId
}> {}

export class UserRepository extends Context.Tag("@cambio/domain/UserRepository")<
  UserRepository,
  {
    readonly create: (user: User) => Effect.Effect<void, StorageError>
    readonly findById: (userId: UserId) => Effect.Effect<User, UserNotFound | StorageError>
  }
>() {}
