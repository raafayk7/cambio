import {
  decodeGameReply,
  decodeLeaveLobbyResponse,
  decodeLobbyResponse,
  decodeLobbyUpdatedEither,
  decodeRoomGameEventEither,
  decodeViewResponse,
  type LobbyResponse,
} from "@cambio/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import * as React from "react"

import { useSession } from "../../hooks/use-session.js"
import { ApiError, apiRequest } from "../../services/api.js"
import { subscribeTopic } from "../../services/realtime.js"

/**
 * The room surface's logic (CAM-17 R2–R5, R7), co-located with its one
 * consumer per the frontend-architecture co-location rule.
 *
 * Bootstrap (R2/R3): `GET /lobbies/:gameId` — 200 means member, done
 * (reload recovers members, status, grants). 404 means not (yet) a member:
 * join once, automatically. Join refusals map to denials; on an
 * already-started refusal (409 `LobbyNotJoinable`) the client checks
 * `GET /games/:gameId/view` — 200 means this visitor is a player of the
 * started game (including a member who missed `GameStarted` while away)
 * and is redirected; 404 means a true outsider.
 *
 * Live view (R4/R5): decoded `LobbyUpdated` broadcasts update the
 * `["lobby", gameId]` query data only when `version` exceeds the last-seen
 * version (the bootstrap-vs-broadcast staleness race, root Decision Log);
 * `GameStarted` navigates. On re-subscribe after a drop the query is
 * refetched so missed broadcasts are absorbed. Everything rendered comes
 * from contracts-decoded payloads — the client reflects, never re-implements
 * (projection renderer; the 2–4 start rule is the server's call).
 */

export type RoomDenial = "full" | "unknown" | "started" | "closed"

type JoinOutcome =
  | { readonly kind: "joined"; readonly response: LobbyResponse }
  | { readonly kind: "denied"; readonly reason: RoomDenial }
  | { readonly kind: "already-member" }
  | { readonly kind: "player-of-started-game" }

export const START_HELPER = "2–4 players"

/** Voice.md copy for a refused start: what went wrong, then the fix. */
export function startErrorCopy(error: unknown): string | undefined {
  if (error === null || error === undefined) return undefined
  if (error instanceof ApiError && error.tag === "BadPlayerCount") {
    return "The game needs 2 to 4 players at the table. Share the link and wait for a friend."
  }
  return "Couldn't start the game. Try again."
}

