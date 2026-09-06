import type { LobbyView } from "@cambio/contracts"
import {
  Alert,
  AppShell,
  Button,
  Divider,
  FieldScaffold,
  Link as UiLink,
  Panel,
  Skeleton,
  TextField,
  ToastStack,
  type ToastItem,
} from "@cambio/ui"
import { Link as RouterLink } from "@tanstack/react-router"
import * as React from "react"

import { NameForm } from "../../components/identity/name-form.js"
import { Seat } from "../../components/game/seat.js"
import { TableSurface } from "../../components/game/table-surface.js"
import { useConnection } from "../../hooks/use-connection.js"
import { sessionErrorCopy } from "../../hooks/use-session.js"
import { type RoomDenial, START_HELPER, startErrorCopy, useRoom } from "./use-room.js"

/**
 * The room (waiting) screen (CAM-17 R1–R5, R7): paving scene, TableSurface
 * in its seating state with one Seat per member in join order (names
 * straight from the C1 projection), the shareable link, start and leave.
 * Denials render the no-access recipe (screen-states.md: plain cream
 * panel — what this is, why you can't enter, where to go).
 */

const DENIAL_COPY: Record<RoomDenial, { title: string; body: string }> = {
  full: {
    title: "Room full",
    body: "Five players are already seated — the table takes no more. Create a room of your own.",
  },
  unknown: {
    title: "No room here",
    body: "This link doesn't lead to a room. Check the link you were sent, or create a room of your own.",
  },
  // Outsider denial after a LobbyNotJoinable + view 404 — the wire cannot
  // distinguish a started room from an abandoned one for a non-member, so
  // the copy covers both truthfully (review F12). Members watching a room
  // die still get the distinct `closed` copy via the broadcast path.
  started: {
    title: "No open seat",
    body: "This room started without you or has closed. Ask for a fresh room link, or create a room of your own.",
  },
  closed: {
    title: "Room closed",
    body: "Everyone left, so this room closed. Create a new room to keep playing.",
  },
}

function NoAccessPanel({ reason }: { reason: RoomDenial }) {
  const copy = DENIAL_COPY[reason]
  return (
    <Panel title={copy.title} className="mx-auto w-full max-w-md">
      <div className="flex flex-col items-start gap-3">
        <p className="font-ui text-base text-ink-primary">{copy.body}</p>
        <UiLink asChild>
          <RouterLink to="/">Back to the start</RouterLink>
        </UiLink>
      </div>
    </Panel>
  )
}

/** First-load skeleton matching the seat-list layout (300ms no-flash). */
function RoomSkeleton() {
  const [visible, setVisible] = React.useState(false)
  React.useEffect(() => {
    const handle = window.setTimeout(() => setVisible(true), 300)
    return () => window.clearTimeout(handle)
  }, [])
  if (!visible) return null
  return (
    <div aria-hidden data-testid="room-skeleton" className="flex flex-col items-center gap-5">
      <div className="flex gap-2">
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
      </div>
      <Skeleton className="aspect-square w-2/3 max-w-sm rounded-full" />
      <Skeleton className="h-24 w-full max-w-md" />
    </div>
  )
}

