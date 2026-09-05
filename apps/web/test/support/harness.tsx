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
    const url = new URL(String(input))
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

/** A minimal valid ViewResponse for the started-game fallback (R2). */
export const viewResponse = () => ({
  view: {
    players: [{ id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] }],
    deckCount: 40,
    discard: ["KH"],
    phase: { _tag: "AwaitingDraw", playerId: ME.userId },
    config: { slamWindowMs: 8000 },
  },
  version: 3,
  grants: GRANTS,
})
