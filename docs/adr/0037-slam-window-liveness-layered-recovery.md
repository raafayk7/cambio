# 0037 — Slam-window liveness via layered recovery: view-route poke, re-arm on load and conflict, client expiry nudge

- **Status:** accepted
- **Date:** 2026-09-07
- **Task:** CAM-26

## Context

A `SlamWindow` phase is closed only by the room actor's `closeIfDue`,
reached via an in-memory timer fiber or lazily before the next non-`Slam`
command. Four stacked gaps let a stale window strand the game with an inert
draw deck (CAM-26): the actor has no bootstrap step at all (it is created
lazily on the first envelope, with no boot-time sweep of in-progress
games), so a restart leaves a persisted `SlamWindow` timer-less; a
`VersionConflict` nulls the cached state and — because `manageTimer` begins
with `clearTimer` — actively interrupts the live window timer and replaces
it with nothing; `GET /games/:gameId/view` deliberately bypasses the actor
(the state row is the materialized authority, ADR-0014/0020), so client
refetches can never trigger the lazy close and an expired-but-open window
is served faithfully at an unchanged version, which the client's
version-guard then discards; and the client has no expiry behavior — the
slam timer drains a bar and goes invisible, with no callback, no polling,
and a broadcast-decode failure that drops even the scheduled refetch.

ADR-0011 fixes `closesAt` at window open; the application layer's standing
rule is that timers are an optimization and lateness is computed from the
clock on the next command. That rule assumed a next command always comes.
When every connected player is waiting on the same stale window, none can
send one: liveness needs a path from "a client noticed" to "the actor
judged the clock".

## Decision

We make slam-window closure survivable by layering four independent
recovery paths, none of which is individually load-bearing:

1. **Poke-on-read.** `GET /games/:gameId/view` keeps its direct
   `games.load` row read for the response, but additionally enqueues a
   reply-less `Poke` envelope to the room's actor (modeled on the existing
   internal `TimerClose`). Handling `Poke`, the actor bootstraps its cache
   if cold, runs `closeIfDue`, and re-arms via `manageTimer`. The resulting
   close persists and publishes `SlamWindowClosed` + `TurnAdvanced` exactly
   like any other batch, so every connected client refetches. Reads remain
   unserialized — the "cache is an optimization, not the source of truth"
   stance of ADR-0020 stands; the actor merely gains a nudge source.
2. **Arm on load.** Whenever the actor populates its cache from
   persistence (the existing lazy `Execute` bootstrap, and the `Poke`
   path), it runs `manageTimer`, so a loaded `SlamWindow` always has a
   timer (a past-due one fires immediately as a zero-duration sleep).
3. **Re-arm after `VersionConflict`.** A conflict still invalidates the
   cache, but the actor immediately re-loads and re-arms instead of
   leaving the window timer-less until the next command.
4. **Client expiry nudge, bounded.** The slam timer gains an `onExpire`
   fired once when `closesAt` (plus a small skew grace) passes; it
   triggers a view refetch — which, via poke-on-read, is the nudge. While
   a subsequent view still shows an expired `SlamWindow`, the client
   re-nudges on a short interval, capped, then falls back to the existing
   reconnect recovery. Broadcast-decode failures no longer skip the
   scheduled refetch (upholding ADR-0033: the refetched view is
   authoritative; broadcasts are only triggers).

Alternatives considered:

- **A client-submittable close/nudge wire command** — rejected: contradicts
  the deliberate contracts decision that `CloseSlamWindow` is issuer-less
  and server-internal, and widens the wire surface for something a read
  can carry.
- **Serializing all view reads through the actor** — rejected: contradicts
  ADR-0020's read-path stance, keeps every room resident for reads, and
  buys consistency the poke already delivers a broadcast-turnaround later.
- **A boot-time sweep re-arming every in-progress game** — rejected for
  now: on a spin-down host the process may not be running to sweep;
  poke-on-read covers the same hole demand-driven, at the cost that a
  game nobody looks at stays stale (which is then nobody's problem).
- **Client-side polling** — rejected: ADR-0033 chose broadcast-triggered
  refetch; a bounded expiry nudge is the surgical exception, polling is
  not.

## Consequences

Any single failure — dead timer fiber, lost broadcast, restarted process,
version race — can no longer strand a game: one player refetching (or the
capped client nudge doing it for them) restores liveness. The `Poke`
envelope becomes part of the actor's contract and must stay reply-less and
idempotent. The view route now touches the registry, so actors become
resident on read traffic; eviction on game end (ADR-0020) is unchanged,
and `Poke` must not resurrect an evicted, ended game's actor beyond a
no-op. As implemented, the poke path also widens ADR-0020's eviction
trigger slightly: a poked room whose bootstrap load fails (no game row, or
a transient storage error — the reload swallows all failures identically)
is flagged for eviction alongside the ended case, which is free because
rooms are reconstructible from rows _(amended 2026-09-07, CAM-26
review)_. Bootstrap-armed timers do **not** change the restart tests'
observable orderings, contrary to this section's original worry: a
bootstrap-armed timer can only enqueue a `TimerClose` envelope behind the
in-flight command, and queue serialization guarantees the late slam is
judged inside its own envelope first — `SlamTooLate`, never `WrongPhase`,
deterministically. Both restart tests kept their assertions unchanged;
only their "bootstrap arms nothing" comments were rewritten _(amended
2026-09-07, CAM-26 review — the original text predicted a possible
`WrongPhase` flip and deliberate test updates that the design itself
forecloses)_. Revisit if a deployment gains an always-on
scheduler (a boot sweep would then be cheap) or if read traffic makes
actor residency costly.
