import type { PlayerGameView, SlotIndex, SlotRef, ViewPhase } from "@cambio/contracts"
import { Alert, AppShell, Button, Link as UiLink, Modal, Panel, Skeleton } from "@cambio/ui"
import { Link as RouterLink } from "@tanstack/react-router"
import * as React from "react"

import { NameForm } from "../../components/identity/name-form.js"
import { DiscardPile } from "../../components/game/discard-pile.js"
import { DrawDeck } from "../../components/game/draw-deck.js"
import { FlightLayer } from "../../components/game/flight/flight-layer.js"
import { Hand, type HandFace } from "../../components/game/hand.js"
import { HeldCard } from "../../components/game/held-card.js"
import { Seat } from "../../components/game/seat.js"
import { handArc, seatArc, type RadialPosition } from "../../components/game/table-geometry.js"
import { TableSurface } from "../../components/game/table-surface.js"
import { TurnIndicator } from "../../components/game/turn-indicator.js"
import { affordancesFor, type Affordances } from "./affordances.js"
import { useConnection } from "../../hooks/use-connection.js"
import { sessionErrorCopy } from "../../hooks/use-session.js"
import { useGame } from "./use-game.js"

/**
 * The game (table) screen (CAM-18 C1-C5 + T1-T4, SL/E scaffolded for the
 * later slam/endgame steps): paving scene, `AppShell` in its `game` chrome,
 * `TableSurface` in `in-game` state composed from the bootstrap snapshot.
 * Follows `room-screen.tsx` throughout: denial states render the no-access
 * recipe, identity resolves in place, the container owns its `AppShell`.
 *
 * Turn-flow/power affordances (`affordancesFor`, H1/T1-T3) drive every
 * interactive element here; `SlamWindow`/`Ended` phases render whatever
 * this milestone's minimal branches leave them (steps 13/14, out of scope).
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

// ---- held-card spot (T2) --------------------------------------------------

/** The three phases that hold a drawn/taken card at the held-card spot
 * (`ViewPhase.HoldingCard`/`ResolvingPower`/`ResolvingQueenSwap` all carry
 * `{playerId, card?}` — `ResolvingQueenSwap.card` is always absent by
 * server construction, round-1 decision: the swap happens from memory). */
function isHeldPhase(
  phase: ViewPhase,
): phase is Extract<ViewPhase, { _tag: "HoldingCard" | "ResolvingPower" | "ResolvingQueenSwap" }> {
  return (
    phase._tag === "HoldingCard" ||
    phase._tag === "ResolvingPower" ||
    phase._tag === "ResolvingQueenSwap"
  )
}

/** voice.md register — exactly the two example strings, never a value. */
function heldCardLabel(isHolder: boolean, holderName: string): string {
  return isHolder ? "You drew" : `${holderName} is holding`
}

// ---- per-seat hand wiring (T2/T3): who may click, which slots, which are
// already picked. Pure function of the current affordances + local
// selection state — no rule logic lives here, only DOM wiring. ----------

interface HandWiring {
  interactive: boolean
  onSlotClick?: (slot: SlotIndex) => void
  selectedSlots: ReadonlyArray<SlotIndex>
}

