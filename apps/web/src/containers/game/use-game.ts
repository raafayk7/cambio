import {
  decodePlayerGameEventEither,
  decodeRoomGameEventEither,
  decodeViewResponse,
  decodeGameReply,
  encodeWireCommand,
  type CardSlug,
  type GameReply,
  type PlayerGameEvent,
  type RoomGameEvent,
  type SlotRef,
  type ViewResponse,
  type WireCommand,
} from "@cambio/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"

import { slotAnchorId } from "../../components/game/flight/anchors.js"
import { useFlights } from "../../components/game/flight/flight-layer.js"
import { useSession } from "../../hooks/use-session.js"
import { ApiError, apiRequest } from "../../services/api.js"
import { subscribeTopic } from "../../services/realtime.js"

/**
 * The game surface's logic (CAM-18 C1-C5), co-located with its one consumer
 * per the frontend-architecture co-location rule. Shape follows
 * `../room/use-room.ts` throughout.
 *
 * ADR-0033 governs state sync: the versioned `PlayerGameView` — from
 * `GET /games/:gameId/view` or a command's own `GameReply` — is the ONLY
 * state source. Every decoded broadcast (room or player channel) does two
 * things only: enqueue future choreography (peek/flight/reveal display
 * state — scaffolded here, fleshed out by later steps) and schedule ONE
 * debounced refetch per event batch. No broadcast payload is ever written
 * into the snapshot.
 */

export type GameDenial = "no-access"

/** One GET per event batch, not per event (ADR-0033 C2) — a single command
 * can publish 5+ events; the trailing debounce coalesces them. */
const REFETCH_DEBOUNCE_MS = 100

/**
 * Mirrors `--duration-peek` (`packages/ui/src/styles.css`, tokens.md
 * `duration.peek` = 2800ms, playing-card.md r2): kept as a plain constant
 * rather than read from CSS at runtime, because this drives a JS
 * `setTimeout` for the T4 peek-reveal state machine, not a CSS transition —
 * a runtime `getComputedStyle` read (the `Modal` `snapMs()` precedent)
 * would need the exact same hardcoded jsdom fallback anyway, for no gain in
 * testability. Keep in sync by hand if the token's value ever changes.
 * Also doubles as the "briefly" duration for the public acting/fizzle beats
 * (T3, CardPeeked/CardsBlindSwapped/PowerFizzled) — there is no separate
 * token for those, and reusing this one avoids inventing an unspecified
 * timing value.
 */
const PEEK_DURATION_MS = 2800

/** T4: one player's own entitled peek, live for `PEEK_DURATION_MS` then
 * deleted — never re-rendered (memory fidelity, cambio-rules). */
interface PeekReveal {
  readonly target: SlotRef
  readonly card: CardSlug
}

/** T5: a 422's tag mapped to voice.md-register inline copy. Every tag not
 * listed here (this milestone doesn't reach slam/endgame tags) falls back
 * to a generic sentence — the table has already been refreshed either way. */
const COMMAND_ERROR_COPY: Record<string, string> = {
  NotYourTurn: "It's not your turn — the table has been refreshed.",
  WrongPhase: "That move isn't available right now — the table has been refreshed.",
  SlamTooLate: "The slam window had already closed — the table has been refreshed.",
}

function commandErrorCopy(error: unknown): string {
  if (error instanceof ApiError) {
    return (
      COMMAND_ERROR_COPY[error.tag] ?? "That move didn't go through — the table has been refreshed."
    )
  }
  return "That move didn't go through — the table has been refreshed."
}

const gameQueryKey = (gameId: string) => ["game", gameId] as const

/**
 * The version guard (ADR-0033): an incoming response applies only when its
 * version is strictly greater than the last one this hook has seen —
 * versions, not arrival order, decide. One comparison, used by both the
 * bootstrap/refetch query path and the command `GameReply` path below, so
 * there is exactly one place that can get the guard wrong.
 */
function isNewerVersion(lastVersion: number, incomingVersion: number): boolean {
  return incomingVersion > lastVersion
}