function SeatedRoom({
  gameId,
  lobby,
  viewerId,
  startPending,
  startError,
  onStart,
  leavePending,
  onLeave,
}: {
  gameId: string
  lobby: LobbyView
  viewerId: string
  startPending: boolean
  startError: string | undefined
  onStart: () => void
  leavePending: boolean
  onLeave: () => void
}) {
  const [toasts, setToasts] = React.useState<ReadonlyArray<ToastItem>>([])
  const toastSeq = React.useRef(0)
  const linkRef = React.useRef<HTMLInputElement>(null)
  const roomUrl =
    typeof window === "undefined" ? `/room/${gameId}` : `${window.location.origin}/room/${gameId}`

  const pushToast = (toast: Omit<ToastItem, "id">) => {
    toastSeq.current += 1
    setToasts((previous) => [...previous, { ...toast, id: `copy-${toastSeq.current}` }])
  }

  // Clipboard can be denied (permissions) or entirely absent (insecure
  // context, e.g. a LAN-IP http origin — `navigator.clipboard` doesn't
  // exist there at all) — sharing is this screen's one job, so the failure
  // must not be silent. Falling back focuses the already-rendered room-link
  // field, which auto-selects on focus, so the player can copy it herself.
  const copyFailed = () => {
    linkRef.current?.focus()
    pushToast({
      variant: "alarm",
      message: "Couldn't copy. Select the link and copy it yourself.",
    })
  }

  const copyLink = () => {
    if (!navigator.clipboard?.writeText) {
      copyFailed()
      return
    }
    navigator.clipboard
      .writeText(roomUrl)
      .then(() => pushToast({ variant: "success", message: "Link copied" }), copyFailed)
  }

  const viewerIndex = lobby.members.findIndex((member) => member.id === viewerId)

  return (
    <div className="flex w-full flex-col gap-5">
      <TableSurface
        state="seating"
        // -1 is unreachable: the bootstrap only renders SeatedRoom for a
        // member, and viewerId came from the same response's session — the
        // Math.max is a type-level fallback, not a live branch.
        viewerSeatIndex={Math.max(0, viewerIndex)}
        seats={lobby.members.map((member, index) => (
          <Seat
            key={member.id}
            name={member.name}
            seatIndex={index}
            {...(index === viewerIndex ? { own: true } : {})}
          />
        ))}
      />

      <Panel className="mx-auto w-full max-w-md">
        <div className="flex flex-col gap-4">
          <FieldScaffold label="Room link" helper="Share it. Friends who open it join this room.">
            <TextField
              ref={linkRef}
              readOnly
              // Long UUIDs overflow the field; visible ellipsis beats a
              // silent mid-glyph clip (gate finding, CAM-17).
              className="text-ellipsis"
              value={roomUrl}
              onFocus={(event) => event.target.select()}
            />
          </FieldScaffold>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={copyLink}>
              Copy link
            </Button>
          </div>

          <Divider />

          {startError !== undefined ? <Alert variant="alarm">{startError}</Alert> : null}

          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={onLeave} disabled={leavePending}>
              Leave room
            </Button>
            <div className="flex items-center gap-3">
              <span className="font-ui text-sm text-ink-muted">
                {lobby.members.length} seated · {START_HELPER}
              </span>
              <Button onClick={onStart} disabled={startPending}>
                Start game
              </Button>
            </div>
          </div>
        </div>
      </Panel>

      <ToastStack
        toasts={toasts}
        onExpire={(id) => setToasts((previous) => previous.filter((toast) => toast.id !== id))}
      />
    </div>
  )
}

export function RoomScreen({ gameId }: { gameId: string }) {
  const connection = useConnection()
  const { session, createUser, room, denial, failed, retry, start, leave, viewerId } =
    useRoom(gameId)

  let content: React.ReactNode
  // Every branch gets a page h1. Most render the sr-only "Room" heading in
  // the wrapper below; the identity branch carries its own visible h1, so
  // it opts out to avoid a double heading (review F13).
  let ownHeading = false
  if (denial !== null) {
    content = <NoAccessPanel reason={denial} />
  } else if (failed) {
    // Bootstrap network/5xx failure — page error (screen-states.md). A 404
    // never lands here: it triggers the join flow instead (R2).
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
        Couldn't reach the room. Check your connection and try again.
      </Alert>
    )
  } else if (session.isPending) {
    content = <RoomSkeleton />
  } else if (session.data?.state === "unauthenticated") {
    // Identity in-place (R2): the route never changes, so the target room
    // is never lost — once named, the bootstrap joins automatically. The
    // heading sits inside the panel, matching the lobby's composition —
    // display type never lands bare on the painted paving (review F1).
    // Paving is a texture ground, not a pictorial scene, so the room keeps
    // `default` panels rather than `wash` (scenes.md wash rule scope).
    ownHeading = true
    content = (
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <Panel>
          <div className="flex flex-col gap-4">
            <h1 className="text-center font-display text-3xl">pull up a chair</h1>
            <NameForm
              onSubmit={(name) => createUser.mutate(name)}
              submitting={createUser.isPending}
              submitError={sessionErrorCopy(createUser.error)}
            />
          </div>
        </Panel>
      </div>
    )
  } else if (room.data !== undefined && viewerId !== undefined) {
    if (room.data.lobby.status === "abandoned") {
      content = <NoAccessPanel reason="closed" />
    } else {
      content = (
        <SeatedRoom
          gameId={gameId}
          lobby={room.data.lobby}
          viewerId={viewerId}
          startPending={start.isPending}
          startError={startErrorCopy(start.error)}
          onStart={() => start.mutate()}
          leavePending={leave.isPending}
          onLeave={() => leave.mutate()}
        />
      )
    }
  } else {
    content = <RoomSkeleton />
  }

  return (
    <AppShell scene="paving" connection={connection}>
      <div className="flex w-full flex-1 flex-col justify-center gap-5 p-5">
        {ownHeading ? null : <h1 className="sr-only">Room</h1>}
        {content}
      </div>
    </AppShell>
  )
}
