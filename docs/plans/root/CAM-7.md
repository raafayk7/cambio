# CAM-7 — Slam window end-to-end — timing authority, races, penalties

- **Linear:** [CAM-7](https://linear.app/raafayk7/issue/CAM-7/slam-window-end-to-end-timing-authority-races-penalties)
- **Scope:** backend
- **Child plans:** [backend](../backend/CAM-7.md)
- **ADRs:** none needed — every timing decision this task touches is already
  covered by ADR-0009 (zero-card draws-then-gives), ADR-0011 (fixed
  `closesAt` from config), ADR-0012 (empty discard skips the window),
  ADR-0020 (actor timer as optimization, lazy close), and ADR-0022
  (penalties unseen). The two candidate decisions planning surfaced
  (processing-time lateness; no timer re-arm on bootstrap) reaffirm those
  ADRs' semantics and are recorded in the Decision Log below.

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

After this task we have proof — not design intent — that slamming works
under real timing conditions: concurrent slammers racing over HTTP, slams
arriving after `closesAt`, the window expiring while no fiber is alive, and
a process restart mid-window. The observable outcome is a set of
integration/e2e tests (`pnpm turbo test`) covering every row of the gap
table below; production code changes only where a test exposes a real gap
(exploration found none — the expected diff is test files plus a
test-support change to make the clock injectable).

## Context & orientation

All slam **production** code already ships and matches its ADRs
(explored 2026-09-02; no contradictions, no TODOs in slam paths):

- **Engine** (`packages/domain/src/Engine.ts`): the slam handler covers all
  four outcome cells (`Engine.ts:242-319`), penalty draws with reshuffle
  (`Engine.ts:82-89`), give-into-vacated-slot (`Engine.ts:288-291`),
  zero-card draw-then-give (`Engine.ts:301-318`, ADR-0009), skipped draws
  (`Engine.ts:254-257,303-305`, ADR-0011). `closesAt` is computed in
  exactly one place — `Engine.ts:59`, `now + config.slamWindowMs` — and a
  slam never rewrites the phase, so it never moves. Lateness:
  `Legality.ts:191-193` rejects `now >= closesAt` with `SlamTooLate`
  (half-open window `[open, closesAt)`); `now` is always a parameter, never
  a command field.
- **Actor** (`packages/application/src/room/RoomRegistry.ts`): close-timer
  fiber (`:136-148`) enqueues a reply-less `TimerClose`; `closeIfDue`
  (`:156-173`) re-validates against `ClockPort` and runs `CloseSlamWindow`
  through the same persist+publish path as any command; the lazy close
  (`:188`) is skipped for `Slam` (so a late slammer gets `SlamTooLate`,
  not `WrongPhase` — probed this session) and for explicit
  `CloseSlamWindow`. ADR-0020 governs.
- **Presentation** (CAM-6): `Slam` on the wire
  (`packages/contracts/src/GameCommand.ts:38-41`; `CloseSlamWindow`
  deliberately absent), `POST /games/:gameId/commands`
  (`apps/api/src/presentation/games.ts:36-57`), `SlamTooLate → 422` in the
  exhaustive `commandErrorStatus` switch
  (`apps/api/src/presentation/errors.ts:77`). Event classification
  (`packages/application/src/projection/EventProjection.ts:113-163`,
  ADR-0009/0022): `SlamSucceeded`/`SlamFailed` keep the card (the §1.5
  public reveal), `PenaltyDrawn` and `CardGivenFromDeck` are stripped,
  none produce per-player private deliveries.
- **Config**: `SLAM_WINDOW_MS` env, default 5000 (placeholder pending
  playtesting, per ADR-0011/§9.4) — `apps/api/src/config.ts:41` →
  `lobbies.ts:112` → `StartGame` → projected on `GameStarted`.
- **Test infra**: `apps/api/test/support/http.ts` builds the real server
  over real Postgres (:5433) with a recording publisher and overridable
  `slamWindowMs`, but hard-wires the real clock (`ClockLive` pre-provided
  into `RoomRegistryLive` at `support/http.ts:70-84`) — merging a fake
  `ClockPort` on top cannot reach the registry. `packages/application`'s
  stub kit (`test/support/stubs.ts`) has the settable authority clock +
  TestClock two-clock pattern.

**Coverage gap table** (what exists vs. what CAM-7 adds):

| Scenario                                          | Today                                                                        | CAM-7                                                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Slam races serialized deterministically           | actor-level, frozen clock (`RoomRegistry.test.ts:42-118`)                    | + over HTTP against real DB; + race where processing crosses `closesAt`                                 |
| Late slam rejected                                | domain boundary (`Slam.test.ts:355`, `Fuzz.test.ts:63-86`)                   | + through the actor (`SlamTooLate` not `WrongPhase`); + over HTTP as 422                                |
| Timer vs lazy close equivalent; stale timer no-op | actor-level (`RoomRegistry.test.ts:307-372`)                                 | + lazy close and timer close observed through the real route/publisher stack                            |
| Four outcome cells + penalties + give             | domain (`Slam.test.ts`) + projection (`EventProjection.test.ts`)             | + e2e over HTTP with publisher-capture assertions incl. reveal + leak-freedom                           |
| Window expiry with dead/sleeping actor            | none                                                                         | new: window expires with no live timer; next command lazily closes                                      |
| Restart-refold mid-window                         | restart tests never restart in `SlamWindow` (`RoomRegistry.test.ts:236-306`) | new: teardown mid-window, `closesAt` passes, rebuilt actor lazily closes; late slam still `SlamTooLate` |

Governing docs: HANDOFF §1.5, §6; skills `cambio-rules`,
`application-layer`, `hidden-information` (for the publisher-capture
assertions), `infrastructure-persistence` (real-DB suites).

## Functional contract

Every clause below either cites the test that already pins it or was
probe-verified against running code during planning (2026-09-02); clauses
marked **(new)** are the coverage this task adds. Wire/event schemas are
already frozen — CAM-7 changes nothing in `packages/contracts`.

**C1 — Window lifecycle & timing authority**

- **C1.1** `closesAt` is computed once, at window open, as
  `now + config.slamWindowMs`; no slam attempt moves it. _(pinned:
  `Slam.test.ts:337`; source `Engine.ts:59`)_
- **C1.2** `slamWindowMs` comes from `SLAM_WINDOW_MS` (default 5000) at
  game creation and is projected to clients on `GameStarted`. _(pinned:
  `Config.test.ts:86-90`, `Lobbies.test.ts:160`,
  `EventProjection.test.ts` GameStarted rows)_
- **C1.3** A `Slam` processed at `now >= closesAt` is rejected with
  `SlamTooLate` — even when the persisted phase is still `SlamWindow`
  because no close was ever processed (dead timer, sleeping server).
  Lateness is judged at **processing time** against the stored `closesAt`;
  the actor's lazy close is skipped for `Slam` so the error is
  `SlamTooLate`, never `WrongPhase`. _(probe-verified this session at the
  actor level; **(new)** pin at actor level and over HTTP)_
- **C1.4** Over HTTP, a late slam returns **422** with
  `error.tag === "SlamTooLate"`. _(mapping row `errors.ts:77` + pinned
  route mapping machinery `GameCommands.test.ts:110-111`; **(new)** pin
  the `SlamTooLate` row end-to-end)_
- **C1.5** `CloseSlamWindow` is not reachable over the wire (400 at
  decode). _(pinned: `GameCommands.test.ts:114-119`)_
- **C1.6** The timer-fired close and the lazy close produce equivalent
  state, log, and publishes; both go through the same persist+publish
  path; a stale/illegal close is a silent no-op. _(pinned at actor level:
  `RoomRegistry.test.ts:307-372`; **(new)** observe both paths through the
  real route + recording-publisher stack)_

**C2 — Races**

- **C2.1** Concurrent slam submissions serialize in enqueue order —
  first-in-queue wins; the loser is judged against the post-winner state;
  the outcome is deterministic and equivalent to sequential execution.
  _(pinned at actor level: `RoomRegistry.test.ts:42-118`; **(new)** concurrent
  submissions over HTTP against real Postgres: exactly one consistent
  outcome set, monotonically increasing versions, coherent event log)_
- **C2.2** A player may slam multiple times within one window; each
  attempt is judged independently against the current state. _(pinned:
  `Slam.test.ts:337`; **(new)** exercised in the e2e slam scenarios)_
- **C2.3** A slam submitted in-window but processed after `closesAt`
  (e.g. queued behind a slower command) is rejected `SlamTooLate` —
  processing-time lateness, per Decision Log. _(**new** at actor level with
  the settable clock)_

**C3 — Outcomes, penalties, reveal (end-to-end)**

- **C3.1** All four outcome cells behave per §1.5 over the full stack:
  own/correct removes the card (hole remains); own/incorrect leaves it and
  penalty-draws; opponent/correct removes it and the slammer's named give
  card fills the vacated slot; opponent/incorrect leaves it with the owner
  and penalty-draws. _(pinned at domain level: `Slam.test.ts:51-149`;
  **(new)** each cell driven over HTTP with reply-view and
  published-event assertions)_
- **C3.2** Published slam events obey the classification: `SlamSucceeded`
  and `SlamFailed` carry the slammed card on the room channel (the §1.5
  momentary public reveal); `PenaltyDrawn` is slot-only (ADR-0022);
  `CardGivenFromDeck` is value-stripped (ADR-0009); `CardGivenFromHand` is
  value-free by construction; no slam event produces a per-player private
  delivery. _(pinned at projection level: `EventProjection.test.ts:94-268`;
  **(new)** asserted from publisher-port capture in the e2e scenarios,
  including leak-freedom of replies and room payloads)_
- **C3.3** Zero-card slammer draws-then-gives unseen (ADR-0009), and
  impossible penalty/give draws are skipped with an explicit `DrawSkipped`
  event (ADR-0011). _(pinned: `Slam.test.ts:245,293,313`, simulation
  counters `Simulation.test.ts:250-253`; e2e reach not required — cells
  stay covered at domain level if no seed reaches them over HTTP)_

**C4 — Sleeping server & restart**

- **C4.1** When the window expires while **no close fiber is alive**, the
  next non-`Slam` command first executes the lazy close as its own
  persisted and published batch, then processes normally. _(pinned at
  actor level with timer disabled: `RoomRegistry.test.ts:307-372`; **(new)**
  through the real HTTP stack: post-expiry command returns 200 and
  `SlamWindowClosed` is published before the command's own events)_
- **C4.2** Restart-refold mid-window: if the actor (process) dies while
  the phase is `SlamWindow` and `closesAt` passes before anything
  restarts, a fresh registry over the same persisted rows rebuilds the
  room, arms no timer, and resolves the window lazily on the next
  command; a late `Slam` after the restart still gets `SlamTooLate`.
  _(**new** — at application level via a second `Effect.provide` over the
  same repo stub, and over HTTP via a second `makeTestApp` against the
  same database rows)_
- **C4.3** A game left in `SlamWindow` with no further traffic stays
  parked in that phase — accepted as designed (Decision Log): timers are
  optimization, `closesAt` still governs, nobody can slam late. The
  C4.2 tests are the evidence this is safe. _(documented, not "fixed")_

### Acceptance criteria

- [x] Every **(new)** clause above has a landed test; the backend child
      plan's Contract coverage table maps clause → test file + name +
      assertion phrase. _(filled 2026-09-02: 3 tests in `SlamTiming.test.ts`,
      7 in `SlamWindow.test.ts`)_
- [x] No production behavior changes (contracts, domain, application,
      api `src/`) unless a test exposed a real gap — any such change is
      recorded in Surprises with the failing test that forced it.
      _(zero production edits; every new test passed against unmodified
      production code — child plan Surprises)_
- [x] Test-support changes (clock injectability, any seed override) live
      only under `apps/api/test/` / `packages/application/test/`.
      _(sweep prints nothing for any production dir)_
- [x] The full gate passes, run bare: `pnpm turbo build typecheck lint test`.
      _(exit 0, 22/22 tasks, 2026-09-02)_
- [x] No new flake: timing tests use injected/settable clocks or generous
      real-time margins with polling; no bare `sleep`-and-assert.
      _(the one real-time test — timer close — deadline-polls; stable over
      four repeat runs at ~0.5 s)_

## Plan of work

No contracts freeze is needed — `packages/contracts` is untouched (the
wire command union and event schemas shipped in CAM-6). Order:

1. **M1 — Test-support enablement** (`apps/api/test/support/http.ts`):
   make `ClockPort` injectable into `PortsLayer` _before_
   `RoomRegistryLive` is built (today `ClockLive` is captured at layer
   construction, so an override merged on top never reaches the registry).
   Mirror the `packages/application` settable-clock pattern where useful.
   This is the one production-adjacent change exploration predicts; it
   touches test support only.
2. **M2 — Application-level timing tests** (`packages/application/test/`):
   pin the probe (late `Slam` → `SlamTooLate`, not `WrongPhase`),
   processing-crosses-`closesAt` (C2.3), and restart-refold mid-window
   (C4.2 application half) using the existing stub kit and two-clock
   pattern.
3. **M3 — API e2e slam suite** (`apps/api/test/`): the four cells with
   publisher-capture and leak assertions (C3), late slam as 422 (C1.4),
   concurrent slams over HTTP (C2.1), sleeping-server lazy close (C4.1),
   restart via a second `makeTestApp` over the same DB rows (C4.2 HTTP
   half), and the timer-fired close observed through the real stack
   (C1.6). Reuse `EndToEndGame.test.ts`'s seeded-replay driver pattern
   (`dealGame` + `legalCandidates` locally = full truth for choosing
   correct/incorrect slams deliberately).
4. **M4 — Close-out**: bare gate, coverage table reconciliation, plan
   docs updated.

M2 and M3 are independent once M1 lands; the child plan may interleave
them. File-level detail is the backend child plan's job.

## Validation

- `pnpm turbo build typecheck lint test` — bare, exit code checked
  (never piped; see AGENTS.md).
- Targeted runs while iterating:
  `pnpm --filter @cambio/application exec vitest run RoomRegistry` and
  `pnpm --filter @cambio/api exec vitest run` (api suites need Postgres:
  `docker compose -f docker/docker-compose.yml up -d`).
- The child plan's Contract coverage table is the completeness check:
  every C-clause row filled or explicitly justified.

## Progress

_(updated continuously; append new entries at the BOTTOM — newest last;
timestamp each entry)_

- [x] 2026-09-02 19:40 — planning: preflight, brief, interviews, exploration
- [x] 2026-09-02 20:00 — probe-verified C1.3 at the actor level (temp test, deleted)
- [x] 2026-09-02 20:26 — M1 landed: injectable clock/seed in the api harness
      (`makeTestApp(overrides?, ports?)`); existing suites untouched-green
- [x] 2026-09-02 20:29 — M2 landed: `SlamTiming.test.ts` pins C1.3, C2.3,
      C4.2 (application half); harness extracted to `support/registry.ts`
- [x] 2026-09-02 20:38 — M3 landed: `SlamWindow.test.ts` — four cells with
      reveal/leak assertions, late slam 422, HTTP race, sleeping-server lazy
      close, timer-fired close (deadline-poll), restart over the same DB
      rows; driver extracted to `support/game-driver.ts`; all seven green
      first run and across repeats
- [x] 2026-09-02 20:45 — M4: bare gate exit 0 (22/22); untouched-surfaces
      sweep empty; plan docs reconciled with as-built code. Implementation
      complete — ready for `/review CAM-7`
- [x] 2026-09-02 22:00 — review fix cycle (F1–F7) landed: C2.3 test now
      discriminates processing-time from arrival-time; race-free
      restructuring around the zero-duration timer re-arm (backend plan
      Surprises); doc claims corrected (stale citations, C3.2 row,
      import-only wording); leak-tripwire hygiene. Awaiting re-review.

## Decision log

- 2026-09-02 — **Processing-time lateness** (user call): a slam is judged
  against `ClockPort.now` at processing time, not arrival time. Two slams
  both submitted in-window can resolve first-ok / second-`SlamTooLate` if
  processing the first crosses `closesAt`. Consistent with §6
  (server-authoritative ordering, one immutable timestamp, ADR-0011);
  arrival-time stamping rejected — it would add a second time source and
  an envelope change for a millisecond-scale window. CAM-7 pins this
  (C2.3).
- 2026-09-02 — **Parked window accepted as designed** (user call): a
  restarted/invalidated actor arms no close timer until its next command,
  so a trafficless game can sit in `SlamWindow` in the DB indefinitely.
  Lazy close resolves it on the next command and `closesAt` still governs
  legality. No bootstrap re-arming added (C4.3).
- 2026-09-02 — **Publisher-port capture, not the Realtime container**
  (user call): e2e assertions read the recording publisher (full truth,
  re-projected in the test), per CAM-6's established pattern; container
  delivery was proven in CAM-6.
- 2026-09-02 — **Restart-refold included in scope** (user call): the
  sleeping-server validation covers both the lazy-close-with-live-actor
  path and a genuine teardown/rebuild mid-window.
- 2026-09-02 — **Tests-mostly deliverable** (user call): exploration found
  no production gaps or ADR contradictions; production edits require a
  forcing test.
- 2026-09-02 — **No new ADRs**: no §9 open questions remain for this task
  (§9.2 → ADR-0009, §9.4 → ADR-0011 + `SLAM_WINDOW_MS`); both interview
  decisions above reaffirm existing ADR semantics rather than selecting
  new alternatives.

## Surprises & discoveries

_(anything found mid-implementation that the plan didn't predict — wrong
assumptions, upstream bugs, better approaches. Evidence included.)_

- 2026-09-02 (planning) — the clock is not injectable end-to-end:
  `support/http.ts:70-84` (and `apps/api/src/runtime.ts:40-54`) pre-provide
  `ClockLive` into `RoomRegistryLive`, so a layer merged on top never
  reaches the registry. Hence milestone M1.

## Outcomes & retrospective

_(filled by `/review`, 2026-09-02)_

**Verdict: fix-then-ship.** Production behavior fully satisfies the
contract; the fix cycle is tests-and-docs only. Independently verified by
the reviewer: forced fresh (`--force`) runs of `@cambio/application`
(14 files / 83 tests) and `@cambio/api` (19 files / 101 tests) against
live Postgres + realtime containers, full bare gate exit 0, and two extra
`SlamWindow` runs (7/7 each; ~7 consecutive green runs of the timing
suite this cycle). No hidden-information leaks, no architecture
violations, zero production-file changes.

**Findings (ranked; F1–F4 gate the ship):**

- **F1 — C2.3 is under-pinned.** The `SlamTiming` processing-time test
  submits slam B _after_ the hook has crossed `closesAt` (both executes
  are sequentially awaited), so an arrival-time-stamping implementation
  would also reject B — the test cannot discriminate the two designs the
  clause and Decision Log distinguish. It does pin the narrower fact
  (lateness re-read per envelope). Fix: enqueue both slams in-window
  (fork A / `yieldNow` / fork B, the `RoomRegistry.test.ts:42-118`
  technique) with the hook crossing during A's processing — or restate
  the clause row and test title to the narrower claim.
- **F2 — stale line citations** invalidated by this diff's own harness
  extraction, in docs this diff edited. Sweep (all instances):
  `RoomRegistry.test.ts:42-118` (root gap table + C2.1) → race test now
  `:42-118`; `:389,429`/`:389` (root gap table, C1.6, C4.1) → timer/lazy
  test now `:307-372`; `:318,360` (root gap table) → restart tests now
  `:236-306`; backend decision 6's `:123-`; backend Context refs
  `:27-37`, `:44-57`, `:65-80`, `:83-88`, `:91-103`, `:317-386`,
  `:388-453` → the harness now lives in `test/support/registry.ts`.
  (A reviewer sub-claim that the `:188` exemption ref is off by one was
  checked and is FALSE — `:188` is correct.)
- **F3 — coverage row C3.2 over-credits `expectRoomRevealOnly`**: the
  helper asserts only the converse (no non-public slug); `SlamSucceeded`
  card presence is asserted once (`SlamWindow.test.ts:250-252`), and
  `SlamFailed` card presence is asserted nowhere in the new suites (it
  stands on `EventProjection.test.ts:188-196`). Add the one assertion or
  reword the row.
- **F4 — "import-only / zero assertion changes" is inaccurate for
  `EndToEndGame.test.ts`** (backend plan table, step 3.1 prose, M3
  progress): `setupGame` added a join-status assertion and a journal
  clear before start to the second test. (The identical claim for
  `RoomRegistry.test.ts` is accurate.)
- **F5 — "arms no timer" appears in the ST C4.2 title and SW narrative
  with no assertion behind it** (inferred from journal sequences).
  Soften, or assert via `TestClock.adjust` in ST lifetime two — which
  would also strengthen C4.3's evidence.
- **F6 — C2.1 weak spots**: the `orderIds` `"unknown"` fallback silently
  picks a branch (should throw); the loser branch asserts 422 without
  `error.tag`; step 3.4's "versions strictly increase across journal
  entries" is only assertable via reply versions (the journal records no
  version).
- **F7 — leak-tripwire hygiene** (from the architecture review): the
  `expectRoomRevealOnly` `as never` casts + unused `state` param lose the
  compile-time exhaustiveness the original `EndToEndGame` scan had; the
  rule-public whitelist is now duplicated instead of living in
  `support/leaks.ts`; four direct `GET /view` reads assert
  `toEqual(viewFor(...))` without an independent `expectNoLeak`; the
  `SlamWindow.test.ts:244` ternary is tautological (both arms are 3);
  dead `alice`/`void alice`; the restart test reads the journal
  unfiltered by gameId.
- **F8 — advisory**: `ports.seed` landed unused (documented as-built);
  the C1.6 "exactly one close" comment over-promises for the snapshot
  assertion (the real duplicate guard is the +1-batch check after the
  next command).

**What passed**: all fifteen contract clauses except C2.3's coverage
depth; every acceptance criterion re-verified against repo state; the
C2.1 order-agnostic replay and the C1.6 timer-provenance argument were
audited hard and are sound (the timer close is conclusively
timer-originated: journal cleared, no command issued during the poll,
and the lazy path requires a command).

**Fix cycle + re-review (2026-09-02, same day): verdict upgraded to
SHIP.** F1–F7 landed (commits `84aa0c5`, `4720023`, plus a straggler-fix
docs commit): the C2.3 test now enqueues both slams in-window behind a
publish gate and genuinely discriminates processing-time from
arrival-time stamping; the citation sweep was re-run and caught two
stragglers the spot-fix missed (step 2.4 prose, an M3 progress phrase) —
both fixed, sweep now clean outside this section's historical quotes;
C3.2's `SlamFailed` reveal presence asserted; leak-tripwire hygiene done
(shared `rulePublicSlugs`, no casts, leak scans on all view reads).
The fix cycle's probe also surfaced a genuine latent flake: `manageTimer`
re-arms a ZERO-duration timer after any envelope on a past-due window
(fires even under TestClock), so three "nothing happened after the
refusal" assertions had been passing on scheduling margins — all
restructured race-free (backend plan Surprises). Re-verified: forced
fresh `--force` runs (application 83/83, api 101/101 against live
containers), full bare gate exit 0, and three consecutive runs each of
`SlamWindow` (7/7) and `SlamTiming` (3/3). F8 (advisory) deliberately
not taken. Deferred: nothing.
