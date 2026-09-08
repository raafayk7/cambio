import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ROW_WIDTH } from "../src/components/game/hand.js"
import { BENCH_ANCHOR_CLASS, BENCH_POSITION_CLASS } from "../src/components/game/table-surface.js"
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
 * Game container (CAM-18 C1-C5 + H1/T1-T5, this task's steps 5/8/9 and
 * 10-12) — memory router, mocked fetch, injected fake realtime client
 * (jsdom never opens sockets, ADR-0030). Follows room-screen.test.tsx's
 * driving patterns throughout; `renderGameApp` mounts the real
 * `GameScreen`, distinct from `renderApp`'s `/game/$gameId` stub the
 * room/lobby suites still depend on.
 *
 * Command-body assertions read `fetchMock.mock.calls` directly rather than
 * awaiting the mutation's round trip: `mutate()` invokes `fetch` (and so
 * the mock) synchronously, before any `await` suspends — so the sent
 * command is already recorded the instant the click handler returns, with
 * no `waitFor` (and no fake-timer/polling interaction) needed.
 */

const GET_VIEW = `GET /games/${GAME_ID}/view`
const POST_COMMANDS = `POST /games/${GAME_ID}/commands`

/** The exact command body(ies) POSTed so far, decoded from the fetch mock's
 * recorded call arguments. */
function postedCommands(fetchMock: ReturnType<typeof stubApi>["fetchMock"]) {
  return fetchMock.mock.calls
    .filter(([input]) => new URL(String(input)).pathname === `/games/${GAME_ID}/commands`)
    .map(([, init]) => JSON.parse(String(init?.body)))
}

/** A slot's clickable button, found by its stable flight anchor
 * (`slot:<playerId>:<slotIndex>`) — the only reliable way to disambiguate
 * two hands that can render the same "Slot N" label at once (e.g. the
 * Queen's any-occupied-slot targeting spans every seat). */
function slotButton(playerId: string, slotIndex: number): HTMLElement {
  const button = document.querySelector<HTMLButtonElement>(
    `[data-flight-anchor="slot:${playerId}:${slotIndex}"] button`,
  )
  if (button === null) throw new Error(`no clickable button at slot:${playerId}:${slotIndex}`)
  return button
}

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

/** A `SlamWindow` phase view (SL1-SL3) — `turnPlayerId` defaults to ME to
 * mirror the other fixtures, but slamming itself is never turn-gated. */
