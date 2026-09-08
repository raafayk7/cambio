# CAM-7 — Slam window end-to-end: timing authority, races, penalties (backend)

- **Root plan:** [root/CAM-7.md](../root/CAM-7.md) — the functional contract
  (clauses C1.1–C4.3) lives there; this document is implementation detail for
  the backend side.
- **ADRs:** none new (root plan) — the governing set is ADR-0009
  (zero-card draws-then-gives), ADR-0011 (fixed `closesAt` from config,
  `DrawSkipped`), ADR-0012 (empty discard skips the window), ADR-0020
  (actor timer as optimization, lazy close), ADR-0022 (penalties unseen).

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

This task is **tests-mostly**: all slam production code already ships and
matches its ADRs (root plan, explored 2026-09-02). The deliverable is
timing/race/e2e coverage plus one test-support change (clock injectability
in the api harness). Production edits under `packages/*/src` or
`apps/api/src` happen **only** if a new test exposes a real gap, and any
such edit is recorded in Surprises with the failing test that forced it.

Governing skills: **application-layer** (M2 — the per-room queue, "timers
are not authoritative", stub-layer testing discipline), **cambio-rules**
§Slamming (the four outcome cells, multi-slam within one window, the public
reveal — never invent a rule beyond it; `legalCandidates` is the single
source of legality, no rule priors in choosers), **hidden-information**
(M3 — every new e2e assertion that reads the publisher journal re-checks
the classification and leak-freedom; the recording publisher receives full
truth, so the _test_ projects and scans), **architecture** (all new files
are test files; the only edited non-test-file candidates are none —
`test/support/**` is not production), **infrastructure-persistence**
(api suites run against real Postgres on :5433).

The surfaces this task builds on, as they exist today (verified against
release-v0 tip, 2026-09-02):

- **Production slam path (read-only for this task):** engine slam handler
  `packages/domain/src/Engine.ts:242-319`; `closesAt` computed in exactly
  one place, `Engine.ts:59` (`now + config.slamWindowMs`); lateness
  `packages/domain/src/Legality.ts:191-193` — `now >= closesAt` ⇒
  `SlamTooLate`, half-open window `[open, closesAt)`. Actor
  `packages/application/src/room/RoomRegistry.ts`: timer fiber
  `:136-148` (sleep duration = `closesAt - ClockPort.now` at arming,
  slept on the **runtime** clock, then a reply-less `TimerClose`);
  `closeIfDue` `:156-173` re-reads `ClockPort` and runs `CloseSlamWindow`
  through `executeGameCommand` (same save+publish path, silent no-op when
  not due or beaten); the lazy close at `:188` is skipped for `Slam` and
  `CloseSlamWindow` — a late slammer is judged against the still-open
  phase and gets `SlamTooLate`, never `WrongPhase`; bootstrap load
  (`:179-186`) arms **no** timer; `VersionConflict` nulls the cache
  (`:199-201`). `executeGameCommand`
  (`packages/application/src/use-cases/ExecuteGameCommand.ts:50`) reads
  `clock.now` once per envelope, **at processing time** — the Decision
  Log's processing-time lateness hangs on this line. HTTP:
  `apps/api/src/presentation/games.ts:36-57`; `SlamTooLate → 422` in
  `commandErrorStatus` (`apps/api/src/presentation/errors.ts:77`).
  Projection classification
  (`packages/application/src/projection/EventProjection.ts:113-163`):
  `SlamSucceeded`/`SlamFailed` keep the card on room (the §1.5 public
  reveal), `PenaltyDrawn` slot-only, `CardGivenFromDeck` stripped,
  `CardGivenFromHand` value-free by construction, `SlamWindowClosed`
  payload-free, `DrawSkipped` passes through; no slam event is
  per-player-private.
- **Api test harness** (`apps/api/test/support/http.ts`): `makeTestApp`
  (`:110-119`) builds a `ManagedRuntime` over `TestAppLayer` and calls the
  real `buildServer`; `PortsLayer` (`:70-78`) hard-wires `ClockLive`,
  `IdGeneratorLive`, the test signer, a fixed `SeedPort`
  (`TEST_SEED = 424_242`, `:39`), the recording publisher
  (`publisherJournal` `:54-68`, `clearPublisherJournal`), and the real
  repositories; `TestAppLayer` (`:81-84`) provides `PortsLayer` into
  `RoomRegistryLive` **at construction** — which is why a clock layer
  merged on top today never reaches the registry (root Surprise; M1 fixes
  this in test support only). `slamWindowMs` is already overridable via
  the config parameter (`:97`, default 5000). Real Postgres via
  `TestDatabaseLive` (`apps/api/test/support/db.ts:18-19`, literal URL);
  migrations + TRUNCATE in `apps/api/test/global-setup.ts`;
  `fileParallelism: false` (`apps/api/vitest.config.ts:12`), 30s test
  timeout (`:7`). Sessions: `POST /users` → `{userId}` +
  `cambio_session` cookie. Both `CreateTemporaryUser` and
  `VerifySession` read `ClockPort`
  (`packages/application/src/use-cases/CreateTemporaryUser.ts:37-47`,
  `VerifySession.ts`), so a frozen injected clock keeps session issue and
  verify coherent — advancing it by slam-window millis never approaches
  the 3600s TTL.
- **The seeded-replay e2e driver** (`apps/api/test/EndToEndGame.test.ts`):
  the pattern every M3 test follows. Replays `dealGame` locally with
  `TEST_SEED` (`:181-188` — the domain is pure, so the test knows full
  truth), drives via `legalCandidates` + a deterministic `choose` policy
  (`:104-142`, which today filters out `Slam`/`CloseSlamWindow`), POSTs
  each command with `toWire` (`:61-82`), mirrors transitions locally with
  `apply` (`:87-93`), compares views after `normalize` (`:84-85`, zeroes
  `SlamWindow.closesAt`). Leak helpers `entitledSlugs`/`expectNoLeak`/
  `slugsIn` in `apps/api/test/support/leaks.ts`; the room-stream
  `publicSlugs` scan over journal entries at `:244-270`. The existing
  real-slam e2e (`:278-360`, 60s window) stays as-is; lazy close is
  implicitly exercised by the `slamWindowMs: 1` full-game script
  (`:146,:198-203`).
- **Application actor harness** — since this task's M2 extraction it lives
  in `packages/application/test/support/registry.ts` (two-clock design in
  its header doc: the Ref-backed `makeSettableClock` `ClockPort` from
  `test/support/stubs.ts` is the engine authority; Effect's `TestClock`
  governs the timer fiber's `Effect.sleep`; it.effect provides `TestClock`,
  so in-process timers with a positive duration never fire unless
  `TestClock.adjust` runs — but see Surprises: a ZERO-duration sleep fires
  regardless). Exports: `makeHarness`, `choose`, `seedLobby`,
  `driveToSlamWindow`, `config`/`NOW`/`SEED`. Pinned in
  `RoomRegistry.test.ts` (post-extraction coordinates): slam-race
  serialization over 20 rooms (`:42-118`, frozen clock),
  restart reconstruction (`:236-306`), timer-vs-lazy-close equivalence +
  stale-timer no-op (`:307-372`); "one `Effect.provide(h.layer)` = one
  process lifetime; a second provide over the same repo stub IS the
  simulated restart". Stub kit: `makeGameRepoStub` (honours version
  guards, `poke()`, `dieOnNextSave()`), `makeJournal`/`opsOf`,
  `makePublisherStub`, `seedStub`, `usersStub` (`test/support/stubs.ts`).
