import { afterAll, beforeEach, describe, expect, it } from "@effect/vitest"
import { decodeLobbyResponse } from "@cambio/contracts"
import { GameId, GameRepository, UserId } from "@cambio/domain"
import { Effect, Schema } from "effect"

import { grantsFor } from "../src/infra/topics.js"
import {
  clearPublisherJournal,
  makeTestApp,
  publisherJournal,
  TEST_TOPIC_SECRET,
} from "./support/http.js"

/**
 * Lobby routes over HTTP (root C1.1–C1.3, C1.7–C1.9) plus the grant-isolation
 * half of C4.4. The app overrides `slamWindowMs` so C1.3 can observe the
 * config value landing in the started game's persisted `GameConfig`.
 */

const SLAM_WINDOW_OVERRIDE = 7777

const { app, runtime } = await makeTestApp({ slamWindowMs: SLAM_WINDOW_OVERRIDE })

afterAll(async () => {
  await app.close()
  await runtime.dispose()
})

beforeEach(() => {
  clearPublisherJournal()
})

interface Player {
  readonly userId: string
  readonly cookie: string
}

const newPlayer = async (name: string): Promise<Player> => {
  const res = await app.inject({ method: "POST", url: "/users", payload: { name } })
  expect(res.statusCode).toBe(201)
  const cookie = res.cookies.find((c) => c.name === "cambio_session")
  expect(cookie).toBeDefined()
  return { userId: (res.json() as { userId: string }).userId, cookie: cookie!.value }
}

const post = (url: string, player?: Player, payload?: unknown) =>
  app.inject({
    method: "POST",
    url,
    ...(player === undefined ? {} : { cookies: { cambio_session: player.cookie } }),
    ...(payload === undefined ? {} : { payload: payload as object }),
  })

const get = (url: string, player?: Player) =>
  app.inject({
    method: "GET",
    url,
    ...(player === undefined ? {} : { cookies: { cambio_session: player.cookie } }),
  })

describe("POST /lobbies (C1.1)", () => {
  it("creates a lobby: 201 with the lobby view, version, and the caller's grants", async () => {
    const alice = await newPlayer("Alice")
    const res = await post("/lobbies", alice)
    expect(res.statusCode).toBe(201)
    const body = res.json() as {
      lobby: {
        id: string
        members: ReadonlyArray<{ id: string; name: string }>
        status: string
      }
      version: number
      grants: { roomTopic: string; playerTopic: string }
    }
    // Members are {id, name} — the display name is on the wire (C1).
    expect(body.lobby.members).toEqual([{ id: alice.userId, name: "Alice" }])
    expect(body.lobby.status).toBe("open")
    expect(body.version).toBeGreaterThan(0)
    const gameId = Schema.decodeUnknownSync(GameId)(body.lobby.id)
    expect(body.grants).toEqual(
      grantsFor(TEST_TOPIC_SECRET, gameId, Schema.decodeUnknownSync(UserId)(alice.userId)),
    )
  })

  it("401 without a session, contract body (C1.7)", async () => {
    const res = await post("/lobbies")
    expect(res.statusCode).toBe(401)
    expect(res.json()).toEqual({ error: { tag: "Unauthorized", message: "no valid session" } })
  })
})

