import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createRouter } from "@tanstack/react-router"

import { routeTree } from "./routeTree.gen"

export function getRouter() {
  // Created per call — on the server that means per request, so no query cache
  // is ever shared between users. This matters more than usual here: the API
  // sends per-player redacted views (§5), and a shared cache would hand one
  // player another player's payload.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000 },
    },
  })

  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