- **Domain testing subpath** `@cambio/domain/testing`: `legalCandidates`
  enumerates every legal slam including the give-slot fan-out (excludes
  `CloseSlamWindow`); fixtures `gid`/`uid`/`ts`. Boundary discipline from
  the sim driver: act at `closesAt - 1`, close at `closesAt`.
- A plan-time probe (deleted) verified C1.3 at the actor level: with the
  phase still `SlamWindow` and the settable clock at/past `closesAt`,
  `registry.execute(Slam)` fails `SlamTooLate` (not `WrongPhase`). The
  probe copied the RoomRegistry.test.ts harness; step 2.2 re-lands it
  permanently.

### Decisions this plan makes (open details the root plan left to the child)

Recorded here so `/implement` doesn't re-litigate; candidates for the root
Decision Log are flagged in Surprises as they're confirmed.

1. **Clock injection design (M1):** `apps/api/test/support/http.ts` is
   refactored so the ports layer is **built per app**, not once at module
   scope. Advisory shape: a `makePortsLayer(clock: Layer<ClockPort>)`
   internal helper; `makeTestApp` grows a second options argument —
   `makeTestApp(overrides?: Partial<AppConfig>, ports?: { clock?:
Layer.Layer<ClockPort>; seed?: number })` — and assembles
   `PortsLayer`/`TestAppLayer` inside the call so the override is present
   **before** `RoomRegistryLive.pipe(Layer.provide(PortsLayer))` is
   constructed. Defaults are `ClockLive` and `TEST_SEED`, so every
   existing suite is byte-for-byte unaffected; the exported
   `TestAppLayer` constant is kept (as the default assembly) because
   `apps/api/test/DyingActor.test.ts:32` imports it directly.
2. **Api-side settable clock is a duplicated helper**, exported from
   `support/http.ts` (or a sibling `support/clock.ts`): the ~8-line twin
   of `packages/application/test/support/stubs.ts:186-192` (Ref-backed
   `ClockPort` + `.set(t)`). Cross-package test imports don't exist in
   this repo (CAM-6 decision 14's stance: 30 duplicated lines beat a new
   package).
