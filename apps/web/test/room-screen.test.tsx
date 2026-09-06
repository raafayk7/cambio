import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { setRealtimeClientForTests } from "../src/services/realtime.js"
import { FakeRealtimeClient } from "./support/fake-realtime.js"
import {
  errorBody,
  FRIEND,
  GAME_ID,
  GRANTS,
  json,
  lobbyResponse,
  ME,
  renderApp,
  stubApi,
  viewResponse,
} from "./support/harness.js"

/**
 * Room container (CAM-17 R1–R5, R7, W4) — memory router, mocked fetch,
 * injected fake realtime client (jsdom never opens sockets, ADR-0030).
 */

afterEach(() => {
  vi.unstubAllGlobals()
  setRealtimeClientForTests(null)
})

const meMember = { id: ME.userId, name: ME.name }
const bothMembers = [meMember, FRIEND]

const memberBootstrap = () =>
  stubApi({
    "GET /me": json(200, ME),
    [`GET /lobbies/${GAME_ID}`]: json(200, lobbyResponse(bothMembers, 2)),
  })

const setupFake = () => {
  const fake = new FakeRealtimeClient()
  setRealtimeClientForTests(fake)
  return fake
}

/** Wait for both granted topics to be subscribed on the fake client. */
const channelsReady = async (fake: FakeRealtimeClient) => {
  await waitFor(() => {
    expect(fake.channels).toHaveLength(2)
  })
  return {
    room: fake.find(GRANTS.roomTopic)!,
    player: fake.find(GRANTS.playerTopic)!,
  }
}

const gameStartedPayload = () => ({
  _tag: "GameStarted",
  players: [ME.userId, FRIEND.id],
  firstDiscard: "KH",
  deckCount: 40,
  config: { slamWindowMs: 8000 },
})

describe("member bootstrap (R1, R3)", () => {
  it("renders every member by name in join order from the GET alone — no join call", async () => {
    setupFake()
    const { calls } = memberBootstrap()
    renderApp(`/room/${GAME_ID}`)

    expect(await screen.findByText(ME.name)).toBeInTheDocument()
    expect(screen.getByText(FRIEND.name)).toBeInTheDocument()

    // Join order: seat wrappers carry ascending data-seat-index.
    const seatOf = (name: string) =>
      screen.getByText(name).closest("[data-seat-index]")?.getAttribute("data-seat-index")
    expect(seatOf(ME.name)).toBe("0")
    expect(seatOf(FRIEND.name)).toBe("1")

    // The viewer's seat is marked own.
    expect(screen.getByText(ME.name).closest("[data-own]")).not.toBeNull()
    expect(screen.getByText(FRIEND.name).closest("[data-own]")).toBeNull()

    // Share, start, leave affordances (R1).
    expect(screen.getByLabelText("Room link")).toHaveValue(`http://localhost:3000/room/${GAME_ID}`)
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Start game" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Leave room" })).toBeInTheDocument()

    expect(calls.filter((call) => call.includes("join"))).toEqual([])
  })
})

