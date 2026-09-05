import { AppShell, Loading } from "@cambio/ui"
import { createFileRoute } from "@tanstack/react-router"

import { useConnection } from "../hooks/use-connection.js"

/**
 * `/game/$gameId` — placeholder (CAM-17 R6): the start flow must land
 * somewhere real, not a 404. A holding state composed purely from
 * registered components; the caption is loading.md's flavor register.
 * No game logic, no view fetch — CAM-18 replaces the content.
 */
export const Route = createFileRoute("/game/$gameId")({
  component: GameHoldingPage,
  head: () => ({ meta: [{ title: "Game · Cambio" }] }),
})

function GameHoldingPage() {
  const connection = useConnection()
  return (
    <AppShell
      scene="paving"
      connection={connection}
      state={connection === "reconnecting" ? "reconnecting" : "default"}
    >
      <div className="flex flex-1 items-center justify-center">
        <Loading delayMs={0} caption="shuffling…" />
      </div>
    </AppShell>
  )
}