const slamWindowView = (rank: string, closesAt: number, turnPlayerId: string = ME.userId) =>
  viewResponse({
    players: [
      { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
      { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
    ],
    deckCount: 37,
    discard: ["KH"],
    phase: { _tag: "SlamWindow", turnPlayerId, closesAt, rank },
  })

describe("bootstrap (C1)", () => {
  it("renders the table from the snapshot — seats by name, deck count, discard top, both topics subscribed", async () => {
    const fake = setupFake()
    gameBootstrap()
    renderGameApp(GAME_ID)

    expect(await screen.findByText(ME.name)).toBeInTheDocument()
    expect(screen.getByText(FRIEND.name)).toBeInTheDocument()
    // CAM-29: the count is no longer a visible badge, only the "Draw a
    // card" button's accessible description.
    expect(
      screen.getByRole("button", { name: "Draw a card", description: "37 cards in the draw deck" }),
    ).toBeInTheDocument()
    // The discard's top card is the only public value on the table — it
    // renders face-up (structural: `data-face="up"` carries the rank).
    const discardRank = screen.getByText("K")
    expect(discardRank.closest('[data-face="up"]')).not.toBeNull()

    await channelsReady(fake)
  })

  it("game start (ADR-0039): empty discard, Draw present, no Take, Call Cambio present", async () => {
    const fake = setupFake()
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(
        200,
        viewResponse({
          players: [
            { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
            { id: FRIEND.id, name: FRIEND.name, hand: [0, 1, 2, 3] },
          ],
          deckCount: 44,
          discard: [],
        }),
      ),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)

    expect(
      document.querySelector('[data-flight-anchor="discard"]')?.getAttribute("data-state"),
    ).toBe("empty")
    expect(
      screen.getByRole("button", { name: "Draw a card", description: "44 cards in the draw deck" }),
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Take the top discard" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Call Cambio" })).toBeInTheDocument()

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
      expect(
        screen.getByRole("button", {
          name: "Draw a card",
          description: "20 cards in the draw deck",
        }),
      ).toBeInTheDocument()
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
    expect(
      screen.getByRole("button", { name: "Draw a card", description: "20 cards in the draw deck" }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "Draw a card",
        description: "99 cards in the draw deck",
      }),
    ).not.toBeInTheDocument()
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
    expect(
      screen.getByRole("button", { name: "Draw a card", description: "37 cards in the draw deck" }),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Draw a card",
          description: "10 cards in the draw deck",
        }),
      ).toBeInTheDocument()
    })
  })

  it("a room broadcast that fails to decode still schedules a refetch, and a decoded follow-up still works (C3)", async () => {
    const fake = setupFake()
    const { calls } = gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    const { room } = await channelsReady(fake)
    const getsBefore = calls.filter((call) => call === GET_VIEW).length

    // No choreography, no crash — but ADR-0033 still holds: the refetch is
    // the authority, so an undecodable trigger must still trigger it.
    act(() => {
      room.emit("GameEvent", { not: "a game event" })
    })
    await waitFor(() => {
      expect(calls.filter((call) => call === GET_VIEW).length).toBe(getsBefore + 1)
    })

    // The handler skip is surgical — only the early return moved. A decoded
    // event right after still goes through the normal path, proven by its
    // choreography landing (the peek beat's selected treatment), not just
    // by another refetch — an inverted decode guard would still refetch
    // but could never produce this DOM effect (review finding 3).
    const getsAfterGarbage = calls.filter((call) => call === GET_VIEW).length
    act(() => {
      room.emit("CardPeeked", {
        _tag: "CardPeeked",
        viewerId: FRIEND.id,
        target: { playerId: ME.userId, slotIndex: 2 },
      })
    })
    expect(
      document.querySelector(`[data-flight-anchor="slot:${ME.userId}:2"] [data-selected="true"]`),
    ).not.toBeNull()
    await waitFor(() => {
      expect(calls.filter((call) => call === GET_VIEW).length).toBe(getsAfterGarbage + 1)
    })
  })

  it("a player broadcast that fails to decode still schedules a refetch, and a decoded follow-up still works (C3)", async () => {
    const fake = setupFake()
    const { calls } = gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    const { player } = await channelsReady(fake)
    const getsBefore = calls.filter((call) => call === GET_VIEW).length

    act(() => {
      player.emit("PlayerEvent", { not: "a game event" })
    })
    await waitFor(() => {
      expect(calls.filter((call) => call === GET_VIEW).length).toBe(getsBefore + 1)
    })

    // Same discipline as the room case: the decoded follow-up must land its
    // handled effect (the private peek's revealed rank), not merely another
    // refetch (review finding 3).
    const getsAfterGarbage = calls.filter((call) => call === GET_VIEW).length
    act(() => {
      player.emit("PrivateCardPeeked", {
        _tag: "PrivateCardPeeked",
        target: { playerId: ME.userId, slotIndex: 0 },
        card: "7H",
      })
    })
    expect(screen.getByText("7")).toBeInTheDocument()
    await waitFor(() => {
      expect(calls.filter((call) => call === GET_VIEW).length).toBe(getsAfterGarbage + 1)
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

/**
 * How-to-play guide (root plan F1–F2): entry point, copy fidelity
 * spot-pins, memory-faithful sweep, and slam-window availability
 * (modal.md r2's opt-in reference overlay exception).
 */
describe("how-to-play guide (F1/F2)", () => {
  it("opens the guide from the game screen's help icon-button and closes it", async () => {
    const fake = setupFake()
    const user = userEvent.setup()
    gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    await user.click(screen.getByRole("button", { name: "How to play" }))
    const dialog = screen.getByRole("dialog", { hidden: true, name: "How to play" })
    expect(within(dialog).getByText("How to play")).toBeInTheDocument()

    await user.click(within(dialog).getByRole("button", { name: "Close" }))
    await waitFor(() => {
      expect(dialog).not.toHaveAttribute("open")
    })
  })

  it("the guide's rules copy matches canon on the load-bearing spot-pins (F2.2)", async () => {
    const fake = setupFake()
    const user = userEvent.setup()
    gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    await user.click(screen.getByRole("button", { name: "How to play" }))
    const dialog = screen.getByRole("dialog", { hidden: true, name: "How to play" })

    // No opening peek (setup).
    expect(
      within(dialog).getByText(/does not look at any of them — there is no opening peek/),
    ).toBeInTheDocument()
    // Suit-split king scores, true minus sign (scoring table).
    expect(within(dialog).getByText("King ♠, King ♣")).toBeInTheDocument()
    expect(within(dialog).getByText("King ♥, King ♦")).toBeInTheDocument()
    expect(within(dialog).getByText("−1")).toBeInTheDocument()
    expect(within(dialog).getByText("−2")).toBeInTheDocument()
    // Obligatory power (taking a turn).
    expect(
      within(dialog).getByText(/obligates you to play it: you can't decline, keep, or discard/),
    ).toBeInTheDocument()
    // Rank-not-score slam matching.
    expect(
      within(dialog).getByText(
        /matching is by rank, not score, so a jack never matches a queen despite scoring the same/,
      ),
    ).toBeInTheDocument()
  })

  it("never offers or implies a card-tracking aid, and opening it makes no new requests (F2.3)", async () => {
    const fake = setupFake()
    const user = userEvent.setup()
    const { calls } = gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)
    const callsBefore = new Set(calls)

    await user.click(screen.getByRole("button", { name: "How to play" }))
    const dialog = screen.getByRole("dialog", { hidden: true, name: "How to play" })
    expect(
      within(dialog).getByText(/Remembering what you saw is the game/),
    ).toBeInTheDocument()

    expect(new Set(calls)).toEqual(callsBefore)
  })

  it("stays open during the slam window and never blocks the timer (F1.3, modal.md r2)", async () => {
    const fake = setupFake()
    const user = userEvent.setup()
    const closesAt = Date.now() + 8000
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, slamWindowView("7", closesAt)),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    await user.click(screen.getByRole("button", { name: "How to play" }))
    const dialog = screen.getByRole("dialog", { hidden: true, name: "How to play" })
    expect(dialog).toHaveAttribute("open")
    // The slam timer keeps rendering — the guide never pauses the window.
    expect(screen.getByText(/Slam window open/)).toBeInTheDocument()
  })

  it("survives a phase-change refetch instead of being force-closed (F1.3)", async () => {
    const fake = setupFake()
    const user = userEvent.setup()
    const { handlers } = gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    const { room } = await channelsReady(fake)

    await user.click(screen.getByRole("button", { name: "How to play" }))
    const dialog = screen.getByRole("dialog", { hidden: true, name: "How to play" })
    expect(dialog).toHaveAttribute("open")

    handlers[GET_VIEW] = json(
      200,
      viewResponse({
        players: [
          { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
          { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
        ],
        phase: { _tag: "AwaitingDraw", playerId: FRIEND.id },
        // ADR-0033 version guard: a refetch only applies at a strictly
        // newer version than the bootstrap's default (3).
        version: 4,
      }),
    )
    act(() => {
      room.emit("TurnAdvanced", { _tag: "TurnAdvanced", playerId: FRIEND.id })
    })
    await waitFor(() => {
      expect(screen.getByText(`${FRIEND.name}'s turn`)).toBeInTheDocument()
    })
    expect(dialog).toHaveAttribute("open")
  })
})

describe("turn flow — AwaitingDraw (H1/T1)", () => {
  it("Call Cambio opens the confirm modal and sends CallCambio only after the explicit confirm", async () => {
    const fake = setupFake()
    const user = userEvent.setup()
    const { handlers, fetchMock } = gameBootstrap()
    handlers[POST_COMMANDS] = json(200, twoPlayerView)
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    await user.click(screen.getByRole("button", { name: "Call Cambio" }))
    const dialog = screen.getByRole("dialog", { hidden: true, name: "Call Cambio — ends the game" })
    expect(within(dialog).getByText("Call Cambio — ends the game")).toBeInTheDocument()
    // Opening the confirm never sends the command by itself.
    expect(postedCommands(fetchMock)).toEqual([])

    await user.click(within(dialog).getByRole("button", { name: "Call Cambio" }))
    expect(postedCommands(fetchMock)).toEqual([{ _tag: "CallCambio" }])
  })

  it("Take discard and Draw send their commands directly from the discard pile and the deck (T1)", async () => {
    const fake = setupFake()
    const { handlers, fetchMock } = gameBootstrap()
    handlers[POST_COMMANDS] = json(200, twoPlayerView)
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    fireEvent.click(screen.getByRole("button", { name: "Take the top discard" }))
    fireEvent.click(screen.getByRole("button", { name: "Draw a card" }))

    await waitFor(() => {
      expect(postedCommands(fetchMock)).toEqual([{ _tag: "TakeDiscard" }, { _tag: "DrawFromDeck" }])
    })
  })

  it("Take discard never renders when the top of the discard is a power card (H1)", async () => {
    setupFake()
    gameBootstrap()
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(
        200,
        viewResponse({
          players: [
            { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
            { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
          ],
          discard: ["7H"],
        }),
      ),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)

    expect(screen.queryByRole("button", { name: "Take the top discard" })).not.toBeInTheDocument()
  })

  it("non-holder gets no Call Cambio affordance and inert hands", async () => {
    setupFake()
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(
        200,
        viewResponse({
          players: [
            { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
            { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
          ],
          phase: { _tag: "AwaitingDraw", playerId: FRIEND.id },
        }),
      ),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)

    expect(screen.queryByRole("button", { name: "Call Cambio" })).not.toBeInTheDocument()
    expect(document.querySelector(`[data-flight-anchor="slot:${ME.userId}:0"] button`)).toBeNull()
  })
})

describe("turn flow — command failures never break the table (T5)", () => {
  it("a 422 surfaces inline failure copy and refetches — never a toast", async () => {
    const fake = setupFake()
    const { handlers, calls } = gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)
    const getsBefore = calls.filter((call) => call === GET_VIEW).length

    handlers[POST_COMMANDS] = json(422, errorBody("NotYourTurn", "illegal move"))
    fireEvent.click(screen.getByRole("button", { name: "Draw a card" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("It's not your turn.")
    await waitFor(() => {
      expect(calls.filter((call) => call === GET_VIEW).length).toBeGreaterThan(getsBefore)
    })
    // The table is intact — the failure is the one inline paragraph above,
    // never a `role="status"` toast (the connection dot and the turn
    // indicator are the app's only other `status` regions; no new one
    // appears alongside the failure copy).
    expect(screen.getByText(ME.name)).toBeInTheDocument()
    expect(screen.getByText(FRIEND.name)).toBeInTheDocument()
    expect(screen.getAllByRole("status")).toHaveLength(2)
  })
})

describe("HoldingCard (T2)", () => {
  const holdingView = (
    holderId: string,
    source: "deck" | "discard",
    card: string,
    myHand: ReadonlyArray<number> = [0, 1, 2, 3],
  ) =>
    viewResponse({
      players: [
        { id: ME.userId, name: ME.name, hand: myHand },
        { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
      ],
      deckCount: 37,
      discard: ["KH"],
      phase: { _tag: "HoldingCard", playerId: holderId, source, card },
    })

  it("holder sees the held card and swaps it into an own occupied slot", async () => {
    const fake = setupFake()
    const { handlers, fetchMock } = stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, holdingView(ME.userId, "deck", "3S")),
    })
    handlers[POST_COMMANDS] = json(200, twoPlayerView)
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    expect(screen.getByText("You drew")).toBeInTheDocument()

    fireEvent.click(slotButton(ME.userId, 0))
    await waitFor(() => {
      expect(postedCommands(fetchMock)).toEqual([{ _tag: "SwapHeld", slotIndex: 0 }])
    })
  })

  it("a holder's discard-source take never offers a discard-back affordance (rule §1(b)) but swap still works", async () => {
    const fake = setupFake()
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, holdingView(ME.userId, "discard", "3S")),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    expect(screen.getByText("You drew")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument()
    expect(
      document.querySelector(`[data-flight-anchor="slot:${ME.userId}:0"] button`),
    ).not.toBeNull()
  })

  it("a discard-source hold is public — a non-holder sees the same value (T2 entitlement)", async () => {
    const fake = setupFake()
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, holdingView(FRIEND.id, "discard", "3S")),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    expect(screen.getByText("Nadia is holding")).toBeInTheDocument()
    // The 3♠ came off the public discard — entitlement is structural, so
    // its rank renders even though ME never held it.
    expect(screen.getByText("3")).toBeInTheDocument()
  })

  it("keep is offered only when the holder's own hand is empty", async () => {
    const fake = setupFake()
    const { handlers, fetchMock } = stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, holdingView(ME.userId, "deck", "3S", [])),
    })
    handlers[POST_COMMANDS] = json(200, twoPlayerView)
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    expect(document.querySelector(`[data-flight-anchor="slot:${ME.userId}:0"] button`)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Keep" }))
    await waitFor(() => {
      expect(postedCommands(fetchMock)).toEqual([{ _tag: "KeepHeld" }])
    })
  })
})

describe("powers + peeks (T3/T4)", () => {
  const resolvingPowerView = (card: string) =>
    viewResponse({
      players: [
        { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
        { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
      ],
      phase: { _tag: "ResolvingPower", playerId: ME.userId, card },
    })

  it("9/10 target one opponent occupied slot with PowerPeek", async () => {
    const fake = setupFake()
    const { handlers, fetchMock } = stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, resolvingPowerView("9H")),
    })
    handlers[POST_COMMANDS] = json(200, twoPlayerView)
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    // Own slots are not eligible for a 9/10 peek.
    expect(document.querySelector(`[data-flight-anchor="slot:${ME.userId}:0"] button`)).toBeNull()

    fireEvent.click(slotButton(FRIEND.id, 0))
    await waitFor(() => {
      expect(postedCommands(fetchMock)).toEqual([
        { _tag: "PowerPeek", target: { playerId: FRIEND.id, slotIndex: 0 } },
      ])
    })
  })

  it("J requires two distinct occupied slots before sending PowerSwap; a repeat click deselects", async () => {
    const fake = setupFake()
    const { handlers, fetchMock } = stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, resolvingPowerView("JH")),
    })
    handlers[POST_COMMANDS] = json(200, twoPlayerView)
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    fireEvent.click(slotButton(ME.userId, 0))
    expect(postedCommands(fetchMock)).toEqual([])

    // A repeat click on the same slot deselects it rather than sending an
    // invalid self-swap.
    fireEvent.click(slotButton(ME.userId, 0))
    expect(postedCommands(fetchMock)).toEqual([])

    fireEvent.click(slotButton(ME.userId, 0))
    fireEvent.click(slotButton(FRIEND.id, 0))
    await waitFor(() => {
      expect(postedCommands(fetchMock)).toEqual([
        {
          _tag: "PowerSwap",
          first: { playerId: ME.userId, slotIndex: 0 },
          second: { playerId: FRIEND.id, slotIndex: 0 },
        },
      ])
    })
  })

  it("the Queen's two-step sends PowerPeek, then (once the phase moves on) PowerSwap for two distinct slots", async () => {
    const fake = setupFake()
    const queenSwapView = viewResponse({
      players: [
        { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
        { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
      ],
      phase: { _tag: "ResolvingQueenSwap", playerId: ME.userId },
      version: 4,
    })
    const { handlers, fetchMock } = stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, resolvingPowerView("QH")),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    handlers[POST_COMMANDS] = json(200, { view: queenSwapView.view, version: 4 })
    // The Queen's first pick can be any occupied slot, own included.
    fireEvent.click(slotButton(ME.userId, 0))
    await waitFor(() => {
      expect(postedCommands(fetchMock)).toEqual([
        { _tag: "PowerPeek", target: { playerId: ME.userId, slotIndex: 0 } },
      ])
    })

    await waitFor(() => {
      expect(
        document.querySelector(`[data-flight-anchor="slot:${FRIEND.id}:1"] button`),
      ).not.toBeNull()
    })

    fireEvent.click(slotButton(FRIEND.id, 0))
    fireEvent.click(slotButton(FRIEND.id, 1))
    await waitFor(() => {
      expect(postedCommands(fetchMock)).toEqual([
        { _tag: "PowerPeek", target: { playerId: ME.userId, slotIndex: 0 } },
        {
          _tag: "PowerSwap",
          first: { playerId: FRIEND.id, slotIndex: 0 },
          second: { playerId: FRIEND.id, slotIndex: 1 },
        },
      ])
    })
  })

  describe("public beats (T3/T4 — review F3/F5 fixes)", () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    // Review F3: CardPeeked.target is PUBLIC wire data — everyone learns
    // which slot was looked at (part of the memory game), never the value.
    it("a public CardPeeked marks the peeked slot with the selected treatment for one reveal beat — no value anywhere", async () => {
      const fake = setupFake()
      gameBootstrap()
      renderGameApp(GAME_ID)
      await screen.findByText(ME.name)
      const { room } = await channelsReady(fake)
      vi.useFakeTimers()

      act(() => {
        room.emit("CardPeeked", {
          _tag: "CardPeeked",
          viewerId: FRIEND.id,
          target: { playerId: ME.userId, slotIndex: 2 },
        })
      })
      const slot = document.querySelector(
        `[data-flight-anchor="slot:${ME.userId}:2"] [data-selected="true"]`,
      )
      expect(slot).not.toBeNull()
      expect(slot).toHaveAttribute("data-face", "down")

      act(() => {
        vi.advanceTimersByTime(1200)
      })
      expect(
        document.querySelector(`[data-flight-anchor="slot:${ME.userId}:2"] [data-selected="true"]`),
      ).toBeNull()
    })

    // Review F5a: the fizzle beat was implemented but unpinned.
    it("PowerFizzled renders the public fizzle copy, then clears", async () => {
      const fake = setupFake()
      gameBootstrap()
      renderGameApp(GAME_ID)
      await screen.findByText(ME.name)
      const { room } = await channelsReady(fake)
      vi.useFakeTimers()

      act(() => {
        room.emit("PowerFizzled", { _tag: "PowerFizzled", playerId: FRIEND.id, power: "J" })
      })
      expect(
        screen.getByText(`${FRIEND.name}'s power fizzled — no legal target.`),
      ).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(2800)
      })
      expect(screen.queryByText(/power fizzled/)).not.toBeInTheDocument()
    })

    // Review F5b: the DrawSkipped beat was implemented but unpinned.
    it("DrawSkipped renders its beat copy with no card movement, then clears", async () => {
      const fake = setupFake()
      gameBootstrap()
      renderGameApp(GAME_ID)
      await screen.findByText(ME.name)
      const { room } = await channelsReady(fake)
      vi.useFakeTimers()
      const facesBefore = document.querySelectorAll("[data-face]").length

      act(() => {
        room.emit("DrawSkipped", { _tag: "DrawSkipped", playerId: FRIEND.id, kind: "penalty" })
      })
      expect(
        screen.getByText(`No cards left to draw — ${FRIEND.name}'s penalty card was skipped.`),
      ).toBeInTheDocument()
      expect(document.querySelectorAll("[data-face]").length).toBe(facesBefore)

      act(() => {
        vi.advanceTimersByTime(1200)
      })
      expect(screen.queryByText(/was skipped/)).not.toBeInTheDocument()
    })
  })

  describe("the private peek reveal (T4, memory fidelity)", () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it("reveals the peeked card, then clears after the peek duration and never re-renders", async () => {
      const fake = setupFake()
      gameBootstrap()
      renderGameApp(GAME_ID)
      await screen.findByText(ME.name)
      const { player } = await channelsReady(fake)

      // Fake timers only start now — channelsReady above needs real ones to
      // poll for the fake realtime client's subscription.
      vi.useFakeTimers()

      act(() => {
        player.emit("PrivateCardPeeked", {
          _tag: "PrivateCardPeeked",
          target: { playerId: ME.userId, slotIndex: 0 },
          card: "7H",
        })
      })
      expect(screen.getByText("7")).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(2800)
      })
      expect(screen.queryByText("7")).not.toBeInTheDocument()
      expect(document.querySelectorAll('[data-face="peeking"]')).toHaveLength(0)
    })

    it("the Queen's swap-picking stays disabled while the reveal is showing, then enables once it clears", async () => {
      const fake = setupFake()
      stubApi({
        "GET /me": json(200, ME),
        [GET_VIEW]: json(
          200,
          viewResponse({
            players: [
              { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
              { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
            ],
            phase: { _tag: "ResolvingQueenSwap", playerId: ME.userId },
          }),
        ),
      })
      renderGameApp(GAME_ID)
      await screen.findByText(ME.name)
      const { player } = await channelsReady(fake)

      vi.useFakeTimers()

      act(() => {
        player.emit("PrivateCardPeeked", {
          _tag: "PrivateCardPeeked",
          target: { playerId: FRIEND.id, slotIndex: 0 },
          card: "9H",
        })
      })
      expect(document.querySelector(`[data-flight-anchor="slot:${ME.userId}:0"] button`)).toBeNull()

      act(() => {
        vi.advanceTimersByTime(2800)
      })
      expect(
        document.querySelector(`[data-flight-anchor="slot:${ME.userId}:0"] button`),
      ).not.toBeNull()
    })
  })
})

