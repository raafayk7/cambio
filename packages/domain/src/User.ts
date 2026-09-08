import { Schema } from "effect"
import { UserId } from "./Ids.js"

/**
 * The user entity (§4.3 `users`): minimal on purpose — temporary/anonymous
 * users are a name and an id. CAM-4 (temp-user auth) builds on this. Lives
 * apart from `UserRepository.ts` so entity consumers (`Lobby.ts`) never pull
 * in the port module.
 */
export const User = Schema.Struct({
  id: UserId,
  name: Schema.String,
})
export type User = typeof User.Type
