import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setRealtimeClientForTests } from "../src/services/realtime.js"
import { FakeRealtimeClient } from "./support/fake-realtime.js"
import {
  errorBody,
  FRIEND,
  GAME_ID,
  GRANTS,
  json,
  ME,
  renderGameApp,
  stubApi,
  viewResponse,
} from "./support/harness.js"

/**
 * Game container (CAM-18 C1-C5, this task's steps 5/8/9) — memory router,
 * mocked fetch, injected fake realtime client (jsdom never opens sockets,
 * ADR-0030). Follows room-screen.test.tsx's driving patterns throughout;
 * `renderGameApp` mounts the real `GameScreen`, distinct from `renderApp`'s
 * `/game/$gameId` stub the room/lobby suites still depend on.
 */

const GET_VIEW = `GET /games/${GAME_ID}/view`

// The screen mounts FlightLayer (root plan step 8), which reads
// prefers-reduced-motion via matchMedia — jsdom doesn't implement it
// (flight-layer.test.tsx precedent).
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
})

afterEach(() => {
  vi.unstubAllGlobals()
  setRealtimeClientForTests(null)
})

const setupFake = () => {
  const fake = new FakeRealtimeClient()
  setRealtimeClientForTests(fake)
  return fake
}

/** Wait for both granted topics to be subscribed on the fake client
 * (room-screen precedent — the game screen subscribes both from bootstrap,
 * not lazily like the room's pre-game player topic). */
const channelsReady = async (fake: FakeRealtimeClient) => {
  await waitFor(() => {
    expect(fake.channels).toHaveLength(2)
  })
  return {
    room: fake.find(GRANTS.roomTopic)!,
    player: fake.find(GRANTS.playerTopic)!,
  }
}

