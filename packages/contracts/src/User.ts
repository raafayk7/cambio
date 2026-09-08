import { Schema } from "effect"
import { DisplayName } from "./GamePrimitives.js"

/**
 * Request body of `POST /users` (CAM-4).
 *
 * The display-name rule lives at the wire boundary, not in the database
 * (root plan decision), as the shared `DisplayName` schema: the value is
 * trimmed first (a transform, so `"  Raafay  "` decodes to `"Raafay"`), then
 * must be non-empty and at most 32 characters. Guest names are labels, not
 * identities — no uniqueness.
 */
export const CreateUserRequest = Schema.Struct({
  name: DisplayName,
})
export type CreateUserRequest = typeof CreateUserRequest.Type

/**
 * Response body of `POST /users` and `GET /me`.
 *
 * `userId` is a plain UUID string — contracts may import only `effect`
 * (§3.1), so domain brands like `UserId` are re-declared as unbranded wire
 * shapes here.
 */
export const SessionUser = Schema.Struct({
  userId: Schema.UUID,
  name: DisplayName,
})
export type SessionUser = typeof SessionUser.Type

export const decodeCreateUserRequest = Schema.decodeUnknownSync(CreateUserRequest)
export const encodeCreateUserRequest = Schema.encodeSync(CreateUserRequest)
export const decodeSessionUser = Schema.decodeUnknownSync(SessionUser)
export const encodeSessionUser = Schema.encodeSync(SessionUser)
