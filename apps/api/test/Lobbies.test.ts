import { afterAll, beforeEach, describe, expect, it } from "@effect/vitest"
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

describe("POST /lobbies (C1.1)", () => {
  it("creates a lobby: 201 with the lobby view, version, and the caller's grants", async () => {
    const alice = await newPlayer("Alice")
    const res = await post("/lobbies", alice)
    expect(res.statusCode).toBe(201)
    const body = res.json() as {
      lobby: { id: string; members: ReadonlyArray<string>; status: string }
      version: number
      grants: { roomTopic: string; playerTopic: string }
    }
    expect(body.lobby.members).toEqual([alice.userId])
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
      lobby: { members: ReadonlyArray<string> }
      grants: { roomTopic: string; playerTopic: string }
    }
    expect(body.lobby.members).toEqual([alice.userId, bob.userId])
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
    expect((body["lobby"] as { members: ReadonlyArray<string> }).members).toEqual([alice.userId])
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