describe("join-on-visit (R2)", () => {
  it("joins on a bootstrap 404 and renders the room from the join response", async () => {
    setupFake()
    stubApi({
      "GET /me": json(200, ME),
      [`GET /lobbies/${GAME_ID}`]: json(404, errorBody("GameNotFound", "not found")),
      [`POST /lobbies/${GAME_ID}/join`]: json(200, lobbyResponse(bothMembers, 3)),
    })
    renderApp(`/room/${GAME_ID}`)

    expect(await screen.findByText(FRIEND.name)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Start game" })).toBeInTheDocument()
  })

  it("renders the no-access panel when the room is full (409 LobbyFull)", async () => {
    setupFake()
    stubApi({
      "GET /me": json(200, ME),
      [`GET /lobbies/${GAME_ID}`]: json(404, errorBody("GameNotFound", "not found")),
      [`POST /lobbies/${GAME_ID}/join`]: json(409, errorBody("LobbyFull", "conflict")),
    })
    renderApp(`/room/${GAME_ID}`)

    expect(await screen.findByText("Room full")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Back to the start" })).toBeInTheDocument()
  })

  it("renders the no-access panel for an unknown room (join 404)", async () => {
    setupFake()
    stubApi({
      "GET /me": json(200, ME),
      [`GET /lobbies/${GAME_ID}`]: json(404, errorBody("GameNotFound", "not found")),
      [`POST /lobbies/${GAME_ID}/join`]: json(404, errorBody("GameNotFound", "not found")),
    })
    renderApp(`/room/${GAME_ID}`)

    expect(await screen.findByText("No room here")).toBeInTheDocument()
  })

  it("redirects an already-started refusal to the game route when the view GET succeeds", async () => {
    setupFake()
    stubApi({
      "GET /me": json(200, ME),
      [`GET /lobbies/${GAME_ID}`]: json(404, errorBody("GameNotFound", "not found")),
      [`POST /lobbies/${GAME_ID}/join`]: json(409, errorBody("LobbyNotJoinable", "conflict")),
      [`GET /games/${GAME_ID}/view`]: json(200, viewResponse()),
    })
    const { router } = renderApp(`/room/${GAME_ID}`)

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/game/${GAME_ID}`)
    })
  })

  it("renders the merged no-seat panel for an outsider (view GET 404) — started and abandoned are indistinguishable on the wire", async () => {
    setupFake()
    stubApi({
      "GET /me": json(200, ME),
      [`GET /lobbies/${GAME_ID}`]: json(404, errorBody("GameNotFound", "not found")),
      [`POST /lobbies/${GAME_ID}/join`]: json(409, errorBody("LobbyNotJoinable", "conflict")),
      [`GET /games/${GAME_ID}/view`]: json(404, errorBody("GameNotFound", "not found")),
    })
    renderApp(`/room/${GAME_ID}`)

    expect(await screen.findByText("No open seat")).toBeInTheDocument()
  })

  it("shows the name form in-place for an unauthenticated visitor, then joins — URL unchanged", async () => {
    setupFake()
    const user = userEvent.setup()
    const { handlers } = stubApi({
      "GET /me": json(401, errorBody("Unauthorized", "no valid session")),
      [`GET /lobbies/${GAME_ID}`]: json(404, errorBody("GameNotFound", "not found")),
      [`POST /lobbies/${GAME_ID}/join`]: json(200, lobbyResponse(bothMembers, 3)),
    })
    const { router } = renderApp(`/room/${GAME_ID}`)

    expect(await screen.findByLabelText("Your name")).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/room/${GAME_ID}`)

    handlers["POST /users"] = json(201, ME)
    await user.type(screen.getByLabelText("Your name"), "Raafay")
    await user.click(screen.getByRole("button", { name: "Deal me in" }))

    expect(await screen.findByText(FRIEND.name)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/room/${GAME_ID}`)
  })
})

describe("live updates (R4)", () => {
  it("applies a newer LobbyUpdated broadcast to the member list without refetching", async () => {
    const fake = setupFake()
    const { calls } = memberBootstrap()
    renderApp(`/room/${GAME_ID}`)
    await screen.findByText(ME.name)
    const { room } = await channelsReady(fake)
    const getsBefore = calls.filter((call) => call === `GET /lobbies/${GAME_ID}`).length

    const third = { id: "33333333-3333-4333-8333-333333333333", name: "Zara" }
    act(() => {
      room.emit("LobbyUpdated", {
        _tag: "LobbyUpdated",
        lobby: { id: GAME_ID, members: [...bothMembers, third], status: "open" },
        version: 3,
      })
    })

    expect(await screen.findByText("Zara")).toBeInTheDocument()
    expect(calls.filter((call) => call === `GET /lobbies/${GAME_ID}`).length).toBe(getsBefore)
  })

  it("discards a LobbyUpdated broadcast not newer than the last-seen version", async () => {
    const fake = setupFake()
    memberBootstrap() // bootstrap version is 2
    renderApp(`/room/${GAME_ID}`)
    await screen.findByText(FRIEND.name)
    const { room } = await channelsReady(fake)

    act(() => {
      room.emit("LobbyUpdated", {
        _tag: "LobbyUpdated",
        lobby: { id: GAME_ID, members: [meMember], status: "open" },
        version: 2,
      })
    })

    // The stale single-member view never replaces the bootstrap's two seats.
    expect(screen.getByText(FRIEND.name)).toBeInTheDocument()
  })

  it("renders the room-closed panel when a broadcast closes the room", async () => {
    const fake = setupFake()
    memberBootstrap()
    renderApp(`/room/${GAME_ID}`)
    await screen.findByText(FRIEND.name)
    const { room } = await channelsReady(fake)

    act(() => {
      room.emit("LobbyUpdated", {
        _tag: "LobbyUpdated",
        lobby: { id: GAME_ID, members: [], status: "abandoned" },
        version: 4,
      })
    })

    expect(await screen.findByText("Room closed")).toBeInTheDocument()
  })
})

describe("start (R5)", () => {
  it("navigates the starter to the game route on success", async () => {
    setupFake()
    const user = userEvent.setup()
    const { handlers } = memberBootstrap()
    handlers[`POST /lobbies/${GAME_ID}/start`] = json(200, {
      view: viewResponse().view,
      version: 3,
    })
    const { router } = renderApp(`/room/${GAME_ID}`)

    await user.click(await screen.findByRole("button", { name: "Start game" }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/game/${GAME_ID}`)
    })
  })

  it("auto-navigates a non-starter on the GameStarted room broadcast", async () => {
    const fake = setupFake()
    memberBootstrap()
    const { router } = renderApp(`/room/${GAME_ID}`)
    await screen.findByText(ME.name)
    const { room } = await channelsReady(fake)

    act(() => {
      room.emit("GameStarted", gameStartedPayload())
    })

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/game/${GAME_ID}`)
    })
  })

  it("surfaces a 422 BadPlayerCount as the inline alert with the 2–5 copy", async () => {
    setupFake()
    const user = userEvent.setup()
    const { handlers } = stubApi({
      "GET /me": json(200, ME),
      [`GET /lobbies/${GAME_ID}`]: json(200, lobbyResponse([meMember], 1)),
    })
    handlers[`POST /lobbies/${GAME_ID}/start`] = json(
      422,
      errorBody("BadPlayerCount", "illegal move"),
    )
    renderApp(`/room/${GAME_ID}`)

    await user.click(await screen.findByRole("button", { name: "Start game" }))

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(
      "The game needs 2 to 5 players at the table. Share the link and wait for a friend.",
    )
    // The seat view stays — an inline failure is never a page error.
    expect(screen.getByText(ME.name)).toBeInTheDocument()
  })
})

describe("leave (R7)", () => {
  it("POSTs leave, drops both subscriptions, and returns to the lobby", async () => {
    const fake = setupFake()
    const user = userEvent.setup()
    const { handlers, calls } = memberBootstrap()
    handlers[`POST /lobbies/${GAME_ID}/leave`] = json(200, {
      lobby: { id: GAME_ID, members: [FRIEND], status: "open" },
      version: 3,
    })
    const { router } = renderApp(`/room/${GAME_ID}`)
    await screen.findByText(ME.name)
    const { room, player } = await channelsReady(fake)

    await user.click(screen.getByRole("button", { name: "Leave room" }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/")
    })
    expect(calls).toContain(`POST /lobbies/${GAME_ID}/leave`)
    expect(room.unsubscribe).toHaveBeenCalled()
    expect(player.unsubscribe).toHaveBeenCalled()
  })
})

describe("reconnecting (W4)", () => {
  it("shows the reconnecting alert under the header while the seat view stays live, then refetches on recovery", async () => {
    const fake = setupFake()
    const { calls } = memberBootstrap()
    renderApp(`/room/${GAME_ID}`)
    await screen.findByText(FRIEND.name)
    const { room } = await channelsReady(fake)
    const getsBefore = calls.filter((call) => call === `GET /lobbies/${GAME_ID}`).length

    act(() => {
      room.setStatus("CHANNEL_ERROR")
    })

    // The banner renders; the member list is still there behind it (W4).
    const banner = await screen.findByText("Reconnecting…")
    expect(banner).toBeInTheDocument()
    expect(screen.getByText(ME.name)).toBeInTheDocument()
    expect(screen.getByText(FRIEND.name)).toBeInTheDocument()

    act(() => {
      room.setStatus("SUBSCRIBED")
    })

    await waitFor(() => {
      expect(screen.queryByText("Reconnecting…")).not.toBeInTheDocument()
    })
    // Recovery absorbs missed broadcasts by refetching the room query.
    await waitFor(() => {
      expect(calls.filter((call) => call === `GET /lobbies/${GAME_ID}`).length).toBe(getsBefore + 1)
    })
  })
})

describe("room states (L4/R ledger)", () => {
  it("shows the first-load skeleton while bootstrap resolves", async () => {
    setupFake()
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    )
    renderApp(`/room/${GAME_ID}`)

    expect(await screen.findByTestId("room-skeleton")).toBeInTheDocument()
  })

  it("renders the page-error alert with retry on a bootstrap 5xx", async () => {
    setupFake()
    stubApi({
      "GET /me": json(200, ME),
      [`GET /lobbies/${GAME_ID}`]: json(500, errorBody("Internal", "internal error")),
    })
    renderApp(`/room/${GAME_ID}`)

    const alert = await screen.findByRole("alert")
    expect(
      within(alert).getByText("Couldn't reach the room. Check your connection and try again."),
    ).toBeInTheDocument()
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeInTheDocument()
  })
})

describe("copy link fallback (CAM-22)", () => {
  it("focuses and selects the room-link field and shows the alarm toast when the clipboard API is missing", async () => {
    setupFake()
    const user = userEvent.setup()
    memberBootstrap()
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined })
    renderApp(`/room/${GAME_ID}`)

    await user.click(await screen.findByRole("button", { name: "Copy link" }))

    expect(
      await screen.findByText("Couldn't copy. Select the link and copy it yourself."),
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Room link")).toBe(document.activeElement)
  })

  it("focuses and selects the room-link field and shows the alarm toast when writeText rejects", async () => {
    setupFake()
    const user = userEvent.setup()
    memberBootstrap()
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    })
    renderApp(`/room/${GAME_ID}`)

    await user.click(await screen.findByRole("button", { name: "Copy link" }))

    expect(
      await screen.findByText("Couldn't copy. Select the link and copy it yourself."),
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Room link")).toBe(document.activeElement)
  })

  it("shows the success toast when writeText resolves", async () => {
    setupFake()
    const user = userEvent.setup()
    memberBootstrap()
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
    renderApp(`/room/${GAME_ID}`)

    await user.click(await screen.findByRole("button", { name: "Copy link" }))

    expect(await screen.findByText("Link copied")).toBeInTheDocument()
  })
})
