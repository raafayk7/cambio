import type * as React from "react"

import { MarkHelp, MarkSettings } from "../lib/marks.js"
import { cn } from "../lib/utils.js"
import { Alert } from "./alert.js"
import { Button } from "./button.js"

/**
 * AppShell — design-system/components/core/app-shell.md (r6).
 * Class: Layout.
 *
 * The screen frame: slim header on surface.page (wordmark in the display
 * face, help + settings icon-buttons and connection dot on the right — no
 * nav tabs; this app is a corridor, not a site). The shell owns the scene
 * grounds (patterns/scenes.md): screens declare a depth, never paint
 * their own. `courtyard` (lobby) renders the illustrated courtyard scene
 * (realized in CAM-17 through the creation gate; app-shell.md r2). The
 * `game` state collapses the header to a floating icon pair.
 *
 * `state` is the chrome axis only (r3, CAM-18 S1) — reconnecting is
 * orthogonal, derived from `connection` on either chrome: `default`
 * chrome gets the alert bar under the header (unchanged); `game` chrome
 * gets the same Alert reconnecting variant floating below the icon pair,
 * inside the flex column the floating controls already anchor to (the
 * shell root stays their positioned ancestor). Play stays visibly live
 * behind either treatment.
 *
 * `onHelp` (r5, CAM-30) renders a help icon-button beside settings in both
 * chrome states, same render-only-with-handler rule.
 */
export interface AppShellProps extends React.HTMLAttributes<HTMLDivElement> {
  scene?: "plain" | "paving" | "courtyard"
  state?: "default" | "game"
  onSettings?: () => void
  onHelp?: () => void
  connection?: "connected" | "reconnecting"
}

// Shape redundancy (r3, CAM-18 S2): filled disc when connected, hollow
// ring when reconnecting — color is never the only signal, and in game
// chrome this dot is the only always-visible one. `data-connection`
// gives structural tests a hook that doesn't depend on class internals
// (ADR-0030; empty-state.tsx's `data-state` precedent).
function ConnectionDot({ connection }: { connection: "connected" | "reconnecting" }) {
  const connected = connection === "connected"
  return (
    <span
      role="status"
      aria-label={connected ? "Connected" : "Reconnecting"}
      data-connection={connection}
      className={cn(
        "inline-block size-3 rounded-full",
        connected ? "border border-ink-primary bg-accent-action" : "border-2 border-accent-alarm",
      )}
    />
  )
}

// Decorative suit cluster beside the wordmark — same color split as
// divider.tsx's `ornament` variant (accent.suit-red on hearts/diamonds
// only, tokens.md's "suit red is quarantined" rule), sized down to sit
// quietly next to the display face rather than announce itself. Order is
// its own (♠ ♥ ♣ ♦), not the divider's ♠ ♥ ♦ ♣ — app-shell.md r6.
function WordmarkSuits() {
  return (
    <span aria-hidden className="flex items-center gap-1 text-sm leading-none">
      <span className="text-ink-primary">♠</span>
      <span className="text-accent-suit-red">♥</span>
      <span className="text-ink-primary">♣</span>
      <span className="text-accent-suit-red">♦</span>
    </span>
  )
}

// Rendered only when a handler exists — an interactive-looking control
// that does nothing on activation is worse than its absence (gate
// finding, CAM-17). The canon's settings icon-button appears as soon as
// a settings surface does.
function SettingsButton({ onSettings }: { onSettings?: (() => void) | undefined }) {
  if (onSettings === undefined) return null
  return (
    <Button variant="icon" aria-label="Settings" onClick={onSettings}>
      <MarkSettings className="size-4" />
    </Button>
  )
}

// Same render-only-with-handler rule as SettingsButton above (r5). The
// label is hardcoded rather than a prop: "How to play" presupposes only
// "an app with something to play" — no Cambio vocabulary — so it stays
// inside the `packages/ui` app-knowledge ban, and hardcoding keeps the
// canon label (app-shell.md r5) single-sourced instead of copied into
// every call site.
function HelpButton({ onHelp }: { onHelp?: (() => void) | undefined }) {
  if (onHelp === undefined) return null
  return (
    <Button variant="icon" aria-label="How to play" onClick={onHelp}>
      <MarkHelp className="size-4" />
    </Button>
  )
}

export function AppShell({
  scene = "plain",
  state = "default",
  onSettings,
  onHelp,
  connection = "connected",
  className,
  children,
  ...props
}: AppShellProps) {
  const ground =
    scene === "paving"
      ? "scene-paving"
      : scene === "courtyard"
        ? "scene-courtyard"
        : "bg-surface-page"

  return (
    <div
      className={cn("relative flex min-h-dvh flex-col safe-area-shell", ground, className)}
      {...props}
    >
      {state === "game" ? (
        <div className="absolute inset-x-2 top-2 z-40 flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <ConnectionDot connection={connection} />
            <HelpButton onHelp={onHelp} />
            <SettingsButton onSettings={onSettings} />
          </div>
          {connection === "reconnecting" ? (
            <Alert variant="reconnecting" className="w-full">
              Reconnecting…
            </Alert>
          ) : null}
        </div>
      ) : (
        <>
          <header className="flex items-center justify-between bg-surface-page px-4 py-2">
            <div className="flex items-center gap-2">
              <span className="font-display text-lg">Cambio</span>
              <WordmarkSuits />
            </div>
            <div className="flex items-center gap-3">
              <ConnectionDot connection={connection} />
              <HelpButton onHelp={onHelp} />
              <SettingsButton onSettings={onSettings} />
            </div>
          </header>
          {connection === "reconnecting" ? (
            <Alert variant="reconnecting" className="rounded-none border-x-0">
              Reconnecting…
            </Alert>
          ) : null}
        </>
      )}
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  )
}