/**
 * Power hints + indicator copy (root plan F3/F4): the holder's hint under
 * the held card, keyed off the affordance's `targeting` alone (D7), and
 * the non-active indicator's power-card copy (F4.1), with the existing
 * 4-state `TurnIndicator` union untouched (F4.2).
 */
describe("power hints + indicator copy (F3/F4)", () => {
  const resolvingPowerView = (card: string, holderId: string = ME.userId) =>
    viewResponse({
      players: [
        { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
        { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
      ],
      phase: { _tag: "ResolvingPower", playerId: holderId, card },
    })

  /** The held-card spot, scoped so hint assertions never collide with the
   * always-mounted how-to-play guide's powers table (same strings). */
  function heldCardRegion(): HTMLElement {
    const region = document.querySelector<HTMLElement>('[data-flight-anchor="held"]')
    if (region === null) throw new Error("no held-card spot rendered")
    return region
  }

  it.each([
    ["7H", "Peek at one of your own cards"],
    ["8H", "Peek at one of your own cards"],
    ["9H", "Peek at one of another player's cards"],
    ["TH", "Peek at one of another player's cards"],
    ["JH", "Blind-swap any two held cards"],
    ["QH", "Peek at any card, then blind-swap any two held cards"],
  ])("holder sees the %s hint under the held card (F3.1)", async (card, hint) => {
    setupFake()
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, resolvingPowerView(card)),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)

    expect(within(heldCardRegion()).getByText(hint)).toBeInTheDocument()
    // The holder's own indicator still reads a plain turn, never the
    // power-card copy — that copy is for non-active viewers only.
    expect(screen.getByText("Your turn")).toBeInTheDocument()
  })

  it("ResolvingQueenSwap holder sees the swap-step hint (F3.2)", async () => {
    setupFake()
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(
        200,
        viewResponse({
          players: [
            { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
            { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
          ],
          phase: { _tag: "ResolvingQueenSwap", playerId: ME.userId },
        }),
      ),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)

    expect(within(heldCardRegion()).getByText("Now blind-swap any two held cards")).toBeInTheDocument()
    expect(screen.getByText("Your turn")).toBeInTheDocument()
  })

  it("the hint disappears once the phase leaves ResolvingPower (F3.3)", async () => {
    const fake = setupFake()
    const { handlers } = stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, resolvingPowerView("7H")),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    const { room } = await channelsReady(fake)
    expect(within(heldCardRegion()).getByText("Peek at one of your own cards")).toBeInTheDocument()

    handlers[GET_VIEW] = json(
      200,
      viewResponse({
        players: [
          { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
          { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
        ],
        phase: { _tag: "AwaitingDraw", playerId: FRIEND.id },
        version: 4,
      }),
    )
    act(() => {
      room.emit("TurnAdvanced", { _tag: "TurnAdvanced", playerId: FRIEND.id })
    })
    await waitFor(() => {
      expect(screen.getByText(`${FRIEND.name}'s turn`)).toBeInTheDocument()
    })
    // AwaitingDraw carries no held-card spot at all — the hint's host is gone.
    expect(document.querySelector('[data-flight-anchor="held"]')).toBeNull()
  })

  it("non-holder renders no hint and the indicator reads the power-card copy (F4.1, F4.3)", async () => {
    setupFake()
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, resolvingPowerView("9H", FRIEND.id)),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)

    expect(screen.getByText(`${FRIEND.name} is playing a power card`)).toBeInTheDocument()
    expect(document.querySelector('[role="status"][data-state]')).toHaveAttribute(
      "data-state",
      "other-turn",
    )
    // No F3 hint string leaks to a non-holder, and the copy never names the
    // rank — the fixture's non-holder phase carries no card field to name
    // it from (F4.3), the same structural guarantee as F3.4. Scoped to the
    // held-card spot: the how-to-play guide's powers table carries the same
    // strings unconditionally and would otherwise false-positive this away.
    expect(within(heldCardRegion()).queryByText(/Peek at|Blind-swap/)).not.toBeInTheDocument()
  })

  it("the non-active copy for ResolvingQueenSwap reads the same power-card line (F4.1)", async () => {
    setupFake()
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(
        200,
        viewResponse({
          players: [
            { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
            { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
          ],
          phase: { _tag: "ResolvingQueenSwap", playerId: FRIEND.id },
        }),
      ),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)

    expect(screen.getByText(`${FRIEND.name} is playing a power card`)).toBeInTheDocument()
  })
})

describe("slam window rendering + targeting (SL1)", () => {
  it("renders the slam timer from closesAt + config.slamWindowMs only in the SlamWindow phase", async () => {
    const fake = setupFake()
    const closesAt = Date.now() + 8000
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, slamWindowView("7", closesAt)),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    const bar = screen.getByRole("progressbar", { name: "Slam window" })
    expect(bar).toHaveAttribute("aria-valuemax", "8000")
  })

  it("(CAM-26 C4) the draw deck carries the slam-window state while the window is open, driven off slamPhase like DiscardPile's slamTarget", async () => {
    const fake = setupFake()
    const closesAt = Date.now() + 8000
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, slamWindowView("7", closesAt)),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    expect(document.querySelector('[data-flight-anchor="deck"]')).toHaveAttribute(
      "data-state",
      "slam-window",
    )
  })

  it("renders no slam timer outside the SlamWindow phase (ADR-0012, empty discard pile)", async () => {
    setupFake()
    gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)

    expect(screen.queryByRole("progressbar", { name: "Slam window" })).not.toBeInTheDocument()
  })

  it("clicking an own face-down card slams it immediately, sending giveSlot null", async () => {
    const fake = setupFake()
    const closesAt = Date.now() + 8000
    const { handlers, fetchMock } = stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, slamWindowView("7", closesAt)),
    })
    handlers[POST_COMMANDS] = json(200, twoPlayerView)
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    fireEvent.click(slotButton(ME.userId, 0))
    await waitFor(() => {
      expect(postedCommands(fetchMock)).toEqual([
        { _tag: "Slam", target: { playerId: ME.userId, slotIndex: 0 }, giveSlot: null },
      ])
    })
  })

  it("(CAM-23 fallback) slamming an opponent's card with nothing armed holds the target, then one own-hand tap sends exactly one Slam command", async () => {
    const fake = setupFake()
    const closesAt = Date.now() + 8000
    const { handlers, fetchMock } = stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, slamWindowView("7", closesAt)),
    })
    handlers[POST_COMMANDS] = json(200, twoPlayerView)
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    fireEvent.click(slotButton(FRIEND.id, 0))
    expect(
      await screen.findByText("If you're right, which card do you give them?"),
    ).toBeInTheDocument()
    expect(postedCommands(fetchMock)).toEqual([])

    fireEvent.click(slotButton(ME.userId, 1))
    await waitFor(() => {
      expect(postedCommands(fetchMock)).toEqual([
        {
          _tag: "Slam",
          target: { playerId: FRIEND.id, slotIndex: 0 },
          giveSlot: 1,
        },
      ])
    })
    expect(
      screen.queryByText("If you're right, which card do you give them?"),
    ).not.toBeInTheDocument()
  })

  it("a zero-card slammer's opponent slam sends giveSlot null immediately — no give pick, no 'Ready a give' control (ADR-0009)", async () => {
    const fake = setupFake()
    const closesAt = Date.now() + 8000
    const { handlers, fetchMock } = stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(
        200,
        viewResponse({
          players: [
            { id: ME.userId, name: ME.name, hand: [] },
            { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
          ],
          discard: ["KH"],
          phase: { _tag: "SlamWindow", turnPlayerId: ME.userId, closesAt, rank: "7" },
        }),
      ),
    })
    handlers[POST_COMMANDS] = json(200, twoPlayerView)
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    // Clause 3: with an empty hand there's nothing to arm — the control
    // never appears at all.
    expect(screen.queryByRole("button", { name: "Ready a give" })).not.toBeInTheDocument()

    fireEvent.click(slotButton(FRIEND.id, 0))
    await waitFor(() => {
      expect(postedCommands(fetchMock)).toEqual([
        { _tag: "Slam", target: { playerId: FRIEND.id, slotIndex: 0 }, giveSlot: null },
      ])
    })
    expect(
      screen.queryByText("If you're right, which card do you give them?"),
    ).not.toBeInTheDocument()
  })

  it("(CAM-23) the 'Ready a give' control appears during an open slam window when the viewer holds cards", async () => {
    const fake = setupFake()
    const closesAt = Date.now() + 8000
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, slamWindowView("7", closesAt)),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    expect(await screen.findByRole("button", { name: "Ready a give" })).toBeInTheDocument()
  })

  it("(CAM-23) the 'Ready a give' control is absent outside a slam window", async () => {
    const fake = setupFake()
    gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    expect(screen.queryByRole("button", { name: "Ready a give" })).not.toBeInTheDocument()
  })

  it("(CAM-23) the 'Ready a give' control hides once the two-tap fallback already holds a pending target", async () => {
    const fake = setupFake()
    const closesAt = Date.now() + 8000
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, slamWindowView("7", closesAt)),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)
    expect(await screen.findByRole("button", { name: "Ready a give" })).toBeInTheDocument()

    fireEvent.click(slotButton(FRIEND.id, 0))
    expect(
      await screen.findByText("If you're right, which card do you give them?"),
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Ready a give" })).not.toBeInTheDocument()
  })

  it("(CAM-23) arming a give-slot sends no command, highlights the slot, and offers a way to cancel the arm", async () => {
    const fake = setupFake()
    const closesAt = Date.now() + 8000
    const { fetchMock } = stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, slamWindowView("7", closesAt)),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    fireEvent.click(screen.getByRole("button", { name: "Ready a give" }))
    fireEvent.click(slotButton(ME.userId, 1))

    expect(postedCommands(fetchMock)).toEqual([])
    expect(
      document.querySelector(`[data-flight-anchor="slot:${ME.userId}:1"] [data-selected="true"]`),
    ).not.toBeNull()
    expect(await screen.findByRole("button", { name: "Cancel give" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Ready a give" })).not.toBeInTheDocument()
  })

  it("(CAM-23) canceling from ready-mode before anything is armed sends no command and returns to 'Ready a give'", async () => {
    const fake = setupFake()
    const closesAt = Date.now() + 8000
    const { fetchMock } = stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, slamWindowView("7", closesAt)),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    fireEvent.click(screen.getByRole("button", { name: "Ready a give" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(postedCommands(fetchMock)).toEqual([])
    expect(await screen.findByRole("button", { name: "Ready a give" })).toBeInTheDocument()
  })

  it("(CAM-23) canceling an armed give-slot un-arms it, sending no command", async () => {
    const fake = setupFake()
    const closesAt = Date.now() + 8000
    const { fetchMock } = stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, slamWindowView("7", closesAt)),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    fireEvent.click(screen.getByRole("button", { name: "Ready a give" }))
    fireEvent.click(slotButton(ME.userId, 1))
    fireEvent.click(await screen.findByRole("button", { name: "Cancel give" }))

    expect(postedCommands(fetchMock)).toEqual([])
    expect(await screen.findByRole("button", { name: "Ready a give" })).toBeInTheDocument()
    expect(
      document.querySelector(`[data-flight-anchor="slot:${ME.userId}:1"] [data-selected="true"]`),
    ).toBeNull()
  })

  it("(CAM-23) a valid armed give-slot is consumed by a single opponent tap — one Slam command, no fallback prompt", async () => {
    const fake = setupFake()
    const closesAt = Date.now() + 8000
    const { fetchMock } = stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, slamWindowView("7", closesAt)),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    fireEvent.click(screen.getByRole("button", { name: "Ready a give" }))
    fireEvent.click(slotButton(ME.userId, 1))
    fireEvent.click(slotButton(FRIEND.id, 0))

    await waitFor(() => {
      expect(postedCommands(fetchMock)).toEqual([
        { _tag: "Slam", target: { playerId: FRIEND.id, slotIndex: 0 }, giveSlot: 1 },
      ])
    })
    expect(
      screen.queryByText("If you're right, which card do you give them?"),
    ).not.toBeInTheDocument()
  })

  it("(CAM-23) an armed give-slot clears automatically if it's slammed away (by the viewer's own case-1 slam) before it's spent", async () => {
    const fake = setupFake()
    const closesAt = Date.now() + 8000
    const { handlers } = stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, slamWindowView("7", closesAt)),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    fireEvent.click(screen.getByRole("button", { name: "Ready a give" }))
    fireEvent.click(slotButton(ME.userId, 1))
    expect(await screen.findByRole("button", { name: "Cancel give" })).toBeInTheDocument()

    // Own-hand taps outside ready mode are unaffected by the armed state
    // (clause 1) — tapping the armed slot itself fires an immediate
    // own-card slam, which vacates it once the reply lands.
    handlers[POST_COMMANDS] = json(
      200,
      viewResponse({
        players: [
          { id: ME.userId, name: ME.name, hand: [0, 2, 3] },
          { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
        ],
        deckCount: 37,
        discard: ["7H"],
        phase: { _tag: "SlamWindow", turnPlayerId: ME.userId, closesAt, rank: "7" },
        version: 5,
      }),
    )
    fireEvent.click(slotButton(ME.userId, 1))

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Cancel give" })).not.toBeInTheDocument()
    })
    expect(screen.getByRole("button", { name: "Ready a give" })).toBeInTheDocument()
  })

  it("marks every face-down card slam-eligible for a viewer who isn't the turn player — slamming isn't turn-gated", async () => {
    const fake = setupFake()
    const closesAt = Date.now() + 8000
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, slamWindowView("7", closesAt, FRIEND.id)),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    expect(
      document.querySelector(
        `[data-flight-anchor="slot:${ME.userId}:0"] [data-slam-eligible="true"]`,
      ),
    ).not.toBeNull()
    expect(
      document.querySelector(
        `[data-flight-anchor="slot:${FRIEND.id}:0"] [data-slam-eligible="true"]`,
      ),
    ).not.toBeNull()
  })
})

