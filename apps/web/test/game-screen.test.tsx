import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
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
    const dialog = screen.getByRole("dialog", { hidden: true })
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

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "It's not your turn — the table has been refreshed.",
    )
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

  it("slamming an opponent's card with a non-empty hand requires a give pick, then sends exactly one Slam command", async () => {
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
    expect(await screen.findByText("Pick a card to give")).toBeInTheDocument()
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
    expect(screen.queryByText("Pick a card to give")).not.toBeInTheDocument()
  })

  it("a zero-card slammer's opponent slam sends giveSlot null immediately — no give pick (ADR-0009)", async () => {
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

    fireEvent.click(slotButton(FRIEND.id, 0))
    await waitFor(() => {
      expect(postedCommands(fetchMock)).toEqual([
        { _tag: "Slam", target: { playerId: FRIEND.id, slotIndex: 0 }, giveSlot: null },
      ])
    })
    expect(screen.queryByText("Pick a card to give")).not.toBeInTheDocument()
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
      "The slam window had already closed — the table has been refreshed.",
    )
    await waitFor(() => {
      expect(calls.filter((call) => call === GET_VIEW).length).toBeGreaterThan(getsBefore)
    })
    expect(screen.getByText(ME.name)).toBeInTheDocument()
    expect(screen.getByText(FRIEND.name)).toBeInTheDocument()
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

    expect(screen.getByLabelText("37 cards in the draw deck")).toBeInTheDocument()

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
      expect(screen.getByLabelText("25 cards in the draw deck")).toBeInTheDocument()
    })
    // Still the same retained top after the refetch too.
    expect(screen.getByText("K").closest('[data-face="up"]')).not.toBeNull()
  })
})
