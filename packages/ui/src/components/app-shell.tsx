import type * as React from "react"

import { MarkSettings } from "../lib/marks.js"
import { cn } from "../lib/utils.js"
import { Alert } from "./alert.js"
import { Button } from "./button.js"

/**
 * AppShell — design-system/components/core/app-shell.md (r1).
 * Class: Layout.
 *
 * The screen frame: slim header on surface.page (wordmark in the display
 * face, settings icon-button + connection dot on the right — no nav
 * tabs; this app is a corridor, not a site). The shell owns the scene
 * grounds (patterns/scenes.md): screens declare a depth, never paint
 * their own. `courtyard` (lobby) has no illustration asset yet and falls
 * back to plain cream — an open gap scheduled with CAM-16 (plan Decision
 * Log). The `game` state collapses the header to a floating icon pair;
 * `reconnecting` adds the alert bar under the header while play stays
 * visibly live.
 */
export interface AppShellProps extends React.HTMLAttributes<HTMLDivElement> {
  scene?: "plain" | "paving" | "courtyard"
  state?: "default" | "game" | "reconnecting"
  onSettings?: () => void
  connection?: "connected" | "reconnecting"
}

function ConnectionDot({ connection }: { connection: "connected" | "reconnecting" }) {
  return (
    <span
      role="status"
      aria-label={connection === "connected" ? "Connected" : "Reconnecting"}
      className={cn(
        "inline-block size-2 rounded-full border border-ink-primary",
        connection === "connected" ? "bg-accent-action" : "bg-accent-alarm",
      )}
    />
  )
}

function SettingsButton({ onSettings }: { onSettings?: (() => void) | undefined }) {
  return (
    <Button variant="icon" aria-label="Settings" {...(onSettings ? { onClick: onSettings } : {})}>
      <MarkSettings className="size-4" />
    </Button>
  )
}

export function AppShell({
  scene = "plain",
  state = "default",
  onSettings,
  connection = "connected",
  className,
  children,
  ...props
}: AppShellProps) {
  const ground = scene === "paving" ? "scene-paving" : "bg-surface-page"

  return (
    <div className={cn("flex min-h-dvh flex-col safe-area-shell", ground, className)} {...props}>
      {state === "game" ? (
        <div className="absolute top-2 right-2 z-40 flex items-center gap-2">
          <ConnectionDot connection={connection} />
          <SettingsButton onSettings={onSettings} />
        </div>
      ) : (
        <header className="flex items-center justify-between bg-surface-page px-4 py-2">
          <span className="font-display text-lg">Cambio</span>
          <div className="flex items-center gap-3">
            <ConnectionDot connection={connection} />
            <SettingsButton onSettings={onSettings} />
          </div>
        </header>
      )}
      {state === "reconnecting" ? (
        <Alert variant="reconnecting" className="rounded-none border-x-0">
          Reconnecting…
        </Alert>
      ) : null}
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  )
}
