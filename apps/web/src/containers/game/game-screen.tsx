import type { PlayerGameView, ViewPhase } from "@cambio/contracts"
import { Alert, AppShell, Button, Link as UiLink, Panel, Skeleton } from "@cambio/ui"
import { Link as RouterLink } from "@tanstack/react-router"
import * as React from "react"

import { NameForm } from "../../components/identity/name-form.js"
import { DiscardPile } from "../../components/game/discard-pile.js"
import { DrawDeck } from "../../components/game/draw-deck.js"
import { FlightLayer } from "../../components/game/flight/flight-layer.js"
import { Hand } from "../../components/game/hand.js"
import { Seat } from "../../components/game/seat.js"
import { handArc, seatArc, type RadialPosition } from "../../components/game/table-geometry.js"
import { TableSurface } from "../../components/game/table-surface.js"
import { TurnIndicator } from "../../components/game/turn-indicator.js"
import { useConnection } from "../../hooks/use-connection.js"
import { sessionErrorCopy } from "../../hooks/use-session.js"
import { useGame } from "./use-game.js"

/**
 * The game (table) screen (CAM-18 C1-C5, T1-T5/SL/E scaffolded for later
 * steps): paving scene, `AppShell` in its `game` chrome, `TableSurface` in
 * `in-game` state composed from the bootstrap snapshot. Follows
 * `room-screen.tsx` throughout: denial states render the no-access recipe,
 * identity resolves in place, the container owns its `AppShell`.
 *
 * All interactions stay inert until step 10 (H1/T1) wires affordances from
 * `ViewPhase` — this step only renders what the snapshot already states.
 */

// ---- no-access (C3): one honest panel, byte-identical for unknown and
// non-participant alike (root plan C3, this task's step 8/9 scope) --------

function NoAccessPanel() {
  return (
    <Panel title="No table here" className="mx-auto w-full max-w-md">
      <div className="flex flex-col items-start gap-3">
        <p className="font-ui text-base text-ink-primary">
          This link doesn&apos;t lead to a game you can watch — it isn&apos;t yours, or it
          doesn&apos;t exist. Check the link you were sent, or head back to the start.
        </p>
        <UiLink asChild>
          <RouterLink to="/">Back to the start</RouterLink>
        </UiLink>
      </div>
    </Panel>
  )
}

/** First-load skeleton matching the table layout (300ms no-flash). */
function GameSkeleton() {
  const [visible, setVisible] = React.useState(false)
  React.useEffect(() => {
    const handle = window.setTimeout(() => setVisible(true), 300)
    return () => window.clearTimeout(handle)
  }, [])
  if (!visible) return null
  return (
    <div aria-hidden data-testid="game-skeleton" className="flex flex-col items-center gap-5">
      <Skeleton className="h-10 w-40" />
      <Skeleton className="aspect-square w-2/3 max-w-sm rounded-full" />
    </div>
  )
}

// ---- turn indicator copy (minimal phase copy, refined by T1-T5/E1) ------

interface TurnStatus {
  state: "your-turn" | "other-turn" | "slam-window" | "game-over"
  activePlayerId: string
}

/** Reads which player is acting straight off `ViewPhase` — structural field
 * access, never a derived rule (affordance derivation is step 10's job). */
function turnStatus(phase: ViewPhase, viewerId: string | undefined): TurnStatus {
  switch (phase._tag) {
    case "AwaitingDraw":
    case "HoldingCard":
    case "ResolvingPower":
    case "ResolvingQueenSwap":
      return {
        state: phase.playerId === viewerId ? "your-turn" : "other-turn",
        activePlayerId: phase.playerId,
      }
    case "SlamWindow":
      return { state: "slam-window", activePlayerId: phase.turnPlayerId }
    case "Ended":
      return { state: "game-over", activePlayerId: phase.calledBy }
  }
}

/** voice.md register: player language, sentence case for functional copy —
 * `turnIndicatorCopy`'s game-over/slam-window strings get the poster/rank
 * detail T5/E1/SL1 add later; this is the minimal naming step 8 owns. */
function turnStatusCopy(status: TurnStatus, activePlayerName: string): string {
  switch (status.state) {
    case "your-turn":
      return "Your turn"
    case "other-turn":
      return `${activePlayerName}'s turn`
    case "slam-window":
      return "Slam window open"
    case "game-over":
      return `${activePlayerName} called Cambio`
  }
}

// ---- hand placement (radial axis toward the table, root plan step 8) ----

type RadialSide = "top" | "bottom" | "left" | "right"

/** Which side of the seat marker the hand sits on, derived from the shared
 * seat/hand rings (table-geometry.ts): the hand ring sits strictly inside
 * the seat ring at the same angle, so the dominant axis of the delta
 * between the two points is the radial direction toward the table center.
 * Exact pixel placement is tuned against the rendered table (step 15,
 * ADR-0030) — this only orders the two nodes toward the center. */
function handSide(seat: RadialPosition, hand: RadialPosition): RadialSide {
  const dx = hand.xPct - seat.xPct
  const dy = hand.yPct - seat.yPct
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? "top" : "bottom"
  return dx < 0 ? "left" : "right"
}