describe("slam resolution display (SL2)", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("SlamSucceeded reveals the slammed card and holds the timer at resolving, then clears without re-rendering", async () => {
    const fake = setupFake()
    const closesAt = Date.now() + 8000
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, slamWindowView("7", closesAt)),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    const { room } = await channelsReady(fake)

    vi.useFakeTimers()

    act(() => {
      room.emit("SlamSucceeded", {
        _tag: "SlamSucceeded",
        slammerId: ME.userId,
        target: { playerId: ME.userId, slotIndex: 0 },
        card: "7H",
      })
    })
    expect(screen.getByText("7")).toBeInTheDocument()
    expect(document.querySelector('[data-state="resolving"]')).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(1200)
    })
    expect(screen.queryByText("7")).not.toBeInTheDocument()
    expect(document.querySelector('[data-state="resolving"]')).toBeNull()
  })

  it("SlamFailed also reveals the slammed card before its penalty lands (§1.5 — both outcomes reveal)", async () => {
    const fake = setupFake()
    const closesAt = Date.now() + 8000
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, slamWindowView("7", closesAt)),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    const { room } = await channelsReady(fake)

    vi.useFakeTimers()

    act(() => {
      room.emit("SlamFailed", {
        _tag: "SlamFailed",
        slammerId: ME.userId,
        target: { playerId: FRIEND.id, slotIndex: 0 },
        card: "9S",
      })
    })
    expect(screen.getByText("9")).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1200)
    })
    expect(screen.queryByText("9")).not.toBeInTheDocument()
  })

  it("PenaltyDrawn never renders a card value, even once its reveal-gated flight lands (C5 extension, ADR-0022)", async () => {
    const fake = setupFake()
    const closesAt = Date.now() + 8000
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, slamWindowView("7", closesAt)),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    const { room } = await channelsReady(fake)
    const faceUpBefore = document.querySelectorAll('[data-face="up"]').length

    vi.useFakeTimers()

    act(() => {
      room.emit("SlamFailed", {
        _tag: "SlamFailed",
        slammerId: ME.userId,
        target: { playerId: FRIEND.id, slotIndex: 0 },
        card: "9S",
      })
      room.emit("PenaltyDrawn", { _tag: "PenaltyDrawn", playerId: ME.userId, slotIndex: 4 })
    })
    act(() => {
      vi.advanceTimersByTime(1200)
    })

    expect(screen.queryByText("9")).not.toBeInTheDocument()
    // The reveal cleared and the penalty's own flight is face-down by
    // construction — no new face-up card ever appeared on the table.
    expect(document.querySelectorAll('[data-face="up"]')).toHaveLength(faceUpBefore)
  })

  it("an opponent-correct slam's give arrives face-down and value-free; the vacated slot shows the awaiting-give treatment until it lands", async () => {
    const fake = setupFake()
    const closesAt = Date.now() + 8000
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, slamWindowView("7", closesAt)),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    const { room } = await channelsReady(fake)

    vi.useFakeTimers()

    act(() => {
      room.emit("SlamSucceeded", {
        _tag: "SlamSucceeded",
        slammerId: ME.userId,
        target: { playerId: FRIEND.id, slotIndex: 0 },
        card: "9S",
      })
    })
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    // The removal flight is queued once the reveal clears — the vacated
    // slot renders as unoccupied (Hand's awaiting-give ring is only painted
    // on the empty-slot branch).
    expect(document.querySelector(`[data-flight-anchor="slot:${FRIEND.id}:0"]`)).toHaveAttribute(
      "data-occupied",
      "false",
    )

    act(() => {
      room.emit("CardGivenFromHand", {
        _tag: "CardGivenFromHand",
        slammerId: ME.userId,
        fromSlot: 0,
        to: { playerId: FRIEND.id, slotIndex: 0 },
      })
    })
    expect(document.querySelector(`[data-flight-anchor="slot:${FRIEND.id}:0"]`)).toHaveAttribute(
      "data-occupied",
      "true",
    )
    // Blind even to the slammer — the event carries no card, ever.
    expect(screen.queryByText("9")).not.toBeInTheDocument()
  })
})

