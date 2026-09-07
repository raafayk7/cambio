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

- [x] `pnpm turbo build typecheck lint test` passes.
- [x] Every S/C clause above has a row in a child plan's contract coverage
      table with a landed test (or a documented reason none can).
- [x] The two restart tests that pinned "bootstrap arms nothing"
      (`apps/api/test/SlamWindow.test.ts` restart case,
      `packages/application/test/SlamTiming.test.ts` restart case) are
      deliberately updated for the new arming behavior, not deleted.
- [x] F1's finding is posted to CAM-26.
- [x] Manual liveness check: with the api running and a game mid-window,
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

- [x] 2026-09-07 — planning complete; implementation not started
- [x] 2026-09-07 — M0 forensics done: no persisted stall found in any
      2026-09-06 game; finding posted to CAM-26 (see Surprises).
- [x] 2026-09-07 — M1 (backend, S1–S8, F1) and M2 (frontend, C1–C5)
      implemented in parallel on the task branch — both lanes' full
      per-package gates green independently; see
      [backend](../backend/CAM-26.md) and [frontend](../frontend/CAM-26.md)
      child plans' Progress sections for step-by-step detail.
- [x] 2026-09-07 — M3 integration pass: repo-wide
      `pnpm turbo build typecheck lint test` green (25/25 tasks, run bare,
      exit 0) once both lanes landed on the same tree. Manual restart-
      mid-window walkthrough performed against a real (non-test) dev api
      process — see Surprises for the full transcript. All acceptance
      criteria met.
- [x] 2026-09-07 — review fix cycle: all nine findings RESOLVED (see
      Outcomes & retrospective for the branch taken per finding — code +
      strengthened tests for 1 and 3; claim amendments for 2, 4–8;
      gallery specimen for 9). Sweeps re-run; suites re-run fresh + full
      gate; re-review below flipped the verdict to ship.

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
  _Resolved at review (2026-09-07): the race cannot happen — queue
  serialization means a bootstrap-armed timer only enqueues `TimerClose`
  behind the in-flight envelope, so the late slam is always judged first;
  `SlamTooLate` is deterministic, both tests kept their assertions, only
  comments changed (review finding 5; ADR-0037 Consequences amended to
  match)._
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
- 2026-09-07 (M0 forensics) — **F1 finding: no persisted evidence of a
  stall.** Queried `game_events` for every 2026-09-06 game with exactly 2
  players (13 games, all Raafay vs. Moony). Of those, 3 contain a
  `SlamFailed` whose `target.playerId` differs from the slammer (the
  "false slam on the opponent's card" shape the report describes):
  `22ffe19d-ec92-41c8-a730-52f51d32e648`,
  `e11e92cd-2f14-4f0e-8347-8692cb159ff8`,
  `f89ce987-e181-484b-a249-692f5d0f281f`. In all three, the ordered log
  (by `seq`) shows `SlamFailed` → `PenaltyDrawn` → `SlamWindowClosed` →
  `TurnAdvanced` landing correctly on the opponent, with no gap and no
  stall. No 2026-09-06 game is currently persisted in a `SlamWindow`
  phase, and no game's log shows a false slam with no following
  close/turn-advance. **Classification: the reported incident left no
  trace of an actual liveness failure in the durable event log** — this
  supports the ticket's own "mundane alternative" hypothesis (the
  give-slot prompt appearing before the outcome, plus the ~1200ms public
  reveal, being misread as a stall) over a reproduction of the structural
  defect. The structural defect itself (no recovery path for a genuinely
  stale `SlamWindow`) is real and independently confirmed by code
  inspection (see Context & orientation above) — this task fixes it
  regardless of whether this specific incident was its cause. Posted to
  CAM-26 as a comment.
