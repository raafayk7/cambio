import { Data, Either, Schema } from "effect"
import { GameId, UserId } from "./Ids.js"

/**
 * The pre-game lobby (ADR-0019): a pure model deliberately OUTSIDE the rules
 * engine. The engine begins at `dealGame` — the lobby never touches `Phase`,
 * `Engine`, or the event log; its persisted authority is rows, not events.
 *
 * `members` is join order, and at start it *is* the seat order — §4.5's
 * "seat_index contiguous from 0" holds by construction.
 */

/**
 * `"started"` is a read-only projection: `loadLobby` maps an
 * `in_progress`/`completed` row to it so join/leave/start refusals stay pure
 * domain decisions. It is never written by `saveLobby` — the open→started
 * transition is `save` with the `GameStarted` batch.
 */
export const LobbyStatus = Schema.Literal("open", "abandoned", "started")
export type LobbyStatus = typeof LobbyStatus.Type

export const Lobby = Schema.Struct({
  id: GameId,
  /** Join order — and, at start, the seat order (§4.5, ADR-0019). */
  members: Schema.Array(UserId),
  status: LobbyStatus,
})
export type Lobby = typeof Lobby.Type

export const decodeLobby = Schema.decodeUnknownSync(Lobby)
export const encodeLobby = Schema.encodeSync(Lobby)

/** The §1.1 player ceiling — a sixth member could never be seated. */
export const MAX_LOBBY_MEMBERS = 5

/** The lobby already holds five members (§1.1). */
export class LobbyFull extends Data.TaggedError("LobbyFull") {}

/** Joining a lobby you are already in. */
export class AlreadyInLobby extends Data.TaggedError("AlreadyInLobby")<{
  readonly userId: UserId
}> {}

/** Leaving or starting a lobby you are not a member of. */
export class NotInLobby extends Data.TaggedError("NotInLobby")<{
  readonly userId: UserId
}> {}

/** The lobby is no longer open — abandoned, or already a running game. */
export class LobbyNotJoinable extends Data.TaggedError("LobbyNotJoinable")<{
  readonly status: LobbyStatus
}> {}

export type LobbyError = LobbyFull | AlreadyInLobby | NotInLobby | LobbyNotJoinable

const requireOpen = (lobby: Lobby): Either.Either<Lobby, LobbyNotJoinable> =>
  lobby.status === "open"
    ? Either.right(lobby)
    : Either.left(new LobbyNotJoinable({ status: lobby.status }))

/** A fresh lobby: sole member is its creator (root plan clause 1). */
export const createLobby = (id: GameId, creator: UserId): Lobby => ({
  id,
  members: [creator],
  status: "open",
})

/** Append a member in join order (root plan clause 2). */
export const joinLobby = (
  lobby: Lobby,
  userId: UserId,
): Either.Either<Lobby, LobbyFull | AlreadyInLobby | LobbyNotJoinable> =>
  Either.gen(function* () {
    yield* requireOpen(lobby)
    if (lobby.members.includes(userId)) return yield* Either.left(new AlreadyInLobby({ userId }))
    if (lobby.members.length >= MAX_LOBBY_MEMBERS) return yield* Either.left(new LobbyFull())
    return { ...lobby, members: [...lobby.members, userId] }
  })

/**
 * Remove a member, preserving the remainder's order. The last member leaving
 * abandons the lobby (root plan clause 3 — user call: abandoned, not deleted).
 */
export const leaveLobby = (
  lobby: Lobby,
  userId: UserId,
): Either.Either<Lobby, NotInLobby | LobbyNotJoinable> =>
  Either.gen(function* () {
    yield* requireOpen(lobby)
    if (!lobby.members.includes(userId)) return yield* Either.left(new NotInLobby({ userId }))
    const members = lobby.members.filter((m) => m !== userId)
    return { ...lobby, members, status: members.length === 0 ? ("abandoned" as const) : lobby.status }
  })

/**
 * Start-eligibility: any current member may start — no host concept (root
 * plan Decision Log). Returns the seat order (= join order). Deliberately no
 * member-count check: `dealGame`'s `BadPlayerCount` is the single source of
 * the 2–5 rule.
 */
export const startSeats = (
  lobby: Lobby,
  starter: UserId,
): Either.Either<ReadonlyArray<UserId>, NotInLobby | LobbyNotJoinable> =>
  Either.gen(function* () {
    yield* requireOpen(lobby)
    if (!lobby.members.includes(starter)) return yield* Either.left(new NotInLobby({ userId: starter }))
    return lobby.members
  })