describe("late slams and window close (SL3)", () => {
  it("a 422 SlamTooLate surfaces inline copy without breaking the table", async () => {
    const fake = setupFake()
    const closesAt = Date.now() + 8000
    const { handlers, calls } = stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, slamWindowView("7", closesAt)),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)
    const getsBefore = calls.filter((call) => call === GET_VIEW).length

    handlers[POST_COMMANDS] = json(422, errorBody("SlamTooLate", "illegal move"))
    fireEvent.click(slotButton(ME.userId, 0))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too slow. The slam window had already closed.",
    )
    await waitFor(() => {
      expect(calls.filter((call) => call === GET_VIEW).length).toBeGreaterThan(getsBefore)
    })
    expect(screen.getByText(ME.name)).toBeInTheDocument()
    expect(screen.getByText(FRIEND.name)).toBeInTheDocument()
  })

  it("(CAM-23) a 422 WrongPhase on a just-sent Slam surfaces the SlamTooLate copy — the server's timer fiber already won the race", async () => {
    const fake = setupFake()
    const closesAt = Date.now() + 8000
    const { handlers } = stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, slamWindowView("7", closesAt)),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    handlers[POST_COMMANDS] = json(422, errorBody("WrongPhase", "illegal move"))
    fireEvent.click(slotButton(ME.userId, 0))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too slow. The slam window had already closed.",
    )
  })

  it("(CAM-23) a 422 WrongPhase on a non-Slam command still shows the generic copy — the remap is Slam-specific", async () => {
    const fake = setupFake()
    const { handlers } = gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    handlers[POST_COMMANDS] = json(422, errorBody("WrongPhase", "illegal move"))
    fireEvent.click(screen.getByRole("button", { name: "Draw a card" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That move isn't available right now.",
    )
  })

  it("(CAM-23) ready-mode and an armed give-slot reset the moment the acting phase moves on from SlamWindow, and don't leak into the next one", async () => {
    const fake = setupFake()
    const closesAt = Date.now() + 8000
    const { handlers } = stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, slamWindowView("7", closesAt)),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    const { room } = await channelsReady(fake)

    fireEvent.click(screen.getByRole("button", { name: "Ready a give" }))
    fireEvent.click(slotButton(ME.userId, 1))
    expect(await screen.findByRole("button", { name: "Cancel give" })).toBeInTheDocument()

    handlers[GET_VIEW] = json(
      200,
      viewResponse({
        players: [
          { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
          { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
        ],
        deckCount: 37,
        discard: ["7H"],
        phase: { _tag: "AwaitingDraw", playerId: FRIEND.id },
        version: 5,
      }),
    )
    act(() => {
      room.emit("SlamWindowClosed", { _tag: "SlamWindowClosed" })
      room.emit("TurnAdvanced", { _tag: "TurnAdvanced", playerId: FRIEND.id })
    })

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Cancel give" })).not.toBeInTheDocument()
    })
    expect(screen.queryByRole("button", { name: "Ready a give" })).not.toBeInTheDocument()

    // Review finding: the assertions above would pass even if the reset
    // itself were deleted, since the control's own `slamPhase !== undefined`
    // render guard already hides it outside any window regardless of
    // `slamReadyMode`/`slamArmedGive`. The round-trip below is what actually
    // discriminates a real reset from a leak: if slot 1 stayed armed across
    // the transition, a later window would show "Cancel give" for a slot the
    // player never touched this time around.
    const closesAt2 = Date.now() + 8000
    handlers[GET_VIEW] = json(
      200,
      viewResponse({
        players: [
          { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
          { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
        ],
        deckCount: 37,
        discard: ["9H"],
        // Version must beat the AwaitingDraw view's `version: 5` above, or
        // the query's staleness guard (ADR-0033) silently discards this
        // response and the round-trip never observes the new window.
        version: 6,
        phase: { _tag: "SlamWindow", turnPlayerId: ME.userId, closesAt: closesAt2, rank: "9" },
      }),
    )
    act(() => {
      room.emit("TurnAdvanced", { _tag: "TurnAdvanced", playerId: ME.userId })
    })

    expect(await screen.findByRole("button", { name: "Ready a give" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Cancel give" })).not.toBeInTheDocument()
  })

  it("SlamWindowClosed + TurnAdvanced arrive as one batch: one refetch moves play on and slam display state is swept", async () => {
    const fake = setupFake()
    const closesAt = Date.now() + 8000
    const { handlers, calls } = stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, slamWindowView("7", closesAt)),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    const { room } = await channelsReady(fake)
    const getsBefore = calls.filter((call) => call === GET_VIEW).length

    // A slam reveal still showing when the window closes must not linger
    // past its own timer — SlamWindowClosed sweeps it outright.
    act(() => {
      room.emit("SlamSucceeded", {
        _tag: "SlamSucceeded",
        slammerId: ME.userId,
        target: { playerId: ME.userId, slotIndex: 0 },
        card: "7H",
      })
    })
    expect(screen.getByText("7")).toBeInTheDocument()

    handlers[GET_VIEW] = json(
      200,
      viewResponse({
        players: [
          { id: ME.userId, name: ME.name, hand: [1, 2, 3] },
          { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
        ],
        deckCount: 37,
        discard: ["7H"],
        phase: { _tag: "AwaitingDraw", playerId: FRIEND.id },
        version: 5,
      }),
    )
    act(() => {
      room.emit("SlamWindowClosed", { _tag: "SlamWindowClosed" })
      room.emit("TurnAdvanced", { _tag: "TurnAdvanced", playerId: FRIEND.id })
    })
    expect(screen.queryByText("7")).not.toBeInTheDocument()

    await waitFor(() => {
      expect(calls.filter((call) => call === GET_VIEW).length).toBe(getsBefore + 1)
    })
    expect(await screen.findByText(`${FRIEND.name}'s turn`)).toBeInTheDocument()
  })
})

describe("reshuffle choreography (CH2)", () => {
  // `reshuffling`'s own rendering (data-state on DrawDeck) is pinned at the
  // component level (draw-deck.test.tsx) — at this integration layer the
  // enqueued flight auto-cancels synchronously against jsdom's degenerate
  // getBoundingClientRect (flight-layer.test.tsx: "a degenerate rect...
  // also cancels", asserted with no `waitFor` at all), so the boolean it
  // drives is never observably true from outside an `act()` boundary here.
  // What IS testable, and what CH2 actually promises structurally, is the
  // one thing ADR-0033 already guarantees for free: broadcasts never touch
  // the snapshot, so the retained top survives untouched until the refetch
  // — that's the assertion below.
  it("keeps the discard top visibly unchanged through a DeckReshuffled broadcast, updating the deck only once the refetch lands", async () => {
    const fake = setupFake()
    const { handlers } = gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    const { room } = await channelsReady(fake)

    expect(
      screen.getByRole("button", { name: "Draw a card", description: "37 cards in the draw deck" }),
    ).toBeInTheDocument()

    handlers[GET_VIEW] = json(
      200,
      viewResponse({
        players: [
          { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
          { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
        ],
        deckCount: 25,
        discard: ["KH"], // the retained top (cambio-rules: reshuffle keeps it)
        version: 5,
      }),
    )
    act(() => {
      room.emit("DeckReshuffled", { _tag: "DeckReshuffled", deckCount: 25 })
    })
    // Synchronously after the broadcast — before the debounced refetch can
    // possibly have landed — the retained top is exactly as it was.
    expect(screen.getByText("K").closest('[data-face="up"]')).not.toBeNull()

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Draw a card",
          description: "25 cards in the draw deck",
        }),
      ).toBeInTheDocument()
    })
    // Still the same retained top after the refetch too.
    expect(screen.getByText("K").closest('[data-face="up"]')).not.toBeNull()
  })
})

describe("reshuffle sequencing gate (C14, ADR-0040)", () => {
  // The default jsdom `getBoundingClientRect` is all-zero (degenerate),
  // which auto-cancels every flight synchronously (flight-layer.test.tsx) —
  // a zero-length deferral window. These two tests stub non-degenerate
  // rects so a flight actually stays `active` across a tick, which is what
  // the sequencing pin needs; the liveness test below then confirms nothing
  // hangs when a batch runs under the DEFAULT (auto-cancelling) measure.
  let restoreRect: () => void = () => undefined

  afterEach(() => {
    vi.useRealTimers()
    restoreRect()
  })

  function stubNonDegenerateRects() {
    const original = Element.prototype.getBoundingClientRect
    let n = 0
    Element.prototype.getBoundingClientRect = function (this: Element) {
      n += 1
      // Non-zero, non-identical rects — planFlight must never see a
      // zero-width/height dimension (its only cancellation condition).
      return {
        top: n,
        left: n,
        right: n + 100,
        bottom: n + 100,
        width: 100,
        height: 100,
        x: n,
        y: n,
        toJSON: () => ({}),
      } as DOMRect
    }
    restoreRect = () => {
      Element.prototype.getBoundingClientRect = original
    }
  }

  const deckState = () =>
    document.querySelector('[data-flight-anchor="deck"]')?.getAttribute("data-state")

  // The C9 re-arm case (a discard landing, not a draw): chosen over a plain
  // CardDrawn+DeckReshuffled batch because CardDrawn's destination anchor is
  // `held`, which only mounts once the (pre-refetch) snapshot itself shows a
  // `HoldingCard` phase — under the still-`AwaitingDraw` bootstrap snapshot
  // a draw flight cancels on a missing anchor regardless of rect stubbing.
  // `HeldSwapped`'s second flight (slot → discard) has no such dependency:
  // both anchors exist in every phase, so its lifetime is governed only by
  // the (stubbed, non-degenerate) measure — exactly what this pin needs.
  it("defers the reshuffle flight behind its causing discard-landing flight — never simultaneously active", async () => {
    const fake = setupFake()
    const { handlers } = gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    const { room } = await channelsReady(fake)
    vi.useFakeTimers()
    stubNonDegenerateRects()

    handlers[GET_VIEW] = json(
      200,
      viewResponse({
        players: [
          { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
          { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
        ],
        deckCount: 25,
        discard: ["5D"],
        version: 5,
      }),
    )

    // Same batch, server order (root plan clause 9): the landing precedes
    // the re-arm reshuffle it caused.
    act(() => {
      room.emit("HeldSwapped", {
        _tag: "HeldSwapped",
        playerId: ME.userId,
        slotIndex: 0,
        discarded: "5D",
      })
      room.emit("DeckReshuffled", { _tag: "DeckReshuffled", deckCount: 25 })
    })

    // The reshuffle is queued behind the landing flight, not concurrent —
    // the deck shows neither "draw" nor "reshuffling" yet.
    expect(deckState()).toBe("populated")

    // Advance past the landing flight's settle clock (FLIGHT_TRACK_MS * 2).
    act(() => {
      vi.advanceTimersByTime(680)
    })

    // The landing flight settled, released the cause latch, and the queued
    // reshuffle flight is now active.
    expect(deckState()).toBe("reshuffling")

    // Settle the reshuffle flight and the debounced refetch before the test
    // ends (review F6: an in-flight refetch at teardown is a flake source).
    act(() => {
      vi.advanceTimersByTime(680)
    })
    vi.useRealTimers()
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Draw a card",
          description: "25 cards in the draw deck",
        }),
      ).toBeInTheDocument()
    })
  })

  it("holds the reshuffle for the LAST armed cause — an earlier cause settling first does not release it (review F1)", async () => {
    // Models the fizzle batch `CardDrawn, PowerFizzled, PowerDiscarded,
    // DeckReshuffled, SlamWindowOpened`: the reshuffle's true cause is the
    // LAST discard-landing before it, but an earlier causing flight (the
    // draw) settles first. The fizzle batch's own anchors are phase-
    // entangled in jsdom (both `held`-anchored flights cancel under the
    // AwaitingDraw bootstrap), so this pin substitutes structurally: the
    // CardDrawn cause cancels instantly on its missing `held` anchor (the
    // early settler), while HeldSwapped's slot→discard landing (anchors
    // present in every phase) stands in as the true, still-flying cause.
    const fake = setupFake()
    const { handlers } = gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    const { room } = await channelsReady(fake)
    vi.useFakeTimers()
    stubNonDegenerateRects()

    handlers[GET_VIEW] = json(
      200,
      viewResponse({
        players: [
          { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
          { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
        ],
        deckCount: 25,
        discard: ["5D"],
        version: 5,
      }),
    )

    act(() => {
      room.emit("CardDrawn", { _tag: "CardDrawn", playerId: ME.userId })
      room.emit("HeldSwapped", {
        _tag: "HeldSwapped",
        playerId: ME.userId,
        slotIndex: 0,
        discarded: "5D",
      })
      room.emit("DeckReshuffled", { _tag: "DeckReshuffled", deckCount: 25 })
    })

    // The CardDrawn cause has already cancelled (missing `held` anchor) —
    // with the unguarded drain that cancel would have flushed the reshuffle
    // here, concurrent with the still-flying landing. The guarded drain
    // holds it: the deck shows neither choreography state.
    expect(deckState()).toBe("populated")

    // The true cause (the landing) settles — now the reshuffle plays.
    act(() => {
      vi.advanceTimersByTime(680)
    })
    expect(deckState()).toBe("reshuffling")

    act(() => {
      vi.advanceTimersByTime(680)
    })
    vi.useRealTimers()
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Draw a card",
          description: "25 cards in the draw deck",
        }),
      ).toBeInTheDocument()
    })
  })

  it("is live under jsdom's default auto-cancelling measure — the batch still resolves to the refetched state", async () => {
    const fake = setupFake()
    const { handlers } = gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    const { room } = await channelsReady(fake)
    // No rect stub here — the default degenerate measure cancels every
    // flight synchronously (onDone fires with "cancelled"), which must
    // still release the cause latch and flush the queued reshuffle thunk
    // rather than leaving it stuck forever.

    handlers[GET_VIEW] = json(
      200,
      viewResponse({
        players: [
          { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
          { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
        ],
        deckCount: 25,
        discard: ["KH"],
        version: 5,
      }),
    )

    act(() => {
      room.emit("CardDrawn", { _tag: "CardDrawn", playerId: ME.userId })
      room.emit("DeckReshuffled", { _tag: "DeckReshuffled", deckCount: 25 })
    })

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Draw a card",
          description: "25 cards in the draw deck",
        }),
      ).toBeInTheDocument()
    })
  })

  it("flushes the queued reshuffle when its cause cancels — the reshuffle flight still animates (review F3)", async () => {
    // The plain liveness test above cannot see the gate (the refetch lands
    // regardless — review F3 called its assertion vacuous). This one makes
    // the flush observable: the CardDrawn cause cancels on its missing
    // `held` anchor (broadcasts never write the snapshot, so the bootstrap
    // stays AwaitingDraw and the anchor never mounts), while the reshuffle
    // flight's own anchors (discard, deck) exist in every phase — under
    // stubbed rects it must therefore mount and fly, proving the cancelled
    // cause released the latch rather than wedging the thunk.
    const fake = setupFake()
    const { handlers } = gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    const { room } = await channelsReady(fake)
    vi.useFakeTimers()
    stubNonDegenerateRects()

    handlers[GET_VIEW] = json(
      200,
      viewResponse({
        players: [
          { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
          { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
        ],
        deckCount: 25,
        discard: ["KH"],
        version: 5,
      }),
    )

    act(() => {
      room.emit("CardDrawn", { _tag: "CardDrawn", playerId: ME.userId })
      room.emit("DeckReshuffled", { _tag: "DeckReshuffled", deckCount: 25 })
    })

    // The cancelled cause flushed the gate: the reshuffle flight is active.
    expect(deckState()).toBe("reshuffling")

    act(() => {
      vi.advanceTimersByTime(680)
    })
    vi.useRealTimers()
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Draw a card",
          description: "25 cards in the draw deck",
        }),
      ).toBeInTheDocument()
    })
  })
})