- 2026-09-07 (M3, manual liveness check) — **live walkthrough against a
  real dev api process (not a test harness), confirming all four recovery
  layers end to end.** Started `apps/api`'s dev server, created two real
  users (Alice, Bob) via `POST /users`, formed a lobby, joined, and
  started a 2-player game over plain HTTP/curl. Alice drew and discarded
  a 4♦, opening a `SlamWindow` (`closesAt` ~5.5s out, version 5). Then:
  killed the api process outright (simulating a crash — the in-memory
  `RoomRegistry` actor and its timer fiber are gone, nothing but the
  persisted Postgres row survives); slept past `closesAt` with the api
  still down; restarted the api fresh (a brand-new process, cold
  `RoomRegistry`, no in-memory state at all); then, as Bob, did a plain
  `GET /games/:id/view` — the same request a page refresh makes. The
  first response still showed the stale `SlamWindow` at version 5
  (expected — S3's read stays a direct, unserialized row read; the
  poke's effect is fire-and-forget and lands slightly after the
  response). A **second** `GET /view` one second later (the "client's
  own nudge" round-trip C2 models) showed `AwaitingDraw` for Bob at
  version 6 — the window had closed and the turn had advanced, with no
  command ever sent and no server code running continuously in between.
  Confirmed for real, not just observed: Bob's `DrawFromDeck` immediately
  succeeded (200, version 7), proving the game was genuinely live again,
  not just showing a different phase tag. This is the acceptance
  criterion's exact scenario (kill+restart mid-window, refresh unsticks
  the game), performed against real process boundaries and real
  wall-clock time rather than the application/API test harnesses'
  simulated restarts and settable clocks.

## Outcomes & retrospective

_(filled by `/review`, 2026-09-07)_

**Verdict: fix-then-ship.** One probe-confirmed client bug plus
documentation/coverage corrections; no contract clause is behaviorally
violated on the happy path, no architecture or hidden-information
violation anywhere, and the four-layer recovery design works end to end
(fresh forced suites + the manual restart walkthrough both green).

### What passed

- Independent verification: full gate `pnpm turbo build typecheck lint
test` exit 0; then, because 24/25 tasks were cache hits, a forced fresh
  run `pnpm turbo test --filter <each pkg> --force` against live Postgres
  — domain 196, application 92, api 121, web 249 tests, all green.
- Contract verdicts: S2–S8 satisfied with real pinning tests (verified by
  test-body reading, not titles); S1 satisfied in code, split on coverage
  (finding 2). C1, C3, C4, C5 satisfied; C2 satisfied on the happy path
  with the unmount lifecycle bug below. F1 forensics consistent across
  both plans.
