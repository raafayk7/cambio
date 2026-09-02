import { afterAll, describe, expect, it } from "@effect/vitest"
import { dealGame, decodeGameConfig, type GameState, UserId } from "@cambio/domain"
import { ts } from "@cambio/domain/testing"
import { Either, Schema } from "effect"
import { viewFor } from "@cambio/application"

import { makeTestApp, TEST_SEED } from "./support/http.js"
import { entitledSlugs, expectNoLeak } from "./support/leaks.js"

/**
 * Command + view routes (root C1.4–C1.6, C1.9, C6.1). The fixed-seed
 * `SeedPort` stub (decision 15) lets the suite replay `dealGame` in-test —
 * the domain is pure — to know the full truth the server holds and recompute
 * the expected `viewFor` output independently.
 */

const SLAM_WINDOW_MS = 5000

const { app, runtime } = await makeTestApp({ slamWindowMs: SLAM_WINDOW_MS })

afterAll(async () => {
  await app.close()
  await runtime.dispose()
})

interface Player {
  readonly userId: string
  readonly cookie: string
}

const toUserId = Schema.decodeUnknownSync(UserId)

const newPlayer = async (name: string): Promise<Player> => {
  const res = await app.inject({ method: "POST", url: "/users", payload: { name } })
  expect(res.statusCode).toBe(201)
  const cookie = res.cookies.find((c) => c.name === "cambio_session")!
  return { userId: (res.json() as { userId: string }).userId, cookie: cookie.value }
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

/** Create + join + start a fresh two-player game; returns its id and roster. */
const startGame = async () => {
  const alice = await newPlayer("Alice")
  const bob = await newPlayer("Bob")
  const created = (await post("/lobbies", alice)).json() as { lobby: { id: string } }
  const gameId = created.lobby.id
  expect((await post(`/lobbies/${gameId}/join`, bob)).statusCode).toBe(200)
  expect((await post(`/lobbies/${gameId}/start`, alice)).statusCode).toBe(200)
  return { gameId, alice, bob }
}

/** The server's deal, replayed from the fixed seed. Timestamps don't shape it. */
const replayDeal = (alice: Player, bob: Player): GameState => {
  const dealt = dealGame(
    [toUserId(alice.userId), toUserId(bob.userId)],
    TEST_SEED,
    decodeGameConfig({ slamWindowMs: SLAM_WINDOW_MS }),
    ts(0),
  )
  if (Either.isLeft(dealt)) throw new Error("replay deal failed")
  return dealt.right[0]
}

describe("POST /games/:gameId/commands (C1.4, C6.1)", () => {
  it("a legal command returns {view, version} where view equals viewFor recomputed in-test", async () => {
    const { gameId, alice, bob } = await startGame()
    const res = await post(`/games/${gameId}/commands`, alice, { _tag: "DrawFromDeck" })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { view: unknown; version: number }
    expect(Object.keys(body).sort()).toEqual(["version", "view"])

    const replayed = replayDeal(alice, bob)
    const afterDraw: GameState = {
      ...replayed,
      deck: replayed.deck.slice(1),
      phase: {
        _tag: "HoldingCard",
        playerId: toUserId(alice.userId),
        card: replayed.deck[0]!,
        source: "deck",
      },
    }
    expect(body.view).toEqual(viewFor(toUserId(alice.userId), afterDraw))
    expectNoLeak(body, entitledSlugs(afterDraw, toUserId(alice.userId)), "draw reply")
  })

  it("a spoofed playerId in the body executes as the session user, never the spoofed player (C1.5)", async () => {
    const { gameId, alice, bob } = await startGame()
    // It is Alice's turn (seat 0). Bob sends a command claiming to be Alice:
    // the wire schema has no issuer field, the spoofed key is dropped at
    // decode, and the engine refuses BOB's out-of-turn draw.
    const res = await post(`/games/${gameId}/commands`, bob, {
      _tag: "DrawFromDeck",
      playerId: alice.userId,
    })
    expect(res.statusCode).toBe(422)
    expect((res.json() as { error: { tag: string } }).error.tag).toBe("NotYourTurn")
  })

  it("CloseSlamWindow is not on the wire: 400 at decode (C1.4)", async () => {
    const { gameId, alice } = await startGame()
    const res = await post(`/games/${gameId}/commands`, alice, { _tag: "CloseSlamWindow" })
    expect(res.statusCode).toBe(400)
    expect((res.json() as { error: { tag: string } }).error.tag).toBe("BadRequest")
  })

  it("malformed bodies 400 before any effect (C1.8)", async () => {
    const { gameId, alice } = await startGame()
    for (const payload of [{}, { _tag: "SwapHeld" }, { _tag: "Nope" }]) {
      const res = await post(`/games/${gameId}/commands`, alice, payload)
      expect(res.statusCode, JSON.stringify(payload)).toBe(400)
    }
    // A JSON string is valid JSON but not a command object — schema, not parser.
    const stringBody = await app.inject({
      method: "POST",
      url: `/games/${gameId}/commands`,
      cookies: { cambio_session: alice.cookie },
      headers: { "content-type": "application/json" },
      payload: '"DrawFromDeck"',
    })
    expect(stringBody.statusCode).toBe(400)
  })

  it("unknown game → 404 GameNotFound; unauthenticated → 401 (C1.7, C1.9)", async () => {
    const { alice } = await startGame()
    const missing = await post(
      "/games/00000000-0000-4000-9000-000000000777/commands",
      alice,
      { _tag: "DrawFromDeck" },
    )
    expect(missing.statusCode).toBe(404)
    expect((missing.json() as { error: { tag: string } }).error.tag).toBe("GameNotFound")

    const anon = await post("/games/00000000-0000-4000-9000-000000000777/commands", undefined, {
      _tag: "DrawFromDeck",
    })
    expect(anon.statusCode).toBe(401)
  })
})

describe("GET /games/:gameId/view (C1.6)", () => {
  it("a participant gets snapshot + version + their grants, leak-free", async () => {
    const { gameId, alice, bob } = await startGame()
    const res = await get(`/games/${gameId}/view`, bob)
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      view: { deckCount: number; players: ReadonlyArray<{ id: string }> }
      version: number
      grants: { roomTopic: string; playerTopic: string }
    }
    expect(Object.keys(body).sort()).toEqual(["grants", "version", "view"])
    expect(body.view.players.map((p) => p.id)).toEqual([alice.userId, bob.userId])

    const replayed = replayDeal(alice, bob)
    expect(body.view).toEqual(viewFor(toUserId(bob.userId), replayed))
    expectNoLeak(body, entitledSlugs(replayed, toUserId(bob.userId)), "bob snapshot")
  })

  it("a non-participant gets a 404 body identical to an unknown game — no existence leak", async () => {
    const { gameId } = await startGame()
    const carol = await newPlayer("Carol")

    const real = await get(`/games/${gameId}/view`, carol)
    const unknown = await get("/games/00000000-0000-4000-9000-000000000778/view", carol)
    expect(real.statusCode).toBe(404)
    expect(unknown.statusCode).toBe(404)
    expect(real.json()).toEqual(unknown.json())
  })

  it("unmatched routes get the curated contract 404 (C1.11)", async () => {
    const res = await app.inject({ method: "GET", url: "/definitely/not/a/route" })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: { tag: "NotFound", message: "not found" } })
  })
})
