import type { PlayerGameView, Rank, SlotIndex, SlotRef, ViewPhase } from "@cambio/contracts"
import { Alert, AppShell, Button, cn, Link as UiLink, Modal, Panel, Skeleton } from "@cambio/ui"
import { Link as RouterLink } from "@tanstack/react-router"
import * as React from "react"

import { HowToPlayGuide } from "../../components/help/how-to-play-guide.js"
import { NameForm } from "../../components/identity/name-form.js"
import { DiscardPile } from "../../components/game/discard-pile.js"
import { DrawDeck } from "../../components/game/draw-deck.js"
import { FlightLayer } from "../../components/game/flight/flight-layer.js"
import { Hand, type HandFace } from "../../components/game/hand.js"
import { HeldCard } from "../../components/game/held-card.js"
import { ScoreSheet } from "../../components/game/score-sheet.js"
import { Seat } from "../../components/game/seat.js"
import { SlamTimer } from "../../components/game/slam-timer.js"
import { benchAssignment, type Bench } from "../../components/game/table-geometry.js"
import { BENCH_POSITION_CLASS, TableSurface } from "../../components/game/table-surface.js"
import { TurnIndicator } from "../../components/game/turn-indicator.js"
import {
  affordancesFor,
  isOccupiedSlot,
  slamGiveSlotRequired,
  type Affordances,
  type PowerTargeting,
} from "./affordances.js"
import { useConnection } from "../../hooks/use-connection.js"
import { sessionErrorCopy } from "../../hooks/use-session.js"
import { useGame } from "./use-game.js"

/**
 * The game (table) screen (CAM-18 C1-C5, H1/T1-T5, SL1-SL3, E1-E3): paving
 * scene, `AppShell` in its `game` chrome, `TableSurface` composed from the
 * bootstrap snapshot for every phase through to game-over. Follows
 * `room-screen.tsx` throughout: denial states render the no-access recipe,
 * identity resolves in place, the container owns its `AppShell`.
 *
 * Turn-flow/power affordances (`affordancesFor`, H1/T1-T3) drive every
 * interactive element here. `Ended` (E1-E3): the turn indicator announces
 * the call (ephemeral `CambioCalled`, then `phase.calledBy`) before the
 * score sheet's `revealing` entrance renders as a screen-level sibling
 * overlay above the dimmed `TableSurface` — never inside `center`.
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
  /** SL1: the rank the window is matching — fully public
   * (`ViewSlamWindow.rank`), so it's safe straight in the indicator copy. */
  rank?: Rank
  /** F4.1: set for `ResolvingPower`/`ResolvingQueenSwap` so `other-turn`
   * copy can distinguish "playing a power" from an ordinary turn — never
   * names the rank or power itself (F4.3: the non-holder payload carries
   * no card field to name it from). `TurnIndicator`'s 4-state union and
   * its dot styling stay untouched (F4.2) — this is copy-only. */
  resolvingPower?: boolean
}

/** `Rank`'s wire encoding is `"T"` for ten (`GamePrimitives.ts` WIRE_RANKS) —
 * the one rank that needs spelling out for display; every other rank is
 * already its own label. */
function rankLabel(rank: Rank): string {
  return rank === "T" ? "10" : rank
}

/** Reads which player is acting straight off `ViewPhase` — structural field
 * access, never a derived rule (affordance derivation is step 10's job). */
function turnStatus(phase: ViewPhase, viewerId: string | undefined): TurnStatus {
  switch (phase._tag) {
    case "AwaitingDraw":
    case "HoldingCard":
      return {
        state: phase.playerId === viewerId ? "your-turn" : "other-turn",
        activePlayerId: phase.playerId,
      }
    case "ResolvingPower":
    case "ResolvingQueenSwap":
      return {
        state: phase.playerId === viewerId ? "your-turn" : "other-turn",
        activePlayerId: phase.playerId,
        resolvingPower: true,
      }
    case "SlamWindow":
      return { state: "slam-window", activePlayerId: phase.turnPlayerId, rank: phase.rank }
    case "Ended":
      return { state: "game-over", activePlayerId: phase.calledBy }
  }
}

/** voice.md register: player language, sentence case for functional copy —
 * the indicator pairs with `SlamTimer` rather than replacing it
 * (turn-indicator.md), so this only names what's being matched; the "SLAM!"
 * shout itself lives on the timer in poster caps.
 *
 * E1: `game-over` is the OTHER of voice.md's two poster-caps shout moments
 * (a Cambio call, a slam) — the caller's name stays plain sentence case
 * (turn-indicator.md's own "Nadia called Cambio" copy), but "Cambio"
 * itself gets the same display-face treatment as the timer's "SLAM!"
 * banner, `!` included (voice.md: "reserved for the two shout moments").
 * Returns `ReactNode`, not `string`, only for this one case. */
