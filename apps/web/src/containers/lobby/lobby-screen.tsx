import { decodeLobbyResponse } from "@cambio/contracts"
import { Alert, AppShell, Button, FieldScaffold, Panel, Skeleton, TextField } from "@cambio/ui"
import { useMutation } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import * as React from "react"

import { NameForm } from "../../components/identity/name-form.js"
import { useConnection } from "../../hooks/use-connection.js"
import { sessionErrorCopy, useSession } from "../../hooks/use-session.js"
import { apiRequest } from "../../services/api.js"
import { parseRoomLink } from "./parse-room-link.js"

/**
 * The lobby (CAM-17 L1, L2, L4): identity, create room, join-by-link — on
 * the courtyard scene (scenes.md: lobby = full illustrated courtyard),
 * with the forms on plain cream panels ON that ground (forms.md: no scene
 * art behind fields). Join is share-link only (root Decision Log): no room
 * list, no short codes.
 */

const LINK_ERROR = "That doesn't look like a room link. Paste the whole link, or just its room id."

/** First-load skeleton matching the identity/action layout (300ms no-flash). */
function LobbySkeleton() {
  const [visible, setVisible] = React.useState(false)
  React.useEffect(() => {
    const handle = window.setTimeout(() => setVisible(true), 300)
    return () => window.clearTimeout(handle)
  }, [])
  if (!visible) return null
  return (
    <div aria-hidden data-testid="lobby-skeleton" className="flex flex-col gap-5">
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

export function LobbyScreen() {
  const navigate = useNavigate()
  const connection = useConnection()
  const { session, createUser } = useSession()

  const createRoom = useMutation({
    mutationFn: () => apiRequest("/lobbies", { method: "POST", decode: decodeLobbyResponse }),
    onSuccess: (response) => {
      // The room screen re-bootstraps via GET (one uniform entry path);
      // grants are never smuggled through navigation state.
      void navigate({ to: "/room/$gameId", params: { gameId: response.lobby.id } })
    },
  })

  const [link, setLink] = React.useState("")
  const [linkError, setLinkError] = React.useState<string | undefined>(undefined)

  const submitLink = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const gameId = parseRoomLink(link)
    if (gameId === null) {
      setLinkError(LINK_ERROR)
      return
    }
    setLinkError(undefined)
    void navigate({ to: "/room/$gameId", params: { gameId } })
  }

  let content: React.ReactNode
  if (session.isPending) {
    content = <LobbySkeleton />
  } else if (session.isError) {
    // Page error (screen-states.md): full-region alarm alert + retry.
    content = (
      <Alert
        variant="alarm"
        action={
          <Button variant="ghost" onClick={() => void session.refetch()}>
            Try again
          </Button>
        }
      >
        Couldn't reach the table. Check your connection and try again.
      </Alert>
    )
  } else if (session.data.state === "unauthenticated") {
    // The unauthenticated state IS first use (L4 ledger).
    content = (
      <div className="flex flex-col gap-5">
        <h1 className="text-center font-display text-3xl">pull up a chair</h1>
        <Panel>
          <NameForm
            onSubmit={(name) => createUser.mutate(name)}
            submitting={createUser.isPending}
            submitError={sessionErrorCopy(createUser.error)}
          />
        </Panel>
      </div>
    )
  } else {
    const name = session.data.user.name
    content = (
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-2xl">shuffle up, {name}</h1>
        <Panel>
          <div className="flex flex-col gap-4">
            {createRoom.isError ? (
              <Alert variant="alarm">Couldn't create the room. Try again.</Alert>
            ) : null}
            <Button onClick={() => createRoom.mutate()} disabled={createRoom.isPending}>
              Create room
            </Button>
          </div>
        </Panel>
        <Panel title="Join a room">
          <form onSubmit={submitLink} noValidate className="flex flex-col gap-4">
            <FieldScaffold
              label="Room link"
              helper="Paste the link a friend shared."
              {...(linkError !== undefined ? { error: linkError } : {})}
            >
              <TextField
                name="room-link"
                autoComplete="off"
                placeholder="e.g. …/room/1b8f…"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                onBlur={() => {
                  // Re-validate on blur once the field has erred (forms.md) —
                  // full re-validation, matching NameForm's behavior: blur can
                  // clear the error or re-flag it, never only clear.
                  if (linkError !== undefined) {
                    setLinkError(parseRoomLink(link) === null ? LINK_ERROR : undefined)
                  }
                }}
              />
            </FieldScaffold>
            <div className="flex justify-end">
              <Button type="submit" variant="secondary">
                Join room
              </Button>
            </div>
          </form>
        </Panel>
      </div>
    )
  }

  return (
    <AppShell
      scene="courtyard"
      connection={connection}
      state={connection === "reconnecting" ? "reconnecting" : "default"}
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 p-5">
        {content}
      </div>
    </AppShell>
  )
}
