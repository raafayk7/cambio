import type { SessionExpired, SessionInvalid } from "@cambio/application"
import type { StorageError, UserNotFound } from "@cambio/domain"

/**
 * Typed-error → HTTP status mapping, in one place (the repo's first — CAM-4).
 *
 * Everything session-shaped is a 401: the client's only remedy is the same
 * (start a fresh identity via `POST /users`), and distinguishing forged from
 * stale from orphaned cookies in the response would only help an attacker.
 * The distinction still exists in the error channel for logs and tests.
 *
 * The switch is exhaustive over the use-case error unions: a new variant
 * added in CAM-5+ breaks this file's build instead of silently 500ing.
 */

export type SessionError = SessionInvalid | SessionExpired | UserNotFound | StorageError

export const sessionErrorStatus = (error: SessionError): 401 | 500 => {
  switch (error._tag) {
    case "SessionInvalid":
    case "SessionExpired":
    case "UserNotFound":
      return 401
    case "StorageError":
      return 500
    default:
      return error satisfies never
  }
}

/** Plain `{ error }` bodies (root plan decision: no error contract yet). */
export const errorBody = (status: 400 | 401 | 500) => {
  switch (status) {
    case 400:
      return { error: "invalid request body" }
    case 401:
      return { error: "no valid session" }
    case 500:
      return { error: "internal error" }
  }
}
