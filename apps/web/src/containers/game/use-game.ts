import {
  decodePlayerGameEventEither,
  decodeRoomGameEventEither,
  decodeViewResponse,
  decodeGameReply,
  encodeWireCommand,
  type GameReply,
  type ViewResponse,
  type WireCommand,
} from "@cambio/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"

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

  // Live subscriptions (C1/C2): effect-scoped, both granted topics dropped
  // on unmount. Handlers are scaffolded here — the peek/flight/reveal
  // display state they'll drive lands in later steps — but every decoded
  // broadcast already discharges its ADR-0033 duty in full: schedule the
  // one debounced refetch, touch nothing else.
  const roomTopic = view.data?.grants.roomTopic
  const playerTopic = view.data?.grants.playerTopic
  React.useEffect(() => {
    if (roomTopic === undefined || playerTopic === undefined) return
    const unsubscribeRoom = subscribeTopic(roomTopic, {
      onEvent: (_event, payload) => {
        const decoded = decodeRoomGameEventEither(payload)
        if (decoded._tag !== "Right") return
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

  // Wired but with no UI affordances yet (step 10 adds them per H1/T1-T5).
  const sendCommand = useMutation({
    mutationFn: (command: WireCommand) =>
      apiRequest(`/games/${gameId}/commands`, {
        method: "POST",
        body: encodeWireCommand(command),
        decode: decodeGameReply,
      }),
    onSuccess: (reply: GameReply) => {
      if (!isNewerVersion(lastVersionRef.current, reply.version)) return
      lastVersionRef.current = reply.version
      queryClient.setQueryData<ViewResponse>(queryKey, (previous) =>
        previous === undefined
          ? previous
          : { ...previous, view: reply.view, version: reply.version },
      )
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

  return { session, createUser, view, denial, failed, retry, viewerId, sendCommand, flights }
}
