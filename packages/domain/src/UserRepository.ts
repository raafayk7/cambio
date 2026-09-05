import { Context, Data, type Effect } from "effect"
import { type StorageError } from "./GameRepository.js"
import { type UserId } from "./Ids.js"
import { type User } from "./User.js"

/**
 * The users port (§4.3 `users`): minimal on purpose — temporary/anonymous
 * users are a name and an id. CAM-4 (temp-user auth) builds on this. The
 * `User` entity itself lives in `User.ts`; re-exported here so existing
 * importers keep working.
 */

export { User } from "./User.js"

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