function handSlotWiring(params: {
  affordances: Affordances
  playerId: string
  viewerId: string
  /** T4: the Queen's peek reveal is still showing — swap-targeting stays
   * disabled until it clears, so the player picks from memory (round-1
   * decision), never while the value is still on screen. */
  peekActive: boolean
  selection: ReadonlyArray<SlotRef>
  onSelectTarget: (ref: SlotRef) => void
  onSwapHeld: (slot: SlotIndex) => void
}): HandWiring {
  const { affordances, playerId, viewerId, peekActive, selection, onSelectTarget, onSwapHeld } =
    params
  const selectedSlots = selection
    .filter((ref) => ref.playerId === playerId)
    .map((ref) => ref.slotIndex)

  if (
    affordances.phase === "HoldingCard" &&
    affordances.holder &&
    affordances.swap &&
    playerId === viewerId
  ) {
    return { interactive: true, onSlotClick: onSwapHeld, selectedSlots }
  }

  if (affordances.phase === "ResolvingPower" && affordances.holder) {
    const isOwn = playerId === viewerId
    const eligible =
      (affordances.targeting.kind === "peek-own" && isOwn) ||
      (affordances.targeting.kind === "peek-other" && !isOwn) ||
      affordances.targeting.kind === "swap-two" ||
      affordances.targeting.kind === "queen-peek"
    if (eligible) {
      return {
        interactive: true,
        onSlotClick: (slotIndex) => onSelectTarget({ playerId, slotIndex }),
        selectedSlots,
      }
    }
  }

  if (affordances.phase === "ResolvingQueenSwap" && affordances.holder && !peekActive) {
    return {
      interactive: true,
      onSlotClick: (slotIndex) => onSelectTarget({ playerId, slotIndex }),
      selectedSlots,
    }
  }

  return { interactive: false, selectedSlots }
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
  sendCommand,
  peek,
  actingPlayerId,
  fizzleMessage,
  commandError,
}: {
  view: PlayerGameView
  viewerId: string
  flights: ReturnType<typeof useGame>["flights"]
  sendCommand: ReturnType<typeof useGame>["sendCommand"]
  peek: ReturnType<typeof useGame>["peek"]
  actingPlayerId: ReturnType<typeof useGame>["actingPlayerId"]
  fizzleMessage: ReturnType<typeof useGame>["fizzleMessage"]
  commandError: ReturnType<typeof useGame>["commandError"]
}) {
  const [tableRoot, setTableRoot] = React.useState<HTMLElement | null>(null)
  const [confirmCambioOpen, setConfirmCambioOpen] = React.useState(false)

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
  const affordances = affordancesFor(view, viewerId)

  // T3/T4: two-pick target selection (7/8/9/10 peeks are single-click and
  // never touch this; J and the Queen's second step are two distinct
  // occupied slots, any players). Reset whenever the acting phase changes
  // (the documented React pattern for "adjusting state when a prop
  // changes" — a render-time comparison, not an effect, per
  // frontend-architecture's "derived state is computed during render").
  const phaseKey = `${view.phase._tag}:${"playerId" in view.phase ? view.phase.playerId : ""}`
  const [selection, setSelection] = React.useState<ReadonlyArray<SlotRef>>([])
  const [selectionPhaseKey, setSelectionPhaseKey] = React.useState(phaseKey)
  if (selectionPhaseKey !== phaseKey) {
    setSelectionPhaseKey(phaseKey)
    setSelection([])
  }

  const handleSelectTarget = (ref: SlotRef) => {
    if (
      affordances.phase === "ResolvingPower" &&
      affordances.holder &&
      affordances.targeting.kind !== "swap-two"
    ) {
      // 7/8/9/10: PowerPeek, one click. Q's first step is also PowerPeek —
      // the server's reply moves the phase to ResolvingQueenSwap.
      sendCommand.mutate({ _tag: "PowerPeek", target: ref })
      return
    }
    // swap-two: J (ResolvingPower) or the Queen's second step
    // (ResolvingQueenSwap) — two distinct occupied slots, any players
    // (cambio-rules: "may involve any two player-held cards, including two
    // belonging to the same player"). A repeat click on an already-picked
    // slot deselects it rather than completing an invalid self-swap.
    setSelection((current) => {
      const alreadyIndex = current.findIndex(
        (picked) => picked.playerId === ref.playerId && picked.slotIndex === ref.slotIndex,
      )
      if (alreadyIndex !== -1) return current.filter((_, index) => index !== alreadyIndex)
      const next = [...current, ref]
      const first = next[0]
      const second = next[1]
      if (first !== undefined && second !== undefined) {
        sendCommand.mutate({ _tag: "PowerSwap", first, second })
        return []
      }
      return next
    })
  }

  const handleSwapHeld = (slotIndex: SlotIndex) => {
    sendCommand.mutate({ _tag: "SwapHeld", slotIndex })
  }

  const discardTop = view.discard[0]
  const discardUnderCount = Math.max(0, Math.min(2, view.discard.length - 1))

  const heldPhase = isHeldPhase(view.phase) ? view.phase : undefined
  const heldIsHolder = heldPhase !== undefined && heldPhase.playerId === viewerId

  const drawing = flights.active.some((flight) => flight.originId === "deck")
  const receiving = flights.active.some((flight) => flight.destinationId === "discard")

  const facesFor = (playerId: string): ReadonlyArray<HandFace> =>
    peek !== null && peek.target.playerId === playerId
      ? [{ slotIndex: peek.target.slotIndex, card: peek.card, peeking: true }]
      : []

  const seatNodes = view.players.map((player, index) => {
    const own = index === viewerSeatIndex
    const seatPos = seatPositions[index]
    const handPos = handPositions[index]
    const side =
      seatPos !== undefined && handPos !== undefined ? handSide(seatPos, handPos) : "bottom"
    const wiring = handSlotWiring({
      affordances,
      playerId: player.id,
      viewerId,
      peekActive: peek !== null,
      selection,
      onSelectTarget: handleSelectTarget,
      onSwapHeld: handleSwapHeld,
    })
    const seatState =
      player.id === actingPlayerId
        ? "acting"
        : status.activePlayerId === player.id
          ? "active-turn"
          : "default"
    return (
      <SeatWithHand
        key={player.id}
        side={side}
        seat={
          <Seat
            name={player.name}
            seatIndex={index}
            cardCount={player.hand.length}
            state={seatState}
            {...(own ? { own: true } : {})}
          />
        }
        hand={
          <Hand
            variant={own ? "own" : "opponent"}
            playerId={player.id}
            slots={player.hand}
            faces={facesFor(player.id)}
            inert={!wiring.interactive}
            selectedSlots={wiring.selectedSlots}
            {...(wiring.onSlotClick !== undefined ? { onSlotClick: wiring.onSlotClick } : {})}
          />
        }
      />
    )
  })

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <TurnIndicator state={indicatorState}>
        {turnStatusCopy(status, playerName(status.activePlayerId))}
      </TurnIndicator>
      {affordances.phase === "AwaitingDraw" && affordances.holder ? (
        <Button variant="danger" onClick={() => setConfirmCambioOpen(true)}>
          Call Cambio
        </Button>
      ) : null}
      {affordances.phase === "HoldingCard" && affordances.holder ? (
        <div className="flex items-center justify-center gap-2">
          {affordances.discardHeld ? (
            <Button variant="secondary" onClick={() => sendCommand.mutate({ _tag: "DiscardHeld" })}>
              Discard
            </Button>
          ) : null}
          {affordances.keep ? (
            <Button variant="secondary" onClick={() => sendCommand.mutate({ _tag: "KeepHeld" })}>
              Keep
            </Button>
          ) : null}
        </div>
      ) : null}
      {commandError !== null ? (
        <p role="alert" className="font-ui text-sm text-accent-alarm-deep">
          {commandError}
        </p>
      ) : null}
      {fizzleMessage !== null ? (
        <p className="font-ui text-sm text-ink-muted">{fizzleMessage}</p>
      ) : null}
      <div ref={setTableRoot} className="relative w-full">
        <TableSurface
          state="in-game"
          viewerSeatIndex={viewerSeatIndex}
          seats={seatNodes}
          center={
            <div className="flex items-center gap-3">
              <DrawDeck
                count={view.deckCount}
                {...(drawing ? { state: "draw" as const } : {})}
                {...(affordances.phase === "AwaitingDraw" &&
                affordances.holder &&
                affordances.drawFromDeck
                  ? { onClick: () => sendCommand.mutate({ _tag: "DrawFromDeck" }) }
                  : {})}
              />
              <DiscardPile
                {...(discardTop !== undefined ? { top: discardTop } : {})}
                underCount={discardUnderCount}
                receiving={receiving}
                {...(affordances.phase === "AwaitingDraw" &&
                affordances.holder &&
                affordances.takeDiscard
                  ? { onClick: () => sendCommand.mutate({ _tag: "TakeDiscard" }) }
                  : {})}
              />
              {heldPhase !== undefined ? (
                // Entitlement is already decided by the wire (GameView.ts:
                // "present exactly when the viewer is entitled — holder
                // always, everyone when source === 'discard'") — `card`
                // being present at all IS the entitlement signal; no extra
                // holder check here would only re-hide data the server
                // already decided to send.
                <HeldCard
                  {...(heldPhase.card !== undefined ? { card: heldPhase.card } : {})}
                  label={heldCardLabel(heldIsHolder, playerName(heldPhase.playerId))}
                />
              ) : null}
            </div>
          }
        />
        <FlightLayer root={tableRoot} active={flights.active} onSettle={flights.settle} />
      </div>
      <Modal
        open={confirmCambioOpen}
        onClose={() => setConfirmCambioOpen(false)}
        variant="confirm"
        title="Call Cambio — ends the game"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmCambioOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmCambioOpen(false)
                sendCommand.mutate({ _tag: "CallCambio" })
              }}
            >
              Call Cambio
            </Button>
          </>
        }
      >
        <p className="font-ui text-base text-ink-primary">
          Ending the game now reveals every hand and scores the round — there&apos;s no going back.
        </p>
      </Modal>
    </div>
  )
}

export function GameScreen({ gameId }: { gameId: string }) {
  const connection = useConnection()
  const {
    session,
    createUser,
    view,
    denial,
    failed,
    retry,
    viewerId,
    flights,
    sendCommand,
    peek,
    actingPlayerId,
    fizzleMessage,
    commandError,
  } = useGame(gameId)

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
    content = (
      <GameTable
        view={view.data.view}
        viewerId={viewerId}
        flights={flights}
        sendCommand={sendCommand}
        peek={peek}
        actingPlayerId={actingPlayerId}
        fizzleMessage={fizzleMessage}
        commandError={commandError}
      />
    )
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