3. **Seed override: yes** (`ports.seed`, decision 1). Justification:
   C3.1 requires all four outcome cells **over HTTP**; whether the fixed
   `TEST_SEED` reaches a given cell (notably opponent/correct, which
   needs a rank match in an opponent's hand while a window is open)
   within a bounded drive is seed-luck. The override is three lines in
   the harness; per-cell seeds are found by a **pure offline search**
   (iterate seeds through `dealGame` + the drive policy — milliseconds,
   run once in a throwaway script) and hardcoded as named constants with
   a comment stating what each seed reaches. No runtime seed search in
   tests. If `TEST_SEED` happens to reach every cell, the constants all
   equal `TEST_SEED` and the override still costs nothing.
   _As built:_ the offline survey (run and deleted during `/implement`)
   found `TEST_SEED` itself has a rank-matching card in seat 1's hand at
   its **first** window plus non-matching cards everywhere — all four
   cells reachable at window 0 with the default seed, so no per-cell
   constants landed; the `ports.seed` override exists but no test uses it.
4. **The api harness has the two-clock gap too, deliberately:** the
   injected settable `ClockPort` is the engine/lateness authority, but
   `Effect.sleep` in the live `ManagedRuntime` runs on **real time**
   (there is no TestClock in the api runtime). Consequences the M3 suites
   are designed around: (a) tests that must keep the timer _out_ of the
   picture use a **large window** (e.g. 600 000 ms — the timer fiber
   sleeps that long in real time and is interrupted at app close) and
   advance only the settable clock; (b) the one test that wants the
   timer to _fire_ (C1.6) uses a **small window** (e.g. 250 ms — sleep
   duration derives from `closesAt - ClockPort.now` at arming,
   `RoomRegistry.ts:140-142`) plus the settable clock advanced past
   `closesAt` immediately after the window-opening reply returns, then
   **polls with a deadline** — never a bare sleep-and-assert (root
   acceptance criterion).
5. **Timeline discipline with an injected clock:** the local replay uses
   the **server's absolute timeline** — start the settable clock at a
   fixed epoch constant (the RoomRegistry.test.ts style
   `NOW = 1_700_000_000_000`), deal locally at that same timestamp, and
   advance both the settable clock and the replay's `now` in lockstep.
   `closesAt` then matches exactly between server and replay; the
   existing `normalize` is kept as belt-and-braces where the driver
   helpers already apply it. _As built:_ the slam suite compares views
   **without** `normalize` on purpose — the exact `closesAt` equality in
   every reply doubles as the standing proof that the injected clock
   reached the registry (the folded step-1.1 probe).
6. **C2.1 mechanism — parallel `app.inject`, order read back:**
   concurrent slam submissions go out via `Promise.all` over
   `app.inject` (in-file concurrency is fine; `fileParallelism: false`
   only serializes _files_). No `listen()` + real sockets: the
   serialization guarantee under test lives in the actor queue, which
   both injected requests reach through the same enqueue path as a
   socket request would; real sockets add only OS nondeterminism.
   Because enqueue order is not controllable, the assertion is
   **order-agnostic**, mirroring the amended clause-8 stance of
   `RoomRegistry.test.ts:42-118`: read the processing order back from the
   publisher journal, replay the two slams **pure** in that order, and
   require each HTTP reply (status + view) and the final persisted
   outcome to equal the sequential replay exactly, with versions
   strictly increasing.
7. **C2.3 mechanism — the clock crosses `closesAt` _inside_ the first
   slam's processing:** wrap the publisher stub with a one-shot hook
   that advances the settable clock past `closesAt` on its first
   `publishGame` (the publish happens inside envelope A's
   `executeGameCommand`, after A's engine decision was judged at
   `closesAt - 1` and before envelope B is dequeued). Then two awaited
   `execute` calls — slam A succeeds, slam B fails `SlamTooLate` —
   deterministically pinning that lateness is read per-envelope at
   `ExecuteGameCommand.ts:50`, not at enqueue.
8. **Harness extraction, application side:** `makeHarness`, `choose`,
   `seedLobby`, `driveToSlamWindow` move from `RoomRegistry.test.ts`
   into a new `packages/application/test/support/registry.ts`;
   `RoomRegistry.test.ts` gets an import-only edit (no assertion
   changes). The new timing suite imports the same helpers instead of
   copying them.
9. **Driver extraction, api side:** `makePlayers`, `toWire`,
   `normalize`, `apply`, and the lobby-create/join/start boilerplate
   move from `EndToEndGame.test.ts` into a new
   `apps/api/test/support/game-driver.ts`; `EndToEndGame.test.ts`
   consumes them. NOT purely import-only (review F4): `setupGame` asserts
   the join status and clears the publisher journal before start, which
   its second suite previously did not; and (fix cycle) the room-stream
   whitelist scan now calls `rulePublicSlugs` from `support/leaks.ts`. The slam suite's chooser differs from the
   existing `choose` (it must _seek_ slams, not filter them out), so the
   chooser stays per-suite; only the mechanical plumbing is shared.
10. **New suites, not extensions:** application timing tests land in a
    new `packages/application/test/SlamTiming.test.ts` (the 450-line
    `RoomRegistry.test.ts` keeps its existing scope); api e2e slam tests
    land in a new `apps/api/test/SlamWindow.test.ts`
    (`EndToEndGame.test.ts` keeps its acceptance role and its existing
    real-slam test untouched).

## Module layout

New/changed files — all under test directories; **no production file
changes are planned** (any exception is a Surprise with its forcing test):

| File                                             | Change | Job                                                                                                                                                                  |
| ------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/test/support/http.ts`                  | edit   | M1: per-call ports assembly; `makeTestApp(overrides?, ports?)` with `clock`/`seed` overrides (decisions 1, 3); settable-clock helper (decision 2)                    |
| `packages/application/test/support/registry.ts`  | new    | Extracted actor harness: `makeHarness`, `choose`, `seedLobby`, `driveToSlamWindow` (decision 8)                                                                      |
| `packages/application/test/RoomRegistry.test.ts` | edit   | Import-only: consume the extracted helpers; zero assertion changes                                                                                                   |
| `packages/application/test/SlamTiming.test.ts`   | new    | M2: C1.3 actor pin, C2.3 processing-time race, C4.2 application half                                                                                                 |
| `apps/api/test/support/game-driver.ts`           | new    | Extracted e2e plumbing: `makePlayers`, `toWire`, `normalize`, `apply`, lobby setup (decision 9)                                                                      |
| `apps/api/test/EndToEndGame.test.ts`             | edit   | Consume the extracted helpers; `setupGame` adds a join assertion + pre-start journal clear to the second suite (review F4); whitelist scan now via `rulePublicSlugs` |
| `apps/api/test/SlamWindow.test.ts`               | new    | M3: four cells + leak assertions, late-slam 422, HTTP race, sleeping-server lazy close, timer close, restart                                                         |
| `packages/application/test/support/stubs.ts`     | edit   | One-word change: `export` on `interface GameRow` — TS4023 once `makeHarness` (whose repo stub type names it) became an export of `registry.ts`                       |
| `apps/api/test/support/leaks.ts`                 | edit   | Fix cycle (review F7): `rulePublicSlugs` — the single rule-public whitelist, typed over `GameEvent`, shared by both room-stream scans                                |

Untouched surfaces (the close-out sweep enforces): `packages/domain/src`,
`packages/contracts/src`, `packages/application/src`, `apps/api/src`,
`apps/web`, all migrations.

## Plan of work

Ordered by root-plan milestone. Each step leaves the repo compiling and
every existing suite green.

**Code sketches (signatures, exports, window sizes, seed values) are
advisory** — the coverage table and module layout are the artifacts
reconciled against as-built code.

### M1 — Test-support enablement (`apps/api/test/support/http.ts`)

**Step 1.1 — Injectable clock + seed in the api harness.** Refactor
`support/http.ts` per decisions 1–3: move the `PortsLayer`/`TestAppLayer`
assembly into a function taking the clock layer (default `ClockLive`) and
the seed (default `TEST_SEED`), called inside `makeTestApp`; keep the
exported `TestAppLayer` constant as the default assembly for
`DyingActor.test.ts:32`; add the settable-clock helper (Ref-backed
`ClockPort` with `.set(t: number)`, twin of `stubs.ts:186-192`). The
critical property — probe it once by hand while implementing: a settable
clock passed to `makeTestApp` must be the clock `RoomRegistryLive`
captures (a quick throwaway assertion that a game started under a frozen
clock persists `closesAt === frozen + slamWindowMs` proves it; the real
pin lands with the M3 suites).

Checkpoint: `pnpm --filter @cambio/api test` — all existing suites green,
untouched by the default path (Postgres up).

### M2 — Application-level timing suite (`packages/application/test/`)

**Step 2.1 — Extract the harness.** Create
`test/support/registry.ts` with `makeHarness`, `choose`, `seedLobby`,
`driveToSlamWindow` (and the `config`/`NOW`/`SEED`/`KNOWN_USERS`
constants they close over — export them too); edit
`RoomRegistry.test.ts` to import them (decision 8). No behavior change.
Checkpoint: `pnpm --filter @cambio/application test` green.

**Step 2.2 — `SlamTiming.test.ts`: late Slam through the actor (C1.3).**
Re-land the plan-time probe as a permanent test: `driveToSlamWindow`,
capture `closesAt`, `clock.set(closesAt)` (the boundary itself — the
half-open window makes `now === closesAt` late), take a `Slam` from
`legalCandidates` at an in-window instant, `Effect.exit` around
`registry.execute` — assert the failure tag is `SlamTooLate` and **not**
`WrongPhase` (the phase is still `SlamWindow`; the `:188` exemption is
what's under test). Also assert nothing was persisted or published for
the failed slam (journal empty since the drive).

**Step 2.3 — processing-time lateness race (C2.3).** Decision 7's
shape: `driveToSlamWindow` with the clock at `closesAt - 1`; wrap the
publisher layer so the first `publishGame` advances the clock to
`closesAt`; pick two slam candidates (any two attempts — same player
twice is fine, C2.2 allows it); `execute` A (succeeds — judged at
`closesAt - 1`; the hook fires mid-processing), then `execute` B (fails
`SlamTooLate` — judged at `closesAt`). Assert A's reply matches a pure
`applyCommand` of A at `closesAt - 1`, B's failure tag, and that the
journal holds exactly A's save+publish after the drive.

**Step 2.4 — restart-refold mid-window (C4.2, application half).**
Follow `RoomRegistry.test.ts`'s restart pattern (`:236-306`
post-extraction) and its timer/lazy world shape (`:307-372`): inside a
first `Effect.provide(h.layer)`, drive to
`SlamWindow` and capture the state + `closesAt`; let the provide scope
close (the process death — actor and timer die with it); `clock.set`
past `closesAt`; then, in a **second** provide over the same stubs:
(a) `execute` a `Slam` → `SlamTooLate` (late even though no close was
ever processed and the persisted phase is still `SlamWindow`);
(b) `execute` the first legal post-close command (computed pure by
applying `CloseSlamWindow` to the captured state, then `choose`) →
succeeds, and the journal reads
`["load", "save", "publishGame", "save", "publishGame"]` — bootstrap
load, then the lazy close as its own persisted+published batch, then the
command's batch. Never `TestClock.adjust` in this test: no timer may
exist in lifetime two (bootstrap arms none — that absence is exactly
what forces the lazy path).

Checkpoint: `pnpm --filter @cambio/application test` green (existing
suites + the new one); no production file touched.

### M3 — API e2e slam suite (`apps/api/test/`)

**Step 3.1 — Extract the driver.** Create `test/support/game-driver.ts`
(decision 9) with `makePlayers`, `toWire`, `normalize`, `apply`, and a
`setupGame(app, playerNames, …)` helper for the create/join/start
boilerplate (`EndToEndGame.test.ts:154-191`); edit
`EndToEndGame.test.ts` to import them. No assertion changes.
Checkpoint: `pnpm --filter @cambio/api test` green.

**Step 3.2 — `SlamWindow.test.ts` scaffolding + the four cells
(C3.1/C3.2, exercising C2.2).** Every test in this suite runs
`makeTestApp` with a settable clock started at a fixed epoch constant
and (where needed) a per-cell seed constant (decisions 3, 5). A local
slam-seeking chooser drives to a window (reuse the drive loop shape of
`EndToEndGame.test.ts:321-333`), then consults **local truth** to pick
the wanted cell: own/correct, own/incorrect, opponent/correct (with a
named `giveSlot`), opponent/incorrect — correctness is decided by
comparing the target card's rank (known from the replayed state) to the
window rank; `legalCandidates` supplies the candidate set (no invented
legality). For each cell: POST the slam — **200 in all four cells** (an
incorrect slam is a legal command producing `SlamFailed` +
`PenaltyDrawn`; only illegal attempts are 422) — then assert: reply
view equals the local replay's `viewFor` (via `normalize`), reply is
leak-free (`expectNoLeak` with `entitledSlugs`); and from the publisher
journal (`clearPublisherJournal` before each act): `SlamSucceeded`/
`SlamFailed` keep the slammed card in the projected **room** stream
(the §1.5 reveal), `PenaltyDrawn` is slot-only, `CardGivenFromHand`
value-free, `CardGivenFromDeck` stripped, and `projectEvents` yields
**no per-player deliveries** for any slam event — extend the
`publicSlugs` scan pattern of `EndToEndGame.test.ts:244-270`. At least
one window carries two attempts by the same player (C2.2's e2e half).
Cells may be spread over multiple windows of one game or over separate
games/seeds — whatever the offline seed search makes cheapest.

**Step 3.3 — late slam over HTTP (C1.3/C1.4).** Drive to a window
(large `slamWindowMs`, decision 4a), advance the settable clock past
`closesAt`, POST a slam that was legal in-window: **422** with
`error.tag === "SlamTooLate"` in the contract body; then `GET /view`
still shows `SlamWindow` (a late `Slam` triggers no close — `:188`),
and the journal shows nothing persisted or published for it.

**Step 3.4 — concurrent slams over HTTP (C2.1).** Decision 6: two
players, two valid slam bodies, `Promise.all([inject, inject])`; both
responses complete; read the processing order from the publisher
journal; replay the two slams pure in that order (each judged against
the post-predecessor state); assert each reply's status and view equal
the replay (a loser rejected by the engine surfaces its typed 422; both
may legally succeed — no "exactly one wins" prior, per cambio-rules
multi-slam), versions strictly increase across the journal's game
entries, and the final `GET /view` matches the replayed end state.

**Step 3.5 — sleeping-server lazy close over HTTP (C4.1).** Large
window (decision 4a — the real-time timer can't fire), advance the
settable clock past `closesAt`, `clearPublisherJournal`, POST the first
legal post-close command (computed pure): **200**, and the journal's
game entries are — first a batch whose events are exactly
`[SlamWindowClosed, TurnAdvanced]` (the engine's close always appends
the turn advance, `Engine.ts:321-325` — corrected from the plan-time
`[SlamWindowClosed]` sketch), then the command's own batch; the reply's
`version` reflects both saves.

**Step 3.6 — timer-fired close through the real stack (C1.6).**
Decision 4b: small window (advisory 250 ms), settable clock frozen; the
window-opening command's reply returns (timer armed with sleep ≈ window
ms of real time — armed _before_ we move the clock, so the duration is
fixed); immediately `clock.set` past `closesAt`; then **poll** the
publisher journal (advisory: 25 ms interval, 10 s deadline — generous
against CI stalls, way under the 30 s vitest timeout) until a game
entry with events `[SlamWindowClosed, TurnAdvanced]` appears, **without
issuing any further command**; fail with a clear message on deadline. Then assert
equivalence with the lazy path (C1.6's clause): the close is a single
persisted+published batch, `GET /view` shows the same post-close phase
the pure replay predicts, and a subsequent command behaves exactly as
in step 3.5's world (same events, one higher version numbering — the
optimization changed nothing observable). No bare sleep-and-assert
anywhere: every wait is a poll with a deadline and an explanatory
failure.

**Step 3.7 — restart over the same database rows (C4.2, HTTP half).**
App 1 (settable clock at the epoch constant, large window): drive to
`SlamWindow`, note `closesAt` from the replay; `app.close()` +
`runtime.dispose()` — the actor scope dies mid-window. App 2: a second
`makeTestApp` with a **fresh** settable clock initialized past the
absolute `closesAt` (same epoch base — decision 5), same database rows
(TRUNCATE runs once per vitest run, not per app), same session cookies
(the signer secret is shared; the frozen clocks stay far inside the
3600 s TTL). Over app 2: (a) POST a slam → **422 `SlamTooLate`** — the
rebuilt actor loaded a persisted `SlamWindow`, armed no timer, and
judged lateness against the stored `closesAt`; (b) POST the first legal
post-close command → **200**, with the `[SlamWindowClosed, TurnAdvanced]`
batch published before the command's batch (journal order), exactly as in
step 3.5. This is the root plan's gap-table bottom row closed
end-to-end.

Checkpoint: `pnpm --filter @cambio/api test` green — new suite + every
existing suite (Postgres up).

### M4 — Close-out

Full bare gate, untouched-surfaces sweep, coverage table filled by
`/implement` as each test lands, module layout reconciled against
as-built files, Progress/Surprises finalized here and in the root plan.

## Concrete steps & validation

Run from the repo root. If `pnpm` is missing:
`source ~/.nvm/nvm.sh && nvm use 22`. Postgres must be up for every api
suite (and it is always safe to start):

```bash
docker compose -f docker/docker-compose.yml up -d
pnpm --filter @cambio/api migrate   # idempotent, if in doubt
```

Per-milestone signals:

- **M1:** `pnpm --filter @cambio/api test` — existing suites green with
  the default (real-clock, `TEST_SEED`) path; the throwaway
  frozen-clock probe from step 1.1 observed once and deleted (or folded
  into an M3 test).
- **M2:** `pnpm --filter @cambio/application exec vitest run RoomRegistry SlamTiming`
  — the extracted-harness suite unchanged-green, the three new tests
  green; then the full
  `pnpm --filter @cambio/application test`.
- **M3:** `pnpm --filter @cambio/api exec vitest run SlamWindow` while
  iterating; then the full `pnpm --filter @cambio/api test` (includes
  the untouched `EndToEndGame` acceptance and the realtime container
  suites — both compose services up). Run the timer test (step 3.6) a
  few times locally (`vitest run SlamWindow` repeated, or its file
  alone) to shake out flake before calling the milestone done; record
  the observed close latency in Progress.
- **M4:** the full gate.

Untouched-surface sweep (must print nothing — this task is tests-only):

```bash
git diff --name-only origin/release-v0...HEAD -- \
  packages/domain/src packages/contracts/src packages/application/src \
  apps/api/src apps/api/migrations apps/web
```

Final gate (must pass before `/ship`). **Never pipe it** — a pipe
replaces the gate's exit code with the filter's and has committed a
broken build before (the PreToolUse hook
`.agents/hooks/block-piped-gate.sh` also denies piped gate invocations
without `pipefail`); run it bare and check the exit status directly:

```bash
pnpm turbo build typecheck lint test
```

(`lint` includes the repo-wide prettier check — `pnpm format` if it
complains about new files, this document included.)

## Contract coverage

_(maintained by `/implement`, verified by `/review`: one row per root-plan
contract clause this side owns — the test that pins it, or why none can.
Each row must also say **what is asserted**, in one phrase. Per the
template rule, the **Contract coverage table stays test-nameless at plan
time**: rows hold clause → planned approach; `/implement` fills the test
file, test name, and assertion phrase as each test actually lands —
invented test titles become review findings. The "planned approach" notes
below are plan-time orientation only.)_

New tests live in `packages/application/test/SlamTiming.test.ts` ("ST")
and `apps/api/test/SlamWindow.test.ts` ("SW").

| Clause | Test (file + name)                                                                                                                                                                                                                        | What is asserted                                                                                                                                                                                                                                                                                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1.1   | pre-existing `Slam.test.ts:337` stands; SW "opponent/correct with give, then two incorrect attempts by the same player (C3.1/C3.2/C2.2)" re-observes it e2e                                                                               | `closesAt === EPOCH + BIG` unchanged after three slam attempts in one window                                                                                                                                                                                                                                                                                                                |
| C1.2   | pre-existing — `Config.test.ts:86-90`, `Lobbies.test.ts:160`, `EventProjection.test.ts` GameStarted rows; CAM-7 adds nothing                                                                                                              | (standing citations)                                                                                                                                                                                                                                                                                                                                                                        |
| C1.3   | ST "a late Slam is SlamTooLate, never WrongPhase — the lazy close is skipped for slams (C1.3)"; HTTP halves in SW "a late slam is 422 SlamTooLate, persists nothing, and the window closes exactly once (C1.3/C1.4)" and SW restart       | at `now === closesAt` (half-open boundary) the actor's reply error tag is `SlamTooLate` and NOT `WrongPhase`; no journal batch carries a slam outcome (race-free form — a due window's zero-duration timer close may legally follow, see Surprises)                                                                                                                                         |
| C1.4   | SW "a late slam is 422 SlamTooLate, persists nothing, and the window closes exactly once (C1.3/C1.4)"                                                                                                                                     | HTTP 422 with `error.tag === "SlamTooLate"`; no slam outcome in any journal batch; exactly one `[SlamWindowClosed, TurnAdvanced]` batch precedes the next command's batch                                                                                                                                                                                                                   |
| C1.5   | pre-existing — `GameCommands.test.ts:114-119` (wire `CloseSlamWindow` → 400); CAM-7 adds nothing                                                                                                                                          | (standing citation)                                                                                                                                                                                                                                                                                                                                                                         |
| C1.6   | actor level stands (`RoomRegistry.test.ts` timer-vs-lazy); SW "the timer-fired close arrives through the same persist+publish path, unprompted (C1.6)"                                                                                    | with no further command, the `[SlamWindowClosed, TurnAdvanced]` batch appears in the real publisher journal within the 10s deadline-poll, exactly once; `GET /view` equals the pure replay; the next command adds one batch                                                                                                                                                                 |
| C2.1   | actor level stands (`RoomRegistry.test.ts:42-118`); SW "concurrent slams over HTTP resolve exactly as the sequential replay in processing order (C2.1)"                                                                                   | `Promise.all` injected slams: processing order read from journal `slammerId`s (a headless batch throws); each reply's status/view/version equals the pure sequential replay in that order (loser: 422 with the engine's exact error tag); final `GET /view` matches and is leak-scanned                                                                                                     |
| C2.2   | domain pin stands (`Slam.test.ts:337`); e2e half in SW "opponent/correct with give, then two incorrect attempts by the same player (C3.1/C3.2/C2.2)"                                                                                      | three slam attempts by the same player (Alice) inside one window over HTTP, each 200 with reply-view equality                                                                                                                                                                                                                                                                               |
| C2.3   | ST "processing-time lateness: a slam submitted in-window but queued behind a slower command is SlamTooLate (C2.3)"                                                                                                                        | BOTH slams enqueued at `closesAt - 1` (A parks in its publish on a gate until B is queued, then the clock crosses): A equals the pure engine answer at `closesAt - 1`, B fails `SlamTooLate` — arrival-time stamping would have let B succeed, so the test discriminates the designs (review F1)                                                                                            |
| C3.1   | domain pin stands (`Slam.test.ts:51-149`); e2e in SW "own/correct: the §1.5 reveal rides the room channel and the hand shrinks (C3.1/C3.2)" + SW "opponent/correct with give, …"                                                          | all four cells over HTTP (own±, opponent±): 200 replies with UNnormalized view equality against the local replay, hand shrink/hole, give fills the vacated slot, penalties into the lowest free slot — all leak-free                                                                                                                                                                        |
| C3.2   | projection pin stands (`EventProjection.test.ts:94-268`); e2e via `expectRoomRevealOnly` + explicit reveal-presence assertions in both SW cell tests                                                                                      | `SlamSucceeded` AND `SlamFailed` reveal cards asserted PRESENT on the room stream (review F3); projected `PenaltyDrawn` and `CardGivenFromHand` have no `card` property; slam-only batches produce zero per-player deliveries; whitelist is the shared `rulePublicSlugs`                                                                                                                    |
| C3.3   | pre-existing — `Slam.test.ts:245,293,313`, `Simulation.test.ts:250-253`; e2e reach not required (root clause): no chosen seed reaches zero-card/`DrawSkipped` cells over HTTP, domain pins remain the coverage                            | (standing citations)                                                                                                                                                                                                                                                                                                                                                                        |
| C4.1   | actor level stands; SW "sleeping server: the next command lazily closes the expired window as its own batch (C4.1)"                                                                                                                       | after expiry with an inert timer, the next command returns 200; journal shows the `[SlamWindowClosed, TurnAdvanced]` batch before the command's batch; reply version is `V+2` (two saves)                                                                                                                                                                                                   |
| C4.2   | ST "restart mid-window: the late slam is refused and the window closes exactly once before the next command (C4.2)"; SW "restart mid-window over the same rows: late slam 422, window closed exactly once before the next command (C4.2)" | second registry/app over the same rows: refusal is `SlamTooLate` with no slam outcome persisted; journal reads `["load","save","publishGame","save","publishGame"]` with the `[SlamWindowClosed, TurnAdvanced]` batch first — identical whether the zero-duration timer or the lazy path closes (race-free form); over HTTP the same story with 422 then 200, view equality and a leak scan |
| C4.3   | no test by design — documented-not-fixed (root Decision Log); the C4.2 tests are the evidence that a parked window is safe (`closesAt` still governs, nobody slams late)                                                                  | (justification, not a test)                                                                                                                                                                                                                                                                                                                                                                 |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [x] 2026-09-02 — backend plan written; awaiting `/implement`
- [x] 2026-09-02 20:26 — M1: `support/http.ts` per-call ports assembly
      (`makeTestApp(overrides?, ports?)`, `makeSettableClock`, `TestPorts`);
      all 18 existing api suites green (94 tests). The step-1.1 frozen-clock
      probe is folded into M3 (the slam suite asserts replay `closesAt`
      equality under the lockstep timeline, decision 5).
- [x] 2026-09-02 20:29 — M2: harness extracted to
      `test/support/registry.ts` (RoomRegistry.test.ts import-only edit);
      `SlamTiming.test.ts` lands C1.3 (boundary `now === closesAt`,
      `SlamTooLate` not `WrongPhase`, nothing persisted), C2.3 (one-shot
      publisher hook crosses `closesAt` inside slam A's processing; A
      equals the pure engine answer, B is `SlamTooLate`), C4.2 application
      half (second provide over the same stubs: `["load","save",
"publishGame","save","publishGame"]`, close batch =
      `SlamWindowClosed`+`TurnAdvanced`). 14 files / 83 tests green.
      Deviation from the advisory sketch: a close batch's events are
      `[SlamWindowClosed, TurnAdvanced]` (Engine.ts:321-325 appends the
      turn advance), not `[SlamWindowClosed]` — M3's steps 3.5-3.7 assert
      accordingly.
- [x] 2026-09-02 20:34 — offline seed survey (temp domain test, deleted):
      `TEST_SEED` reaches all four cells at its first window (decision 3
      as-built note) — no per-cell seed constants needed.
- [x] 2026-09-02 20:38 — M3: `support/game-driver.ts` extracted
      (EndToEndGame.test.ts edit + `setupGame` boilerplate
      swap); `SlamWindow.test.ts` lands all seven e2e tests (four cells +
      reveal/leak, late slam 422, HTTP race, sleeping-server lazy close,
      timer close, restart) — 7/7 green on the FIRST run and across four
      repeat runs; timer-close latency observed ~485–500 ms wall
      (250 ms window + poll interval + publish). Full api suite:
      19 files / 101 tests green.
- [x] 2026-09-02 20:45 — M4: full bare gate
      (`pnpm turbo build typecheck lint test`) exit 0, 22/22 tasks,
      after fixing two unused imports in
      `SlamTiming.test.ts`, exporting `GameRow` (TS4023, see Surprises),
      and prettier passes; untouched-surfaces sweep prints nothing;
      coverage table filled; plan docs reconciled with as-built code.

- [x] 2026-09-02 22:00 — review fix cycle (F1–F7): C2.3 rewritten to
      enqueue both slams in-window behind a publish gate (now discriminates
      processing-time from arrival-time stamping); late-slam and restart
      tests restructured race-free against the zero-duration timer re-arm
      (see Surprises); `rulePublicSlugs` centralized in `support/leaks.ts`
      and adopted by both scans; `SlamFailed` reveal presence asserted;
      race loser now checked against the engine's exact error tag and the
      order read-back throws on a headless batch; leak scans added to every
      direct `GET /view` read; tautological hand-size ternary fixed; dead
      `alice` binding removed; restart journal reads filtered by gameId;
      stale `RoomRegistry.test.ts` citations updated across both plan docs.
      Suites green: SlamTiming 3/3, SlamWindow 7/7, EndToEndGame 2/2.

## Surprises & notes for the root plan

_(anything the root plan's Decision Log or the reviewer must know)_

- Plan-time note (not a surprise, but load-bearing for M3 design): in the
  api harness the injected `ClockPort` governs the engine and lateness,
  but the actor's timer fiber sleeps on the **runtime** clock — real time
  in a `ManagedRuntime` (the application suites get `TestClock` from
  `it.effect`; the api suites do not). The M3 designs above lean on this
  gap deliberately (decision 4): large windows to keep timers inert,
  a small window + clock-set + poll for the one timer test. If C1.6
  proves flaky despite the deadline-poll, the fallback is widening the
  window/deadline margins — not adding a sleep.
- Session issuance and verification both read `ClockPort`
  (`CreateTemporaryUser.ts`, `VerifySession.ts`), so frozen/advanced test
  clocks keep sessions coherent — noted here because a future suite that
  advances a settable clock by more than `sessionTtlSeconds` (3600 s)
  will start receiving 401s that have nothing to do with slams.
- 2026-09-02 (implement) — **close batches always carry `TurnAdvanced`**:
  `closeSlamWindow` (`Engine.ts:321-325`) emits `SlamWindowClosed` and then
  the turn advance in ONE batch, so every journal assertion on a close is
  `[SlamWindowClosed, TurnAdvanced]`, not the plan-time `[SlamWindowClosed]`
  sketch. Prose in steps 3.5–3.7 corrected in place.
- 2026-09-02 (implement) — **one word outside the planned file list**:
  exporting `makeHarness` from `registry.ts` tripped TS4023 (its inferred
  type names the repo stub's `GameRow`), fixed by `export interface GameRow`
  in `packages/application/test/support/stubs.ts`. Test-support only; added
  to the module layout table.
- 2026-09-02 (implement) — **no production gap surfaced**: every new test
  passed on its first run against unmodified production code (the plan-time
  probe had predicted C1.3; the rest confirmed CAM-1/5/6 behavior). The
  root plan's "tests-mostly, production edits only if forced" stance held
  with zero forced edits.
- 2026-09-02 (review fix cycle) — **the zero-duration timer re-arm**:
  `manageTimer` runs after EVERY envelope (`RoomRegistry.ts:202`), and for
  a past-due window it arms `Effect.sleep(0)` — which fires even under an
  un-adjusted TestClock (probe-verified this cycle). Consequence: after a
  refused LATE slam, the actor may close the window at any moment via that
  timer, so "nothing happened after the refusal" is only assertable as "no
  slam outcome was persisted", never as "journal empty" — the original
  suite had three such assertions passing on scheduling margins (a real
  flake risk on the real-clock api side). All were restructured race-free;
  the journal sequence is provably identical whichever close mechanism
  wins, which is what the tests now assert. Production behavior itself is
  correct and ADR-0020-consistent (a due window closes promptly); no
  production change made.