export function useGame(gameId: string) {
  const queryClient = useQueryClient()
  const { session, createUser } = useSession()
  const flights = useFlights()

  const [denial, setDenial] = React.useState<GameDenial | null>(null)
  // Advanced ONLY by HTTP responses (query data and command GameReplies) —
  // never by a broadcast, which carries no version at all (ADR-0033).
  const lastVersionRef = React.useRef(-1)

  const authenticated = session.data?.state === "authenticated"
  const viewerId = session.data?.state === "authenticated" ? session.data.user.userId : undefined

  const queryKey = gameQueryKey(gameId)

  const view = useQuery({
    queryKey,
    enabled: authenticated && denial === null,
    retry: false,
    queryFn: async (): Promise<ViewResponse> => {
      const response = await apiRequest(`/games/${gameId}/view`, { decode: decodeViewResponse })
      if (!isNewerVersion(lastVersionRef.current, response.version)) {
        // A stale response (an in-flight refetch overtaken by a newer
        // command reply) must never regress the cache — keep what's there.
        return queryClient.getQueryData<ViewResponse>(queryKey) ?? response
      }
      lastVersionRef.current = response.version
      return response
    },
  })

  // 404 is byte-identical for an unknown id and a non-participant (root
  // C3) — one honest no-access denial. Unlike the room, there is no
  // join-on-visit recovery: a game either has you seated or it doesn't.
  React.useEffect(() => {
    if (denial !== null) return
    if (view.error instanceof ApiError && view.error.status === 404) {
      setDenial("no-access")
    }
  }, [view.error, denial])

  // Debounced refetch authority (C2, ADR-0033): every decoded broadcast
  // schedules this, never applies its payload to the snapshot directly.
  const refetchRef = React.useRef(view.refetch)
  refetchRef.current = view.refetch
  const refetchTimeoutRef = React.useRef<number | null>(null)

  const scheduleRefetch = React.useCallback(() => {
    if (refetchTimeoutRef.current !== null) window.clearTimeout(refetchTimeoutRef.current)
    refetchTimeoutRef.current = window.setTimeout(() => {
      refetchTimeoutRef.current = null
      void refetchRef.current()
    }, REFETCH_DEBOUNCE_MS)
  }, [])

  React.useEffect(() => {
    return () => {
      if (refetchTimeoutRef.current !== null) window.clearTimeout(refetchTimeoutRef.current)
    }
  }, [])

  // ---- ephemeral display state (hazard 3, C5, T3-T5): React state that
  // never touches the query cache — a peek/beat/error lives here for its
  // own duration and is cleared by its own timer. Timers are mirrored
  // nowhere special because each already clears itself on unmount below
  // (the `useFlights` unmount trap only matters for state a *different*
  // effect reads on cleanup; these read their own ref directly).

  const playersRef = React.useRef<ReadonlyArray<{ id: string; name: string }>>([])
  playersRef.current = view.data?.view.players ?? []

  const nextFlightIdRef = React.useRef(0)
  const nextFlightId = () => `flight-${(nextFlightIdRef.current += 1)}`

  // T4: PrivateCardPeeked flips the target slot up for PEEK_DURATION_MS,
  // then the entry is deleted — never to return (memory fidelity). The
  // Queen's own peek uses the exact same entry; `ResolvingQueenSwap`
  // targeting stays disabled by the screen while this is non-null, which is
  // what makes "the player swaps from memory" (round-1 decision) hold.
  const [peek, setPeek] = React.useState<PeekReveal | null>(null)
  const peekTimeoutRef = React.useRef<number | null>(null)

  // T3: the public "seat acting" beat (a peek's target, a fizzle) — one
  // seat at a time is enough for this milestone; a second simultaneous beat
  // is a rare visual nicety, never a correctness concern (nothing hidden
  // rides on it).
  const [actingPlayerId, setActingPlayerId] = React.useState<string | null>(null)
  const actingTimeoutRef = React.useRef<number | null>(null)

  // T3: PowerFizzled's public no-op beat (voice.md: "fizzle", never
  // "cancel"/"skip").
  const [fizzleMessage, setFizzleMessage] = React.useState<string | null>(null)
  const fizzleTimeoutRef = React.useRef<number | null>(null)

  // T5: the last command failure, surfaced inline near the action — never a
  // toast (toast.md law). Cleared at the start of every new attempt.
  const [commandError, setCommandError] = React.useState<string | null>(null)

  React.useEffect(() => {
    return () => {
      if (peekTimeoutRef.current !== null) window.clearTimeout(peekTimeoutRef.current)
      if (actingTimeoutRef.current !== null) window.clearTimeout(actingTimeoutRef.current)
      if (fizzleTimeoutRef.current !== null) window.clearTimeout(fizzleTimeoutRef.current)
    }
  }, [])

  function pulseSeat(playerId: string) {
    if (actingTimeoutRef.current !== null) window.clearTimeout(actingTimeoutRef.current)
    setActingPlayerId(playerId)
    actingTimeoutRef.current = window.setTimeout(() => {
      actingTimeoutRef.current = null
      setActingPlayerId(null)
    }, PEEK_DURATION_MS)
  }

  // CH1 (T2/T3): one handler per room event, enqueuing flights/beats THEN
  // (back at the call site below) scheduling the refetch — ADR-0033: a
  // flight spec references only the event's own payload, never live state.
  // Slam/reshuffle/endgame tags (M5/M6) fall through to `default`: out of
  // this milestone's scope, so the generic refetch is their entire handling
  // for now (the screen renders whatever minimal branch M3 left for them).
  function handleRoomEvent(event: RoomGameEvent) {
    switch (event._tag) {
      case "CardDrawn":
        flights.enqueue({
          id: nextFlightId(),
          face: { face: "down" },
          originId: "deck",
          destinationId: "held",
        })
        break
      case "DiscardTaken":
        flights.enqueue({
          id: nextFlightId(),
          face: { face: "up", card: event.card },
          originId: "discard",
          destinationId: "held",
        })
        break
      case "HeldSwapped": {
        const slot = slotAnchorId(event.playerId, event.slotIndex)
        flights.enqueue({
          id: nextFlightId(),
          face: { face: "down" },
          originId: "held",
          destinationId: slot,
        })
        flights.enqueue({
          id: nextFlightId(),
          face: { face: "up", card: event.discarded },
          originId: slot,
          destinationId: "discard",
        })
        break
      }
      case "HeldDiscarded":
        flights.enqueue({
          id: nextFlightId(),
          face: { face: "up", card: event.card },
          originId: "held",
          destinationId: "discard",
        })
        break
      case "PowerDiscarded":
        flights.enqueue({
          id: nextFlightId(),
          face: { face: "up", card: event.card },
          originId: "held",
          destinationId: "discard",
        })
        break
      case "HeldKept": {
        const slot = slotAnchorId(event.playerId, event.slotIndex)
        flights.enqueue({
          id: nextFlightId(),
          face: { face: "down" },
          originId: "held",
          destinationId: slot,
        })
        break
      }
      case "CardsBlindSwapped": {
        const firstSlot = slotAnchorId(event.first.playerId, event.first.slotIndex)
        const secondSlot = slotAnchorId(event.second.playerId, event.second.slotIndex)
        flights.enqueue({
          id: nextFlightId(),
          face: { face: "down" },
          originId: firstSlot,
          destinationId: secondSlot,
        })
        flights.enqueue({
          id: nextFlightId(),
          face: { face: "down" },
          originId: secondSlot,
          destinationId: firstSlot,
        })
        break
      }
      case "CardPeeked":
        pulseSeat(event.target.playerId)
        break
      case "PowerFizzled": {
        pulseSeat(event.playerId)
        const name = playersRef.current.find((player) => player.id === event.playerId)?.name
        if (fizzleTimeoutRef.current !== null) window.clearTimeout(fizzleTimeoutRef.current)
        setFizzleMessage(`${name ?? "A player"}'s power fizzled — no legal target.`)
        fizzleTimeoutRef.current = window.setTimeout(() => {
          fizzleTimeoutRef.current = null
          setFizzleMessage(null)
        }, PEEK_DURATION_MS)
        break
      }
      default:
        break
    }
  }

  function handlePlayerEvent(event: PlayerGameEvent) {
    switch (event._tag) {
      case "PrivateCardPeeked":
        if (peekTimeoutRef.current !== null) window.clearTimeout(peekTimeoutRef.current)
        setPeek({ target: event.target, card: event.card })
        peekTimeoutRef.current = window.setTimeout(() => {
          peekTimeoutRef.current = null
          setPeek(null)
        }, PEEK_DURATION_MS)
        break
      case "PrivateCardDrawn":
        // The holder's own phase already carries this value structurally
        // (`ViewPhase.HoldingCard.card`) — nothing extra to display.
        break
    }
  }

  // Handlers are redefined every render (they close over this render's
  // `flights`/setters) but the subscription effect below only re-runs when
  // the topics themselves change — refs carry the latest handler across
  // renders without adding them to that effect's dependency array (the
  // `refetchRef` pattern above; no `exhaustive-deps` rule is registered in
  // this repo, so this is a documented deliberate choice, not a lint dodge).
  const handleRoomEventRef = React.useRef(handleRoomEvent)
  handleRoomEventRef.current = handleRoomEvent
  const handlePlayerEventRef = React.useRef(handlePlayerEvent)
  handlePlayerEventRef.current = handlePlayerEvent

  // Live subscriptions (C1/C2): effect-scoped, both granted topics dropped
  // on unmount. Every decoded broadcast enqueues its choreography (via the
  // refs above) THEN discharges its ADR-0033 duty: schedule the one
  // debounced refetch, touch nothing else in the snapshot.
  const roomTopic = view.data?.grants.roomTopic
  const playerTopic = view.data?.grants.playerTopic
  React.useEffect(() => {
    if (roomTopic === undefined || playerTopic === undefined) return
    const unsubscribeRoom = subscribeTopic(roomTopic, {
      onEvent: (_event, payload) => {
        const decoded = decodeRoomGameEventEither(payload)
        if (decoded._tag !== "Right") return
        handleRoomEventRef.current(decoded.right)
        scheduleRefetch()
      },
      onResubscribe: () => {
        scheduleRefetch()
      },
    })
    const unsubscribePlayer = subscribeTopic(playerTopic, {
      onEvent: (_event, payload) => {
        const decoded = decodePlayerGameEventEither(payload)
        if (decoded._tag !== "Right") return
        handlePlayerEventRef.current(decoded.right)
        scheduleRefetch()
      },
      onResubscribe: () => {
        scheduleRefetch()
      },
    })
    return () => {
      unsubscribeRoom()
      unsubscribePlayer()
    }
  }, [roomTopic, playerTopic, scheduleRefetch])

  const sendCommand = useMutation({
    mutationFn: (command: WireCommand) =>
      apiRequest(`/games/${gameId}/commands`, {
        method: "POST",
        body: encodeWireCommand(command),
        decode: decodeGameReply,
      }),
    onMutate: () => {
      setCommandError(null)
    },
    onSuccess: (reply: GameReply) => {
      if (!isNewerVersion(lastVersionRef.current, reply.version)) return
      lastVersionRef.current = reply.version
      queryClient.setQueryData<ViewResponse>(queryKey, (previous) =>
        previous === undefined
          ? previous
          : { ...previous, view: reply.view, version: reply.version },
      )
    },
    onError: (error: unknown) => {
      // T5: a 422 (or any command failure) never breaks the table — resync
      // first, then surface the failure inline (never a toast).
      scheduleRefetch()
      setCommandError(commandErrorCopy(error))
    },
  })

  // Page error (screen-states.md) means *broken* — network/5xx on any leg.
  // A bootstrap 404 is never one: it resolves to the no-access denial (C3).
  const bootstrapNotFound = view.error instanceof ApiError && view.error.status === 404
  const failed = session.isError || (view.isError && !bootstrapNotFound)

  const retry = () => {
    if (session.isError) {
      void session.refetch()
      return
    }
    void view.refetch()
  }

  return {
    session,
    createUser,
    view,
    denial,
    failed,
    retry,
    viewerId,
    sendCommand,
    flights,
    peek,
    actingPlayerId,
    fizzleMessage,
    commandError,
  }
}