export function useRoom(gameId: string) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { session, createUser } = useSession()

  const [denial, setDenial] = React.useState<RoomDenial | null>(null)
  const lastVersionRef = React.useRef(-1)
  const joinAttemptedRef = React.useRef(false)

  const authenticated = session.data?.state === "authenticated"
  const viewerId = session.data?.state === "authenticated" ? session.data.user.userId : undefined

  const room = useQuery({
    queryKey: ["lobby", gameId],
    enabled: authenticated && denial === null,
    retry: false,
    queryFn: () => apiRequest(`/lobbies/${gameId}`, { decode: decodeLobbyResponse }),
  })

  // Track the newest version any server response has shown us (R4 guard).
  React.useEffect(() => {
    const version = room.data?.version
    if (version !== undefined && version > lastVersionRef.current) {
      lastVersionRef.current = version
    }
  }, [room.data])

  const join = useMutation({
    mutationFn: async (): Promise<JoinOutcome> => {
      try {
        const response = await apiRequest(`/lobbies/${gameId}/join`, {
          method: "POST",
          decode: decodeLobbyResponse,
        })
        return { kind: "joined", response }
      } catch (error) {
        if (!(error instanceof ApiError)) throw error
        if (error.status === 404) return { kind: "denied", reason: "unknown" }
        if (error.tag === "LobbyFull") return { kind: "denied", reason: "full" }
        if (error.tag === "AlreadyInLobby") return { kind: "already-member" }
        if (error.status === 409) {
          // LobbyNotJoinable: started or abandoned. The view GET separates
          // "player of this game" from "outsider" (root R2 reconciliation).
          try {
            await apiRequest(`/games/${gameId}/view`, { decode: decodeViewResponse })
            return { kind: "player-of-started-game" }
          } catch (viewError) {
            if (viewError instanceof ApiError && viewError.status === 404) {
              return { kind: "denied", reason: "started" }
            }
            throw viewError
          }
        }
        throw error
      }
    },
    onSuccess: (outcome) => {
      switch (outcome.kind) {
        case "joined":
          if (outcome.response.version > lastVersionRef.current) {
            lastVersionRef.current = outcome.response.version
          }
          queryClient.setQueryData<LobbyResponse>(["lobby", gameId], outcome.response)
          return
        case "denied":
          setDenial(outcome.reason)
          return
        case "already-member":
          void room.refetch()
          return
        case "player-of-started-game":
          void navigate({ to: "/game/$gameId", params: { gameId } })
          return
      }
    },
  })

  // Join-on-visit (R2): exactly one automatic attempt per mount, triggered
  // by the bootstrap 404 ("not a member of an open lobby").
  const joinMutate = join.mutate
  React.useEffect(() => {
    if (!authenticated || joinAttemptedRef.current) return
    if (room.error instanceof ApiError && room.error.status === 404) {
      joinAttemptedRef.current = true
      joinMutate()
    }
  }, [authenticated, room.error, joinMutate])

  // Live subscriptions (R4/R5/W4): effect-scoped, dropped on unmount.
  const refetchRef = React.useRef(room.refetch)
  refetchRef.current = room.refetch
  const roomTopic = room.data?.grants.roomTopic
  const playerTopic = room.data?.grants.playerTopic
  React.useEffect(() => {
    if (roomTopic === undefined || playerTopic === undefined) return
    const unsubscribeRoom = subscribeTopic(roomTopic, {
      onEvent: (event, payload) => {
        if (event === "LobbyUpdated") {
          const decoded = decodeLobbyUpdatedEither(payload)
          if (decoded._tag !== "Right") return
          const update = decoded.right
          queryClient.setQueryData<LobbyResponse>(["lobby", gameId], (previous) => {
            if (previous === undefined || update.version <= lastVersionRef.current) {
              return previous
            }
            lastVersionRef.current = update.version
            return { ...previous, lobby: update.lobby, version: update.version }
          })
          return
        }
        if (event === "GameStarted") {
          const decoded = decodeRoomGameEventEither(payload)
          if (decoded._tag === "Right" && decoded.right._tag === "GameStarted") {
            // R5: non-starters auto-navigate on the room event.
            void navigate({ to: "/game/$gameId", params: { gameId } })
          }
        }
      },
      // Recovery without reload (W4): missed broadcasts are absorbed by a
      // refetch when the channel re-subscribes after a drop.
      onResubscribe: () => {
        void refetchRef.current()
      },
    })
    // Silent pre-game — subscribed anyway so CAM-18 inherits the wiring.
    const unsubscribePlayer = subscribeTopic(playerTopic, { onEvent: () => {} })
    return () => {
      unsubscribeRoom()
      unsubscribePlayer()
    }
  }, [roomTopic, playerTopic, gameId, navigate, queryClient])

  const start = useMutation({
    mutationFn: () =>
      apiRequest(`/lobbies/${gameId}/start`, { method: "POST", decode: decodeGameReply }),
    onSuccess: () => {
      void navigate({ to: "/game/$gameId", params: { gameId } })
    },
  })

  const leave = useMutation({
    mutationFn: () =>
      apiRequest(`/lobbies/${gameId}/leave`, { method: "POST", decode: decodeLeaveLobbyResponse }),
    onSuccess: () => {
      // Navigating unmounts the surface; the subscription effect's cleanup
      // drops both channels (R7).
      void navigate({ to: "/" })
    },
  })

  // Page error (screen-states.md) means *broken* — network/5xx on any leg.
  // A bootstrap 404 is never one: it is the join-on-visit trigger (R2).
  const bootstrapNotFound = room.error instanceof ApiError && room.error.status === 404
  const failed = session.isError || (room.isError && !bootstrapNotFound) || join.isError

  const retry = () => {
    joinAttemptedRef.current = false
    join.reset()
    if (session.isError) {
      void session.refetch()
      return
    }
    void room.refetch()
  }

  return { session, createUser, room, denial, failed, retry, start, leave, viewerId }
}
