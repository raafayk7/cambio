import * as React from "react"

import {
  type ConnectionStatus,
  getConnectionStatus,
  onConnectionStatusChange,
} from "../services/realtime.js"

/**
 * Connected-vs-reconnecting (CAM-17 W4, hook half): adapts the realtime
 * service's status source for AppShell's `connection`/`state` props. The
 * server snapshot is always "connected" — no socket exists during SSR, and
 * the reconnecting banner is a client-observed condition.
 */
export function useConnection(): ConnectionStatus {
  return React.useSyncExternalStore(
    onConnectionStatusChange,
    getConnectionStatus,
    () => "connected",
  )
}
