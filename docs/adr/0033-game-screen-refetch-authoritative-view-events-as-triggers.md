# 0033 — Game screen state is the refetched view; broadcasts are animation triggers only

- **Status:** proposed
- **Date:** 2026-09-05
- **Task:** CAM-18

## Context

The game table screen must stay correct while game events stream in over
Realtime. The room screen solved its equivalent race with a staleness
guard: `LobbyUpdated` carries the room's persisted `version`, and the
client discards any broadcast older than its last-seen state. That guard
does not transfer to the game: none of the 22 `RoomGameEvent` variants
(nor either `PlayerGameEvent`) carries a version, sequence, or timestamp —
only the HTTP surfaces do (`GameReply { view, version }` from commands,
`ViewResponse { view, version, grants }` from `GET /games/:gameId/view`).
A client folding broadcasts into local state cannot detect a dropped,
duplicated, or out-of-order event.

Two further wire facts constrain the design. Slam reveals
(`SlamSucceeded.card` / `SlamFailed.card`) exist **only** in events —
`viewFor` never re-sends them — so the screen cannot be a pure
refetch-on-event renderer; it must consume event payloads to drive
reveals. Conversely, the post-`DiscardTaken` pile top and the
post-reshuffle pile collapse exist **only** in the view — events don't
name them — so events alone cannot maintain the table. Some mixing of
the two sources is forced; the question is which one owns correctness.

## Decision

We make the versioned view the **only** source of game state, and treat
broadcasts as **transient choreography triggers** that never mutate
state. Concretely:

- The game container holds exactly one state snapshot: the latest
  `PlayerGameView` by `version`, from `GET /games/:gameId/view` or from
  the caller's own `GameReply`. A response with a version ≤ the current
  snapshot's is discarded — versions, not arrival order, decide.
- Every decoded room/player broadcast does two things only: enqueue its
  animation/reveal (flights, slam reveal, peek display), and schedule
  **one debounced refetch per event batch** (one command can publish 5+
  events; the client refetches once, not per event).
- `onResubscribe` triggers the same refetch — a dropped channel costs
  missed animations, never wrong state.
- Ephemeral private values (`PrivateCardDrawn`, `PrivateCardPeeked`)
  live in component-local display state for their reveal window and are
  never written into the snapshot (memory fidelity, ADR-0021).

Alternatives rejected:

- **Version every game broadcast server-side** (publisher port +
  contracts change carrying the persisted version on each event). Fixes
  ordering detection, but the client would still have to re-implement
  the event fold — rule duplication the projection-renderer principle
  exists to prevent — and it widens CAM-18 into the wire for data the
  view already serves. Remains available later if refetch volume ever
  becomes a real cost.
- **Fold events into local state without a guard.** Cheapest wiring;
  silently corrupts the table on any dropped or reordered event until
  the next reconnect. Rejected outright.

## Consequences

- Correctness reduces to "the newest versioned snapshot wins" — no
  event-ordering reasoning anywhere in the client, and the reconnect
  path is the normal path.
- The screen does one debounced `GET view` per command resolved anywhere
  at the table. At Cambio's scale (≤5 players, human-paced turns) this
  is trivial; if it ever isn't, the versioned-events alternative is the
  named escape hatch and would supersede this ADR.
- Choreography must tolerate refetch/animation races in either order:
  animations reference slots and card slugs from their event payloads,
  not from the snapshot, so a snapshot landing mid-flight cannot retarget
  a moving card.
- A peek or reveal missed while disconnected is gone (single delivery,
  ADR-0021) — by design, and this ADR does not try to recover it.
