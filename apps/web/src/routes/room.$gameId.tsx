import { createFileRoute } from "@tanstack/react-router"

import { RoomScreen } from "../containers/room/room-screen.js"

/**
 * `/room/$gameId` — the pre-game room (CAM-17 R1–R5, R7). Routing only:
 * the container owns bootstrap, join-on-visit, and the live view.
 */
export const Route = createFileRoute("/room/$gameId")({
  component: RoomPage,
  head: () => ({ meta: [{ title: "Room · Cambio" }] }),
})

function RoomPage() {
  const { gameId } = Route.useParams()
  return <RoomScreen gameId={gameId} />
}
