import { decodeHealthResponse } from "@cambio/contracts"
import { Button } from "@cambio/ui"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: Home,
})

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001"

/**
 * Scaffold smoke test, not UI.
 *
 * It exists to prove three wires at once: a shadcn primitive resolves from
 * `@cambio/ui`, a TanStack Query call reaches the API, and the response is
 * validated with the shared `@cambio/contracts` schema rather than trusted.
 * The real lobby and game UI come much later (§12).
 */
function Home() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const response = await fetch(`${API_URL}/health`)
      if (!response.ok) {
        throw new Error(`GET /health responded ${response.status}`)
      }
      // Decoded through the shared contract — the wire is never trusted.
      return decodeHealthResponse(await response.json())
    },
  })

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-start gap-6 p-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cambio</h1>
        <p className="text-muted-foreground mt-1 text-sm">Scaffold smoke test.</p>
      </div>

      <p className="text-sm" data-testid="health-status">
        API health:{" "}
        {health.isPending
          ? "checking…"
          : health.isError
            ? `unreachable (${health.error.message})`
            : health.data.ok
              ? "ok"
              : "unexpected response"}
      </p>

      <Button onClick={() => void health.refetch()} disabled={health.isFetching}>
        {health.isFetching ? "Checking…" : "Re-check health"}
      </Button>
    </main>
  )
}
