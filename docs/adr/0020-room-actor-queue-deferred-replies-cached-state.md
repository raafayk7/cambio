# 0020 — Room actor: per-room queue with Deferred replies, cached state, evict on game end

- **Status:** accepted
- **Date:** 2026-09-01
- **Task:** CAM-5

## Context

HANDOFF §6 mandates the shape: all commands for a room go through a single
Effect `Queue` consumed by one fiber per room, so slam races are
deterministic — first-in-queue wins, ordering is server-authoritative.
What §6 does not decide is the mechanics: how callers receive typed
outcomes from a queue that is fire-and-forget by nature, whether the actor
keeps state in memory between commands, what happens on a
`VersionConflict`, when actors are evicted, and where the slam-window
close timer lives. The repo has essentially no concurrency precedent
(one `acquireRelease` in `apps/api/src/index.ts`), so whatever CAM-5 builds
becomes the pattern.

## Decision

We build an in-memory **room registry** service in `packages/application`
that lazily creates one actor per room. The mechanics:

- **Replies via `Deferred`.** The queue carries envelopes
  `{ command, reply: Deferred<outcome> }`. The room fiber runs the use case
  and completes the `Deferred` with the typed success or typed error
  (`IllegalMove` variants, `VersionConflict`, …); the caller enqueues and
  awaits. Typed errors survive end to end — no polling, no exception
  tunneling. (Alternative rejected: fire-and-forget with outcomes learned
  from published events — CAM-6's HTTP layer could not return per-command
  errors.)
- **Cached state.** The actor holds `{ state, version }` in memory,
  updating it after each successful save. It loads (or folds, per HANDOFF
  §6 restart semantics) only when the actor starts — this is the
  "rebuild on first command after restart" story. One fiber per room makes
  the cache race-free. (Alternative rejected: reload from the repository on
  every command — more round-trips and makes §6's in-memory room state
  vestigial.)
- **`VersionConflict`: surface and invalidate, never retry.** Under
  one-fiber-per-room a conflict signals a real anomaly (restart race,
  second instance). The actor completes the caller's `Deferred` with the
  typed conflict and drops its cache so the next command reloads. A silent
  retry would reorder commands relative to whatever won, muddying
  server-authoritative ordering.
- **Eviction on game end only.** The actor and queue are removed from the
  registry when the game reaches `Ended` (or the lobby is abandoned). Idle
  live rooms stay resident — acceptable on a single small instance, and
  reconstructibility makes eviction safe to add later if needed.
- **A room can fail, never hang** (added in the CAM-5 review fix cycle).
  The actor is supervised: every use-case call is exit-guarded and
  completes the caller's `Deferred` — defects included; a defect escaping
  the guard completes the current envelope's reply with its cause and
  tears the actor down; an `ensuring` finalizer on every exit (eviction,
  defect, layer shutdown) unregisters the room under the creation lock and
  interrupts any stranded envelopes, so the next message always reaches a
  fresh actor rebuilt from persisted state.
- **Slam-window close timer lives in the actor, as an optimization only.**
  When a save leaves the game in `SlamWindow`, the actor forks a fiber that
  sleeps until `closesAt` and enqueues `CloseSlamWindow` through the same
  queue. Correctness never depends on it (ADR-0011, HANDOFF §6): the engine
  never auto-closes the window, so before processing any command while the
  cached phase is `SlamWindow` with `ClockPort.now >= closesAt`, the actor
  first executes a `CloseSlamWindow` as its own persisted and published
  batch — the lazy path that works even when the process was asleep at
  `closesAt`. The injection is skipped for a `Slam` (a late slammer gets
  the engine's specific `SlamTooLate` rather than a post-close
  `WrongPhase`) and for an explicit `CloseSlamWindow` (which simply runs).
  A close that is illegal by the time it is processed (the other path won)
  is dropped silently.

## Consequences

- `packages/application` gains its first stateful service; the
  `Queue`/`Deferred`/fiber idioms established here are the template for
  future concurrency in this repo.
- Use cases remain plain functions; serialization is entirely the actor's
  concern, so use-case tests need no queue and queue tests need few use
  cases.
- A second API instance would break the single-writer assumption — the
  typed `VersionConflict` is the tripwire, and horizontal scaling remains
  explicitly out of scope (HANDOFF §6: no Redis pre-emptively).
- The timer fiber introduces the repo's first time-based concurrency;
  tests must use a controllable clock and must prove the lazy close path
  works with the timer disabled.