- Architecture: import boundaries, domain purity (S7 test-only), typed
  errors (poke's `Effect<void>` E=never), ports/clock discipline,
  ADR-0020 read-path semantics, hidden-information (poke placed after the
  membership check — no existence oracle; response byte-identical),
  design-token law (zero arbitrary values; overlay is the established
  `slamEligible` idiom, not an AI-default), ADR-0030/0033 test and
  refetch conventions — all clean.
- The strict batch test (`getsBefore + 1`) survived untouched, fixture
  unchanged, as the frontend plan predicted.

### Findings (rank order; fix cycle loads from here)

1. **[code bug — probe-confirmed] The nudge loop survives unmount when a
   fetch is in flight.** The cleanup (`use-game.ts:290-295`) clears
   `nudgeTimeoutRef` but never nulls `nudgeStateRef`, so an in-flight
   refetch's `.then` (`:252-272`) passes its cancellation guard (`:255`)
   and re-arms `setTimeout(runNudge, …)` (`:271`) on a dead component —
   continuing GETs (each also a server poke) up to the cap. Review probe
   (throwaway test, deleted): GET count grew 4 → 6 after `cleanup()` with
   a fetch held in flight. The comment at `:253-254` claims unmount
   cancellation the cleanup does not provide. The shipped unmount test
   (`slam-expiry-nudge.test.tsx:228-252`) cannot catch this: it unmounts
   _between_ attempts and its sync `vi.advanceTimersByTime` never drains
   microtasks. **Fix:** call `clearNudge()` in the cleanup; strengthen
   the unmount test to hold a fetch in flight across `cleanup()` (deferred
   handler + `advanceTimersByTimeAsync`), which fails against today's
   code. RESOLUTION: **RESOLVED 2026-09-07 — code fixed AND test
   strengthened.** The cleanup now calls `clearNudge()` (nulling
   `nudgeStateRef` so the settling fetch's cancellation guard catches
   unmount), and a new test in `slam-expiry-nudge.test.tsx` holds a
   deferred fetch in flight across `cleanup()` then advances async timers
   — the review probe's exact failing scenario, now green; the old
   unmount test was renamed to "between attempts" to say what it covers.
2. **[coverage overclaim] S1's Execute-bootstrap arming has no pinning
   test.** The backend coverage table's S1 row cites the `SlamTiming`
   restart test as asserting "bootstrap arms a timer", but that test's own
   rewritten comment says the observed sequence is "identical either way",
   and no landed test fails if the arming at `RoomRegistry.ts:225` is
   removed (the trailing `manageTimer` at `:247` and the lazy `closeIfDue`
   cover every tested path; the Poke-path load _is_ genuinely pinned by
   the cold-poke test). **Fix:** either land a test isolating `:225` or
   amend the S1 row to state the pin covers the Poke-path load only, with
   the Execute-half documented as unpinned-by-redundancy. Sweep: backend
   coverage S1 row; backend Progress step 2 ("7 new tests" — actually 6
   new + 1 deliberately rewritten). RESOLUTION: **RESOLVED 2026-09-07 —
   claim amended** (the arming is externally indistinguishable from the
   envelope-end `manageTimer`, so no isolating test is possible without a
   contrived short-circuit): the S1 row now cites only the poke test and
   documents the `Execute`-bootstrap site as unpinned-by-redundancy; the
   Progress count reads "6 new + 1 deliberately rewritten".
3. **[coverage phrase mismatch] Frontend C3 row overstates its test.**
   "a decoded event right after is still handled normally" — the test
   bodies (`game-screen.test.tsx` C3 pair) only assert another `+1` GET,
   which passes even if the decode guard were inverted and the handler
   never ran. **Fix:** strengthen the follow-up assertion to observe a
   handled effect (choreography/state), or amend the phrase to what is
   asserted. RESOLUTION: **RESOLVED 2026-09-07 — test strengthened** (the
   preferred branch): both decoded follow-ups now land observable handled
   effects — the room case emits `CardPeeked` and asserts the selected
   slot beat; the player case emits `PrivateCardPeeked` and asserts the
   revealed rank — in addition to their refetch counts; the coverage
   phrase was updated to name those assertions.
4. **[load-bearing comment false] `isSameStaleWindow`'s docblock**
   (`use-game.ts:150-159`) claims it inspects "the FETCHED result … never
   the applied cache"; on exactly the guard-dropped path it describes, the
   query fn returns the cache (`:196`), so `result.data` _is_ the cache.
   (Corollary: the `data === undefined` branch is unreachable from this
   call path.) Behavior is correct; the C5 rationale comment is not.
   **Fix:** rewrite to the true discipline — "the loop never requires its
   own response to be _applied_". RESOLUTION: **RESOLVED 2026-09-07 —
   claim amended**: the docblock now states the real discipline (the loop
   never requires its own response applied; `data` may be the cache on
   the guard-dropped path, and a cache that moved ahead reads as
   progress).
5. **[ADR accuracy] ADR-0037's Consequences describes an outcome that
   didn't happen.** It predicts restart tests may flip `SlamTooLate` →
   `WrongPhase` "when the close wins the race" and says the tests were
   "updated deliberately" — but queue serialization forecloses the race (a
   bootstrap-armed timer can only _enqueue_ `TimerClose` behind the
   in-flight `Execute`), and only comments changed, zero assertions.
   Relatedly, the rewritten comments in `SlamTiming.test.ts:213-215` and
   `SlamWindow.test.ts:658-661` credit scheduler timing rather than queue
   serialization for a deterministic guarantee. **Fix:** amend 0037's
   Consequences (proposed ADR, same release — Consequences amendment, the
   Decision stands) and correct both test comments. Sweep the root
   Decision Log's arm-only entry for the same "accept either ordering"
   phrasing and annotate it resolved-deterministic. RESOLUTION:
   **RESOLVED 2026-09-07 — claim amended everywhere**: ADR-0037's
   Consequences carries a dated amendment (queue serialization forecloses
   the race; assertions unchanged, comments-only updates); both test
   comments now credit queue serialization; the root Decision Log entry
   carries a resolved-deterministic note. Sweep re-run across all four
   task docs: the remaining `WrongPhase`/"either ordering" hits are the
   backend plan's accurate conditional prose (its Step 3 correctly says
   `WrongPhase` needs a _second_ envelope) and this retrospective itself.
