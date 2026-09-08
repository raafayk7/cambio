import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { setRealtimeClientForTests } from "../src/services/realtime.js"
import { FakeRealtimeClient } from "./support/fake-realtime.js"
import {
  errorBody,
  GAME_ID,
  json,
  lobbyResponse,
  ME,
  renderApp,
  stubApi,
} from "./support/harness.js"

/**
 * Lobby container (CAM-17 W2, L1, L2, L4) — memory router + mocked fetch
 * per ADR-0030. The lobby holds no realtime subscription in v0; the fake
 * client is injected anyway so nothing ever touches a socket.
 */

afterEach(() => {
  vi.unstubAllGlobals()
  setRealtimeClientForTests(null)
})

const setup = () => setRealtimeClientForTests(new FakeRealtimeClient())

describe("lobby identity (W2, L1)", () => {
  it("renders the name form for an unauthenticated visitor (401 from /me)", async () => {
    setup()
    stubApi({ "GET /me": json(401, errorBody("Unauthorized", "no valid session")) })
    renderApp("/")

    expect(await screen.findByLabelText("Your name")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Deal me in" })).toBeInTheDocument()
  })

  it("submits a valid name to POST /users and flips to authenticated without a reload", async () => {
    setup()
    const user = userEvent.setup()
    const { fetchMock } = stubApi({
      "GET /me": json(401, errorBody("Unauthorized", "no valid session")),
      "POST /users": json(201, ME),
    })
    renderApp("/")

    await user.type(await screen.findByLabelText("Your name"), "Raafay")
    await user.click(screen.getByRole("button", { name: "Deal me in" }))

    // The authenticated lobby appears — same mount, no reload, no /me refetch.
    expect(await screen.findByRole("button", { name: "Create room" })).toBeInTheDocument()
    expect(screen.getByText(`shuffle up, ${ME.name}`)).toBeInTheDocument()
    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")
    expect(postCall?.[1]?.body).toBe(JSON.stringify({ name: "Raafay" }))
  })

  it("rejects an empty name on submit with the field error — no request leaves", async () => {
    setup()
    const user = userEvent.setup()
    const { calls } = stubApi({
      "GET /me": json(401, errorBody("Unauthorized", "no valid session")),
    })
    renderApp("/")

    await screen.findByLabelText("Your name")
    await user.click(screen.getByRole("button", { name: "Deal me in" }))

    expect(
      await screen.findByText("Enter a name so the table knows who you are."),
    ).toBeInTheDocument()
    expect(calls.filter((call) => call.startsWith("POST"))).toEqual([])
  })

  it("surfaces a server 400 as the submit alert per forms.md", async () => {
    setup()
    const user = userEvent.setup()
    stubApi({
      "GET /me": json(401, errorBody("Unauthorized", "no valid session")),
      "POST /users": json(400, errorBody("BadRequest", "invalid request")),
    })
    renderApp("/")

    await user.type(await screen.findByLabelText("Your name"), "Raafay")
    await user.click(screen.getByRole("button", { name: "Deal me in" }))

    expect(
      await screen.findByText("That name didn't work. Use 1 to 32 characters."),
    ).toBeInTheDocument()
  })
})

describe("authenticated lobby (L1, L2)", () => {
  it("greets by name and offers create + join-by-link", async () => {
    setup()
    stubApi({ "GET /me": json(200, ME) })
    renderApp("/")

    expect(await screen.findByText(`shuffle up, ${ME.name}`)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create room" })).toBeInTheDocument()
    expect(screen.getByLabelText("Room link")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Join room" })).toBeInTheDocument()
  })

  it("create room POSTs /lobbies and navigates to the new room route", async () => {
    setup()
    const user = userEvent.setup()
    stubApi({
      "GET /me": json(200, ME),
      "POST /lobbies": json(201, lobbyResponse([{ id: ME.userId, name: ME.name }], 1)),
      [`GET /lobbies/${GAME_ID}`]: json(200, lobbyResponse([{ id: ME.userId, name: ME.name }], 1)),
    })
    const { router } = renderApp("/")

    await user.click(await screen.findByRole("button", { name: "Create room" }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/room/${GAME_ID}`)
    })
  })

  it("join-by-link accepts a pasted room URL and navigates to it", async () => {
    setup()
    const user = userEvent.setup()
    stubApi({
      "GET /me": json(200, ME),
      [`GET /lobbies/${GAME_ID}`]: json(200, lobbyResponse([{ id: ME.userId, name: ME.name }], 1)),
    })
    const { router } = renderApp("/")

    await user.type(
      await screen.findByLabelText("Room link"),
      `http://localhost:3000/room/${GAME_ID}`,
    )
    await user.click(screen.getByRole("button", { name: "Join room" }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/room/${GAME_ID}`)
    })
  })

  it("join-by-link rejects garbage with the voice.md field error and stays put", async () => {
    setup()
    const user = userEvent.setup()
    stubApi({ "GET /me": json(200, ME) })
    const { router } = renderApp("/")

    await user.type(await screen.findByLabelText("Room link"), "not a link")
    await user.click(screen.getByRole("button", { name: "Join room" }))

    expect(
      await screen.findByText(
        "That doesn't look like a room link. Paste the whole link, or just its room id.",
      ),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/")
  })
})

/** Root plan F1.1/F1.2/F1.3: the entry point on every screen. This suite
 * proves lobby wiring only — copy-fidelity spot-pins live in
 * game-screen.test.tsx (root plan step 11) to keep the fidelity diff in
 * one file. */
describe("how-to-play guide entry point (F1)", () => {
  it("opens the guide from the lobby's help icon-button and closes it", async () => {
    setup()
    const user = userEvent.setup()
    stubApi({ "GET /me": json(200, ME) })
    renderApp("/")

    await user.click(await screen.findByRole("button", { name: "How to play" }))
    const dialog = screen.getByRole("dialog", { hidden: true })
    expect(within(dialog).getByText("How to play")).toBeInTheDocument()

    await user.click(within(dialog).getByRole("button", { name: "Close" }))
    await waitFor(() => {
      expect(dialog).not.toHaveAttribute("open")
    })
  })
})

describe("lobby page states (L4)", () => {
  it("shows the first-load skeleton while /me resolves", async () => {
    setup()
    // A /me that never settles keeps the screen in first-load.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    )
    renderApp("/")

    expect(screen.queryByLabelText("Your name")).not.toBeInTheDocument()
    // The skeleton respects the 300ms no-flash rule, so it appears late.
    expect(await screen.findByTestId("lobby-skeleton")).toBeInTheDocument()
  })

  it("renders the page-error alert with retry when /me fails outright", async () => {
    setup()
    stubApi({ "GET /me": json(500, errorBody("Internal", "internal error")) })
    renderApp("/")

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(
      "Couldn't reach the table. Check your connection and try again.",
    )
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument()
  })
})
