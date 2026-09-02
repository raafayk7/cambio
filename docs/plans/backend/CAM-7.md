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
- **Application actor harness**
  (`packages/application/test/RoomRegistry.test.ts`): the two-clock design
  documented at `:27-37` — `makeSettableClock`
  (`test/support/stubs.ts:186-192`, Ref-backed `ClockPort`) is the engine
  authority; Effect's `TestClock` governs the timer fiber's `Effect.sleep`
  (it.effect provides `TestClock`, so in-process timers never fire unless
  `TestClock.adjust` runs — determinism for free). Harness `makeHarness`
  (`:44-57`), chooser (`:65-80`), `seedLobby` (`:83-88`),
  `driveToSlamWindow` (`:91-103`). Already pinned there: slam-race
  serialization over 20 rooms (`:123-`, frozen clock),
  timer-vs-lazy-close equivalence + stale-timer no-op (`:388-453`),
  restart reconstruction (`:317-386` — never restarted while the phase is
  `SlamWindow`; "one `Effect.provide(h.layer)` = one process lifetime; a
  second provide over the same repo stub IS the simulated restart").
  Stub kit: `makeGameRepoStub` (honours version guards, `poke()`,
  `dieOnNextSave()`), `makeJournal`/`opsOf`, `makePublisherStub`,
  `seedStub`, `usersStub` (`test/support/stubs.ts`).
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
   helpers already apply it.
6. **C2.1 mechanism — parallel `app.inject`, order read back:**
   concurrent slam submissions go out via `Promise.all` over
   `app.inject` (in-file concurrency is fine; `fileParallelism: false`
   only serializes _files_). No `listen()` + real sockets: the
   serialization guarantee under test lives in the actor queue, which
   both injected requests reach through the same enqueue path as a
   socket request would; real sockets add only OS nondeterminism.
   Because enqueue order is not controllable, the assertion is
   **order-agnostic**, mirroring the amended clause-8 stance of
   `RoomRegistry.test.ts:123-`: read the processing order back from the
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
   `apps/api/test/support/game-driver.ts`; `EndToEndGame.test.ts` gets
   an import-only edit. The slam suite's chooser differs from the
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

| File                                             | Change | Job                                                                                                                                               |
| ------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/test/support/http.ts`                  | edit   | M1: per-call ports assembly; `makeTestApp(overrides?, ports?)` with `clock`/`seed` overrides (decisions 1, 3); settable-clock helper (decision 2) |
| `packages/application/test/support/registry.ts`  | new    | Extracted actor harness: `makeHarness`, `choose`, `seedLobby`, `driveToSlamWindow` (decision 8)                                                   |
| `packages/application/test/RoomRegistry.test.ts` | edit   | Import-only: consume the extracted helpers; zero assertion changes                                                                                |
| `packages/application/test/SlamTiming.test.ts`   | new    | M2: C1.3 actor pin, C2.3 processing-time race, C4.2 application half                                                                              |
| `apps/api/test/support/game-driver.ts`           | new    | Extracted e2e plumbing: `makePlayers`, `toWire`, `normalize`, `apply`, lobby setup (decision 9)                                                   |
| `apps/api/test/EndToEndGame.test.ts`             | edit   | Import-only: consume the extracted helpers; zero assertion changes                                                                                |
| `apps/api/test/SlamWindow.test.ts`               | new    | M3: four cells + leak assertions, late-slam 422, HTTP race, sleeping-server lazy close, timer close, restart                                      |

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
Follow the `:317-386` restart pattern and the timer/lazy world shape at
`:388-453`: inside a first `Effect.provide(h.layer)`, drive to
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
`[SlamWindowClosed]`, then the command's own batch; the reply's
`version` reflects both saves.

**Step 3.6 — timer-fired close through the real stack (C1.6).**
Decision 4b: small window (advisory 250 ms), settable clock frozen; the
window-opening command's reply returns (timer armed with sleep ≈ window
ms of real time — armed _before_ we move the clock, so the duration is
fixed); immediately `clock.set` past `closesAt`; then **poll** the
publisher journal (advisory: 25 ms interval, 10 s deadline — generous
against CI stalls, way under the 30 s vitest timeout) until a game
entry with events `[SlamWindowClosed]` appears, **without issuing any
further command**; fail with a clear message on deadline. Then assert
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
post-close command → **200**, with the `[SlamWindowClosed]` batch
published before the command's batch (journal order), exactly as in
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

| Clause | Test (file + name)                                                                                                                                                                                                                                                                              | What is asserted |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| C1.1   | _planned:_ already pinned (`Slam.test.ts:337`, source `Engine.ts:59`) — the citation stands; CAM-7 adds nothing beyond the e2e suites incidentally re-observing a stable `closesAt`                                                                                                             |                  |
| C1.2   | _planned:_ already pinned (`Config.test.ts:86-90`, `Lobbies.test.ts:160`, `EventProjection.test.ts` GameStarted rows) — stands; CAM-7 adds nothing                                                                                                                                              |                  |
| C1.3   | _planned:_ new — actor-level pin in `SlamTiming.test.ts` (step 2.2: frozen phase, clock at `closesAt`, `SlamTooLate` not `WrongPhase`) **and** the HTTP halves of steps 3.3/3.7                                                                                                                 |                  |
| C1.4   | _planned:_ new — step 3.3: late slam over HTTP returns 422 with `error.tag === "SlamTooLate"` (mapping row `errors.ts:77` exercised end-to-end)                                                                                                                                                 |                  |
| C1.5   | _planned:_ already pinned (`GameCommands.test.ts:114-119`, wire `CloseSlamWindow` → 400 at decode) — stands; CAM-7 adds nothing                                                                                                                                                                 |                  |
| C1.6   | _planned:_ actor-level equivalence stands (`RoomRegistry.test.ts:388-453`); new — step 3.6 observes the timer-fired close through the real route/publisher stack (poll-with-deadline, decision 4b) and its equivalence with step 3.5's lazy world                                               |                  |
| C2.1   | _planned:_ actor-level stands (`RoomRegistry.test.ts:123-`); new — step 3.4: parallel `inject`s, order read back from the journal, replies + final state equal the pure sequential replay in that order, versions monotone (decision 6)                                                         |                  |
| C2.2   | _planned:_ domain pin stands (`Slam.test.ts:337`); new e2e half — step 3.2 drives multiple attempts by one player inside one window over HTTP                                                                                                                                                   |                  |
| C2.3   | _planned:_ new — step 2.3: clock advanced past `closesAt` inside slam A's processing via the publisher hook (decision 7); A succeeds, B `SlamTooLate` — processing-time judgment at `ExecuteGameCommand.ts:50`                                                                                  |                  |
| C3.1   | _planned:_ domain pin stands (`Slam.test.ts:51-149`); new — step 3.2 drives each of the four cells over HTTP with reply-view + local-replay equality and leak-free replies (per-cell seed constants, decision 3)                                                                                |                  |
| C3.2   | _planned:_ projection pin stands (`EventProjection.test.ts:94-268`); new — step 3.2 asserts the classification from publisher-port capture in the e2e scenarios: reveal on room, `PenaltyDrawn` slot-only, gives value-free/stripped, no per-player slam deliveries, room stream leak-free      |                  |
| C3.3   | _planned:_ already pinned (`Slam.test.ts:245,293,313`, `Simulation.test.ts:250-253`) — stands; per the root clause, e2e reach is **not required** — if no chosen seed reaches zero-card/`DrawSkipped` cells over HTTP, the domain pins remain the coverage (say so in this row when filling it) |                  |
| C4.1   | _planned:_ actor-level stands (`RoomRegistry.test.ts:388-`, timer disabled world); new — step 3.5: post-expiry command over HTTP returns 200 with the `[SlamWindowClosed]` batch persisted+published before the command's own events                                                            |                  |
| C4.2   | _planned:_ new, both halves — step 2.4 (second `Effect.provide` over the same stubs: bootstrap load, no timer, lazy close, late slam `SlamTooLate`) and step 3.7 (second `makeTestApp` over the same DB rows, same assertions over HTTP)                                                        |                  |
| C4.3   | _planned:_ documented-not-fixed by root Decision Log — no dedicated test; the C4.2 tests are the cited evidence that a parked window is safe (`closesAt` still governs, nobody slams late). Row is filled with that justification, not a test name                                              |                  |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [x] 2026-09-02 — backend plan written; awaiting `/implement`

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