6. **[misdirected citation] `config.ts` and `.env.example` cite
   "CAM-26/ADR-0037" for the 7500 default**, but ADR-0037 carries no
   duration decision — it lives in this plan's Decision Log. **Fix:**
   re-point both comments at the root plan's Decision Log (or add the
   duration line to 0037). RESOLUTION: **RESOLVED 2026-09-07 — claim
   amended**: both comments now point at the root plan's Decision Log
   explicitly ("not ADR-0037").
7. **[comment narrower than code + unlogged widening] The Poke eviction
   comment** (`RoomRegistry.ts:286-291`) attributes `evict = true` to
   "no game row", but `reload` swallows _every_ failure identically, so a
   transient `StorageError` also evicts; the `evict` flag is also sticky
   once set. Both benign (cold cacheless actor, reconstructible rooms),
   but ADR-0020's "eviction on game end only" has silently widened.
   **Fix:** correct the comment; add one sentence to ADR-0037's
   Consequences acknowledging poke-path eviction of dead/unloadable
   rooms. RESOLUTION: **RESOLVED 2026-09-07 — claim amended**: the
   `RoomRegistry` comment now names the transient-`StorageError` path and
   the sticky `evict` flag; ADR-0037's Consequences gained the
   eviction-widening sentence with a dated amendment note.
8. **[stale plan note] Frontend plan's closing Surprise** still reports
   the repo-wide gate red at `//#format:check` on
   `EndToEndGame.test.ts` — resolved by the backend lane before M3; the
   gate is green. **Fix:** annotate the Surprise as resolved.
   RESOLUTION: **RESOLVED 2026-09-07 — claim amended** (annotation added
   to the frontend plan's Surprise).
9. **[convention gap] No gallery specimen for the new canonical
   `slam-window` deck state.** Every other canonical `DrawDeck` state has
   a `StateCard` in `apps/web/src/components/gallery/game.tsx`, including
   both r2 additions and the two precedents this change cites
   (`slamTarget`, `slamEligible`). **Fix:** add the StateCard.
   RESOLUTION: **RESOLVED 2026-09-07** — `StateCard` "deck slam-window
   (CAM-26 C4)" added to the gallery's deck section, using the canonical
   prop only.

### Advisory (no action required; recorded for future tasks)

- The poke idempotency test (`RoomRegistry.test.ts:548-571`) is
  near-vacuous — an unprocessed poke and an inert poke are
  indistinguishable; no positive control. S4's "wrong phase" sub-case and
  S2's `closeIfDue`-conflict site are correct by construction but
  unpinned. C2's 2s pacing is unpinned (a synchronous burst of 5 would
  pass). C1's re-fire guard for an already-fired window across a
  `resolving` toggle is covered by inspection only.
- "Progress = version advance" ends the nudge loop on any concurrent
  command (e.g. another player's failed slam) while the window is still
  stale — self-heals because that nudge's GET already poked the actor,
  but the loop's invariant is looser than its comment states.
- `poke` takes the registry-wide creation semaphore on every GET view
  (non-blocking work only — fine today; a sentence in ADR-0037 if read
  volume grows). An ended game pays a load + actor create/evict per view
  read; a cheap guard would skip the poke when the just-read phase is
  `Ended`.
- The overlay's `card-frame card-md` + `inset-0` are redundant
  constraints that agree only while the stack footprint is `card-md`; two
  test titles promise more than their bodies run (`draw-deck.test.tsx`
  "with or without onClick omitted"; the nudge suite's unmount title —
  the latter is fixed by finding 1).

### Deferred

Nothing from the contract. The manual walkthrough, forensics, and 7500ms
tuning all landed as specified.
