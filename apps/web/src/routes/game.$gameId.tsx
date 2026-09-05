import { createFileRoute } from "@tanstack/react-router"

import { GameScreen } from "../containers/game/game-screen.js"

/**
 * `/game/$gameId` — CAM-18: the one-line container pick (the R6
 * placeholder's replacement, room-screen precedent — routes pick
 * containers, they don't own logic). `game-screen.test.tsx` covers the
 * route's render; there is no route-level logic left to pin here.
 */
export const Route = createFileRoute("/game/$gameId")({
  component: GamePage,
  head: () => ({ meta: [{ title: "Game · Cambio" }] }),
})

function GamePage() {
  const { gameId } = Route.useParams()
  return <GameScreen gameId={gameId} />
}
