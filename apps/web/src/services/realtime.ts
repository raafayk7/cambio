import { RealtimeClient } from "@supabase/realtime-js"

/**
 * The browser realtime layer (CAM-17 W3, ADR-0032).
 *
 * A module-lazy RealtimeClient built from the two build-time env vars —
 * created only in the browser (TanStack Start SSRs the first render; no
 * socket ever opens on the server — subscriptions live in effects, which
 * never run there). The channel mechanics follow the pattern pinned by
 * `apps/api/test/RealtimeIntegration.test.ts` verbatim:
 * `client.channel(topic)` → `.on("broadcast", {event: "*"}, handler)` →
 * `.subscribe(statusCallback)`.
 *
 * Topics are capabilities (ADR-0023): held in memory, passed straight to
 * `subscribeTopic`, never rendered and never logged.
 *
 * Tests inject a fake via `setRealtimeClientForTests` — jsdom never opens
 * sockets (ADR-0030). The structural `RealtimeClientLike` surface is the
 * exact subset the service touches, so a fake is a few lines.
 */

export type ConnectionStatus = "connected" | "reconnecting"

interface BroadcastMessage {
  readonly event: string
  readonly payload: unknown
}

export interface RealtimeChannelLike {
  on(
    type: "broadcast",
    filter: { event: string },
    callback: (message: BroadcastMessage) => void,
  ): unknown
  subscribe(callback?: (status: string, err?: Error) => void): unknown
  unsubscribe(): unknown
}

export interface RealtimeClientLike {
  channel(topic: string): RealtimeChannelLike
}

// --- client singleton -------------------------------------------------------

let client: RealtimeClientLike | null = null
let injected: RealtimeClientLike | null = null

function getClient(): RealtimeClientLike {
  if (injected !== null) return injected
  // The singleton must never construct server-side. Since CAM-32 the only
  // server-side render is the one-shot build-time SPA prerender (ADR-0041),
  // so this is now a prerender guard — a socket opened there would hang the
  // build; under any future per-request SSR it would be shared across users.
  // Subscriptions live in effects, which never run server-side — reaching
  // this guard means that discipline broke.
  if (typeof window === "undefined") {
    throw new Error("realtime client requested during SSR — subscribe from browser effects only")
  }
  if (client === null) {
    // Ad-hoc tunnel support (ngrok or similar), opt-in only, mirrors
    // `VITE_TUNNEL_HOST` in vite.config.ts/api.ts: derive the socket URL
    // from whatever origin actually served this page instead of the
    // fixed dev host, so it rides vite.config.ts's `/socket` proxy and
    // needs no per-session URL to keep in sync with the tunnel's
    // (frequently-rotating) address. Unset (the default): byte-identical
    // to before, the fixed `VITE_REALTIME_URL`.
    const tunnelHost = import.meta.env.VITE_TUNNEL_HOST?.trim()
    const url: string | undefined = tunnelHost
      ? `wss://${window.location.host}/socket`
      : import.meta.env.VITE_REALTIME_URL
    const apikey: string | undefined = import.meta.env.VITE_REALTIME_APIKEY
    // Empty/whitespace counts as missing: .env.example ships
    // VITE_REALTIME_APIKEY= blank, and `""` would pass an undefined-only
    // check, then fail the handshake with no diagnostic (review F10).
    if (url === undefined || url.trim() === "" || apikey === undefined || apikey.trim() === "") {
      throw new Error(
        "realtime env missing — VITE_REALTIME_URL and VITE_REALTIME_APIKEY must be set and non-empty (ADR-0032, amended by ADR-0041)",
      )
    }
    // The apikey is public by design: locally a self-minted anon JWT
    // (ADR-0032), in prod the Supabase publishable key (ADR-0041). Either
    // way it gates the socket handshake only; capability topics are the
    // authorization.
    client = new RealtimeClient(url, { params: { apikey } })
  }
  return client
}

/** Test seam: inject a fake client (and reset the status store); pass null to clear. */
export function setRealtimeClientForTests(fake: RealtimeClientLike | null): void {
  injected = fake
  client = null
  status = "connected"
  activeSubscriptions = 0
}

// --- connection status source ----------------------------------------------

let status: ConnectionStatus = "connected"
const listeners = new Set<() => void>()

function setStatus(next: ConnectionStatus): void {
  if (status === next) return
  status = next
  for (const listener of listeners) listener()
}

/** `useSyncExternalStore` pair — adapted by `hooks/use-connection.ts` (W4). */
export function getConnectionStatus(): ConnectionStatus {
  return status
}

export function onConnectionStatusChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// --- subscriptions ----------------------------------------------------------

export interface TopicHandlers {
  onEvent: (event: string, payload: unknown) => void
  /**
   * Fired when the channel re-subscribes after a drop — the caller refetches
   * its query so broadcasts missed while down are absorbed (recovery without
   * reload). Not fired on the first successful subscribe.
   */
  onResubscribe?: () => void
}

/**
 * Subscribe one granted topic. Returns the unsubscribe. The library
 * reconnects with its own backoff; this layer only translates channel
 * status into the app's connected/reconnecting signal.
 */
let activeSubscriptions = 0

export function subscribeTopic(topic: string, handlers: TopicHandlers): () => void {
  let resolvedClient: RealtimeClientLike
  try {
    resolvedClient = getClient()
  } catch (error) {
    // Misconfiguration must be legible, not a crash: without this catch the
    // throw surfaces inside a subscription effect and the router's default
    // error page replaces the screen. Instead the console names the fix and
    // the screen shows the truthful W4 reconnecting banner. Only the config
    // message is logged — never the topic (a capability) or any env value.
    console.error(error instanceof Error ? error.message : String(error))
    setStatus("reconnecting")
    return () => {}
  }
  const channel = resolvedClient.channel(topic)
  let dropped = false
  let active = true
  activeSubscriptions += 1

  channel.on("broadcast", { event: "*" }, (message) => {
    if (active) handlers.onEvent(message.event, message.payload)
  })
  channel.subscribe((channelStatus) => {
    if (!active) return
    if (channelStatus === "SUBSCRIBED") {
      setStatus("connected")
      if (dropped) {
        dropped = false
        handlers.onResubscribe?.()
      }
      return
    }
    if (
      channelStatus === "CHANNEL_ERROR" ||
      channelStatus === "TIMED_OUT" ||
      channelStatus === "CLOSED"
    ) {
      dropped = true
      setStatus("reconnecting")
    }
  })

  return () => {
    if (!active) return
    active = false
    activeSubscriptions -= 1
    // No subscriptions left means nothing is degraded — an idle screen
    // (e.g. back on the lobby) never shows a stale reconnecting banner.
    if (activeSubscriptions === 0) setStatus("connected")
    channel.unsubscribe()
  }
}
