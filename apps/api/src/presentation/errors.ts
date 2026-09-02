import type { SessionExpired, SessionInvalid } from "@cambio/application"
import type { ErrorBody } from "@cambio/contracts"
import type {
  AlreadyInLobby,
  GameError,
  GameNotFound,
  LobbyFull,
  LobbyNotJoinable,
  NotInLobby,
  StorageError,
  UserNotFound,
  VersionConflict,
} from "@cambio/domain"

/**
 * Typed-error → HTTP status mapping, in one place (CAM-4, widened by CAM-6).
 *
 * Everything session-shaped is a 401: the client's only remedy is the same
 * (start a fresh identity via `POST /users`), and distinguishing forged from
 * stale from orphaned cookies in the response would only help an attacker.
 * The distinction still exists in the error channel for logs and tests.
 *
 * The game-facing statuses (root plan C1.9): 404 not-found (including the
 * non-participant view request — no existence leak), 409 for version/lobby
 * conflicts, 422 for `GameError` (a semantically illegal move on a
 * well-formed request), 500 for storage.
 *
 * Every switch is exhaustive over its use-case error union: a new variant
 * added upstream breaks this file's build instead of silently 500ing.
 *
 * Bodies follow the `contracts` `ErrorBody` shape (CAM-6): a machine-readable
 * `tag` — the typed error's `_tag` where one exists, a curated constant
 * otherwise — and a generic human message. Server state is never
 * interpolated.
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

/** `RoomRegistry.execute`'s union: the engine's 16 refusals plus load/save. */
export type CommandRouteError = GameError | GameNotFound | VersionConflict | StorageError

export const commandErrorStatus = (error: CommandRouteError): 404 | 409 | 422 | 500 => {
  switch (error._tag) {
    case "GameNotFound":
      return 404
    case "VersionConflict":
      return 409
    case "StorageError":
      return 500
    // Every GameError variant: an illegal move on a well-formed request.
    case "UnknownPlayer":
    case "EmptyDiscard":
    case "BadPlayerCount":
    case "GameAlreadyEnded":
    case "NotYourTurn":
    case "WrongPhase":
    case "PowerDiscardNotTakeable":
    case "MustResolvePower":
    case "EmptySlotTarget":
    case "SwapTargetsIdentical":
    case "WrongPeekTarget":
    case "KeepRequiresEmptyHand":
    case "InvalidGiveSlot":
    case "SlamTooLate":
    case "WindowStillOpen":
    case "NoCardToDraw":
      return 422
    default:
      return error satisfies never
  }
}

/** The union across createLobby + join/leave/start (start carries GameError). */
export type LobbyRouteError =
  | GameNotFound
  | UserNotFound
  | LobbyFull
  | AlreadyInLobby
  | NotInLobby
  | LobbyNotJoinable
  | VersionConflict
  | StorageError
  | GameError

export const lobbyErrorStatus = (error: LobbyRouteError): 404 | 409 | 422 | 500 => {
  switch (error._tag) {
    case "GameNotFound":
    case "UserNotFound":
      return 404
    case "LobbyFull":
    case "AlreadyInLobby":
    case "NotInLobby":
    case "LobbyNotJoinable":
    case "VersionConflict":
      return 409
    case "StorageError":
      return 500
    default:
      // The remainder is exactly GameError; a new lobby-route variant would
      // fail this call's type check rather than fall through silently.
      return commandErrorStatus(error)
  }
}

/** Curated bodies for errors that never had a typed `_tag`. */
export const errorBody = (status: 400 | 401 | 404 | 500): ErrorBody => {
  switch (status) {
    case 400:
      return { error: { tag: "BadRequest", message: "invalid request" } }
    case 401:
      return { error: { tag: "Unauthorized", message: "no valid session" } }
    case 404:
      return { error: { tag: "NotFound", message: "not found" } }
    case 500:
      return { error: { tag: "Internal", message: "internal error" } }
  }
}

const STATUS_MESSAGES: Record<401 | 404 | 409 | 422 | 500, string> = {
  401: "no valid session",
  404: "not found",
  409: "conflict",
  422: "illegal move",
  500: "internal error",
}

/**
 * Body for a typed error: the variant's `_tag` (all are safe to name — root
 * plan Decision Log) with a generic message for its status class.
 */
export const typedErrorBody = (
  status: 401 | 404 | 409 | 422 | 500,
  error: { readonly _tag: string },
): ErrorBody => ({ error: { tag: error._tag, message: STATUS_MESSAGES[status] } })

/**
 * Fallback for anything that never reached the typed channel: defects
 * escaping the exit fold, and framework errors (malformed JSON, oversized
 * payloads). Fastify's client-fault status codes are kept; the body is
 * curated here — the default handler's `{ message: err.message }` is
 * unreviewed output and must never reach a client (hidden-information
 * posture).
 */
export const unhandledErrorResponse = (statusCode: number | undefined) => {
  const clientFault = statusCode !== undefined && statusCode >= 400 && statusCode < 500
  return clientFault
    ? { status: statusCode, body: errorBody(400) }
    : { status: 500, body: errorBody(500) }
}