describe("join/leave (C1.2, C1.9)", () => {
  it("join returns the joiner's grants; one player's response never carries another's private topic (C4.4)", async () => {
    const alice = await newPlayer("Alice")
    const bob = await newPlayer("Bob")
    const created = (await post("/lobbies", alice)).json() as {
      lobby: { id: string }
      grants: { playerTopic: string }
    }

    const joined = await post(`/lobbies/${created.lobby.id}/join`, bob)
    expect(joined.statusCode).toBe(200)
    const body = joined.json() as {
      lobby: { members: ReadonlyArray<{ id: string; name: string }> }
      grants: { roomTopic: string; playerTopic: string }
    }
    expect(body.lobby.members).toEqual([
      { id: alice.userId, name: "Alice" },
      { id: bob.userId, name: "Bob" },
    ])
    expect(body.grants.playerTopic).not.toBe(created.grants.playerTopic)
    // Adversarial: Alice's secret-bearing topic appears nowhere in Bob's body.
    expect(JSON.stringify(body)).not.toContain(created.grants.playerTopic)
  })

  it("leave returns the view and version, no grants (C1.2)", async () => {
    const alice = await newPlayer("Alice")
    const bob = await newPlayer("Bob")
    const created = (await post("/lobbies", alice)).json() as { lobby: { id: string } }
    await post(`/lobbies/${created.lobby.id}/join`, bob)

    const left = await post(`/lobbies/${created.lobby.id}/leave`, bob)
    expect(left.statusCode).toBe(200)
    const body = left.json() as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(["lobby", "version"])
    expect(
      (body["lobby"] as { members: ReadonlyArray<{ id: string; name: string }> }).members,
    ).toEqual([{ id: alice.userId, name: "Alice" }])
  })

  it("typed refusals surface their mapped status and tag (C1.9 sampling)", async () => {
    const alice = await newPlayer("Alice")
    const created = (await post("/lobbies", alice)).json() as { lobby: { id: string } }

    // Joining a lobby you are already in → 409 AlreadyInLobby.
    const dup = await post(`/lobbies/${created.lobby.id}/join`, alice)
    expect(dup.statusCode).toBe(409)
    expect((dup.json() as { error: { tag: string } }).error.tag).toBe("AlreadyInLobby")

    // Unknown game → 404 GameNotFound.
    const missing = await post(`/lobbies/00000000-0000-4000-9000-000000000999/join`, alice)
    expect(missing.statusCode).toBe(404)
    expect((missing.json() as { error: { tag: string } }).error.tag).toBe("GameNotFound")

    // Leaving a lobby you are not in → 409 NotInLobby.
    const bob = await newPlayer("Bob")
    const notIn = await post(`/lobbies/${created.lobby.id}/leave`, bob)
    expect(notIn.statusCode).toBe(409)
    expect((notIn.json() as { error: { tag: string } }).error.tag).toBe("NotInLobby")
  })

  it("malformed :gameId is a 400 before any effect — no registry or publisher activity (C1.8)", async () => {
    const alice = await newPlayer("Alice")
    clearPublisherJournal()
    const res = await post("/lobbies/not-a-uuid/join", alice)
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: { tag: "BadRequest", message: "invalid request" } })
    expect(publisherJournal).toEqual([])
  })
})

