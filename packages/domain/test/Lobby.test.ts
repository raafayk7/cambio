import { describe, expect, it } from "@effect/vitest"
import { Either } from "effect"
import {
  AlreadyInLobby,
  createLobby,
  joinLobby,
  leaveLobby,
  type Lobby,
  LobbyFull,
  LobbyNotJoinable,
  MAX_LOBBY_MEMBERS,
  NotInLobby,
  startSeats,
} from "../src/Lobby.js"
import { gid, uid, user } from "./fixtures.js"

/**
 * The pure lobby model (ADR-0019, root plan clauses 1–4's pure halves; CAM-17
 * C1: members are `{id, name}` users). Plain `it` — everything here is a pure
 * function.
 */

const lobbyId = gid(7)
const p0 = user(0)
const p1 = user(1)
const p2 = user(2)

const expectRight = <R, L>(e: Either.Either<R, L>): R => {
  expect(Either.isRight(e)).toBe(true)
  if (Either.isLeft(e)) throw new Error("expected Right")
  return e.right
}

const expectLeft = <R, L>(e: Either.Either<R, L>): L => {
  expect(Either.isLeft(e)).toBe(true)
  if (Either.isRight(e)) throw new Error("expected Left")
  return e.left
}

const openWith = (...members: ReadonlyArray<ReturnType<typeof user>>): Lobby => ({
  id: lobbyId,
  members,
  status: "open",
})

describe("createLobby (clause 1)", () => {
  it("yields an open lobby whose sole member is the creator, name included (C1)", () => {
    const lobby = createLobby(lobbyId, p0)
    expect(lobby).toEqual({ id: lobbyId, members: [p0], status: "open" })
    expect(lobby.members[0]).toEqual({ id: uid(0), name: "sim-player-0" })
  })
})

describe("joinLobby (clause 2)", () => {
  it("appends members, preserving join order (C1)", () => {
    const a = expectRight(joinLobby(createLobby(lobbyId, p0), p1))
    const b = expectRight(joinLobby(a, p2))
    expect(b.members).toEqual([p0, p1, p2])
    expect(b.status).toBe("open")
  })

  it("joining twice is AlreadyInLobby — membership is by id, not by name", () => {
    const renamed = { id: p1.id, name: "Different Name" }
    const err = expectLeft(joinLobby(openWith(p0, p1), renamed))
    expect(err._tag).toBe("AlreadyInLobby")
    if (err._tag === "AlreadyInLobby") expect(err.userId).toBe(p1.id)
  })

  it("a fourth member fills the lobby; a fifth is LobbyFull (§1.1 ceiling)", () => {
    const three = openWith(user(10), user(11), user(12))
    const four = expectRight(joinLobby(three, user(13)))
    expect(four.members).toHaveLength(MAX_LOBBY_MEMBERS)
    const err = expectLeft(joinLobby(four, user(14)))
    expect(err._tag).toBe("LobbyFull")
  })

  it("joining an abandoned or started lobby is LobbyNotJoinable carrying the status", () => {
    for (const status of ["abandoned", "started"] as const) {
      const err = expectLeft(joinLobby({ ...openWith(p0), status }, p1))
      expect(err._tag).toBe("LobbyNotJoinable")
      if (err._tag === "LobbyNotJoinable") expect(err.status).toBe(status)
    }
  })
})

describe("leaveLobby (clause 3)", () => {
  it("removes the member by id and keeps the remainder's order", () => {
    const next = expectRight(leaveLobby(openWith(p0, p1, p2), p1.id))
    expect(next.members).toEqual([p0, p2])
    expect(next.status).toBe("open")
  })

  it("leaving when not a member is NotInLobby", () => {
    const err = expectLeft(leaveLobby(openWith(p0), p1.id))
    expect(err._tag).toBe("NotInLobby")
    if (err._tag === "NotInLobby") expect(err.userId).toBe(p1.id)
  })

  it("the last member leaving abandons the lobby", () => {
    const next = expectRight(leaveLobby(openWith(p0), p0.id))
    expect(next).toEqual({ id: lobbyId, members: [], status: "abandoned" })
  })

  it("leaving an abandoned or started lobby is LobbyNotJoinable", () => {
    for (const status of ["abandoned", "started"] as const) {
      const err = expectLeft(leaveLobby({ ...openWith(p0), status }, p0.id))
      expect(err._tag).toBe("LobbyNotJoinable")
    }
  })
})

describe("startSeats (clause 4's pure half)", () => {
  it("any current member gets back the member IDS as the seat order — dealGame consumers stay id-typed", () => {
    const lobby = openWith(p0, p1, p2)
    for (const starter of [p0, p1, p2]) {
      expect(expectRight(startSeats(lobby, starter.id))).toEqual([p0.id, p1.id, p2.id])
    }
  })

  it("a non-member cannot start", () => {
    const err = expectLeft(startSeats(openWith(p0, p1), p2.id))
    expect(err._tag).toBe("NotInLobby")
  })

  it("started/abandoned lobbies cannot start (again)", () => {
    for (const status of ["abandoned", "started"] as const) {
      const err = expectLeft(startSeats({ ...openWith(p0, p1), status }, p0.id))
      expect(err._tag).toBe("LobbyNotJoinable")
    }
  })

  it("does NOT check member count — dealGame's BadPlayerCount owns it (single source)", () => {
    expect(expectRight(startSeats(openWith(p0), p0.id))).toEqual([p0.id])
  })
})

describe("purity", () => {
  it("transitions never mutate their input", () => {
    const lobby = openWith(p0, p1)
    const snapshot = structuredClone(lobby)
    void joinLobby(lobby, p2)
    void leaveLobby(lobby, p1.id)
    void startSeats(lobby, p0.id)
    expect(lobby).toEqual(snapshot)
  })
})

describe("lobby errors", () => {
  it("constructs every class with its fields and _tag", () => {
    expect(new LobbyFull()._tag).toBe("LobbyFull")
    expect(new AlreadyInLobby({ userId: p0.id }).userId).toBe(p0.id)
    expect(new NotInLobby({ userId: p1.id }).userId).toBe(p1.id)
    expect(new LobbyNotJoinable({ status: "abandoned" }).status).toBe("abandoned")
  })
})
