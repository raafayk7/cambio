# CAM-26 — Slam window liveness: expiry recovery on every layer (backend)

- **Root plan:** [root/CAM-26.md](../root/CAM-26.md) — the functional
  contract lives there; this document is implementation detail for the
  backend. Backend-owned clauses: **S1–S8, F1**.

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

Governing skills: **application-layer** (the per-room actor, "timers are
never the authority", ports for time), **architecture** (everything here
stays in its existing layer — no new packages, no new ports),
**infrastructure-persistence** (F1's read-only event-log queries; nothing
persisted changes shape), **effect-domain-modeling** for the S7 domain
test, and **hidden-information** as a standing check — this task
deliberately sends nothing new to clients (no contracts change, no new
wire command; `CloseSlamWindow` stays off the wire, pinned by
`apps/api/test/GameCommands.test.ts` "CloseSlamWindow is not on the wire:
400 at decode (C1.4)", which must stay green and untouched).

All file:line anchors verified on `release-v0` @ 40c2318.

### The actor (`packages/application/src/room/RoomRegistry.ts`)

One lazily-created actor per room: an unbounded `Queue` of `Envelope`s
(union at `:63-85`) consumed by a single fiber (`runRoom`, `:123-313`).
Mutable per-actor state `cache` / `timer` / `evict` at `:124-127`. The
pieces this task touches:

- `clearTimer` (`:129-133`) and `manageTimer` (`:135-148`): `manageTimer`
  leads with `clearTimer`, then arms a forked
  `sleep(max(0, closesAt - now))` → enqueue `{_tag:"TimerClose"}` **iff**
  `cache?.state.phase` is `SlamWindow`. Called at the end of `Execute`
  (`:203`), `Start` (`:230`), and `TimerClose` (`:234`) — never at actor
  creation and never right after a bootstrap load.
- `closeIfDue` (`:150-173`): no-op when `cache === null` (it never loads);
  executes `CloseSlamWindow` as its own persisted + published batch when
  `ClockPort.now >= closesAt`; on `VersionConflict` **nulls the cache**
  (`:170-172`).
- The `Execute` bootstrap is inline (`:178-186`), gated on
  `cache === null`; the lazy close (`:187-188`) is skipped for `Slam` and
  `CloseSlamWindow`. A `VersionConflict` from the command itself also
  nulls the cache (`:199-201`) — and the `manageTimer` at `:203` then
  starts with `clearTimer` over a null cache, i.e. **a conflict actively
  disarms a live window timer** (root-plan Surprise).
- `TimerClose` (`:84-85`, handled `:232-234`) is the reply-less envelope
  precedent the new `Poke` follows. Two places special-case reply-less
  envelopes by tag and must learn the new one: the defect guard
  (`:253-259`) and the cleanup drain (`:300-306`).
- The service surface is the `Context.Tag` interface (`:87-103`) plus the
  returned object (`:338-348`); `send` (`:315-336`) creates the actor
  lazily under the semaphore and always awaits a `Deferred` reply — the
  poke entry point needs an enqueue-only variant. `roomCount` is
  observability for tests/ops (eviction assertions use it) — the poke
  design must not build room semantics on it.
- Actors also exist for **lobby-only rooms** (Join/Leave/Start before any
  game row exists), where `games.load` fails. The design below never
  pokes a lobby (see the route step), but the `Poke` handler still
  tolerates a failing load defensively.

### The view route (`apps/api/src/presentation/games.ts`)

`GET /games/:gameId/view` (`:63-106`) does a direct `games.load` +
membership check + `viewForEffect` — deliberately unserialized (comment
`:71-73`, ADR-0014/0020). That stays. The route additionally enqueues a
`Poke` after the load + membership check succeed — fire-and-forget: the
enqueue is cheap (offer under the creation lock), the response never
waits on the actor, and the HTTP shape/status codes are byte-identical.
`runRoute` (`apps/api/src/presentation/run.ts:17-37`) and
`commandErrorStatus` (`apps/api/src/presentation/errors.ts`) are
unchanged.

### Config (three files agree on the default)

- `apps/api/src/config.ts:37-43` — `slamWindowMs`,
  `Config.integer("SLAM_WINDOW_MS")` withDefault **10000**; the doc
  comment narrates the CAM-23 raise from 5000 and must be rewritten for
  7500 (middle ground now that CAM-23's pre-armed give flow exists —
  root-plan Decision Log).
- `.env.example:39-42` — `SLAM_WINDOW_MS=10000` plus the same rationale
  comment; update both value and comment.
- `apps/api/test/Config.test.ts` "slam window and realtime URL take the
  documented defaults" — pins 10000; update to 7500.
- Do **not** touch `apps/api/test/support/http.ts` `baseConfig`
  (`slamWindowMs: 5000`) — test-only, unrelated to the default.
- Games in flight keep their started-with value: existing behavior,
  pinned by `packages/application/test/ViewFor.test.ts` "exposes
  config.slamWindowMs from the state it received — the started-with value
  (C4)" — untouched.

### Domain anchors (read-only except the S7 test)

`CloseSlamWindow`: `packages/domain/src/Command.ts:72` (no `playerId`);
seat-check exemption `Legality.ts:82`; legality `Legality.ts:220-225`
(`WrongPhase` / `WindowStillOpen` / legal at `now >= closesAt`); engine
`Engine.ts:321-325` emits exactly `["SlamWindowClosed","TurnAdvanced"]`;
`closesAt` is computed only at `Engine.ts:59`
(`now + state.config.slamWindowMs`). No domain source changes in this
task — S7 is a test-only addition.

### Test infrastructure to reuse

- **Application layer** (`packages/application/test/support/registry.ts`):
  `makeHarness` (journal + repo stub + settable `ClockPort` + registry
  layer), `choose`, `seedLobby`, `driveToSlamWindow`, config
  `slamWindowMs: 4000`. Lifetime discipline (comment `:29-33`): one
  `Effect.provide(h.layer)` = one process lifetime; a second provide over
  the same repo stub IS the simulated restart — the idiom for every
  bootstrap-arming test. Two-clock design: the Ref-backed `ClockPort` is
  the lateness authority; Effect's `TestClock` governs timer-fiber sleeps.
  Wrinkle (documented atop `SlamTiming.test.ts`): a past-due `manageTimer`
  arms `sleep(0)`, which fires even under TestClock — post-refusal
  assertions must be race-free (`expectNoSlamPersisted` /
  `SLAM_OUTCOME_TAGS` is the idiom).
- **API layer** (`apps/api/test/support/http.ts`): `makeSettableClock`
  (`:84-90`) — timer fibers sleep on REAL time in the ManagedRuntime, so
  suites keep timers inert with a huge `slamWindowMs` and move only the
  settable clock (`BIG`/`SMALL` in `SlamWindow.test.ts`). Ports are
  assembled per app (`makePortsLayer`) so the injected clock reaches
  `RoomRegistryLive` at construction. `apps/api/test/SlamWindow.test.ts`
  `makeWorld` carries the local pure replay, `step`/`driveToWindow`/
  `gameEntries` helpers, and the publisher-journal deadline-poll pattern
  (from "the timer-fired close arrives through the same persist+publish
  path, unprompted (C1.6)") — never a bare sleep-and-assert.
- **Publish-for-free**: `executeGameCommand` publishes every persisted
  batch, so a poke-triggered close publishes exactly like the timer-fired
  one (S5) with no new code — the tests just assert it.

### F1 forensics (read-only, `infrastructure-persistence` rules apply)

`game_events` DDL: `apps/api/migrations/0002_cambio_schema.sql:103-119`
— `type` (event `_tag`), `payload` jsonb, `actor_id` nullable (null for
`SlamWindowClosed`/`DeckReshuffled`/`GameStarted`), `at` bigint epoch ms,
soft-delete. Always filter `deleted_at IS NULL`; order by `seq`, never
`at` (a batch shares one `at`). Slammer vs victim come from
`payload->>'slammerId'` and `payload->'target'->>'playerId'`. DB is local
Docker Postgres on host port 5433; retention is safe (ADR-0025 — local
schedules no pg_cron). Queries only — no writes, no migrations.

## Plan of work

Every step leaves the repo compiling and the suite green. The two restart
tests that pinned "bootstrap arms nothing" are updated **deliberately**
(root-plan acceptance criterion), never deleted.

### Step 0 — M0: forensics (first; independent of all code)

No repo files change except this plan. Run the queries in Concrete steps
against the local database: find the 2026-09-06 game, pull its ordered
event log, classify the anomaly (`SlamFailed`+`PenaltyDrawn` = false slam
vs `SlamSucceeded`+`CardGivenFromHand` = successful opponent slam — and
whether a `SlamWindowClosed`+`TurnAdvanced` ever followed). Record the
finding in this plan's Surprises, the root plan's Surprises, and as a
Linear comment on CAM-26.

### Step 1 — S7 domain test (pure; can land before everything else)

Extend `packages/domain/test/Slam.test.ts` (test-first is trivially
satisfied: it should pass against the existing engine — it pins a
sequence nothing pins today). Reuse the file's `base` fixture
(`decodeGameConfig({ slamWindowMs: 4000 })`, phase
`SlamWindow { turnPlayerId: p0, closesAt: ts(1_004_000), rank: "4" }`)
and its `apply` helper, following the shape of "opponent's card,
incorrect: card stays with its owner, slammer draws a penalty": false
opponent slam in-window → `apply(…, { _tag: "CloseSlamWindow" }, at ≥
closesAt)` → assert `["SlamWindowClosed","TurnAdvanced"]` and that the
next player's `DrawFromDeck` is legal and succeeds. If it unexpectedly
fails, stop — that is a domain bug the root plan did not predict; flag it
before touching the engine.

### Step 2 — Application layer, tests first (S1–S4 + S5's app half)

TDD in `packages/application/test/`: write the new tests, watch them
fail, then implement in `RoomRegistry.ts`.

**New tests** (home: `RoomRegistry.test.ts` for poke/eviction/conflict
behavior, `SlamTiming.test.ts` if a timing-flavored case fits better —
implementer's call):

- **Poke closes a cold past-due window** (S1+S3+S5's application half,
  the root plan's load-bearing proof (a)): lifetime one drives to
  `SlamWindow` via `driveToSlamWindow` and dies with the provide scope;
  set the settable clock past `closesAt`; lifetime two calls the new
  `registry.poke(gid(1))`. Poke has no reply, so assert race-free: poll
  the harness journal (yield/deadline loop, or `TestClock` idioms already
  in the file) until it shows `["load","save","publishGame"]` with the
  close batch's events exactly `["SlamWindowClosed","TurnAdvanced"]`.
- **Poke is inert** (S4): (i) poke a still-open window (clock before
  `closesAt`) → the journal gains a `load` and nothing else, and the
  timer is now armed (observable: advance TestClock past the remaining
  duration → the close lands without any further envelope); (ii) poke an
  ended game → nothing persisted/published and no resident actor is left
  behind (`roomCount` is the established eviction assertion); (iii) poke
  a game with no game row (lobby-only / unknown id) → no crash, nothing
  persisted, no lingering actor.
- **Conflict re-arms** (S2, load-bearing proof (b)): extend
  `RoomRegistry.test.ts` "VersionConflict: surfaced unchanged, cache
  dropped, next command reloads (clause 6)" — or add a sibling test
  beside it — with a `SlamWindow`-phase variant: drive to a window,
  `h.repo.poke(gid(1), …)` to force a conflict on the next command,
  assert the conflict surfaces unchanged **and** the window still closes
  via the timer with no further command (the re-load + re-arm is what
  makes that close arrive). The existing test's non-window assertions
  stay valid; extend, don't rewrite.

**Implementation** (`packages/application/src/room/RoomRegistry.ts`),
advisory sketch — the coverage table and this module list are what get
reconciled, not these exact shapes:

- Envelope union gains a reply-less variant: `{ readonly _tag: "Poke" }`
  (beside `TimerClose`, `:84-85`). Both reply-less tags must be handled
  wherever `TimerClose` is special-cased today: the defect guard
  (`:253`) and the cleanup drain (`:300`).
- Service surface gains `poke: (gameId: GameId) => Effect.Effect<void>`
  (tag interface `:87-103` and returned object `:338-348`). It reuses the
  lock/rooms creation logic of `send` (`:315-336`) but offers the
  envelope without making or awaiting a `Deferred` — enqueue-only,
  cannot fail.
- A `bootstrapCache`-style helper: load `games.load(gameId)` into
  `cache`, swallowing failure (no reply to fail); on a load that fails or
  loads an `Ended` phase from a `Poke`, set `evict = true` so a poked
  dead room drains away instead of staying resident (ADR-0037: poke must
  not resurrect an evicted, ended game's actor beyond a no-op — eviction
  still only happens via the existing empty-queue-under-lock path).
- `case "Poke"`: bootstrap if cold → `closeIfDue` → `manageTimer`.
  Idempotent by construction: `closeIfDue` re-judges against `ClockPort`
  every time; a second poke finds the phase already advanced and does
  nothing.
- **Arm on load** (S1): after the `Execute` bootstrap populates the cache
  (`:186`), run `manageTimer` before the command is judged (root-plan
  decision: arm-only at load, no forced close in the prologue). The
  `manageTimer` at `:203` still runs at envelope end, as today.
- **Re-arm after conflict** (S2): at both cache-nulling sites
  (`closeIfDue` `:170-172`, `Execute` `:199-201`), follow the
  invalidation with a re-load (swallow failure) so the trailing
  `manageTimer` sees fresh state and re-arms. Conflict semantics are
  otherwise unchanged: surface + invalidate, never retry the command.

### Step 3 — Deliberate update of the application restart test

`packages/application/test/SlamTiming.test.ts` "restart mid-window: the
late slam is refused and the window closes exactly once before the next
command (C4.2)": the comment "the bootstrap load arms nothing" is now
false — rewrite it. Expected outcome: the `opsOf` sequence
`["load","save","publishGame","save","publishGame"]` and the
`SlamTooLate` refusal both still hold (the late slam is the bootstrapping
envelope, so it is judged before any bootstrap-armed `TimerClose` can be
processed), but verify rather than assume; if the ordering genuinely
shifts, pin the new ordering or accept both per the root-plan Decision
Log ("accept either ordering or pin the new one"). A `WrongPhase` in
place of `SlamTooLate` is only reachable when the slam arrives as a
_second_ envelope after a poke/close — if a test wants that case, it is a
new test, not a mutation of this one.

### Step 4 — API layer: the route poke + API tests (S3–S5 at the edge)

Tests live in `apps/api/test/SlamWindow.test.ts`, reusing `makeWorld`:

- **View-triggered close** (S3+S5 end to end): `makeWorld(BIG)` (timer
  inert), drive to the window, `setNow(closesAt + 1)`, then GET
  `/games/:gameId/view` as a participant. Assert the response itself is
  unchanged in shape (and, per today's behavior, may still carry the
  expired window at the unchanged version), then deadline-poll
  `gameEntries()` for exactly one close batch
  `["SlamWindowClosed","TurnAdvanced"]` — the same assertion the
  timer-fired test makes, proving S5's "exactly like the timer path".
  Follow with a next-player command over HTTP to show the game moves.
- **Inert poke at the edge** (S4): GET the view while the window is still
  open (`BIG`, clock untouched) and assert no publish occurs
  (`gameEntries()` stays empty over a short poll) and a subsequent slam
  still succeeds — the read changed nothing.
- **Deliberate update** of "restart mid-window over the same rows: late
  slam 422, window closed exactly once before the next command (C4.2)":
  rewrite the "(its bootstrap arms nothing)" comment block (`:568-573`);
  re-verify the `422 SlamTooLate`, the exactly-two-entries count, and
  ordering under the new arming (same reasoning as Step 3 — expected to
  hold, verified not assumed; entries-count assertions may need the
  race-free `expectNoSlamPersisted` treatment if a timer close can now
  interleave differently).
- Check `apps/api/test/DyingActor.test.ts` ("a defect escaping the typed
  union becomes a 500 contract body — the reply completes", "a bare
  interrupt becomes a 500 too — never a hang") still passes after the
  envelope-union change; no edits expected.

Implementation: `apps/api/src/presentation/games.ts` GET handler —
after the membership check succeeds (never for unknown games,
non-participants, or lobby-only rows), sequence
`RoomRegistry.poke(gameId)` into the route effect. The poke is
enqueue-only so this adds no meaningful latency and cannot fail the
route; the direct row read remains the response source (update the
`:71-73` comment to say the read is still unserialized and the poke is a
liveness nudge, per ADR-0037). Wire-wise nothing changes; leak-wise
nothing new is sent (`hidden-information` holds trivially).

### Step 5 — S8 integration sequence

Extend `apps/api/test/EndToEndGame.test.ts` in the "a real Slam over
HTTP (large window)" suite (beside "a slam inside an open window
round-trips with a leak-free reply"): after an in-window slam, advance
the injected clock past `closesAt` and post the next player's
`DrawFromDeck` over HTTP — the lazy close runs as its own batch first,
the draw returns 200, replay-mirrored and leak-checked with the file's
existing helpers. A new focused test in that suite is preferred over
stretching the existing one.

### Step 6 — S6: the 7500 default

Three files, one commit: `apps/api/src/config.ts:37-43` (value +
rewritten comment: 7500 per CAM-26/ADR-0037, middle ground between the
original 5000 and CAM-23's 10000 now that the pre-armed give flow
exists), `.env.example:39-42` (value + comment), and
`apps/api/test/Config.test.ts` "slam window and realtime URL take the
documented defaults" (10000 → 7500). Test updated in the same change —
the gate stays green at every step.

### Step 7 — Final gate + handoff to M3

Full gate (below), then the root plan's M3 integration pass (manual
restart-mid-window walkthrough) happens once the frontend child plan's
work is also on the branch.

## Concrete steps & validation

**M0 forensics** (Docker Postgres must be up):

```bash
docker compose -f docker/docker-compose.yml up -d
psql "postgres://cambio:cambio@localhost:5433/cambio"
```

```sql
-- 1. Find the playtest game (phase + closesAt tell whether it is still stuck)
SELECT game_id, version, phase->>'_tag' AS phase,
       phase->>'closesAt' AS closes_at, created_at
FROM games
WHERE created_at::date = DATE '2026-09-06' AND deleted_at IS NULL
ORDER BY created_at;

-- 2. Who sat where
SELECT gp.seat_index, u.user_name, gp.user_id
FROM game_players gp
JOIN users u ON u.user_id = gp.user_id AND u.deleted_at IS NULL
WHERE gp.game_id = '<game_id>' AND gp.deleted_at IS NULL
ORDER BY gp.seat_index;

-- 3. The slam-relevant event log, in authoritative order (seq, never at)
SELECT seq, type, actor_id, at,
       payload->>'slammerId'                AS slammer,
       payload->'target'->>'playerId'       AS victim,
       payload
FROM game_events
WHERE game_id = '<game_id>' AND deleted_at IS NULL
  AND type IN ('SlamWindowOpened','SlamSucceeded','SlamFailed',
               'PenaltyDrawn','CardGivenFromHand','CardGivenFromDeck',
               'DrawSkipped','SlamWindowClosed','TurnAdvanced',
               'DeckReshuffled')
ORDER BY seq;
```

Success: the anomaly classifies cleanly; finding recorded in both plans'
Surprises and posted to CAM-26.

**Per-step checkpoints** (canonical per-package command; turbo builds
dependencies first — never the bare package script over a stale dist):

```bash
pnpm turbo test --filter @cambio/domain        # after Step 1
pnpm turbo test --filter @cambio/application   # after Steps 2–3
pnpm turbo test --filter @cambio/api           # after Steps 4–6
```

For single-suite iteration after a build, bare
`npx vitest run <file>` inside the package is fine. API suites need
Postgres up (`ECONNREFUSED` on 5433 → run the docker compose line;
migrations are idempotent: `pnpm --filter @cambio/api migrate`).

**Final gate** — run bare, never piped, exit status checked directly:

```bash
pnpm turbo build typecheck lint test
```

Success signals: all suites green including the two deliberately-updated
restart tests; no test deleted; `GameCommands.test.ts` wire pin
untouched; prettier clean (markdown auto-formats via the PostToolUse
hook; keep inline code spans on one line in this document).

## Contract coverage

_(maintained by `/implement`, verified by `/review`: one row per root-plan
contract clause this side owns — the test that pins it, or why none can.
Each row must also say **what is asserted**, in one phrase — a test whose
title cites a clause but whose body doesn't assert it is the failure mode
this column exists to catch. **At plan time, fill only the Clause column
plus a planned-approach note**; test file, name, and assertion phrase are
written by `/implement` when the test actually lands. A plan-time row that
invents a test title and assertion is an overclaim waiting to become a
review finding.)_

| Clause                             | Test (file + name)                                                                                                                                                                                                                                                      | What is asserted                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1 — arm on load                   | packages/application/test/RoomRegistry.test.ts — "poke closes a cold, past-due window — bootstrap, judge the clock, close (S1+S3+S5)"                                                                                                                                   | the Poke-path load arms: a cold actor with a past-due persisted window closes it with no command at all. The `Execute`-bootstrap arming site has **no isolating test** — it is redundant-by-design with the envelope-end `manageTimer` (every tested sequence passes with it removed), documented here per review finding 2 rather than overclaimed |
| S2 — re-arm after conflict         | packages/application/test/RoomRegistry.test.ts — "VersionConflict during an open window: eager reload keeps the timer armed, closing with no further command (S2, CAM-26)"                                                                                              | conflict surfaces unchanged; eager reload re-arms the timer, closing with no further command                                                                                                                                                                                                                                                        |
| S3 — poke-on-read                  | packages/application/test/RoomRegistry.test.ts — "poke closes a cold, past-due window..."; apps/api/test/SlamWindow.test.ts — "GET view pokes the room actor: an expired window closes via the read, unprompted by any command (S3+S5, CAM-26)"                         | application: registry.poke bootstraps+closes; API: GET view triggers the close with unchanged response shape                                                                                                                                                                                                                                        |
| S4 — poke inert when nothing to do | packages/application/test/RoomRegistry.test.ts — 5 Poke tests (still-open / ended / unknown-or-lobby-only / idempotent); apps/api/test/SlamWindow.test.ts — "GET view while the window is still open: the poke is inert, a subsequent slam still succeeds (S4, CAM-26)" | poke with nothing to do persists/publishes nothing and does not disturb eviction; API GET publishes nothing while the window is open                                                                                                                                                                                                                |
| S5 — close publishes               | apps/api/test/SlamWindow.test.ts — "GET view pokes the room actor: an expired window closes via the read, unprompted by any command (S3+S5, CAM-26)"                                                                                                                    | poke-triggered close publishes SlamWindowClosed+TurnAdvanced exactly like the timer-fired close                                                                                                                                                                                                                                                     |
| S6 — 7500 default                  | apps/api/test/Config.test.ts — "slam window and realtime URL take the documented defaults"                                                                                                                                                                              | SLAM_WINDOW_MS with no env override decodes to 7500                                                                                                                                                                                                                                                                                                 |
| S7 — domain sequence               | packages/domain/test/Slam.test.ts — "false opponent slam, then CloseSlamWindow: window closes and the next player can draw"                                                                                                                                             | close emits SlamWindowClosed+TurnAdvanced; next player DrawFromDeck legal and succeeds                                                                                                                                                                                                                                                              |
| S8 — integration sequence          | apps/api/test/EndToEndGame.test.ts — "after an in-window slam, the window expires and the next player draws over HTTP (S8, CAM-26)"                                                                                                                                     | in-window slam, window expiry, lazy close batch, then next player DrawFromDeck all round-trip leak-free over HTTP                                                                                                                                                                                                                                   |
| F1 — forensics                     | not a test — the M0 psql queries above, run against the local database (Step 0, done before this implementation pass began)                                                                                                                                             | _(n/a — documented deliverable)_ the classification is recorded in this plan's Surprises, the root plan's Surprises, and as a Linear comment on CAM-26                                                                                                                                                                                              |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [ ] 2026-09-07 — backend child plan written; implementation not started
- [x] 2026-09-07 — Step 1 done: S7 domain test landed in
      `packages/domain/test/Slam.test.ts` (pure addition, no engine changes).
      Passed against the existing engine on the first run —
      `pnpm turbo test --filter @cambio/domain` green (196 tests, 23 files).
- [x] 2026-09-07 — Step 2 done: `Poke` envelope, `registry.poke`,
      `reload` helper, arm-on-load, and eager re-arm-after-conflict landed in
      `packages/application/src/room/RoomRegistry.ts`. TDD followed: 6 new
      tests plus 1 deliberately rewritten, written first in
      `packages/application/test/RoomRegistry.test.ts`
      (1 rewritten VersionConflict test + 1 new SlamWindow-conflict variant +
      5 new Poke tests; count corrected at review, finding 2), confirmed
      they exercised the not-yet-existing
      `registry.poke` (compile failure), then implemented.
      `pnpm turbo test --filter @cambio/application` green on the first run
      after implementation (92 tests, 14 files).
- [x] 2026-09-07 — Step 3 done: `SlamTiming.test.ts`'s restart-mid-window
      test comment rewritten (the old "bootstrap load arms nothing" claim is
      false post-S1). Verified, not assumed: reran the suite before touching
      the comment — `SlamTooLate` (not `WrongPhase`) and the five-op journal
      both still held unchanged, because the late slam is itself the
      bootstrapping envelope and is judged before the newly-forked
      zero-duration timer fiber can be scheduled. Only the comment changed;
      no assertion touched.
- [x] 2026-09-07 — Step 4 done: `apps/api/src/presentation/games.ts`'s GET
      handler now pokes `RoomRegistry` after the load + membership check
      succeed (unknown games/non-participants never wake an actor). Adding
      `poke` to the `RoomRegistry` service interface required a mechanical
      fix to `apps/api/test/DyingActor.test.ts`'s `StubRegistry` object
      literal (missing-property compile error — confirmed by running
      `pnpm turbo typecheck --filter @cambio/api` before the fix, which
      failed with exactly that TS2345, and again after, which passed): a
      no-op `poke: () => Effect.void` was added since neither of that
      file's suites exercise the GET route. This is a narrower deviation
      than "no edits expected" from the child plan's Step 4 description,
      but purely mechanical — no assertion in that file changed. Two new
      tests landed in `apps/api/test/SlamWindow.test.ts` ("GET view pokes
      the room actor..." and "GET view while the window is still open:
      the poke is inert..."), and the restart test's stale
      "(its bootstrap arms nothing)" comment was rewritten, mirroring
      Step 3's reasoning. `pnpm turbo test --filter @cambio/api` green
      before AND after the new tests (118 → 120 tests, 20 files;
      `SlamWindow.test.ts` 7 → 9, `DyingActor.test.ts` still 2/2).
- [x] 2026-09-07 — Step 5 done: a new S8 test landed in
      `apps/api/test/EndToEndGame.test.ts`'s "a real Slam over HTTP (large
      window)" suite — an in-window slam, then the window expiring, then
      the next turn player's `DrawFromDeck` over HTTP, closing the named
      gap where the acceptance suite's `slamWindowMs: 1` and the sibling
      slam test both stop short of a post-window command. Needed an
      injected settable clock (`makeSettableClock`, not previously used in
      this file) to make the expiry deterministic, matching
      `SlamWindow.test.ts`'s pattern. One incidental fix: the new test's
      compound `.filter((e) => e._tag === "game" && e.gameId === gameId)`
      needed an explicit `e is Extract<...>` type predicate — TypeScript's
      automatic predicate inference (which is why the file's older,
      simpler `.filter((e) => e._tag === "game")` typechecks with no
      predicate) does not fire for compound `&&` conditions.
      `pnpm turbo test --filter @cambio/api` green (121 tests, 20 files;
      `EndToEndGame.test.ts` 2 → 3).
- [x] 2026-09-07 — Step 6 done: `SLAM_WINDOW_MS` default 10000 → 7500 in
      `apps/api/src/config.ts` (value + rewritten doc comment),
      `.env.example` (value + comment), and
      `apps/api/test/Config.test.ts`'s "slam window and realtime URL take
      the documented defaults" test, one change set.
      `apps/api/test/support/http.ts`'s `baseConfig.slamWindowMs: 5000`
      and `packages/application/test/ViewFor.test.ts`'s config-projection
      test were left untouched, per the plan.
      `pnpm turbo test --filter @cambio/api` green (121 tests, 20 files).
- [x] 2026-09-07 — Step 7 done: backend M1 complete. Full repo-wide gate
      (`pnpm turbo build typecheck lint test`, run bare, exit status
      checked directly) surfaced one pre-existing prettier formatting
      issue in this task's own new file
      (`apps/api/test/EndToEndGame.test.ts`), fixed with `prettier
--write`, then reran green for `//:format:check`. The gate's ONE
      remaining red task is `@cambio/web#test` (2 timeouts in
      `apps/web/test/game-screen.test.tsx`) — out of this lane's scope
      (`apps/web/` belongs to the parallel frontend agent's M2 work, which
      was still in progress on this branch at gate time; see Surprises
      below). Backend-owned packages verified green independently and
      definitively, standalone (not just as part of the mixed full-repo
      run, since turbo aborts remaining tasks after a sibling failure and
      the full-gate log's own per-task summaries for domain/application/
      api got cut off mid-stream as a result):
      `pnpm turbo build typecheck test --filter @cambio/domain --filter
@cambio/application --filter @cambio/api` → 10/10 tasks green;
      `pnpm turbo lint --filter @cambio/domain --filter @cambio/application
--filter @cambio/api` → 7/7 tasks green (this run also re-confirmed
      root `//:format:check` green repo-wide). Final counts: domain 196
      tests/23 files, application 92 tests/14 files, api 121 tests/20
      files — all green.
- [x] 2026-09-07 — review fix cycle (this side): S1 coverage row and Step
      2 test count corrected (finding 2); `SlamTiming`/`SlamWindow`
      restart-test comments now credit queue serialization (finding 5);
      `config.ts`/`.env.example` citations re-pointed at the root plan's
      Decision Log (finding 6); the `Poke` eviction comment corrected and
      ADR-0037's Consequences amended for the eviction widening
      (finding 7). Comments/docs only — no assertion or behavior changed
      on this side.

## Surprises & notes for the root plan

- (planning) The `Execute` path already runs `manageTimer` at envelope end
  (`RoomRegistry.ts:203`), so "arm on load" for the Execute bootstrap is
  narrower than it sounds: the new arming site (right after `:186`) mostly
  matters for ordering _within_ the bootstrapping envelope and for making
  the arming independent of the command's outcome. The genuinely new
  liveness comes from `Poke` (an arming/closing path that needs no
  command at all) and the conflict re-load (today a conflict leaves
  `manageTimer` running over a null cache — an active disarm).
- (planning) Expectation to verify at implement time: both restart tests'
  observable sequences (`opsOf` five-op journal; 422 `SlamTooLate`)
  should survive bootstrap-arming, because the late slam is itself the
  bootstrapping envelope and is judged before any enqueued `TimerClose`
  can be processed. The comments pinning "bootstrap arms nothing" are
  what must change. If reality disagrees, the root-plan Decision Log
  already accepts either ordering — pin what actually happens.
- (planning) The route pokes only after the load + membership check
  succeed, so unknown games, non-participants, and lobby-only rows never
  create or wake an actor via reads; the `Poke` handler still tolerates a
  failing bootstrap load defensively (and evicts rather than lingering).
- 2026-09-07 (M0, Step 0) — **F1 forensics result: no persisted stall.**
  13 two-player games exist for 2026-09-06 (all Raafay vs. Moony). 3 have
  an opponent-targeted `SlamFailed` (`22ffe19d-ec92-41c8-a730-52f51d32e648`,
  `e11e92cd-2f14-4f0e-8347-8692cb159ff8`,
  `f89ce987-e181-484b-a249-692f5d0f281f`); all three show
  `SlamFailed`→`PenaltyDrawn`→`SlamWindowClosed`→`TurnAdvanced` with the
  turn correctly landing on the opponent, no gap. No 2026-09-06 game is
  persisted in a `SlamWindow` phase today. Classification: the reported
  symptom is not reproduced in the durable event log — likely the
  give-slot-prompt/reveal-delay UX moment, per the ticket's own mundane
  alternative — not evidence the structural liveness gap fired that day.
  The gap itself stands, confirmed by code inspection, independent of
  this incident. Full queries and output are in this task's implement
  transcript; not re-pasted here to keep the plan lean.
- 2026-09-07 (Step 2, implement) — **deviation from the plan's assumption
  that "the existing [VersionConflict] test's non-window assertions stay
  valid; extend, don't rewrite."** Reality disagrees, necessarily: S2's
  whole point is that a conflict re-arms without waiting for a next
  command, which means the reload happens eagerly inside the SAME
  conflicted envelope, not lazily on the next one. That changes
  `RoomRegistry.test.ts`'s original "VersionConflict: surfaced unchanged,
  cache dropped, next command reloads (clause 6)" test in two concrete
  ways: (a) the conflicted call's own journal now shows `["load"]` (the
  eager reload) instead of `[]`, and (b) the follow-up "healed" call no
  longer shows a `"load"` op (`["save","publishGame"]`, not
  `["load","save","publishGame"]`) because the cache is already warm from
  the eager reload. Deferring the reload to preserve the old assertions
  literally would mean NOT re-arming inside the conflicted envelope —
  i.e. not actually implementing S2, since a stuck window has no
  guaranteed "next command" to trigger a lazy reload (that is the entire
  liveness bug this task fixes). Renamed and updated the test
  (`"VersionConflict: surfaced unchanged, cache reloaded eagerly in the
same envelope (clause 6, CAM-26 S2)"`) rather than leaving a
  now-inaccurate comment; added a sibling SlamWindow-phase variant
  alongside it per the plan's "or add a sibling test beside it" option.
  Nothing was deleted — both the conflict-surfaces-unchanged assertion and
  the self-heal-succeeds assertion still hold, just with corrected journal
  shapes.
- 2026-09-07 (Step 4, implement) — **narrower deviation than "no edits
  expected" for `apps/api/test/DyingActor.test.ts`.** Adding `poke` to the
  `RoomRegistry` service interface (required for S3) makes the file's
  `StubRegistry` object literal (`Layer.succeed(RoomRegistry, {...})`)
  fail to typecheck — TS2345, "Property 'poke' is missing" — confirmed by
  running `pnpm turbo typecheck --filter @cambio/api` before and after a
  one-line fix (`poke: () => Effect.void`, since neither of that file's
  two suites exercise the GET route this poke lives on). This is
  unavoidable for ANY new `RoomRegistry` service method under this repo's
  `Layer.succeed`-with-a-full-object-literal stubbing convention, not
  specific to how `Poke` was designed — worth the child-plan author (or a
  future one) knowing about ahead of time next time the actor interface
  grows. No assertion in the file changed.
- 2026-09-07 (Step 7, gate) — **the full repo-wide gate's only red task,
  `@cambio/web#test`, is two timeouts in
  `apps/web/test/game-screen.test.tsx`** (`"(CAM-23) arming a give-slot
sends no command..."` and `"offers exactly one exit — back to the
lobby..."`, both `Test timed out in 30000ms`). `apps/web/` is the
  parallel frontend agent's M2 lane (`git status` at the time showed
  `draw-deck.tsx`, `slam-timer.tsx`, `game-screen.tsx`, `use-game.ts`, and
  three test files modified/added there, none of it touched by this
  backend lane) — out of scope for this plan to fix or diagnose further,
  flagged here only so the orchestrator doesn't mistake it for a backend
  regression. All three backend-owned packages (domain, application, api)
  were verified green independently of this failure — see Progress.