describe("GET /lobbies/:gameId (CAM-17 B1–B3, C5)", () => {
  it("a member gets 200 {lobby, version, grants} — own grants only, decodable through LobbyResponse (B1, C5)", async () => {
    const alice = await newPlayer("Alice")
    const bob = await newPlayer("Bob")
    const created = (await post("/lobbies", alice)).json() as {
      lobby: { id: string }
      grants: { playerTopic: string }
    }
    const joined = (await post(`/lobbies/${created.lobby.id}/join`, bob)).json() as {
      grants: { playerTopic: string }
    }

    const res = await get(`/lobbies/${created.lobby.id}`, bob)
    expect(res.statusCode).toBe(200)
    const body = res.json() as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(["grants", "version", "lobby"].sort())
    // C5: the reload bootstrap decodes through the join response's schema.
    const decoded = decodeLobbyResponse(body)
    expect(decoded.lobby.members).toEqual([
      { id: alice.userId, name: "Alice" },
      { id: bob.userId, name: "Bob" },
    ])
    expect(decoded.lobby.status).toBe("open")
    expect(decoded.version).toBeGreaterThan(0)
    // Own grants only, matching the join reply; Alice's secret-bearing
    // topic appears nowhere in Bob's body (the C4.4 mirror).
    expect(decoded.grants.playerTopic).toBe(joined.grants.playerTopic)
    expect(JSON.stringify(body)).not.toContain(created.grants.playerTopic)
  })

  it("404s byte-identically for non-members, unknown ids, started and abandoned lobbies (B2)", async () => {
    const alice = await newPlayer("Alice")
    const mallory = await newPlayer("Mallory")

    // Non-member of a real open lobby.
    const open = (await post("/lobbies", alice)).json() as { lobby: { id: string } }
    const nonMember = await get(`/lobbies/${open.lobby.id}`, mallory)

    // Unknown id.
    const unknown = await get("/lobbies/00000000-0000-4000-9000-000000000998", mallory)

    // Started lobby — even for a member: the room moved on.
    const bob = await newPlayer("Bob")
    const started = (await post("/lobbies", alice)).json() as { lobby: { id: string } }
    await post(`/lobbies/${started.lobby.id}/join`, bob)
    expect((await post(`/lobbies/${started.lobby.id}/start`, alice)).statusCode).toBe(200)
    const afterStart = await get(`/lobbies/${started.lobby.id}`, alice)

    // Abandoned lobby — its last member left.
    const abandoned = (await post("/lobbies", alice)).json() as { lobby: { id: string } }
    await post(`/lobbies/${abandoned.lobby.id}/leave`, alice)
    const afterAbandon = await get(`/lobbies/${abandoned.lobby.id}`, alice)

    for (const res of [nonMember, unknown, afterStart, afterAbandon]) {
      expect(res.statusCode).toBe(404)
      // Raw-body equality — no existence leak down to the byte.
      expect(res.body).toBe(unknown.body)
    }
  })

  it("malformed :gameId is a 400 before any effect — empty publisher journal (B3)", async () => {
    const alice = await newPlayer("Alice")
    clearPublisherJournal()
    const res = await get("/lobbies/not-a-uuid", alice)
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: { tag: "BadRequest", message: "invalid request" } })
    expect(publisherJournal).toEqual([])
  })

  it("401 without a session (B1's auth edge)", async () => {
    const res = await get("/lobbies/00000000-0000-4000-9000-000000000001")
    expect(res.statusCode).toBe(401)
    expect((res.json() as { error: { tag: string } }).error.tag).toBe("Unauthorized")
  })
})

describe("start (C1.3)", () => {
  it("assembles GameConfig from AppConfig — the override lands in the persisted game", async () => {
    const alice = await newPlayer("Alice")
    const bob = await newPlayer("Bob")
    const created = (await post("/lobbies", alice)).json() as { lobby: { id: string } }
    await post(`/lobbies/${created.lobby.id}/join`, bob)

    const started = await post(`/lobbies/${created.lobby.id}/start`, alice)
    expect(started.statusCode).toBe(200)
    const body = started.json() as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(["version", "view"])
    // C4's equals-started-with pin: the view reports the override the game
    // was started with, sourced from persisted state, not the live env.
    expect((body["view"] as { config: { slamWindowMs: number } }).config.slamWindowMs).toBe(
      SLAM_WINDOW_OVERRIDE,
    )

    const gameId = Schema.decodeUnknownSync(GameId)(created.lobby.id)
    const loaded = await runtime.runPromise(
      Effect.flatMap(GameRepository, (games) => games.load(gameId)),
    )
    expect(loaded.state.config.slamWindowMs).toBe(SLAM_WINDOW_OVERRIDE)
  })

  it("a non-member cannot start: 409 NotInLobby (C1.9)", async () => {
    const alice = await newPlayer("Alice")
    const mallory = await newPlayer("Mallory")
    const created = (await post("/lobbies", alice)).json() as { lobby: { id: string } }
    const res = await post(`/lobbies/${created.lobby.id}/start`, mallory)
    expect(res.statusCode).toBe(409)
    expect((res.json() as { error: { tag: string } }).error.tag).toBe("NotInLobby")
  })

  it("all lobby routes 401 without a session (C1.7)", async () => {
    for (const url of [
      "/lobbies/00000000-0000-4000-9000-000000000001/join",
      "/lobbies/00000000-0000-4000-9000-000000000001/leave",
      "/lobbies/00000000-0000-4000-9000-000000000001/start",
    ]) {
      const res = await post(url)
      expect(res.statusCode, url).toBe(401)
      expect((res.json() as { error: { tag: string } }).error.tag).toBe("Unauthorized")
    }
  })
})