const SIDE_FLEX_CLASS: Record<RadialSide, string> = {
  top: "flex-col-reverse",
  bottom: "flex-col",
  left: "flex-row-reverse",
  right: "flex-row",
}

function SeatWithHand({
  side,
  seat,
  hand,
}: {
  side: RadialSide
  seat: React.ReactNode
  hand: React.ReactNode
}) {
  return (
    <div className={`flex items-center gap-2 ${SIDE_FLEX_CLASS[side]}`}>
      {seat}
      {hand}
    </div>
  )
}

// ---- the table, composed from the bootstrap snapshot ---------------------

function GameTable({
  view,
  viewerId,
  flights,
}: {
  view: PlayerGameView
  viewerId: string
  flights: ReturnType<typeof useGame>["flights"]
}) {
  const [tableRoot, setTableRoot] = React.useState<HTMLElement | null>(null)

  const viewerIndex = view.players.findIndex((player) => player.id === viewerId)
  // -1 is unreachable: this component only renders once the bootstrap view
  // resolved for an authenticated participant — the Math.max is a
  // type-level fallback, not a live branch (room-screen precedent).
  const viewerSeatIndex = Math.max(0, viewerIndex)
  const seatPositions = seatArc(view.players.length, viewerSeatIndex)
  const handPositions = handArc(view.players.length, viewerSeatIndex)

  const playerName = (id: string): string =>
    view.players.find((player) => player.id === id)?.name ?? ""

  const status = turnStatus(view.phase, viewerId)
  const indicatorState = status.state === "slam-window" ? "slam-window" : status.state

  const discardTop = view.discard[0]
  const discardUnderCount = Math.max(0, Math.min(2, view.discard.length - 1))

  const seatNodes = view.players.map((player, index) => {
    const own = index === viewerSeatIndex
    const seatPos = seatPositions[index]
    const handPos = handPositions[index]
    const side =
      seatPos !== undefined && handPos !== undefined ? handSide(seatPos, handPos) : "bottom"
    return (
      <SeatWithHand
        key={player.id}
        side={side}
        seat={
          <Seat
            name={player.name}
            seatIndex={index}
            cardCount={player.hand.length}
            {...(own ? { own: true } : {})}
          />
        }
        hand={<Hand variant={own ? "own" : "opponent"} slots={player.hand} inert />}
      />
    )
  })

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <TurnIndicator state={indicatorState}>
        {turnStatusCopy(status, playerName(status.activePlayerId))}
      </TurnIndicator>
      <div ref={setTableRoot} className="relative w-full">
        <TableSurface
          state="in-game"
          viewerSeatIndex={viewerSeatIndex}
          seats={seatNodes}
          center={
            <div className="flex items-center gap-3">
              <div data-flight-anchor="deck">
                <DrawDeck count={view.deckCount} />
              </div>
              <div data-flight-anchor="discard">
                <DiscardPile
                  {...(discardTop !== undefined ? { top: discardTop } : {})}
                  underCount={discardUnderCount}
                />
              </div>
            </div>
          }
        />
        <FlightLayer root={tableRoot} active={flights.active} onSettle={flights.settle} />
      </div>
    </div>
  )
}

export function GameScreen({ gameId }: { gameId: string }) {
  const connection = useConnection()
  const { session, createUser, view, denial, failed, retry, viewerId, flights } = useGame(gameId)

  let content: React.ReactNode
  // Every branch gets a page h1; the identity branch carries its own
  // visible heading, so it opts out to avoid a double heading (room
  // precedent, review F13).
  let ownHeading = false
  if (denial !== null) {
    content = <NoAccessPanel />
  } else if (failed) {
    content = (
      <Alert
        variant="alarm"
        className="mx-auto max-w-md"
        action={
          <Button variant="ghost" onClick={retry}>
            Try again
          </Button>
        }
      >
        Couldn&apos;t reach the game. Check your connection and try again.
      </Alert>
    )
  } else if (session.isPending) {
    content = <GameSkeleton />
  } else if (session.data?.state === "unauthenticated") {
    // Identity in-place (room precedent): the route never changes, so the
    // bootstrap runs the moment a session exists — resolving either to the
    // table or to the no-access panel above.
    ownHeading = true
    content = (
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <Panel>
          <div className="flex flex-col gap-4">
            <h1 className="text-center font-display text-3xl">back at the table</h1>
            <NameForm
              onSubmit={(name) => createUser.mutate(name)}
              submitting={createUser.isPending}
              submitError={sessionErrorCopy(createUser.error)}
            />
          </div>
        </Panel>
      </div>
    )
  } else if (view.data !== undefined && viewerId !== undefined) {
    content = <GameTable view={view.data.view} viewerId={viewerId} flights={flights} />
  } else {
    content = <GameSkeleton />
  }

  return (
    <AppShell scene="paving" state="game" connection={connection}>
      <div className="flex w-full flex-1 flex-col justify-center gap-5 p-5">
        {ownHeading ? null : <h1 className="sr-only">Game</h1>}
        {content}
      </div>
    </AppShell>
  )
}
