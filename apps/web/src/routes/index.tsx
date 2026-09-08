import { createFileRoute } from "@tanstack/react-router"

import { LobbyScreen } from "../containers/lobby/lobby-screen.js"

/**
 * `/` — the lobby (CAM-17 L1). Routing only: the container owns the
 * session state, the actions, and the courtyard scene declaration.
 */
export const Route = createFileRoute("/")({
  component: LobbyScreen,
})