describe("the call moment (E1)", () => {
  it("flips the turn indicator to the CAMBIO! call copy the instant CambioCalled arrives — before any reveal renders", async () => {
    const fake = setupFake()
    gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    const { room } = await channelsReady(fake)

    act(() => {
      room.emit("CambioCalled", { _tag: "CambioCalled", playerId: ME.userId })
    })

    // Ephemeral (use-game.ts `calledBy`) — applied synchronously, before
    // the debounced refetch (still pending) could possibly have landed a
    // real `Ended` view with `reveal`.
    // `getByRole("status")` alone is ambiguous — the AppShell connection
    // dot (S1/S2) is also `role="status"` — so this scopes to the one
    // TurnIndicator carries `data-state` on (turn-indicator.tsx).
    const indicator = document.querySelector('[role="status"][data-state]')
    expect(indicator).toHaveAttribute("data-state", "game-over")
    expect(indicator).toHaveTextContent(`${ME.name} called CAMBIO!`)
    expect(screen.queryByText("SCORES")).not.toBeInTheDocument()
    // The table itself hasn't dimmed yet — only the indicator is in the
    // game-over state; the still-`AwaitingDraw` snapshot renders normally.
    expect(document.querySelectorAll('[data-state="game-over"]')).toHaveLength(1)
  })

  it("prefers the ephemeral announcement's own player over a stale turn-active seat ring until the snapshot catches up", async () => {
    // FRIEND is the active player in the bootstrap snapshot (turn-gated
    // affordances aside, this only asserts the copy/seat naming) — the
    // CambioCalled announcement must still name the caller (ME), not
    // whoever `view.phase` currently says is acting.
    const fake = setupFake()
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(
        200,
        viewResponse({
          players: [
            { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
            { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
          ],
          phase: { _tag: "AwaitingDraw", playerId: FRIEND.id },
        }),
      ),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    const { room } = await channelsReady(fake)

    act(() => {
      room.emit("CambioCalled", { _tag: "CambioCalled", playerId: ME.userId })
    })

    expect(document.querySelector('[role="status"][data-state]')).toHaveTextContent(
      `${ME.name} called CAMBIO!`,
    )
  })
})

describe("the reveal (E2)", () => {
  const THIRD = "33333333-3333-4333-8333-333333333333"
  const THIRD_NAME = "Sam"

  // A. Rules-consistent totals (cambio-rules: black king −1): ME and
  // FRIEND tie for lowest at −1; THIRD's zero-card hand scores 0 — higher
  // than the tie, so it must NOT be styled as winning despite having the
  // fewest cards. ME is also the caller — the reveal marks no distinct
  // "caller" treatment beyond the shared winner styling.
  const endedReveal = {
    hands: [
      { playerId: ME.userId, cards: [{ slotIndex: 0, card: "KS" }] },
      { playerId: FRIEND.id, cards: [{ slotIndex: 0, card: "KC" }] },
      { playerId: THIRD, cards: [] },
    ],
    scores: [
      { playerId: ME.userId, total: -1 },
      { playerId: FRIEND.id, total: -1 },
      { playerId: THIRD, total: 0 },
    ],
    winners: [ME.userId, FRIEND.id],
  }

  const endedView = () =>
    viewResponse({
      players: [
        { id: ME.userId, name: ME.name, hand: [] },
        { id: FRIEND.id, name: FRIEND.name, hand: [] },
        { id: THIRD, name: THIRD_NAME, hand: [] },
      ],
      phase: { _tag: "Ended", calledBy: ME.userId },
      reveal: endedReveal,
      version: 9,
    })

  it("renders the settled score sheet: sorted ascending, plural tie winners, true-minus totals, caller unmarked, zero-card hand not styled as winning", async () => {
    setupFake()
    stubApi({ "GET /me": json(200, ME), [GET_VIEW]: json(200, endedView()) })
    renderGameApp(GAME_ID)

    const heading = await screen.findByText("SCORES")
    const sheet = heading.closest("[data-state]")
    if (sheet === null) throw new Error("score sheet root not found")
    await waitFor(() => expect(sheet).toHaveAttribute("data-state", "final"))

    const rows = within(sheet as HTMLElement).getAllByRole("listitem")
    expect(rows).toHaveLength(3)
    // Ascending by total, never by card count: the two −1 ties come
    // before the zero-card hand's 0, even though it holds fewer cards.
    expect(rows[2]).toHaveTextContent(THIRD_NAME)
    expect(rows[2]).toHaveAttribute("data-winner", "false")

    const winnerRows = rows.filter((row) => row.getAttribute("data-winner") === "true")
    expect(winnerRows).toHaveLength(2)
    const winnerNames = winnerRows.map((row) => row.textContent ?? "")
    expect(winnerNames.some((text) => text.includes(ME.name))).toBe(true)
    expect(winnerNames.some((text) => text.includes(FRIEND.name))).toBe(true)

    // True minus (voice.md), never a hyphen — both tied winners show it.
    expect(within(sheet as HTMLElement).getAllByText("−1")).toHaveLength(2)

    // The caller (ME) gets no marker beyond the winner styling FRIEND also
    // gets — same row treatment, nothing caller-specific rendered anywhere
    // in the sheet (ScoreSheet's props don't even carry `calledBy`).
    const meRow = rows.find((row) => row.textContent?.includes(ME.name))
    const friendRow = rows.find((row) => row.textContent?.includes(FRIEND.name))
    expect(meRow?.className).toBe(friendRow?.className)
  })

  it("dims the table under the game-over state while the score sheet is showing", async () => {
    setupFake()
    stubApi({ "GET /me": json(200, ME), [GET_VIEW]: json(200, endedView()) })
    renderGameApp(GAME_ID)

    await screen.findByText("SCORES")
    const tableRoot = document.querySelector("[data-seat-index]")?.closest("[data-state]")
    expect(tableRoot).toHaveAttribute("data-state", "game-over")
  })

  it("a fresh bootstrap straight into an Ended view renders the score sheet, not an error — the revealing entrance is structurally present", async () => {
    setupFake()
    stubApi({ "GET /me": json(200, ME), [GET_VIEW]: json(200, endedView()) })
    renderGameApp(GAME_ID)

    // No error, no stuck skeleton — the score sheet itself is the first
    // thing this fresh mount settles on.
    const heading = await screen.findByText("SCORES")
    expect(screen.queryByTestId("game-skeleton")).not.toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()

    const sheet = heading.closest("[data-state]")
    if (sheet === null) throw new Error("score sheet root not found")
    // Mounts `revealing`: every mini card starts face-down.
    expect(sheet).toHaveAttribute("data-state", "revealing")
    expect(within(sheet as HTMLElement).queryAllByText("K")).toHaveLength(0)

    // Flips every card up in the same beat and settles — never again.
    await waitFor(() => expect(sheet).toHaveAttribute("data-state", "final"))
    expect(within(sheet as HTMLElement).getAllByText("K")).toHaveLength(2)
  })
})

describe("game-over composition and exit (E3)", () => {
  const endedView = () =>
    viewResponse({
      players: [{ id: ME.userId, name: ME.name, hand: [] }],
      phase: { _tag: "Ended", calledBy: ME.userId },
      reveal: {
        hands: [{ playerId: ME.userId, cards: [] }],
        scores: [{ playerId: ME.userId, total: 0 }],
        winners: [ME.userId],
      },
      version: 9,
    })

  it("offers exactly one exit — back to the lobby — which navigates to /", async () => {
    setupFake()
    const user = userEvent.setup()
    stubApi({ "GET /me": json(200, ME), [GET_VIEW]: json(200, endedView()) })
    const { router } = renderGameApp(GAME_ID)

    await screen.findByText("SCORES")
    const exitLinks = screen.getAllByRole("link", { name: "Back to the lobby" })
    expect(exitLinks).toHaveLength(1)

    await user.click(exitLinks[0]!)

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/")
    })
    expect(screen.getByTestId("index-route-stub")).toBeInTheDocument()
  })
})

// ---- CAM-21: the compact docked composition — structural containment
// only (ADR-0030 routes every geometry/fit claim to the design-gate
// rendered pass; these pin the DOM shape that composition depends on). ---