const twoPlayerView = viewResponse({
  players: [
    { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
    { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
  ],
  deckCount: 37,
  discard: ["KH"],
})

const gameBootstrap = () =>
  stubApi({
    "GET /me": json(200, ME),
    [GET_VIEW]: json(200, twoPlayerView),
  })

describe("bootstrap (C1)", () => {
  it("renders the table from the snapshot — seats by name, deck count, discard top, both topics subscribed", async () => {
    const fake = setupFake()
    gameBootstrap()
    renderGameApp(GAME_ID)

    expect(await screen.findByText(ME.name)).toBeInTheDocument()
    expect(screen.getByText(FRIEND.name)).toBeInTheDocument()
    expect(screen.getByLabelText("37 cards in the draw deck")).toBeInTheDocument()
    // The discard's top card is the only public value on the table — it
    // renders face-up (structural: `data-face="up"` carries the rank).
    const discardRank = screen.getByText("K")
    expect(discardRank.closest('[data-face="up"]')).not.toBeNull()

    await channelsReady(fake)
  })

  it("shows the first-load skeleton while bootstrap resolves (300ms no-flash)", async () => {
    setupFake()
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    )
    renderGameApp(GAME_ID)

    expect(await screen.findByTestId("game-skeleton")).toBeInTheDocument()
  })
})

describe("version guard + refetch authority (C2, ADR-0033)", () => {
  it("applies a newer refetched view and discards a stale one that arrives after it", async () => {
    const fake = setupFake()
    const { handlers } = gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    const { room } = await channelsReady(fake)

    // A newer version (5) lands on the next refetch — applied.
    handlers[GET_VIEW] = json(
      200,
      viewResponse({
        players: [
          { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
          { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
        ],
        deckCount: 20,
        version: 5,
      }),
    )
    act(() => {
      room.emit("CardDrawn", { _tag: "CardDrawn", playerId: ME.userId })
    })
    await waitFor(() => {
      expect(screen.getByLabelText("20 cards in the draw deck")).toBeInTheDocument()
    })

    // A stale response (version 4 < the 5 already applied) lands next —
    // discarded; the snapshot stays at 20.
    handlers[GET_VIEW] = json(
      200,
      viewResponse({
        players: [
          { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
          { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
        ],
        deckCount: 99,
        version: 4,
      }),
    )
    act(() => {
      room.emit("CardDrawn", { _tag: "CardDrawn", playerId: ME.userId })
    })
    // Give the debounced refetch time to land, then assert the stale
    // response never displaced the newer snapshot.
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(screen.getByLabelText("20 cards in the draw deck")).toBeInTheDocument()
    expect(screen.queryByLabelText("99 cards in the draw deck")).not.toBeInTheDocument()
  })

  it("fires exactly one refetch for a burst of several events in one batch", async () => {
    const fake = setupFake()
    const { calls } = gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    const { room } = await channelsReady(fake)
    const getsBefore = calls.filter((call) => call === GET_VIEW).length

    act(() => {
      room.emit("CardDrawn", { _tag: "CardDrawn", playerId: ME.userId })
      room.emit("DiscardTaken", { _tag: "DiscardTaken", playerId: ME.userId, card: "AS" })
      room.emit("TurnAdvanced", { _tag: "TurnAdvanced", playerId: FRIEND.id })
    })

    await waitFor(() => {
      expect(calls.filter((call) => call === GET_VIEW).length).toBe(getsBefore + 1)
    })
    // Confirm the count settles at exactly one — the trailing debounce
    // coalesces the whole burst, it doesn't just delay a second call.
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(calls.filter((call) => call === GET_VIEW).length).toBe(getsBefore + 1)
  })

  it("refetches on resubscribe after a channel drop", async () => {
    const fake = setupFake()
    const { calls } = gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    const { room } = await channelsReady(fake)
    const getsBefore = calls.filter((call) => call === GET_VIEW).length

    act(() => {
      room.setStatus("CHANNEL_ERROR")
    })
    await screen.findByText("Reconnecting…")

    act(() => {
      room.setStatus("SUBSCRIBED")
    })

    await waitFor(() => {
      expect(calls.filter((call) => call === GET_VIEW).length).toBe(getsBefore + 1)
    })
  })

  it("never mutates the snapshot from a broadcast payload — only the refetch it schedules changes what renders", async () => {
    const fake = setupFake()
    const { handlers } = gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    const { room } = await channelsReady(fake)

    handlers[GET_VIEW] = json(
      200,
      viewResponse({
        players: [
          { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
          { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
        ],
        deckCount: 10,
        version: 5,
      }),
    )
    act(() => {
      room.emit("CardDrawn", { _tag: "CardDrawn", playerId: ME.userId })
    })
    // Synchronously after the broadcast (before the debounced GET can have
    // resolved) the snapshot is untouched — the event carried no state.
    expect(screen.getByLabelText("37 cards in the draw deck")).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByLabelText("10 cards in the draw deck")).toBeInTheDocument()
    })
  })
})

describe("denials and errors (C3)", () => {
  it("renders the no-access panel on a byte-identical 404 (unknown id or non-participant alike)", async () => {
    setupFake()
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(404, errorBody("GameNotFound", "not found")),
    })
    renderGameApp(GAME_ID)

    expect(await screen.findByText("No table here")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Back to the start" })).toBeInTheDocument()
  })

  it("shows the name form in place for an unauthenticated visitor, then renders the table — URL unchanged", async () => {
    setupFake()
    const user = userEvent.setup()
    const { handlers } = stubApi({
      "GET /me": json(401, errorBody("Unauthorized", "no valid session")),
    })
    const { router } = renderGameApp(GAME_ID)

    expect(await screen.findByLabelText("Your name")).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/game/${GAME_ID}`)

    handlers["POST /users"] = json(201, ME)
    handlers[GET_VIEW] = json(200, viewResponse())
    await user.type(screen.getByLabelText("Your name"), "Raafay")
    await user.click(screen.getByRole("button", { name: "Deal me in" }))

    expect(await screen.findByText(ME.name)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/game/${GAME_ID}`)
  })

  it("renders the page-error alert with retry on a bootstrap 5xx", async () => {
    setupFake()
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(500, errorBody("Internal", "internal error")),
    })
    renderGameApp(GAME_ID)

    const alert = await screen.findByRole("alert")
    expect(
      within(alert).getByText("Couldn't reach the game. Check your connection and try again."),
    ).toBeInTheDocument()
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeInTheDocument()
  })
})

describe("reconnecting (game chrome)", () => {
  it("shows the reconnecting treatment on the game chrome while the table stays live", async () => {
    const fake = setupFake()
    gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    const { room } = await channelsReady(fake)

    act(() => {
      room.setStatus("CHANNEL_ERROR")
    })

    expect(await screen.findByText("Reconnecting…")).toBeInTheDocument()
    expect(screen.getByLabelText("Reconnecting")).toHaveAttribute("data-connection", "reconnecting")
    // The table stays live and current-as-of, behind the treatment.
    expect(screen.getByText(ME.name)).toBeInTheDocument()
    expect(screen.getByText(FRIEND.name)).toBeInTheDocument()
  })
})

describe("hidden information (C5, structural sweep)", () => {
  it("renders every hand slot face-down with no card value anywhere in the DOM", async () => {
    setupFake()
    gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)

    const faceDownCards = document.querySelectorAll('[data-face="down"]')
    expect(faceDownCards.length).toBeGreaterThan(0)
    for (const card of faceDownCards) {
      expect(card.textContent).toBe("")
    }
  })

  it("makes no requests beyond the view GET and /me", async () => {
    const fake = setupFake()
    const { calls } = gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    expect(new Set(calls)).toEqual(new Set(["GET /me", GET_VIEW]))
  })
})