function turnStatusCopy(status: TurnStatus, activePlayerName: string): React.ReactNode {
  switch (status.state) {
    case "your-turn":
      return "Your turn"
    case "other-turn":
      return status.resolvingPower === true
        ? `${activePlayerName} is playing a power card`
        : `${activePlayerName}'s turn`
    case "slam-window":
      return status.rank === undefined
        ? "Slam window open"
        : `Slam window open — match the ${rankLabel(status.rank)}`
    case "game-over":
      // The shout word takes the display face only — the poster shadow
      // reads as mud at the pill's 15px size and pushed the glyphs over
      // the pill's frame (gate fix cycle); the shadow belongs to the
      // SLAM! banner's big display moment, not to inline indicator copy.
      return (
        <>
          {activePlayerName} called <span className="font-display">CAMBIO!</span>
        </>
      )
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

/** F3.1 hint strings, keyed by the holder affordance's `targeting.kind` —
 * spec strings from root plan F3.1, matching the how-to-play guide's
 * powers table verbatim so the two surfaces never drift apart. */
const POWER_HINT_BY_TARGETING: Record<PowerTargeting["kind"], string> = {
  "peek-own": "Peek at one of your own cards",
  "peek-other": "Peek at one of another player's cards",
  "swap-two": "Blind-swap any two held cards",
  "queen-peek": "Peek at any card, then blind-swap any two held cards",
}

/** F3.2: the queen's second step gets its own fixed copy — its affordance
 * carries `targeting: {kind: "swap-two"}` but the guide should read as a
 * continuation of the queen's power, not a plain jack-style swap. */
const QUEEN_SWAP_STEP_HINT = "Now blind-swap any two held cards"

/** F3/D7: derives the holder's power hint from the affordance's
 * `targeting` alone — never from a `card` field, which the
 * `ResolvingQueenSwap` affordance deliberately omits (affordances.ts).
 * Non-holders and every other phase get no hint (F3.4: nothing to derive
 * one from — their payload carries no card field). */
function powerHint(affordances: Affordances): string | undefined {
  if (affordances.phase === "ResolvingPower" && affordances.holder) {
    return POWER_HINT_BY_TARGETING[affordances.targeting.kind]
  }
  if (affordances.phase === "ResolvingQueenSwap" && affordances.holder) {
    return QUEEN_SWAP_STEP_HINT
  }
  return undefined
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
  /** F3 (review fix): the transient public which-slot-was-peeked beat —
   * merged into the selected treatment for the target's hand. */
  publicPeekSlot: SlotRef | null
  onSelectTarget: (ref: SlotRef) => void
  onSwapHeld: (slot: SlotIndex) => void
}): HandWiring {
  const {
    affordances,
    playerId,
    viewerId,
    peekActive,
    selection,
    publicPeekSlot,
    onSelectTarget,
    onSwapHeld,
  } = params
  const selectedSlots = [
    ...selection.filter((ref) => ref.playerId === playerId).map((ref) => ref.slotIndex),
    ...(publicPeekSlot !== null && publicPeekSlot.playerId === playerId
      ? [publicPeekSlot.slotIndex]
      : []),
  ]

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

// ---- hand placement (bench doctrine, ADR-0036, root plan clause 5) ------

/** The hand grows INWARD from its seat's bench (`Bench`, table-geometry) —
 * paired with TableSurface's `seatAnchor="edge"` so the whole seat+hand
 * group grows from the bench anchor toward the table center (CAM-18 gate
 * fix: a centered group escaped the container and occluded the chrome
 * above it). Exact pixel placement is tuned against the rendered table
 * (ADR-0030).
 *
 * CAM-21: at compact this direction is `regular:`-scoped, not unprefixed —
 * compact doesn't render bench placement at all (opponents are a flat
 * wrapping row, table-surface.tsx), so letting a "left"/"right" bench leak
 * into a horizontal (`flex-row`) group there was never a deliberate
 * choice, just unexamined reuse. A horizontal group is ~175px wide vs a
 * vertical one's ~95px (width = pill + gap + hand vs max(pill, hand)) —
 * with 360px to share, that's the difference between 2 opponents fitting
 * on one wrapped line and needing two (measured at the CAM-21 M5 rendered
 * pass: forcing every opponent to the vertical form closes the fold
 * budget for 2–4 players outright). The viewer's own seat is unaffected —
 * it always sits on the bottom bench (the only one whose compact and
 * regular forms coincide) and keeps its vertical form via the `own` flag
 * rather than `bench`. */
const REGULAR_SIDE_FLEX_CLASS: Record<Bench, string> = {
  bottom: "regular:flex-col-reverse",
  top: "regular:flex-col",
  right: "regular:flex-row-reverse",
  left: "regular:flex-row",
}

function SeatWithHand({
  bench,
  own,
  seat,
  hand,
}: {
  bench: Bench
  own: boolean
  seat: React.ReactNode
  hand: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2",
        own ? "flex-col-reverse" : "flex-col",
        REGULAR_SIDE_FLEX_CLASS[bench],
      )}
    >
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
  publicPeekSlot,
  actingPlayerId,
  fizzleMessage,
  commandError,
  slamReveal,
  awaitingGive,
  slamBeatMessage,
  calledBy,
  onSlamExpire,
}: {
  view: PlayerGameView
  viewerId: string
  flights: ReturnType<typeof useGame>["flights"]
  sendCommand: ReturnType<typeof useGame>["sendCommand"]
  peek: ReturnType<typeof useGame>["peek"]
  publicPeekSlot: ReturnType<typeof useGame>["publicPeekSlot"]
  actingPlayerId: ReturnType<typeof useGame>["actingPlayerId"]
  fizzleMessage: ReturnType<typeof useGame>["fizzleMessage"]
  commandError: ReturnType<typeof useGame>["commandError"]
  slamReveal: ReturnType<typeof useGame>["slamReveal"]
  awaitingGive: ReturnType<typeof useGame>["awaitingGive"]
  slamBeatMessage: ReturnType<typeof useGame>["slamBeatMessage"]
  calledBy: ReturnType<typeof useGame>["calledBy"]
  onSlamExpire: ReturnType<typeof useGame>["onSlamExpire"]
}) {
  const [tableRoot, setTableRoot] = React.useState<HTMLElement | null>(null)
  const [confirmCambioOpen, setConfirmCambioOpen] = React.useState(false)

  const viewerIndex = view.players.findIndex((player) => player.id === viewerId)
  // -1 is unreachable: this component only renders once the bootstrap view
  // resolved for an authenticated participant — the Math.max is a
  // type-level fallback, not a live branch (room-screen precedent).
  const viewerSeatIndex = Math.max(0, viewerIndex)
  const benches = benchAssignment(view.players.length, viewerSeatIndex)

  const playerName = (id: string): string =>
    view.players.find((player) => player.id === id)?.name ?? ""

  const ended = view.phase._tag === "Ended"
  // E1: the ephemeral CambioCalled announcement wins ONLY until the
  // snapshot itself catches up — the instant `view.phase` is really
  // `Ended`, `turnStatus` reads `phase.calledBy` directly and this
  // override stops mattering (no separate cleanup needed in the hook).
  const status: TurnStatus =
    calledBy !== null && !ended
      ? { state: "game-over", activePlayerId: calledBy }
      : turnStatus(view.phase, viewerId)
  const indicatorState = status.state === "slam-window" ? "slam-window" : status.state
  const affordances = affordancesFor(view, viewerId)
  // F3: the holder's power hint, gone the instant the phase leaves
  // ResolvingPower/ResolvingQueenSwap — derived fresh every render from
  // the current affordances, persisted nowhere (F3.3).
  const heldCardHint = powerHint(affordances)
  // SL1: fully public, phase-gated (not turn-gated) — every viewer may slam
  // while this is non-null, holder or not.
  const slamPhase = view.phase._tag === "SlamWindow" ? view.phase : undefined

  // T3/T4: two-pick target selection (7/8/9/10 peeks are single-click and
  // never touch this; J and the Queen's second step are two distinct
  // occupied slots, any players). Reset whenever the acting phase changes
  // (the documented React pattern for "adjusting state when a prop
  // changes" — a render-time comparison, not an effect, per
  // frontend-architecture's "derived state is computed during render").
  const phaseKey = `${view.phase._tag}:${"playerId" in view.phase ? view.phase.playerId : ""}`
  const [selection, setSelection] = React.useState<ReadonlyArray<SlotRef>>([])
  const [selectionPhaseKey, setSelectionPhaseKey] = React.useState(phaseKey)
  // SL1: the slammer's own occupied slots become the give-target selection
  // once an opponent-slam's give is owed (H1 `slamGiveSlotRequired`) — reset
  // on the same phase transitions as the power-targeting selection above.
  const [slamPendingGive, setSlamPendingGive] = React.useState<SlotRef | null>(null)
  // CAM-23: arm-first give-pick — "ready mode" gates whether an own-hand tap
  // arms a give-slot (below) instead of attempting an own-card slam
  // (unchanged elsewhere); the armed slot itself survives leaving ready
  // mode, so it can be prepared calmly ahead of spotting a slam and spent
  // later in a single opponent tap. Both reset on the same phase
  // transitions as `selection`/`slamPendingGive` above.
  const [slamReadyMode, setSlamReadyMode] = React.useState(false)
  const [slamArmedGive, setSlamArmedGive] = React.useState<SlotIndex | null>(null)
  if (selectionPhaseKey !== phaseKey) {
    setSelectionPhaseKey(phaseKey)
    setSelection([])
    setSlamPendingGive(null)
    setSlamReadyMode(false)
    setSlamArmedGive(null)
  }

  const viewerHand = view.players.find((player) => player.id === viewerId)?.hand ?? []

  // CAM-23: an armed give-slot can go stale mid-window — any player (not
  // just the viewer) may slam that exact slot away before it's spent. A
  // render-time occupancy check (sibling to the `phaseKey` reset above, but
  // keyed on occupancy rather than phase identity) clears it the moment
  // that happens, rather than letting the control/highlight lie.
  if (
    slamArmedGive !== null &&
    !isOccupiedSlot(view, { playerId: viewerId, slotIndex: slamArmedGive })
  ) {
    setSlamArmedGive(null)
  }

  const handleSlamClick = (ref: SlotRef) => {
    if (slamPendingGive !== null) {
      // Only the slammer's own occupied slots resolve the pending give; any
      // other click while a give is owed is a no-op (the Cancel button is
      // the only other way out — SL1 "keep it minimal").
      if (ref.playerId !== viewerId) return
      sendCommand.mutate({ _tag: "Slam", target: slamPendingGive, giveSlot: ref.slotIndex })
      setSlamPendingGive(null)
      return
    }
    // CAM-23: ready mode claims own-hand taps for arming, ahead of the
    // existing own-slam branch below — this is the disambiguation between
    // "slam my own card" and "arm this as my give" (both target the same
    // gesture; an explicit mode is what tells them apart, see root plan
    // Decision Log).
    if (slamReadyMode && ref.playerId === viewerId) {
      setSlamArmedGive(ref.slotIndex)
      setSlamReadyMode(false)
      return
    }
    if (ref.playerId === viewerId) {
      // Own card: no give ever follows a correct own-slam (cambio-rules).
      // Unaffected by any armed give-slot — if this happens to be the
      // armed slot, the staleness check above cleans it up next render.
      sendCommand.mutate({ _tag: "Slam", target: ref, giveSlot: null })
      return
    }
    if (slamGiveSlotRequired(viewerId, ref.playerId, viewerHand)) {
      if (slamArmedGive !== null) {
        // CAM-23: consume the pre-armed give — the single-tap path this
        // task exists to add.
        sendCommand.mutate({ _tag: "Slam", target: ref, giveSlot: slamArmedGive })
        setSlamArmedGive(null)
        return
      }
      // Nothing armed: fall back to today's two-tap flow. Also drops ready
      // mode, if somehow still engaged — ready mode and a pending fallback
      // target are mutually exclusive (root plan clause 9).
      setSlamPendingGive(ref)
      setSlamReadyMode(false)
    } else {
      // Zero-card slammer (ADR-0009): the server draws-then-gives, unseen —
      // `giveSlot` stays null even though a give still happens.
      sendCommand.mutate({ _tag: "Slam", target: ref, giveSlot: null })
    }
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
  const reshuffling = flights.active.some(
    (flight) => flight.originId === "discard" && flight.destinationId === "deck",
  )
  const receiving = flights.active.some((flight) => flight.destinationId === "discard")

  const facesFor = (playerId: string): ReadonlyArray<HandFace> => {
    const faces: HandFace[] = []
    if (peek !== null && peek.target.playerId === playerId) {
      faces.push({ slotIndex: peek.target.slotIndex, card: peek.card, peeking: true })
    }
    // SL2: both a correct and an incorrect slam reveal (§1.5) — a plain "up"
    // face, never "peeking" (that state is the private memory-fidelity
    // hold; this reveal is public).
    if (slamReveal !== null && slamReveal.target.playerId === playerId) {
      faces.push({ slotIndex: slamReveal.target.slotIndex, card: slamReveal.card })
    }
    return faces
  }

  const seatNodes = view.players.map((player, index) => {
    const own = index === viewerSeatIndex
    const bench = benches[index] ?? "bottom"
    // ADR-0036 §5 / decision 5: a side-bench opponent's hand reads rotated
    // along its bench. The viewer's own hand is never on a side bench
    // (decision 2's hang-below exception keeps it on `bottom`), so this
    // never needs to special-case `own`.
    const rotate =
      bench === "left" ? ("left" as const) : bench === "right" ? ("right" as const) : undefined
    const wiring = handSlotWiring({
      affordances,
      playerId: player.id,
      viewerId,
      peekActive: peek !== null,
      selection,
      publicPeekSlot,
      onSelectTarget: handleSelectTarget,
      onSwapHeld: handleSwapHeld,
    })
    // SL1: slamming is phase-gated only — every viewer may slam any
    // face-down card in any hand while the window is open, turn or no turn.
    // A pending give narrows clicks to the slammer's own hand (the Cancel
    // affordance below is the only other way out of that sub-state).
    const slamOnSlotClick =
      slamPhase !== undefined && (slamPendingGive === null || player.id === viewerId)
        ? (slotIndex: SlotIndex) => handleSlamClick({ playerId: player.id, slotIndex })
        : undefined
    const seatState =
      player.id === actingPlayerId
        ? "acting"
        : status.activePlayerId === player.id
          ? "active-turn"
          : "default"
    // SL2: the slot a correct opponent-slam vacated renders as a vacancy
    // (Hand's `awaitingGiveSlot` ring only applies to the empty-slot branch)
    // until the give lands and the refetch catches occupancy up — the
    // client-side snapshot is otherwise untouched (ADR-0033).
    const handSlots =
      awaitingGive !== null && awaitingGive.playerId === player.id
        ? player.hand.filter((slotIndex) => slotIndex !== awaitingGive.slotIndex)
        : player.hand
    return (
      <SeatWithHand
        key={player.id}
        bench={bench}
        own={own}
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
            slots={handSlots}
            faces={facesFor(player.id)}
            {...(rotate !== undefined ? { rotate } : {})}
            inert={!wiring.interactive && slamOnSlotClick === undefined}
            // CAM-23: the armed give-slot renders with the same
            // `selectedSlots` treatment `Hand` already uses for an
            // in-progress power-target pick — `wiring.selectedSlots` is
            // always empty for the viewer's own seat while a SlamWindow is
            // open (it only ever holds power-targeting/peek state), so
            // there's nothing to de-duplicate against.
            selectedSlots={
              own && slamArmedGive !== null
                ? [...wiring.selectedSlots, slamArmedGive]
                : wiring.selectedSlots
            }
            {...(slamPhase !== undefined ? { slamWindow: true } : {})}
            {...(awaitingGive !== null && awaitingGive.playerId === player.id
              ? { awaitingGiveSlot: awaitingGive.slotIndex }
              : {})}
            {...(slamOnSlotClick !== undefined
              ? { onSlotClick: slamOnSlotClick }
              : wiring.onSlotClick !== undefined
                ? { onSlotClick: wiring.onSlotClick }
                : {})}
          />
        }
      />
    )
  })

  return (
    // Unconditionally relative (CAM-21, was `regular:relative`): the
    // positioned ancestor for both the bounded stage below and the
    // regular docked Call Cambio affordance (bottom-right of the whole
    // stage column). `flex-1 min-h-0` now stay LIVE at regular too
    // (CAM-20/ADR-0036 clause 9: `regular:flex-initial`/
    // `regular:min-h-auto` used to cancel them here, restoring the OLD
    // regular layout CAM-21 deliberately pinned as "regular untouched" —
    // this task revises that on purpose so the stage actually claims the
    // screen wrapper's bounded height instead of growing to fit content).
    <div className="relative flex w-full flex-1 min-h-0 flex-col items-center gap-4">
      {/* Top band (root plan clause 2, CAM-21): turn indicator, slam timer,
          and every inline message pin here — none of them can leave the
          viewport while the game screen is mounted. `regular:contents`
          dissolves the wrapper at regular so its children resume being
          plain stage flex items (a `contents` element is never a
          positioned ancestor, so nothing else shifts); `regular:order-*`
          on each restores today's exact stage sequence. */}
      <div
        data-region="chrome"
        className="flex shrink-0 flex-col items-center gap-4 regular:contents"
      >
        <TurnIndicator state={indicatorState}>
          {turnStatusCopy(status, playerName(status.activePlayerId))}
        </TurnIndicator>
        {slamPhase !== undefined ? (
          // SL1/SL2: pairs with the indicator above, never replaces it
          // (turn-indicator.md) — `resolving` pauses the drain visually while
          // a slam's public reveal plays; the drain math itself never resets
          // (ADR-0011 fixed `closesAt`, unaffected by `resolving`).
          <SlamTimer
            window={{ closesAt: slamPhase.closesAt, durationMs: view.config.slamWindowMs }}
            resolving={slamReveal !== null}
            onExpire={onSlamExpire}
            className="regular:order-1"
          />
        ) : null}
        {/* E3: slam/peek/turn ephemera are ignored once the game has ended —
            a beat that happened to still be showing when the call landed
            must not render on top of the score-sheet overlay below. */}
        {!ended && slamBeatMessage !== null ? (
          <p className="font-ui text-sm text-ink-muted regular:order-4">{slamBeatMessage}</p>
        ) : null}
        {!ended && commandError !== null ? (
          <p role="alert" className="font-ui text-sm text-accent-alarm-deep regular:order-7">
            {commandError}
          </p>
        ) : null}
        {!ended && fizzleMessage !== null ? (
          <p className="font-ui text-sm text-ink-muted regular:order-8">{fizzleMessage}</p>
        ) : null}
      </div>
      {/* Middle region (root plan clause 4, CAM-21): stays the flight root
          and the ScoreSheet overlay's positioning box (ADR-0034/0035 —
          zero flight-layer churn, no transform anywhere in this chain).
          A bounded flex column of (a) the ONLY element that ever
          scrolls — the opponents/table/art, and (b) the extracted own
          seat, docked directly beneath it (the dock's hand half).
          CAM-20/ADR-0036 clause 9: `regular:block`/`regular:flex-initial`/
          `regular:min-h-auto` used to cancel flex here, restoring the OLD
          regular layout (CAM-21 pinned "regular untouched" for exactly
          these three utilities) — this task deliberately revises that.
          Table-root now stays a REAL flex column at regular too, so
          TableSurface (the scroll wrapper's only child, hoisted by its
          own `regular:contents` below) can be given `flex-1` and grow to
          fill whatever height this element has. The extracted own-seat
          wrapper right below is `shrink-0` AND `regular:absolute` at
          regular (out of flow there), so TableSurface is the only
          in-flow flex child at regular — its resolved box exactly
          coincides with table-root's own (same top edge, same height),
          which is what keeps the own-seat wrapper's bench percentages
          (measured against table-root) aligned with TableSurface's
          benches (see the wrapper's own comment below). */}
      <div
        ref={setTableRoot}
        data-region="table-root"
        // `gap-2` (not the stage's `gap-4`, CAM-21): compact has TWO
        // in-flow children (the scroll wrapper + the own-seat wrapper
        // below, both still in-flow there) — the gap separates them for
        // the fold budget. At regular the scroll wrapper dissolves
        // (`regular:contents`) and the own-seat wrapper goes
        // `regular:absolute`, leaving TableSurface the only in-flow flex
        // child (see the comment above) — `gap` has nothing to apply
        // between there, inert but harmless.
        className="relative flex w-full flex-1 min-h-0 flex-col items-center gap-2 regular:order-9"
      >
        <div
          data-region="table-scroll"
          // CAM-27/ADR-0038: `flex flex-col` (was a plain block box) so
          // `TableSurface`'s root below can actually become a flex ITEM of
          // this element and claim its real available height via its own
          // `flex-1` — a `flex-1` on a non-flex-item child of a block
          // parent has no effect. `regular:contents` already dissolves
          // this element's own box (and therefore its `display` value)
          // entirely at regular, so this addition is inert there.
          className="flex w-full flex-1 min-h-0 flex-col overflow-y-auto regular:contents"
        >
          <TableSurface
            state={ended ? "game-over" : "in-game"}
            viewerSeatIndex={viewerSeatIndex}
            seats={seatNodes}
            seatAnchor="edge"
            viewerSeat="external"
            center={
              // CAM-21 design-gate fix, numbers re-derived after CAM-20's
              // fix pass raised the compact art cap to 158px (review F10c):
              // the painted disc is now ~85px (TABLE_DISC_FRACTION 0.54).
              // gap-4 would put the deck+discard pair at 80px — a ~2.6px
              // margin per side, still cramped against the disc's painted
              // edge — so compact keeps gap-1 (pair at 68px, clear air);
              // regular keeps gap-4 (its disc has plenty of room).
              <div className="flex items-center gap-1 regular:gap-4">
                <DrawDeck
                  count={view.deckCount}
                  {...(reshuffling
                    ? { state: "reshuffling" as const }
                    : drawing
                      ? { state: "draw" as const }
                      : {})}
                  {...(slamPhase !== undefined ? { slamWindow: true } : {})}
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
                  {...(slamPhase !== undefined ? { slamTarget: true } : {})}
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
                    {...(heldCardHint !== undefined ? { hint: heldCardHint } : {})}
                  />
                ) : null}
              </div>
            }
          />
        </div>
        {/* The viewer's own seat, extracted from TableSurface (root plan
            clause 3): reuses the exact `bottom`-bench POSITION
            (`BENCH_POSITION_CLASS`) TableSurface imports from the same
            module and would have applied itself — one shared source, no
            hand-copied position, no reproduced geometry call (decision 3).
            The vertical TRANSLATE diverges from `BENCH_ANCHOR_CLASS.bottom`
            by one 4px spacing step (CAM-20 gate fix, finding 1 — see the
            wrapper's own comment below); the shared constant itself is
            untouched and TableSurface's internal seatWrapper still uses it
            unmodified for the room screen's own-seat pill. Landing INSIDE
            this middle div,
            after the scroll wrapper, keeps every flight anchor a
            descendant of `tableRoot` with zero flight-layer churn —
            clause 5 by containment, not by moving the ref. Compact:
            `shrink-0` so the scroll region above absorbs any squeeze,
            never the dock. Bench placement is entirely `regular:`-scoped
            Tailwind classes now (no inline ring-point percentages) — the
            old hazard of `position: relative` reviving stray inline
            offsets at compact no longer applies by construction, but this
            OUTER div still carries no unprefixed position of its own; the
            INNER div is the positioning context for the game-over rest.
            The rest is COMPACT-ONLY (`regular:hidden`, review F2): at
            regular this wrapper is `regular:z-10`, a stacking context
            that TableSurface's own full-region z-20 rest paints OVER
            wherever the seat overlaps the square — so an always-on copy
            here DOUBLE-dims that overlap (~0.58 combined vs the
            pre-CAM-21 0.35) and dims the below-square overhang the
            pre-change rendering left undimmed. Hiding it at regular
            reproduces the pre-change regular game-over exactly (surface
            rest alone: 35% inside the square, 0 below — that boundary is
            pre-existing, not this task's seam to fix). At compact the
            wrapper sits entirely outside the square, gets no share of
            the surface's rest, and needs this copy — same
            z-20/`green-deep`/35% treatment, scoped to this wrapper. */}
        <div
          data-seat-index={viewerSeatIndex}
          className={cn(
            "shrink-0 regular:absolute regular:z-10",
            BENCH_POSITION_CLASS.bottom,
            // CAM-20 gate fix (regular, finding 1): `BENCH_ANCHOR_CLASS.bottom`
            // centers the group with a plain `-translate-y-1/2`, which measured
            // 3px past the 900px regular reference viewport (the pill's bottom
            // border + its 3x3 hard shadow), clipped by the screen wrapper's
            // `overflow-hidden` ancestor — undetected because nothing pinned
            // the actual bottom coordinate. Nudged up by one 4px spacing step
            // beyond that translate, scoped to THIS wrapper only (not the
            // shared constant — table-surface.tsx's own internal seatWrapper
            // reuses `BENCH_ANCHOR_CLASS.bottom` unmodified for the room
            // screen's own-seat pill, which this task's finding never flagged).
            "regular:-translate-x-1/2 regular:translate-y-[calc(-50%-4px)]",
          )}
        >
          <div className="relative">
            {seatNodes[viewerSeatIndex]}
            {ended ? (
              <div
                aria-hidden
                data-region="own-seat-rest"
                className="pointer-events-none absolute inset-0 z-20 bg-(--green-deep)/35 regular:hidden"
              />
            ) : null}
          </div>
        </div>
        <FlightLayer root={tableRoot} active={flights.active} onSettle={flights.settle} />
        {ended && view.reveal !== undefined ? (
          // E3, hazard 4 (decided): the score sheet is a SCREEN-LEVEL
          // SIBLING OVERLAY above `TableSurface`, never inside `center` —
          // `center`'s content stays beneath the game-over scrim as the
          // dimmed tabletop (table-surface.md: "table is ground, not
          // HUD"). Placed after `FlightLayer` in DOM order (both are
          // z-index:auto, sharing this `relative` div's stacking context)
          // so it paints above the whole table without needing to fight
          // TableSurface's own internal `regular:z-10` seat layer.
          <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto p-4">
            <ScoreSheet
              reveal={view.reveal}
              playerName={playerName}
              revealing
              className="max-h-full overflow-y-auto"
              // Exactly one exit (E3, v0 decision), ON the panel surface so
              // it groups with the scores (gate D2 fix).
              footer={
                <Button asChild variant="secondary">
                  <RouterLink to="/">Back to the lobby</RouterLink>
                </Button>
              }
            />
          </div>
        ) : null}
      </div>
      {/* Bottom dock (root plan clause 3, CAM-21): every action affordance,
          pinned beneath the own-hand row above so the whole dock reads as
          one thumb-reachable unit — explicitly reversing CAM-18's "compact
          keeps Call Cambio in flow" call (root plan Decision Log; the
          playtest finding that the actionable chrome went invisible mid-
          scroll is what justifies it). `regular:contents` + `regular:order-*`
          restore today's exact stage sequence at regular, same mechanism
          as the top band above. */}
      <div
        data-region="dock-actions"
        className="flex shrink-0 flex-col items-center gap-4 regular:contents"
      >
        {/* CAM-23: lets the slammer pre-arm which own card they'll give ahead
            of spotting an opponent to slam, so the opponent tap itself fires
            in one action. Hidden while the two-tap fallback (below) already
            holds a pending target — the two sub-states are mutually
            exclusive (root plan clause 9), and showing both prompts at once
            would be confusing. */}
        {slamPhase !== undefined && slamPendingGive === null && viewerHand.length > 0 ? (
          <div className="flex items-center gap-2 regular:order-2">
            {slamArmedGive !== null ? (
              <Button variant="ghost" onClick={() => setSlamArmedGive(null)}>
                Cancel give
              </Button>
            ) : slamReadyMode ? (
              <Button variant="ghost" onClick={() => setSlamReadyMode(false)}>
                Cancel
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setSlamReadyMode(true)}>
                Ready a give
              </Button>
            )}
          </div>
        ) : null}
        {slamPendingGive !== null ? (
          <div className="flex items-center gap-2 regular:order-3">
            <p className="font-ui text-sm text-ink-primary">
              If you&apos;re right, which card do you give them?
            </p>
            <Button variant="ghost" onClick={() => setSlamPendingGive(null)}>
              Cancel
            </Button>
          </div>
        ) : null}
        {affordances.phase === "AwaitingDraw" && affordances.holder ? (
          // The call affordance docks by the viewer's own hand at regular —
          // it is the VIEWER's action (gate fix: the tall top stack pushed
          // the viewer's own seat below the fold). Compact: part of the
          // bottom dock, alongside the hand it belongs to (root plan
          // Decision Log — this reverses CAM-18's "compact keeps it in
          // flow" call).
          //
          // CAM-20 gate fix (regular, finding 2): this element's DOM
          // location (inside dock-actions, `regular:contents`-dissolved)
          // must stay put — `dockActions().contains(callCambio)` is an
          // existing structural pin (game-screen.test.tsx) and the exact
          // reason "part of the bottom dock" holds at compact — so it still
          // resolves `position:absolute` against the STAGE (this component's
          // outer `relative` div), not against `table-root`. The own-seat
          // group is centered at the stage's horizontal midline (same
          // centerline table-root and the stage share, both `w-full`), so
          // `left: calc(50% + …)` reaches it without needing table-root as
          // an ancestor. The own hand's row width caps at 6 columns
          // (hand.tsx `ROW_WIDTH`) regardless of card count — extra cards
          // ADD ROWS, never extra width — so 6 × card-lg's regular width
          // (2×`--spacing-7` = 96px) + 5 × the grid's own gap (`gap-2` =
          // 8px) = 616px is the true CEILING on the hand's rendered width,
          // not an approximation: half of that (308px) plus one `gap-4`
          // step (16px) places the button just outside the widest hand this
          // component ever renders. Shorter hands (4 or 5 cards, 408px/
          // 512px) leave a bigger but still small gap (~100-150px) instead
          // of a fixed corner 260-415px away — measured live at a 4-card
          // hand: gap dropped from 260.5px to well under 150px. A true
          // pixel-exact dock would need JS measurement of the rendered hand
          // (no existing breakpoint-aware measurement hook exists in this
          // codebase, and `window.matchMedia` isn't polyfilled in the
          // jsdom test environment) — out of proportion for a reposition-
          // only fix; this CSS-only approximation is bounded and correct
          // for the common (5+ card) case.
          <div className="regular:absolute regular:bottom-5 regular:left-[calc(50%+324px)] regular:z-20 regular:order-5">
            <Button variant="danger" onClick={() => setConfirmCambioOpen(true)}>
              Call Cambio
            </Button>
          </div>
        ) : null}
        {affordances.phase === "HoldingCard" && affordances.holder ? (
          <div className="flex items-center justify-center gap-2 regular:order-6">
            {affordances.discardHeld ? (
              <Button
                variant="secondary"
                onClick={() => sendCommand.mutate({ _tag: "DiscardHeld" })}
              >
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
  const [helpOpen, setHelpOpen] = React.useState(false)
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
    publicPeekSlot,
    actingPlayerId,
    fizzleMessage,
    commandError,
    slamReveal,
    awaitingGive,
    slamBeatMessage,
    calledBy,
    onSlamExpire,
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
        publicPeekSlot={publicPeekSlot}
        actingPlayerId={actingPlayerId}
        fizzleMessage={fizzleMessage}
        commandError={commandError}
        slamReveal={slamReveal}
        awaitingGive={awaitingGive}
        slamBeatMessage={slamBeatMessage}
        calledBy={calledBy}
        onSlamExpire={onSlamExpire}
      />
    )
  } else {
    content = <GameSkeleton />
  }

  return (
    <AppShell
      scene="paving"
      state="game"
      connection={connection}
      onHelp={() => setHelpOpen(true)}
    >
      {/* CAM-21: the viewport bound lives HERE, not on AppShell —
          lobby/room screens don't use this wrapper and inherit nothing
          (root plan decision 1). `max-h-dvh` + the `min-h-0` flex chain
          give GameTable's stage a real height to bound itself against.
          CAM-20/ADR-0036 clause 9 EXTENDS the bound to `regular` (was
          compact-only; `regular:max-h-none`/`regular:overflow-visible`
          used to cancel it and let this screen scroll the page normally
          there) — the fluid table needs a real, bounded height to grow
          into at every breakpoint, not just compact's fold. Only the
          padding restores at regular now (`regular:py-4`), a visual
          choice independent of the bound itself. Known residual:
          `max-h-dvh` ignores the shell's safe-area inset padding, so on
          notched devices the bound is generous by that amount; exact at
          the 360×640 floor. `py-2` (design-gate fix, was `py-0`, CAM-21):
          the scroll region (table-root's `table-scroll`) is flex-grown
          past its own content at 2–4 players by ~53px — unclaimed slack,
          not a decision — which left the pinned top/bottom bands flush
          with the viewport edges and clipped the dock's button shadow.
          This claims 16px of that same slack as real padding instead
          (verified at CAM-21 for the then-supported 2–5; CAM-20 re-
          verifies the fold at M6 with the row-major hand, bench layout,
          and the regular bound extended here). */}
      {/* `justify-center` is inert for the game state (GameTable's stage is
          `flex-1`) but still centers every non-stage state — skeleton,
          no-access, error — so it stays (review F5.6 called it dead; it is
          only conditionally so). */}
      <div className="flex max-h-dvh w-full flex-1 min-h-0 flex-col justify-center gap-4 overflow-hidden px-4 py-2 regular:py-4">
        {ownHeading ? null : <h1 className="sr-only">Game</h1>}
        {content}
      </div>
      <HowToPlayGuide open={helpOpen} onClose={() => setHelpOpen(false)} />
    </AppShell>
  )
}