describe("compact docked composition (CAM-21)", () => {
  const chromeBand = (): HTMLElement => {
    const band = document.querySelector('[data-region="chrome"]')
    if (band === null) throw new Error("chrome band not found")
    return band as HTMLElement
  }

  const dockActions = (): HTMLElement => {
    const dock = document.querySelector('[data-region="dock-actions"]')
    if (dock === null) throw new Error("dock-actions region not found")
    return dock as HTMLElement
  }

  it("keeps the turn indicator and an open slam timer inside the pinned chrome band", async () => {
    const fake = setupFake()
    const closesAt = Date.now() + 8000
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, slamWindowView("7", closesAt)),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    const band = chromeBand()
    expect(within(band).getByText(/Slam window open/)).toBeInTheDocument()
    expect(within(band).getByRole("progressbar", { name: "Slam window" })).toBeInTheDocument()
  })

  it("keeps command-error, fizzle, and beat messages inside the chrome band once they render", async () => {
    const fake = setupFake()
    const { handlers } = gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    const { room } = await channelsReady(fake)

    handlers[POST_COMMANDS] = json(422, errorBody("NotYourTurn", "illegal move"))
    fireEvent.click(screen.getByRole("button", { name: "Draw a card" }))
    await screen.findByRole("alert")

    const band = chromeBand()
    expect(within(band).getByRole("alert")).toHaveTextContent("It's not your turn.")

    act(() => {
      room.emit("PowerFizzled", { _tag: "PowerFizzled", playerId: FRIEND.id, power: "J" })
    })
    expect(
      within(band).getByText(`${FRIEND.name}'s power fizzled — no legal target.`),
    ).toBeInTheDocument()

    // Review F3: the DrawSkipped beat message is band content too — the
    // coverage table claimed it, no assertion pinned it until now.
    act(() => {
      room.emit("DrawSkipped", { _tag: "DrawSkipped", playerId: FRIEND.id, kind: "penalty" })
    })
    expect(
      within(band).getByText(`No cards left to draw — ${FRIEND.name}'s penalty card was skipped.`),
    ).toBeInTheDocument()
  })

  it("keeps the give-pick prompt inside the bottom dock, never the chrome band", async () => {
    const fake = setupFake()
    const closesAt = Date.now() + 8000
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, slamWindowView("7", closesAt)),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    // Review F3: the pre-arm "Ready a give" affordance is dock content too
    // (root plan clause 3) — claimed by the coverage table, unpinned before.
    const readyGive = screen.getByRole("button", { name: "Ready a give" })
    expect(dockActions().contains(readyGive)).toBe(true)
    expect(chromeBand().contains(readyGive)).toBe(false)

    fireEvent.click(slotButton(FRIEND.id, 0))
    const prompt = await screen.findByText("If you're right, which card do you give them?")

    expect(dockActions().contains(prompt)).toBe(true)
    expect(chromeBand().contains(prompt)).toBe(false)
  })

  it("renders Call Cambio inside the bottom dock, not the chrome band", async () => {
    const fake = setupFake()
    gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    const callCambio = screen.getByRole("button", { name: "Call Cambio" })
    expect(dockActions().contains(callCambio)).toBe(true)
    expect(chromeBand().contains(callCambio)).toBe(false)
  })

  it("renders Keep/Discard inside the bottom dock in the holding phase", async () => {
    const fake = setupFake()
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(
        200,
        viewResponse({
          players: [
            { id: ME.userId, name: ME.name, hand: [] },
            { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
          ],
          phase: { _tag: "HoldingCard", playerId: ME.userId, source: "deck", card: "3S" },
        }),
      ),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    // Review F3: both buttons, and the negative half — the coverage table
    // claimed Keep/Discard "never the chrome band"; only Keep was pinned.
    const keep = screen.getByRole("button", { name: "Keep" })
    const discard = screen.getByRole("button", { name: "Discard" })
    for (const button of [keep, discard]) {
      expect(dockActions().contains(button)).toBe(true)
      expect(chromeBand().contains(button)).toBe(false)
    }
  })

  it("keeps the viewer's own hand anchors outside the scroll region but inside the flight root", async () => {
    const fake = setupFake()
    gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    const tableRoot = document.querySelector('[data-region="table-root"]')
    const scrollRegion = document.querySelector('[data-region="table-scroll"]')
    if (tableRoot === null || scrollRegion === null) {
      throw new Error("table-root/table-scroll region not found")
    }

    const ownAnchor = document.querySelector(`[data-flight-anchor="slot:${ME.userId}:0"]`)
    const opponentAnchor = document.querySelector(`[data-flight-anchor="slot:${FRIEND.id}:0"]`)
    const deckAnchor = document.querySelector('[data-flight-anchor="deck"]')
    const discardAnchor = document.querySelector('[data-flight-anchor="discard"]')
    for (const anchor of [ownAnchor, opponentAnchor, deckAnchor, discardAnchor]) {
      expect(anchor).not.toBeNull()
      expect(tableRoot.contains(anchor)).toBe(true)
    }
    // Only the own-hand anchor lives OUTSIDE the scrollable middle region —
    // it's the dock's hand half, extracted from TableSurface (clause 3/5).
    expect(scrollRegion.contains(ownAnchor)).toBe(false)
    expect(scrollRegion.contains(opponentAnchor)).toBe(true)
    expect(scrollRegion.contains(deckAnchor)).toBe(true)
    expect(scrollRegion.contains(discardAnchor)).toBe(true)
    // Review F3: the coverage table's row 4 claims the scroll wrapper never
    // contains the dock either — pin that half too.
    expect(scrollRegion.contains(dockActions())).toBe(false)
  })

  it("no longer renders the viewer's own seat wrapper inside TableSurface — it's extracted to the screen's dock", async () => {
    const fake = setupFake()
    gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    // TableSurface's own root carries `data-state` — found via the
    // opponent's still-internal seat wrapper (`[role=status][data-state]`
    // on TurnIndicator would otherwise be the DOM-first false match, the
    // same ambiguity the game-over walk test above already routes around).
    // The viewer's seat wrapper must NOT be a descendant of it — it
    // renders as a sibling in the screen's dock instead (decision 3).
    // Room-screen's default `viewerSeat="internal"` path is unaffected and
    // stays pinned by room-screen.test.tsx's own seat-index assertion.
    const opponentSeatWrapper = screen.getByText(FRIEND.name).closest("[data-seat-index]")
    const tableSurfaceRoot = opponentSeatWrapper?.closest("[data-state]")
    expect(tableSurfaceRoot).not.toBeNull()
    expect(tableSurfaceRoot?.contains(opponentSeatWrapper)).toBe(true)

    const ownSeatWrapper = screen.getByText(ME.name).closest("[data-seat-index]")
    expect(ownSeatWrapper).not.toBeNull()
    expect(tableSurfaceRoot?.contains(ownSeatWrapper)).toBe(false)
  })

  it("carries no scale-or-rotate transform class from every flight anchor up through the root's ancestors (ADR-0035, widened to rotation by ADR-0036 §5)", async () => {
    const fake = setupFake()
    gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    // CAM-20/ADR-0036 §5 widens the CAM-21 pin two ways: it now walks from
    // EVERY flight anchor (not just the table-root down) and it now checks
    // for rotate too, not just scale — the FLIP layer measures
    // post-transform pixels, so a rotated ancestor of an anchor corrupts a
    // flight the same way a scaled one does. Anchors' DESCENDANTS stay
    // exempt (playing-card's own `rotate-6`/`rotate-y-180`, the discard
    // fan, and CAM-20's own side-bench card rotate are all BELOW their
    // anchor and legal) — the walk only ever goes from an anchor upward.
    const anchors = document.querySelectorAll("[data-flight-anchor]")
    expect(anchors.length).toBeGreaterThan(0)
    for (const anchor of anchors) {
      for (let node: Element | null = anchor; node !== null; node = node.parentElement) {
        // Review F5.1 widened the net: variant-prefixed (`regular:scale-*`)
        // and negative (`-scale-x-*`) utilities, arbitrary transform
        // utilities, and inline transform styles are all ADR-0035/0036
        // breaches the original `/(^|\s)scale-/` couldn't see.
        expect(node.className).not.toMatch(/(^|\s|:)-?(scale|rotate)-/)
        expect(node.className).not.toMatch(/transform-\[/)
        expect((node as HTMLElement).style.transform ?? "").toBe("")
      }
    }
  })

  it("renders the own-seat game-over rest inside the extracted seat wrapper, compact-only (review F2)", async () => {
    setupFake()
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(
        200,
        viewResponse({
          players: [
            { id: ME.userId, name: ME.name, hand: [] },
            { id: FRIEND.id, name: FRIEND.name, hand: [0] },
          ],
          phase: { _tag: "Ended", calledBy: ME.userId },
          reveal: {
            hands: [
              { playerId: ME.userId, cards: [] },
              { playerId: FRIEND.id, cards: [{ slotIndex: 0, card: "KS" }] },
            ],
            scores: [
              { playerId: ME.userId, total: 0 },
              { playerId: FRIEND.id, total: 13 },
            ],
            winners: [ME.userId],
          },
        }),
      ),
    })
    renderGameApp(GAME_ID)
    await screen.findByText("SCORES")

    // The extracted own seat needs its OWN rest at compact (it sits outside
    // TableSurface's square, so the surface's full-region rest never reaches
    // it) — and that rest must be compact-only: at regular the surface's
    // z-20 rest already paints over the `regular:z-10` seat wherever they
    // overlap, and an always-on copy double-dims it (review F2). The class
    // pin mirrors the ADR-0035 guard's structural-classname precedent.
    const rest = document.querySelector('[data-region="own-seat-rest"]')
    expect(rest).not.toBeNull()
    expect(rest?.closest("[data-seat-index]")).not.toBeNull()
    expect(rest?.closest('[data-state="game-over"]')).toBeNull()
    expect(rest?.className).toContain("regular:hidden")
  })
})

// ---- CAM-20 M4: side-bench rotation (ADR-0036 §5) ------------------------

