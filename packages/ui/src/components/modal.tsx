import * as React from "react"

import { MarkX } from "../lib/marks.js"
import { cn } from "../lib/utils.js"

/**
 * Modal — design-system/components/core/modal.md (r1). Class: Overlay.
 *
 * Built on the native <dialog> element (focus trap, inert page, Esc
 * semantics come from the platform, no dependency). Panel anatomy at
 * elevation.float, max-width 28rem (spec-carried), centered; scrim is
 * green-deep at 55% (deliberately theme-fixed). Enters scale .96→1 at
 * duration.snap — no fade-in drift; closes with the reverse snap.
 *
 * Every modal has an escape: ✕, Esc, and scrim click all close — unless
 * `variant="confirm"` (destructive framing: consequence in the title,
 * danger button in the footer), where only explicit buttons close (✕
 * included). One modal at a time; the game never pauses for a modal.
 */
export interface ModalProps {
  open: boolean
  /** Called after the closing snap finishes. */
  onClose: () => void
  title: React.ReactNode
  /** `display` for ceremonial moments; default `ui` 700. */
  titleFace?: "ui" | "display"
  variant?: "default" | "confirm"
  /** Right-aligned button row; exactly one primary. */
  footer?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

/** The closing snap mirrors --duration-snap; fallback for non-CSS environments. */
function snapMs(): number {
  if (typeof window === "undefined") return 140
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--duration-snap")
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 140
}

export function Modal({
  open,
  onClose,
  title,
  titleFace = "ui",
  variant = "default",
  footer,
  children,
  className,
}: ModalProps) {
  const dialogRef = React.useRef<HTMLDialogElement>(null)
  const [closing, setClosing] = React.useState(false)
  const closeTimer = React.useRef<number | undefined>(undefined)

  React.useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      // jsdom's <dialog> lacks showModal in some versions; degrade to the
      // open attribute so behavior tests still exercise the dismiss logic.
      if (typeof dialog.showModal === "function") dialog.showModal()
      else dialog.setAttribute("open", "")
      // Environments without native autofocus (jsdom) leave focus outside;
      // Esc handling and the trap both need focus to start inside.
      if (!dialog.contains(document.activeElement)) dialog.focus()
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close()
      else dialog.removeAttribute("open")
    }
  }, [open])

  React.useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  const requestClose = React.useCallback(() => {
    if (closing) return
    setClosing(true)
    closeTimer.current = window.setTimeout(() => {
      setClosing(false)
      onClose()
    }, snapMs())
  }, [closing, onClose])

  const dismissable = variant !== "confirm"
  const titleId = React.useId()

  return (
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Native Esc path (and any platform-initiated cancel).
        event.preventDefault()
        if (dismissable) requestClose()
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault()
          if (dismissable) requestClose()
        }
      }}
      onClick={(event) => {
        // A click on the <dialog> element itself is the scrim.
        if (event.target === event.currentTarget && dismissable) requestClose()
      }}
      className={cn(
        // `hidden open:flex` keeps the UA's closed-dialog display:none in
        // charge — a bare `flex` would make closed dialogs render inline.
        "m-auto hidden max-w-md flex-col rounded-md border-frame bg-surface-raised p-0 text-ink-primary shadow-float open:flex",
        "transition duration-snap ease-snap starting:scale-96",
        closing ? "scale-96" : "scale-100",
        "backdrop:bg-(--green-deep)/55",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-ink-primary/25 p-4">
        {titleFace === "display" ? (
          <h2 id={titleId} className="font-display text-xl">
            {title}
          </h2>
        ) : (
          <h2 id={titleId} className="font-ui text-lg font-bold">
            {title}
          </h2>
        )}
        <button
          type="button"
          aria-label="Close"
          onClick={requestClose}
          className="-m-2 cursor-pointer p-2 text-ink-primary transition duration-snap ease-snap focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent-focus focus-visible:outline-solid"
        >
          <MarkX className="size-4" />
        </button>
      </div>
      <div className="min-h-0 overflow-y-auto p-4">{children}</div>
      {footer !== undefined ? (
        <div className="flex justify-end gap-2 border-t border-ink-primary/25 p-4">{footer}</div>
      ) : null}
    </dialog>
  )
}
