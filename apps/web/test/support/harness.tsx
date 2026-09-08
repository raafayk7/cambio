import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router"
import { render } from "@testing-library/react"
import { vi } from "vitest"

import { GameScreen } from "../../src/containers/game/game-screen.js"
import { LobbyScreen } from "../../src/containers/lobby/lobby-screen.js"
import { RoomScreen } from "../../src/containers/room/room-screen.js"

/**
 * Container test harness (ADR-0030): a memory-history TanStack router
 * carrying the app's three routes, a FRESH QueryClient per render (the
 * per-request rule holds in tests too), fetch mocked at the service seam.
 * The game route is a stub — navigation assertions read the router state.
 */

export function renderApp(initialPath: string) {
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: LobbyScreen,
  })
  const roomRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/room/$gameId",
    component: function RoomPage() {
      const { gameId } = roomRoute.useParams()
      return <RoomScreen gameId={gameId} />
    },
  })
  const gameRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/game/$gameId",
    component: () => <div data-testid="game-route-stub" />,
  })

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, roomRoute, gameRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, queryClient }
}

/**
 * The game render path (CAM-18 step 5, root plan hazard 5): mounts the
 * real `GameScreen` at `/game/$gameId` instead of `renderApp`'s stub — the
 * room/lobby suites depend on that stub staying cheap and untouched, so
 * this is a separate entry point rather than a replacement. Stub routes
 * for `/` (the E3 back-to-lobby exit) and `/room/$gameId` (unreachable
 * from the game screen today, kept for parity) so a stray navigation
 * fails loudly instead of throwing a missing-route error.
 */
export function renderGameApp(gameId: string, initialPath: string = `/game/${gameId}`) {
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div data-testid="index-route-stub" />,
  })
  const roomRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/room/$gameId",
    component: () => <div data-testid="room-route-stub" />,
  })
  const gameRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/game/$gameId",
    component: function GamePage() {
      const { gameId: routeGameId } = gameRoute.useParams()
      return <GameScreen gameId={routeGameId} />
    },
  })

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, roomRoute, gameRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, queryClient }
}

export const json = (status: number, body: unknown) => () =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

/**
 * Stub fetch with a `"METHOD /path"` handler table. Handlers are factories
 * (a Response body is single-use); re-assign entries mid-test to change a
 * route's answer. `calls` records the order for no-extra-call assertions.
 */
export function stubApi(handlers: Record<string, () => Response>) {
  const calls: string[] = []
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    // The base makes bare relative paths parse: with VITE_API_URL unset the
    // service issues same-origin relative requests (CAM-32 C11), and
    // `new URL("/me")` without a base throws. Absolute URLs ignore the base,
    // so both request shapes key on their pathname.
    const url = new URL(String(input), "http://localhost")
    const key = `${init?.method ?? "GET"} ${url.pathname}`
    calls.push(key)
    const handler = handlers[key]
    if (handler === undefined) {
      return Promise.reject(new Error(`unmocked fetch: ${key}`))
    }
    return Promise.resolve(handler())
  })
  vi.stubGlobal("fetch", fetchMock)
  return { fetchMock, calls, handlers }
}

// --- shared fixtures --------------------------------------------------------

export const GAME_ID = "3f2c8a44-9d1e-4b6a-8c55-2e7f0a1b3c4d"
export const ME = { userId: "11111111-1111-4111-8111-111111111111", name: "Raafay" }
export const FRIEND = { id: "22222222-2222-4222-8222-222222222222", name: "Nadia" }

export const GRANTS = {
  roomTopic: `room:topic-secret:${GAME_ID}`,
  playerTopic: `player:topic-secret:${GAME_ID}:${ME.userId}`,
}

export const lobbyResponse = (
  members: ReadonlyArray<{ id: string; name: string }>,
  version: number,
  status: "open" | "abandoned" | "started" = "open",
) => ({
  lobby: { id: GAME_ID, members, status },
  version,
  grants: GRANTS,
})

export const errorBody = (tag: string, message: string) => ({ error: { tag, message } })

export interface ViewResponseOverrides {
  players?: ReadonlyArray<{ id: string; name: string; hand: ReadonlyArray<number> }>
  deckCount?: number
  discard?: ReadonlyArray<string>
  /** A plain `{_tag, ...}` literal for one `ViewPhase` variant — the real
   * decode (`decodeViewResponse`, exercised by the game-screen suite) is
   * what actually checks the shape; the fixture only needs to carry it. */
  phase?: Record<string, unknown>
  version?: number
  slamWindowMs?: number
  reveal?: {
    hands: ReadonlyArray<{
      playerId: string
      cards: ReadonlyArray<{ slotIndex: number; card: string }>
    }>
    scores: ReadonlyArray<{ playerId: string; total: number }>
    winners: ReadonlyArray<string>
  }
}

/**
 * A valid `ViewResponse` (CAM-17 R2 started-game fallback; CAM-18 the game
 * screen's bootstrap). Defaults to a minimal `AwaitingDraw` view for one
 * player; every field is overridable so later suites can drive any phase
 * (step 5, root plan).
 */
export const viewResponse = (overrides: ViewResponseOverrides = {}) => ({
  view: {
    players: overrides.players ?? [{ id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] }],
    deckCount: overrides.deckCount ?? 40,
    discard: overrides.discard ?? ["KH"],
    phase: overrides.phase ?? { _tag: "AwaitingDraw", playerId: ME.userId },
    config: { slamWindowMs: overrides.slamWindowMs ?? 8000 },
    ...(overrides.reveal !== undefined ? { reveal: overrides.reveal } : {}),
  },
  version: overrides.version ?? 3,
  grants: GRANTS,
})