describe("side-bench rotation (CAM-20)", () => {
  const THIRD = { id: "33333333-3333-4333-8333-333333333333", name: "Zara" }

  const threePlayerBootstrap = () =>
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(
        200,
        viewResponse({
          players: [
            { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
            { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
            { id: THIRD.id, name: THIRD.name, hand: [0, 1] },
          ],
        }),
      ),
    })

  it("actually exercises rotation: a left-bench and a right-bench opponent each get a rotate class on the card visual, below their anchor", async () => {
    const fake = setupFake()
    threePlayerBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    // Viewer (index 0) is seat-arc order 0 → bottom; the next seat (FRIEND,
    // index 1) takes the leftmost occupied bench for a 3-seat table (left);
    // THIRD (index 2) takes right (table-geometry.ts benchAssignment).
    const friendAnchor = document.querySelector(`[data-flight-anchor="slot:${FRIEND.id}:0"]`)
    const thirdAnchor = document.querySelector(`[data-flight-anchor="slot:${THIRD.id}:0"]`)
    expect(friendAnchor).not.toBeNull()
    expect(thirdAnchor).not.toBeNull()

    // The rotate class lives on the card visual INSIDE the anchor, never on
    // the anchor div itself.
    expect(friendAnchor?.className ?? "").not.toMatch(/rotate-/)
    expect(thirdAnchor?.className ?? "").not.toMatch(/rotate-/)
    expect(friendAnchor?.querySelector("[data-face]")).toHaveClass("regular:-rotate-90")
    expect(thirdAnchor?.querySelector("[data-face]")).toHaveClass("regular:rotate-90")

    // And the viewer's own hand (always the bottom bench) never rotates.
    const ownAnchor = document.querySelector(`[data-flight-anchor="slot:${ME.userId}:0"]`)
    expect(ownAnchor?.querySelector("[data-face]")?.className ?? "").not.toMatch(/rotate-/)

    // Review F12b: opponent seat WRAPPERS carry the shared bench position
    // classes (previously only the own-seat wrapper's classes were pinned —
    // dropping BENCH_POSITION_CLASS from seatWrapper would have passed).
    const friendWrapper = screen.getByText(FRIEND.name).closest("[data-seat-index]")
    const thirdWrapper = screen.getByText(THIRD.name).closest("[data-seat-index]")
    for (const token of BENCH_POSITION_CLASS.left.split(" ")) {
      expect(friendWrapper?.className ?? "").toContain(token)
    }
    for (const token of BENCH_POSITION_CLASS.right.split(" ")) {
      expect(thirdWrapper?.className ?? "").toContain(token)
    }
  })

  it("still carries no scale-or-rotate transform above any flight anchor with a rotated hand on the table (ADR-0035/0036 §5)", async () => {
    const fake = setupFake()
    threePlayerBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    const anchors = document.querySelectorAll("[data-flight-anchor]")
    expect(anchors.length).toBeGreaterThan(0)
    for (const anchor of anchors) {
      for (let node: Element | null = anchor; node !== null; node = node.parentElement) {
        expect(node.className).not.toMatch(/(^|\s|:)-?(scale|rotate)-/)
        expect(node.className).not.toMatch(/transform-\[/)
        expect((node as HTMLElement).style.transform ?? "").toBe("")
      }
    }
  })
})

// ---- CAM-20 M5: the fluid regular table (clause 9), scoped to the docked
// composition only (mirrors CAM-21's viewerSeat scoping pins) --------------

describe("fluid regular table (CAM-20 M5)", () => {
  it("sizes the table square from height at regular (flex-grown, max-w-4xl), never the pre-CAM-20 width-driven max-w-2xl", async () => {
    const fake = setupFake()
    gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    // `document.querySelector("[data-state]")` would DOM-first-match
    // TurnIndicator's own `[role=status][data-state]` in the chrome band
    // (same ambiguity the game-over walk test above routes around) — find
    // TableSurface's root via a still-internal opponent seat wrapper.
    const opponentSeatWrapper = screen.getByText(FRIEND.name).closest("[data-seat-index]")
    const tableSurfaceRoot = opponentSeatWrapper?.closest("[data-state]")
    expect(tableSurfaceRoot).not.toBeNull()
    const className = tableSurfaceRoot?.className ?? ""
    expect(className).toContain("regular:flex-1")
    expect(className).toContain("regular:min-h-0")
    expect(className).toContain("regular:max-w-4xl")
    expect(className).not.toContain("regular:max-w-2xl")
    expect(className).not.toContain("regular:block")
  })
})

// ---- CAM-27/ADR-0038: the fluid COMPACT table (clauses 1-4), the same
// scoping pins as the regular table above but one breakpoint over — the
// table art now grows via a flex-grown frame (container-type: size)
// wrapping a container-query-sized square, instead of a fixed max-width
// cap (a single element combining flex-grow with aspect-ratio/max-width
// does not hold a square once the width ceiling binds — confirmed live,
// ADR-0038). Real pixel/fit claims are rendered-path evidence (ADR-0030 —
// jsdom computes no layout); these are the structural pins that would
// catch a REGRESSION even though they can't themselves prove the
// rendered outcome — see docs/plans/frontend/CAM-27.md's Progress for
// the measured numbers. -----------------------------------------------

describe("fluid compact table (CAM-27 M2)", () => {
  it("makes TableSurface's root a real flex item, at compact (flex-1, min-h-0)", async () => {
    const fake = setupFake()
    gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    const opponentSeatWrapper = screen.getByText(FRIEND.name).closest("[data-seat-index]")
    const tableSurfaceRoot = opponentSeatWrapper?.closest("[data-state]")
    expect(tableSurfaceRoot).not.toBeNull()
    const className = tableSurfaceRoot?.className ?? ""
    expect(className).toMatch(/(^|\s)flex-1(\s|$)/)
    expect(className).toMatch(/(^|\s)min-h-0(\s|$)/)
    // The root never has its own leftover space to redistribute (the art
    // frame's `grow` always consumes exactly what it leaves) — centering
    // the square once ITS width ceiling binds is the frame's job, not the
    // root's (see the "frames the table art" test below).
    expect(className).not.toMatch(/(^|\s)justify-center(\s|$)/)
  })

  it("makes table-scroll a real flex column, so the root above can claim its height (CAM-27 — was a plain block box)", async () => {
    const fake = setupFake()
    gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    const tableScroll = document.querySelector('[data-region="table-scroll"]')
    expect(tableScroll).not.toBeNull()
    const className = tableScroll?.className ?? ""
    expect(className).toMatch(/(^|\s)flex(\s|$)/)
    expect(className).toContain("flex-col")
    expect(className).toContain("regular:contents")
  })

  it("frames the table art as a size query container at compact, dissolved everywhere else (CAM-27, revised)", async () => {
    const fake = setupFake()
    gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    const frame = document.querySelector('[data-region="table-art-frame"]')
    expect(frame).not.toBeNull()
    const className = frame?.className ?? ""
    // A single flex-1/aspect-ratio/max-width element does not stay square
    // once the width ceiling binds (confirmed live — see the plan's
    // Surprises); the frame instead becomes a real flex item AND a size
    // query container so the square below can read its resolved box.
    // `grow basis-[0px]`, NOT `flex-1` (`flex: 1 1 0%`) — a percentage
    // flex-basis on a `container-type: size` element nested two flex-grow
    // levels deep resolves `cqh` queries to 0 in this browser (confirmed
    // live); a literal `0px` basis does not have this problem.
    expect(className).toMatch(/(^|\s)grow(\s|$)/)
    expect(className).toContain("basis-[0px]")
    expect(className).not.toMatch(/(^|\s)flex-1(\s|$)/)
    expect(className).toMatch(/(^|\s)min-h-0(\s|$)/)
    expect(className).toContain("[container-type:size]")
    expect(className).toContain("regular:contents")
    // The frame centers the square once its own width ceiling binds and
    // it renders shorter than the frame's full flex-grown height — a
    // plain block child would otherwise sit top-aligned, leaving the
    // leftover as one gap below it instead of symmetric margin (clause 4).
    expect(className).toMatch(/(^|\s)flex(\s|$)/)
    expect(className).toContain("items-center")
    expect(className).toMatch(/(^|\s)justify-center(\s|$)/)
  })

  it("grows the table art to the biggest square that fits its frame, via container query units, floored (not capped) at the token, and restores today's w-3/4 sizing at regular", async () => {
    const fake = setupFake()
    gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    const tableArt = document.querySelector('[data-region="table-art"]')
    expect(tableArt).not.toBeNull()
    const className = tableArt?.className ?? ""
    // The old fixed cap is gone; the token is now a floor, not a cap.
    expect(className).not.toContain("max-w-(--size-table-art-compact)")
    expect(className).toContain("min-w-(--size-table-art-compact)")
    expect(className).toContain("min-h-(--size-table-art-compact)")
    // Real CSS sizing via container query units, not a magic clamp() or
    // JS/ResizeObserver measurement — width is the min of the frame's own
    // width and its resolved height (`100cqh`), aspect-ratio derives
    // height from that, so the square holds regardless of which
    // dimension binds (unlike a plain flex-grow + aspect-ratio + max-
    // width attempt on one element, which does NOT self-correct).
    expect(className).toContain("aspect-square")
    expect(className).toContain("w-[min(100%,100cqh)]")
    // Regular restores the pre-CAM-27 width-driven sizing byte-for-byte —
    // the load-bearing companion edit this task's own plan flagged: this
    // element's `w-3/4` had no existing `regular:w-*` twin before this
    // change, so regular silently depended on the same unprefixed value
    // this task had to repurpose for compact.
    expect(className).toContain("regular:w-3/4")
    expect(className).toContain("regular:aspect-auto")
  })

  it("still carries no scale-or-rotate transform above the table art now that it sizes via container query units (ADR-0035)", async () => {
    const fake = setupFake()
    gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    const tableArt = document.querySelector('[data-region="table-art"]')
    expect(tableArt).not.toBeNull()
    for (let node: Element | null = tableArt; node !== null; node = node.parentElement) {
      expect(node.className).not.toMatch(/(^|\s|:)-?(scale|rotate)-/)
      expect(node.className).not.toMatch(/transform-\[/)
      expect((node as HTMLElement).style.transform ?? "").toBe("")
    }
  })
})

// ---- CAM-20 design-gate fix cycle: the Judge's accidental findings at the
// regular (1280×900) and compact (360×640) reference viewports. Real pixel
// claims are rendered-path evidence (ADR-0030 — jsdom computes no layout);
// these are the structural pins that would catch a REGRESSION even though
// they can't themselves prove the rendered outcome — see
// docs/plans/frontend/CAM-20.md's Progress for the measured numbers. -------

describe("design-gate fix cycle, regular findings (CAM-20)", () => {
  it("nudges the own-seat group's vertical translate one 4px step past the shared bench anchor's plain -50% (finding 1 — the group measured 3px past the 900px regular reference viewport before this fix)", async () => {
    const fake = setupFake()
    gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    const ownSeatWrapper = screen.getByText(ME.name).closest("[data-seat-index]")
    expect(ownSeatWrapper).not.toBeNull()
    const className = ownSeatWrapper?.className ?? ""
    // The extra 4px nudge — NOT the shared BENCH_ANCHOR_CLASS.bottom's bare
    // `-translate-y-1/2` alone, which is what let the overshoot through
    // undetected (nothing pinned the actual bottom coordinate). jsdom
    // cannot compute the real bottom edge (ADR-0030); the rendered pass
    // (plan doc Progress) is the pixel evidence this pin can only guard.
    expect(className).toContain("regular:translate-y-[calc(-50%-4px)]")
    expect(className).not.toContain("regular:-translate-y-1/2")
    // The shared constant itself must stay untouched — TableSurface's own
    // internal seatWrapper (room screen) still applies it unmodified.
    expect(BENCH_ANCHOR_CLASS.bottom).toBe("regular:-translate-x-1/2 regular:-translate-y-1/2")
  })

  it("docks the Call Cambio affordance near the own-seat group's horizontal center instead of the stage's bottom-right corner (finding 2 — measured 260px away at a 4-card hand before this fix)", async () => {
    const fake = setupFake()
    gameBootstrap()
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    const callCambio = screen.getByRole("button", { name: "Call Cambio" })
    const wrapper = callCambio.parentElement
    const className = wrapper?.className ?? ""
    // Review F9: the 324px is a live derivation, not a magic number — half
    // the own hand's full-row width (ROW_WIDTH card-lg columns at 96px
    // regular + the grid's 8px gaps) plus one 16px step of clearance. If
    // ROW_WIDTH or the card footprint ever changes, this pin fails instead
    // of the button silently landing on the hand.
    const CARD_LG_REGULAR_PX = 96 // card-lg, packages/ui/src/styles.css
    const GRID_GAP_REGULAR_PX = 8 // regular:gap-2, hand.tsx
    const derived =
      (ROW_WIDTH * CARD_LG_REGULAR_PX + (ROW_WIDTH - 1) * GRID_GAP_REGULAR_PX) / 2 + 16
    expect(derived).toBe(324)
    expect(className).toContain(`regular:left-[calc(50%+${derived}px)]`)
    expect(className).not.toContain("regular:right-5")
    // Still docked inside the bottom dock region, not the chrome band —
    // the pre-existing structural pin for this element's DOM location
    // (mirrors "compact docked composition (CAM-21)"'s own dockActions()).
    const dock = document.querySelector('[data-region="dock-actions"]')
    expect(dock).not.toBeNull()
    expect(dock?.contains(callCambio)).toBe(true)
  })
})

describe("design-gate fix cycle, compact findings (CAM-20)", () => {
  const THIRD = { id: "44444444-4444-4444-8444-444444444444", name: "Priya" }

  it("gives the compact opponents row a wider gap BETWEEN hands than the gap INSIDE each hand (finding 4 — the two used to match, reading as one continuous card strip)", async () => {
    const fake = setupFake()
    stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(
        200,
        viewResponse({
          players: [
            { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
            { id: FRIEND.id, name: FRIEND.name, hand: [0, 1, 2, 3] },
            { id: THIRD.id, name: THIRD.name, hand: [0, 1, 2, 3] },
          ],
        }),
      ),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    const friendHand = document
      .querySelector(`[data-flight-anchor="slot:${FRIEND.id}:0"]`)
      ?.closest('[data-variant="opponent"]')
    expect(friendHand).not.toBeNull()
    // Intra-hand: gap-1 (4px) at compact, unchanged gap-2 (8px) at regular.
    expect(friendHand?.className ?? "").toContain("gap-1")
    expect(friendHand?.className ?? "").not.toMatch(/(^|\s)gap-2(\s|$)/)
    expect(friendHand?.className ?? "").toContain("regular:gap-2")

    // Inter-seat: the opponents row wrapper widens to gap-x-5 (24px vs the
    // 4px intra-hand gap-1 above — the class assertions ARE the pin; a
    // literal 24 > 4 comparison was removed in the review fix cycle, F10h,
    // as vacuous).
    const opponentsRow = friendHand?.closest("[data-seat-index]")?.parentElement
    expect(opponentsRow?.className ?? "").toContain("gap-x-5")
  })
})
