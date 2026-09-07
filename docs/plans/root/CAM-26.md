# CAM-26 — Slam window liveness: expiry recovery on every layer

- **Linear:** [CAM-26](https://linear.app/raafayk7/issue/CAM-26)
- **Scope:** fullstack
- **Child plans:** [backend](../backend/CAM-26.md) · [frontend](../frontend/CAM-26.md)
- **ADRs:** [0037](../../adr/0037-slam-window-liveness-layered-recovery.md) —
  the layered recovery design (view-route poke, re-arm on load/conflict,
  client expiry nudge)

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

Today a stale `SlamWindow` can strand a game forever: if the server's
in-memory close timer dies (restart, version conflict) and the close
broadcast never reaches clients, every player stares at an inert draw deck
with no message and no way out. After this task, the game recovers from any
single such failure: the server re-arms its timer whenever it loads state,
the view route nudges the room actor awake, and the client notices an
expired window and refetches until the world moves. Observably: kill the
API mid-slam-window, restart it, refresh the page — the window closes and
the next player can draw. The window also shrinks from 10s to 7.5s, and the
deck visibly signals "held by the slam window" instead of going silently
dead.

## Context & orientation

The room actor (`packages/application/src/room/RoomRegistry.ts`, ADR-0020)
serializes all commands per game. `SlamWindow` close is an issuer-less
internal command (`CloseSlamWindow`) reachable only via the actor's
`closeIfDue` — from an in-memory timer fiber (`manageTimer`) or lazily
before the next non-`Slam` command. Four gaps stack into the strand
(verified in exploration, file:line as of `release-v0` @ 40c2318):

- **No bootstrap arming.** The actor is created lazily on the first
  envelope (`RoomRegistry.ts:315-336`); the only state load is inline in
  the `Execute` branch (`:178-186`) and never runs `manageTimer`. There is
  no boot-time sweep of in-progress games.
- **`VersionConflict` disarms.** Both nulling sites (`:170-172`,
  `:199-201`) leave `cache === null`, and the subsequent `manageTimer`
  starts with `clearTimer` (`:137`) — the live window timer is interrupted
  and replaced with nothing.
- **Reads bypass the actor.** `GET /games/:gameId/view`
  (`apps/api/src/presentation/games.ts:63-106`) reads the state row
  directly (deliberate — ADR-0014/0020), so refetches never trigger the
  lazy close, and a stale window is served at an unchanged version — which
  the client's version guard
  (`apps/web/src/containers/game/use-game.ts:160-167`) then discards.
- **The client has no expiry behavior.** `SlamTimer`
  (`apps/web/src/components/game/slam-timer.tsx`) drains a bar on a 50ms
  interval and fades out at zero — no callback, no polling. A
  broadcast-decode failure returns before `scheduleRefetch` in **both**
  subscriptions (`use-game.ts:607`, `:618`), dropping the resync too.

Terminal state: `affordancesFor` returns bare `{ phase: "SlamWindow" }`
(`apps/web/src/containers/game/affordances.ts:189-190`), so `DrawDeck`
renders with no `onClick` (`game-screen.tsx:704-716`) — inert. The
`TurnIndicator` does say "Slam window open — match the X"
(`game-screen.tsx:622-624`), and `DiscardPile` carries a `slamTarget`
alarm state (`:721`); the deck is the only silent participant.

Governing law: ADR-0011 (fixed `closesAt`, duration from
`GameConfig.slamWindowMs`), ADR-0020 (actor; cache is an optimization),
ADR-0033 (refetched view is authoritative; broadcasts are triggers only),
ADR-0037 (this task's design), the `application-layer` skill (timers are
never the authority), and the `design-system` skill (the new deck state
crossed the creation gate with explicit user authorization — see Decision
Log).

Also in scope: the playtest forensics. The 2026-09-06 report ("I got their
card, they got a new one" after a supposed false slam) matches no
false-slam outcome; the event log decides what happened. Retention is safe
(ADR-0025: soft-delete only after 30 idle days; local Docker Postgres
schedules nothing).

## Functional contract

Server (S), client (C), forensics (F). "Window" means a `SlamWindow` phase
whose `closesAt` has passed per the authoritative `ClockPort`.

- **S1 — Arm on load.** Whenever the actor populates its cache from
  persistence (lazy `Execute` bootstrap, or the new `Poke` path), a cached
  `SlamWindow` phase ends up with an armed timer. A past-due window closes
  promptly (zero-duration sleep → `TimerClose`), with the close persisted
  and published as a normal batch.
- **S2 — Re-arm after conflict.** After a `VersionConflict` invalidates
  the cache, the actor re-loads and re-arms; an open window is never left
  timer-less by a conflict.
- **S3 — Poke-on-read.** `GET /games/:gameId/view` enqueues a reply-less
  `Poke` envelope to the game's room actor (in addition to, not instead
  of, its direct row read). Handling `Poke` bootstraps the cache if cold,
  runs `closeIfDue`, and re-arms. The HTTP response shape, status codes,
  and non-serialized read semantics are unchanged.
- **S4 — Poke is inert when there is nothing to do.** A `Poke` for a game
  with no open-and-due window (wrong phase, still-open window, ended game)
  changes no persisted state and publishes nothing. It does not disturb
  eviction semantics: an ended game's close-out still evicts per ADR-0020.
- **S5 — Close publishes.** A close reached via `Poke` publishes
  `SlamWindowClosed` + `TurnAdvanced` on the room channel exactly like the
  timer-fired close (existing behavior for timer closes, pinned by
  `apps/api/test/SlamWindow.test.ts` "closes the window unprompted when
  the timer fires"; the poke path must match it).
- **S6 — Default duration.** `SLAM_WINDOW_MS` defaults to **7500**
  (config, `.env.example`, and the default-pinning test all agree). Games
  already in flight keep the value they started with (existing behavior,
  pinned by `packages/application/test/ViewFor.test.ts` config
  projection).
- **S7 — Domain sequence.** A domain test pins: false opponent slam →
  `CloseSlamWindow` → next player's `DrawFromDeck` is legal and succeeds
  (the brief's gap — `packages/domain/test/Slam.test.ts` asserts hands
  only).
- **S8 — Integration sequence.** An API-level test plays: slam during a
  window, window closes, the next player draws over HTTP — closing the
  `EndToEndGame.test.ts` gap where `Slam` is filtered out of the script.
- **C1 — Expiry fires once.** `SlamTimer` gains an `onExpire` callback
  fired exactly once per window when local time passes `closesAt` plus a
  small skew grace — not once per 50ms tick, and not while `resolving`.
- **C2 — Bounded nudge.** On expiry the client schedules a view refetch
  (which, via S3, nudges the server). While a refetched view still shows
  the same expired window, the client re-nudges on a short interval, a
  bounded number of times, then stops (the existing `onResubscribe`
  recovery remains the backstop). A view showing progress (new version,
  phase change) ends the nudge loop.
- **C3 — Decode failure still resyncs.** A broadcast payload that fails to
  decode still triggers `scheduleRefetch`, on **both** the room and player
  subscriptions (upholding ADR-0033's "refetched view is authoritative").
- **C4 — The deck signals the window.** During an open slam window,
  `DrawDeck` renders a new canonical `slam-window` state — a quiet visual
  treatment using existing alarm tokens, symmetric with
  `DiscardPile.slamTarget`; still no button, no `onClick`, no new copy.
  `design-system/components/core/draw-deck.md` is revised in the same
  change (creation gate: authorized, see Decision Log).
- **C5 — Recovery is version-guard-proof.** The client's recovery path
  must not depend on same-version refetch responses being applied (the
  guard drops them); it completes via the poke-triggered close broadcast
  and the version bump it carries.
- **F1 — Forensics.** The 2026-09-06 playtest game's `game_events` are
  queried (ordered by `seq`, `deleted_at IS NULL`); the observed anomaly
  is classified (`SlamFailed`+`PenaltyDrawn` vs
  `SlamSucceeded`+`CardGivenFromHand`, and whether a close/turn-advance
  ever followed); the finding is recorded in this plan's Surprises and as
  a Linear comment on CAM-26.

### Acceptance criteria

- [ ] `pnpm turbo build typecheck lint test` passes.
- [ ] Every S/C clause above has a row in a child plan's contract coverage
      table with a landed test (or a documented reason none can).
- [ ] The two restart tests that pinned "bootstrap arms nothing"
      (`apps/api/test/SlamWindow.test.ts` restart case,
      `packages/application/test/SlamTiming.test.ts` restart case) are
      deliberately updated for the new arming behavior, not deleted.
- [ ] F1's finding is posted to CAM-26.
- [ ] Manual liveness check: with the api running and a game mid-window,
      kill and restart the api; after the window's `closesAt` passes, a
      page refresh (or the client's own nudge) unsticks the game.

## Plan of work

**No contracts freeze is needed**: the wire surface is deliberately
unchanged (no new commands, no schema changes — poke rides the existing
GET). Backend and frontend milestones are therefore parallelizable after
M0, with one sequencing note: C2's end-to-end validation needs S3 on the
same branch, so final integration verification happens after both land.

- **M0 — Forensics** (first; independent). Run the event-log query against
  the local database for the 2026-09-06 game, classify the anomaly, record
  it (Surprises + Linear comment). Detail: backend child plan.
- **M1 — Server liveness** (backend child plan). The `Poke` envelope and
  its handling (bootstrap-if-cold, `closeIfDue`, `manageTimer`); arm-on-
  load at the `Execute` bootstrap; re-load-and-re-arm after
  `VersionConflict`; the view route's fire-and-forget poke; the 7500ms
  default (three files); the S7 domain test and S8 integration test; the
  deliberate update of the two restart tests.
- **M2 — Client recovery + deck state** (frontend child plan). `onExpire`
  on `SlamTimer` (fire-once, skew grace); the bounded nudge loop in
  `use-game`; the decode-failure refetch fix at both sites; the `DrawDeck`
  `slam-window` state plus `draw-deck.md` revision and test updates
  (including the strict refetch-count assertion in
  `game-screen.test.tsx` that any new refetch source will break).
- **M3 — Integration pass.** Both sides on the task branch: run the full
  gate, then the manual restart-mid-window walkthrough (fresh dev servers
  per the AGENTS.md staleness rule).

## Validation

Beyond the acceptance list: the child plans carry per-clause test intents
in their coverage tables. The load-bearing new proofs are (a) an
application-layer test that a poke on a cold actor with a past-due
persisted window closes it and publishes (S1+S3+S5 in one), (b) a
`VersionConflict` test asserting the timer is re-armed (S2 — extend the
existing conflict self-heal test), (c) a jsdom test that an expired window
with no broadcast still produces refetches that stop when the view moves
(C1+C2), and (d) a malformed-broadcast test asserting the refetch still
happens (C3 — the fake realtime harness currently never emits garbage;
that's the new fixture). S7/S8 close the brief's named test gaps.

## Progress

_(updated continuously; append new entries at the BOTTOM — newest last;
timestamp each entry)_

- [ ] 2026-09-07 — planning complete; implementation not started

## Decision log

- 2026-09-07 — **Poke-on-read over serialized reads or a wire nudge
  command** — user's call; promoted to ADR-0037 (alternatives and
  rationale there).
- 2026-09-07 — **`SLAM_WINDOW_MS` default 10000 → 7500** — user's call,
  confirmed knowing the CAM-23 history (10000 was a deliberate raise from
  5000 because the give-pick flow burned the window; CAM-23's pre-armed
  "Ready a give" flow reduced that pressure). Config default only; games
  in flight keep their value.
- 2026-09-07 — **Creation gate authorization: new `slam-window` state on
  `DrawDeck`** — user authorized crossing the gate. Quiet visual treatment
  with existing alarm tokens, symmetric with `DiscardPile.slamTarget`; no
  button, no caption copy. `draw-deck.md`'s "static stack, never a
  disabled button" rule stays true — this is a state, not a disabled
  control. Doc revision + `draw-deck.test.tsx` update ride the same
  change.
- 2026-09-07 — **Bounded client nudge over single-shot or polling** —
  user's call. Suggested constants (advisory, tune at implement): ~500ms
  skew grace, ~2s re-nudge interval, cap ~5 attempts.
- 2026-09-07 — **Arm-only at load; no forced close in the Execute
  bootstrap prologue** — a past-due window closes via the zero-duration
  timer moments later, and the existing lazy `closeIfDue` still runs for
  non-`Slam` commands. Consequence: after a restart, a late `Slam` may
  race the bootstrap-armed close and get `WrongPhase` instead of
  `SlamTooLate`; UX-safe because CAM-23 already remaps `WrongPhase` →
  slam-too-late copy for `Slam` commands. The two restart tests are
  updated deliberately (accept either ordering or pin the new one).
- 2026-09-07 — **No boot-time sweep of in-progress games** — rejected in
  ADR-0037 (demand-driven poke covers it; a sleeping host can't sweep).

## Surprises & discoveries

_(anything found mid-implementation that the plan didn't predict — wrong
assumptions, upstream bugs, better approaches. Evidence included.)_

- 2026-09-07 (planning) — a plain client refetch cannot recover the game
  at all today: the read path bypasses the actor **and** the client
  discards equal-version responses. The brief's "onExpire → refetch"
  suggestion is only sufficient together with poke-on-read.
- 2026-09-07 (planning) — the decode-failure refetch drop exists in
  **both** subscriptions (room `use-game.ts:607`, player `:618`), not one.
- 2026-09-07 (planning) — `VersionConflict` doesn't merely fail to arm; it
  actively interrupts the live timer (`manageTimer` leads with
  `clearTimer`). The window is more stranded after a conflict than before.

## Outcomes & retrospective

_(filled at the end, typically by `/review`)_
