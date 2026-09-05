import { Context, Data, type Effect, Schema } from "effect"
// Type-only statement (not inline) so no runtime edge to GameRepository
// exists — see the cycle note in GameRepository.ts (CAM-17).
import type { StorageError } from "./GameRepository.js"
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
    /**
     * Batch lookup (CAM-17 C2): missing ids are simply absent from the
     * result — no `UserNotFound`; callers decide what absence means.
     */
    readonly findManyById: (
      userIds: ReadonlyArray<UserId>,
    ) => Effect.Effect<ReadonlyArray<User>, StorageError>
  }
>() {}
