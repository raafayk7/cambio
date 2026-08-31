# CAM-2 — Randomized-game simulation harness + invariant property tests (backend)

- **Root plan:** [root/CAM-2.md](../root/CAM-2.md) — the functional contract
  (C1–C7) lives there; this document is implementation detail for the backend
  side.
- **ADRs:** [0013](../../adr/0013-hand-rolled-seeded-simulation-driver.md)
  (hand-rolled seeded driver, second independent `Utils.PCGRandom`, no
  property-testing library). The harness must *exercise and count* the
  behaviors decided in [0009](../../adr/0009-zero-card-slammer-draws-then-gives.md),
  [0010](../../adr/0010-jq-swaps-require-occupied-slots-powers-fizzle.md),
  [0011](../../adr/0011-slam-window-fixed-close-config-duration.md), and
  [0012](../../adr/0012-empty-discard-skips-slam-window.md).

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

All new code lives in **`packages/domain/test/sim/`** (a new directory), plus
one env declaration in `turbo.json` and a timeout line in
`packages/domain/vitest.config.ts`. **Nothing under `packages/domain/src/`
changes, and `packages/domain/test/EndToEnd.test.ts` stays byte-identical**
(root acceptance criteria). If the sim exposes an engine defect or a rule
situation not covered by HANDOFF §1 / ADRs 0009–0012, that is the C7.1
stop-and-ask — halt, present the failing seeds and trace, and wait; never
patch the engine or fill the gap from other Cambio variants. Governing
skills: **effect-domain-modeling** (purity, idioms — they apply to test code
too), **cambio-rules** (the anti-prior guard), **architecture** (domain =
`effect`-only leaf; ESLint enforces this over `test/**` as well).

The engine surface the harness drives (all complete, CAM-1):

- `applyCommand(state, command, now)` — `packages/domain/src/Engine.ts:332`,
  returns `Either.Either<readonly [GameState, ReadonlyArray<GameEvent>],
  GameError>` (success channel **first**, effect 3.x order). Pure; illegal
  commands leave the input untouched.
- `dealGame(players, seed, config, now)` — `src/Deal.ts:16`, same Either
  shape; deals 4 cards to each of 2–5 seats, one discard, emits
  `[GameStarted]`.
- `legalCommandKinds(state, playerId, now)` — `src/Legality.ts:237`. Returns
  command **tags** only, per player; the harness fills arguments. Two facts
  that shape the driver: (1) `Slam` is legal for **any seated player** during
  an open window, so candidates must be gathered across **all** seats, not
  just the active one; (2) `CloseSlamWindow` carries no issuer
  (`src/Command.ts:72`) yet `legalCommandKinds` needs a seated `playerId` to
  list it, and it is legal only once `now >= closesAt` — mutually exclusive
  with `Slam` (`now < closesAt`). The driver therefore treats window-closing
  as a **clock action** (jump `now` to `closesAt`, issue the close), never a
  per-player choice (root plan Surprises).
- Argument-filling helpers, `src/GameState.ts`: `handOf` (SwapHeld slot
  choices, give-slot choices), `occupiedSlots(state)` (`:96` — every
  `SlotRef` in seat-then-slot order, the peek/swap/slam target pool),
  `slotCard`, `lowestFreeSlot`. The per-power target rules are in
  `src/Legality.ts:157-162`: 7/8 peek an **own** occupied slot, 9/T an
  **opponent's**, Q any; J/Q swaps take two **distinct** occupied slots
  (`SwapTargetsIdentical` otherwise). `Slam.giveSlot` must be `null` iff
  slamming one's own card or the slammer's hand is empty, else a named
  occupied own slot (`src/Legality.ts:202-219`).
- `allCards(state)` — `src/GameState.ts:126` — deck + discard + hands **+ the
  phase-held card**. The partition idiom from `test/EndToEnd.test.ts:58`:
  `expect([...allCards(state)].sort()).toStrictEqual([...ALL_CARD_SLUGS].sort())`.
- `test/fixtures.ts` — `uid(n)`, `slot(n)`, `ts(n)`, `card(slug)` builders;
  reuse them (`../fixtures.js` from inside `test/sim/`).

Behavioral facts the driver must be built around (root plan Surprises,
planning exploration):

- **A legal command can return a byte-identical state**: a failed slam whose
  penalty draw is skipped, and a zero-card give whose draw is skipped
  (ADR-0011; `src/Engine.ts:262-265`, `:308-310`). Never assert state churn;
  termination comes from the clock + policy + step cap only.
- **Games end only via `CallCambio`**, which is always legal for the active
  player in `AwaitingDraw` — the policy needs rising call probability plus a
  forced call past a turn threshold (C1.4).
- **ADR-0012**: an empty discard pile (a zero-card keep took its last card)
  opens **no** slam window — `openWindowOrAdvance` (`src/Engine.ts:61-63`)
  advances the turn directly, emitting `TurnAdvanced` **without**
  `SlamWindowClosed`. Not every turn has a window; that signature is also how
  the counter detects the skip.
- Rare paths the run must provably reach (C5.2): zero-card
  `TakeDiscard`→`KeepHeld` (ADR-0009; `KeepRequiresEmptyHand` guard at
  `src/Legality.ts:141`), zero-card slammer draw-then-give
  (`src/Engine.ts:306-323`), each power-fizzle shape
  (`powerHasValidTarget`, `src/Legality.ts:48-67`; fizzle branch
  `src/Engine.ts:136-151`), and the ADR-0012 skip.

Toolchain facts the implementer must honor:

- tsconfig covers `test/**/*.ts` (so `test/sim/` typechecks); vitest's
  include pattern `test/**/*.test.ts` (`packages/domain/vitest.config.ts`)
  already matches subdirectories — **only** files ending `.test.ts` become
  suites, so the sim's helper modules are plain imports. ESLint lints
  `test/**/*.{ts,tsx}` with the same rules as `src`: inline type imports
  (`import { type GameState }`), `no-unused-vars`, zod banned, workspace
  imports beyond `effect` banned. NodeNext: relative imports need the `.js`
  extension (`"./driver.js"`, `"../../src/Engine.js"`).
- **No new npm dependencies** (ADR-0013). `@types/node` is already a
  devDependency, so `process.env` reads typecheck. `beforeAll` is imported
  from `"vitest"`; `describe`/`expect`/`it` from `"@effect/vitest"` — plain
  `it` everywhere (all code here is pure/synchronous; `it.effect` is for
  effectful code, which this task has none of).
- vitest's default per-test timeout is 5 s and
  `packages/domain/vitest.config.ts` sets no override — hundreds of games
  will blow it. M6 adds a config-level `testTimeout` plus a computed timeout
  on the batch hook (C6.1).
- Turborepo runs tasks in **strict env mode**: `SIM_GAMES`/`SIM_SEED` must be
  declared in `turbo.json`'s `test` task `env` array or `turbo test` strips
  them (C6.2). Declared in `env` (hashed), not passThrough — a different
  game count is a genuinely different test run.
- **Determinism discipline for the harness itself** (C1.1): no
  `Math.random`, `Date.now`, or wall-clock anywhere in `test/sim/`; all
  randomness flows from the driver's own `Utils.PCGRandom` (integer draws
  only, via `integer(max)` — platform-stable); every choice iterates plain
  arrays in construction order (never object/Set iteration order); time is
  integer arithmetic on `Timestamp.make(...)`.
- effect 3.22.1; `Utils.PCGRandom` has `constructor(seed)`, `integer(max)`
  (uniform in `[0, max)`), `getState`/`setState`. The driver's instance is
  **separate from `GameState.prng`** and may stay a long-lived local — the
  driver is test infrastructure, not domain code, but it must be
  deterministic.
- Prettier: no semicolons, double quotes, width 100. Test titles cite the
  contract clause and handoff section they pin — `"(C2.1, §4.5)"` — CAM-1
  convention.
- If `pnpm` is missing from PATH: `source ~/.nvm/nvm.sh && nvm use 22`.

## Module layout (`packages/domain/test/sim/`)

Helper modules (imported, never collected as suites):

| File | Exports | Job |
| --- | --- | --- |
| `rng.ts` | `DriverRng` (`int(maxExclusive)`, `pick(items)`, `chance(num, den)`), `makeDriverRng(seed)` | The ADR-0013 second PRNG: one `Utils.PCGRandom` behind a tiny interface. All draws integer-based. |
| `candidates.ts` | `legalCandidates(state, now): ReadonlyArray<Command>` | Fully-instantiated legal commands across **all** seats: tags from `legalCommandKinds`, arguments filled from state helpers. Excludes `CloseSlamWindow` (clock action — documented in the module docstring). |
| `policy.ts` | `PolicyKnobs`, `defaultKnobs`, `chooseTurnCommand(candidates, rng, turnCount, knobs)`, `chooseSlam(state, slamCandidates, rng, slamsThisWindow, knobs): Option.Option<Command>` | Weighted choice + termination pressure (C1.4). `Option.none()` from `chooseSlam` means "close the window now". |
| `invariants.ts` | `cardPartitionViolations(state, baselineSorted)`, `handIntegrityViolations(state, roster)`, `stepViolations(state, roster, baselineSorted)`, `endViolations(finalState, events, roster)` | Pure checkers returning `ReadonlyArray<string>` of violation descriptions (empty = healthy), so the driver can wrap them with seed/step repro info. C2.4's recomputation is **local** (`score` from `Card.ts` reduced over hands + a local min-filter) — it must not import `Scoring.ts`. |
| `counters.ts` | `SimCounters`, `emptyCounters()`, `recordStep(counters, stateBefore, command, events)`, `formatSummary(counters)` | Event-derived rare-case counters (C5.1) — see M5 for the exact derivations. |
| `driver.ts` | `SimParams`, `StepRecord`, `GameRun`, `SimFailure` (Error subclass carrying `gameSeed`/`driverSeed`/`step`/`trace`), `simulateGame(params): GameRun`, `seedPair(base, i)`, `playerCountFor(i)` | The loop: deal (or `params.initial`), enumerate → choose → apply → check, clock control, step cap, per-step invariants, counters. Throws `SimFailure` on any violation or cap hit (C1.5). |
| `fuzz.ts` | `randomCommand(state, rng)`, `sampleFillings(state, playerId, tag, rng, n)` | Structurally-valid but mostly-illegal command generation for C4.1, and per-tag argument sampling for the C4.2 cross-check. |

Test files (each named for what it pins):

- `Driver.test.ts` — C1 (determinism, candidate enumeration units, clock,
  step-cap failure shape) and single-game liveness.
- `Invariants.test.ts` — the checkers themselves, against hand-built corrupt
  states (a checker that misses a dropped card is worthless).
- `Simulation.test.ts` — **the batch**: `SIM_GAMES` seeded games, per-step
  invariants live in the driver, end-state checks, liveness, counters,
  summary line, coverage assertions. Header comment documents the
  `SIM_GAMES`/`SIM_SEED` knobs (C6.2).
- `Fuzz.test.ts` — C4.1 illegal-command robustness and the C4.2
  legality/engine agreement property.
- `Coverage.test.ts` — *contingent* (M5): dedicated seeded scenarios for any
  C5.2 shape the tuned default batch cannot reach.
- `Regressions.test.ts` — *contingent* (C6.3): created the first time a
  failing seed is found; each entry replays the literal seeds.

## Plan of work

Ordered by root-plan milestone. Every step writes the named test (or test
addition) **first**, watches it fail, then implements. Each step ends with
`pnpm --filter @cambio/domain test` green and typecheck clean. The existing
suite (111 tests across 15 files) must stay green throughout — this task
only adds files.

### M1 — Driver core

**Step 1.1 — Driver RNG.**
Write `packages/domain/test/sim/Driver.test.ts` first, a
`describe("driver rng (ADR-0013)")`: same seed ⇒ identical `int` sequences
(compare 100 draws, `toStrictEqual`); different seeds ⇒ different sequences
(fixed literals, so stable); `int(n)` stays in `[0, n)`; `pick` returns an
element and is deterministic; `chance(1, 1)` always true, `chance(0, n)`
always false. Then create `test/sim/rng.ts`:

```ts
export interface DriverRng {
  readonly int: (maxExclusive: number) => number
  readonly pick: <A>(items: ReadonlyArray<A>) => A // caller guarantees non-empty
  readonly chance: (numerator: number, denominator: number) => boolean
}
export const makeDriverRng = (seed: number): DriverRng
```

— one `Utils.PCGRandom(seed)` in the closure; `chance(n, d)` is
`integer(d) < n` (integer path only). Docstring cites ADR-0013: this stream
is independent of `GameState.prng`, so command-choice randomness never
perturbs the game's shuffle stream.

**Step 1.2 — Candidate enumeration.**
Extend `Driver.test.ts` with `describe("candidate enumeration (C1.2)")`,
against states built via `dealGame` and hand-built phases (states are plain
data — imitate the tie test in `test/EndToEnd.test.ts:221-241`):

- Fresh 3-player deal: candidates are exactly the active player's
  `CallCambio` + `DrawFromDeck` (+ `TakeDiscard` when the top is non-power),
  each with `playerId` filled; no candidate for other seats.
- `HoldingCard` (non-empty hand, source deck): one `SwapHeld` per occupied
  own slot, one `DiscardHeld`; source discard: no `DiscardHeld`; empty hand:
  exactly `KeepHeld`.
- `ResolvingPower` with a 7: `PowerPeek` targets = own occupied slots only;
  with a 9: opponents' occupied slots only; with a Q: all occupied slots.
  `ResolvingPower` with a J and `ResolvingQueenSwap`: `PowerSwap` for every
  unordered pair of **distinct** occupied slots.
- `SlamWindow` with `now < closesAt`: one `Slam` per (slammer × occupied
  target), where own-target and empty-handed-slammer candidates carry
  `giveSlot: null` and opponent-target candidates with a non-empty hand fan
  out one per occupied own `giveSlot`; **every seated player** appears as a
  slammer. With `now >= closesAt`: no candidates at all (`CloseSlamWindow`
  is deliberately excluded — clock action).
- `Ended`: empty.

Then create `test/sim/candidates.ts` with
`legalCandidates(state, now): ReadonlyArray<Command>` — loop
`state.players`, call `legalCommandKinds(state, p.id, now)`, fill each tag
per the table above using `handOf`/`occupiedSlots`. Enumeration order is
fixed by seat order then slot order (determinism). Every filled candidate
must satisfy `checkCommand` — the C4.2 fuzz property later enforces this at
scale, but the unit tests here pin the shape.

**Step 1.3 — Policy skeleton and the game loop.**
Extend `Driver.test.ts` first with the driver-level properties:

- **"replaying the same seeds yields the identical game (C1.1)"** —
  `simulateGame` twice with identical `SimParams`: `trace`, `events`,
  `finalState`, `counters` all `toStrictEqual`. A third run with a different
  `driverSeed` shares the deal (`GameStarted` events equal) but produces a
  different trace (fixed literal seeds chosen so this holds — deterministic,
  not flaky).
- **"the simulated clock is monotone and window actions respect closesAt
  (C1.3)"** — every `trace[i].at <= trace[i+1].at`; every `Slam` in the
  trace has `at < closesAt` of its window (correlate with the preceding
  `SlamWindowOpened` event); every `CloseSlamWindow` has
  `at === closesAt`.
- **"a full random game reaches Ended (C3.1)"** — `finalState.phase._tag`
  is `"Ended"`, `steps < 5000`.
- **"hitting the step cap fails with full repro info (C1.4, C1.5)"** —
  `simulateGame({ ..., stepCap: 3 })` throws `SimFailure`; the message
  contains the literal `gameSeed`, `driverSeed`, and step index; the error's
  `trace` field has exactly 3 entries.

Then create `test/sim/policy.ts` and `test/sim/driver.ts`.

`policy.ts` — knobs as data so M3 can tune without touching logic:

```ts
export interface PolicyKnobs {
  readonly forceCallTurn: number        // start: 64 — hard C1.4 backstop
  readonly callRampStart: number        // start: 8
  readonly callRampDenominator: number  // start: 64 — p(call) = (turn - start)/den, clamped
  readonly slamAttemptNum: number       // start: 2  (2/5 chance to attempt a slam)
  readonly slamAttemptDen: number       // start: 5
  readonly informedSlamNum: number      // start: 1  (1/2 of attempts pick a true rank match)
  readonly informedSlamDen: number      // start: 2
  readonly maxSlamsPerWindow: number    // start: 3
  readonly zeroCardTakeNum: number      // start: 4  (4/5: empty-handed player takes discard)
  readonly zeroCardTakeDen: number      // start: 5
}
export const defaultKnobs: PolicyKnobs
export const chooseTurnCommand = (
  candidates: ReadonlyArray<Command>, rng: DriverRng, turnCount: number, knobs: PolicyKnobs,
): Command
export const chooseSlam = (
  state: GameState, slams: ReadonlyArray<Command>, rng: DriverRng,
  slamsThisWindow: number, knobs: PolicyKnobs,
): Option.Option<Command>
```

`chooseTurnCommand`: if a `CallCambio` candidate exists and
(`turnCount >= forceCallTurn` or the ramp chance fires) take it; else if the
active player's hand is empty and a `TakeDiscard` candidate exists, take it
with the zero-card bias (this is what makes ADR-0009 keeps and ADR-0012
skips reachable); else uniform `rng.pick`. `chooseSlam`: `none` once
`slamsThisWindow >= maxSlamsPerWindow` or the attempt chance fails;
otherwise, with the informed chance, pick among slams whose target card's
`rank` equals the window rank (the driver may read full state — it is a
test), falling back to uniform. Informed slams are what shrink hands to
zero, unlocking the whole ADR-0009/0012 family.

`driver.ts`:

```ts
export interface SimParams {
  readonly gameSeed: number
  readonly driverSeed: number
  readonly playerCount: number // 2–5
  readonly config: GameConfig
  readonly stepCap?: number    // default 5000 (EndToEnd precedent)
  readonly knobs?: PolicyKnobs
  readonly initial?: { readonly state: GameState; readonly roster: ReadonlyArray<UserId> }
  readonly onStep?: (state: GameState, now: Timestamp, step: number) => void
}
export interface StepRecord { readonly command: Command; readonly at: Timestamp }
export interface GameRun {
  readonly finalState: GameState
  readonly roster: ReadonlyArray<UserId>
  readonly trace: ReadonlyArray<StepRecord>
  readonly events: ReadonlyArray<GameEvent>
  readonly steps: number
  readonly turns: number
  readonly counters: SimCounters
}
export class SimFailure extends Error { /* gameSeed, driverSeed, step, trace fields */ }
export const simulateGame = (params: SimParams): GameRun
export const seedPair = (base: number, i: number): readonly [number, number] // [base + 2i, base + 2i + 1]
export const playerCountFor = (i: number): number // 2 + (i % 4)
```

Loop shape: roster is `uid(0)…uid(n-1)` (fixtures); deal via `dealGame`
(`Either.getOrThrow` — a deal failure is a `SimFailure`) unless
`params.initial` is given (Coverage scenarios, M5). `now` starts at `ts(0)`
and advances `+25` ms per ordinary step. Dispatch on `state.phase._tag`:

- `AwaitingDraw` / `HoldingCard` / `ResolvingPower` / `ResolvingQueenSwap`:
  `legalCandidates(state, now)` → `chooseTurnCommand` → apply.
- `SlamWindow`: enumerate candidates at `Timestamp.make(closesAt - 1)` (the
  in-window instant); `chooseSlam` picks a slam (applied at `closesAt - 1`)
  or `none`, in which case the driver jumps `now` to `closesAt` and applies
  `{ _tag: "CloseSlamWindow" }` — the clock action. `closesAt` is always
  `> ` the previous `now` (window opened at resolve time + `slamWindowMs`),
  so monotonicity holds by construction; the driver still asserts it
  (C1.3), failing as `SimFailure`.
- `Ended`: exit the loop.

Every `applyCommand` left is a `SimFailure` (a *chosen* candidate was
rejected — a legality/engine disagreement, i.e. an engine gap: C7.1 says
stop and ask, so the failure message must say so). Every step: push
`StepRecord`, append events, `recordStep` counters (from M5; until then a
stub), call `params.onStep`, count `TurnAdvanced` events into `turns`, and
run `stepViolations` (from M2; until then skipped). Cap hit ⇒ `SimFailure`.
The `SimFailure` message always embeds `gameSeed`, `driverSeed`, `step`,
and the last few trace entries; the full trace rides on the error object
(C1.5). Track `slamsThisWindow`, reset on `SlamWindowOpened`.

Checkpoint: `pnpm --filter @cambio/domain test` green (existing 111 + new
driver tests), typecheck clean, lint clean.

### M2 — Invariant checkers

**Step 2.1 — Checkers, tested against corrupt states.**
Write `packages/domain/test/sim/Invariants.test.ts` first. Build one healthy
state via `dealGame`, then corrupt copies (plain-data spreads):

- Partition (C2.1, §4.5): healthy state ⇒ no violations and its baseline
  equals `[...ALL_CARD_SLUGS].sort()`; duplicate a card in `deck` ⇒
  violation; drop a card from a hand ⇒ violation; swap a card for a
  duplicate of another ⇒ violation (multiset check, not just length).
- Hand & seat integrity (C2.2): duplicate `slotIndex` in one hand ⇒
  violation; unsorted `slotIndex` ⇒ violation; reordered/renamed/extra
  player vs the dealt roster ⇒ violation; roster sizes outside 2–5 ⇒
  violation.
- End checks (C2.3, C2.4, §1.8): a well-formed ended run (small hand-built
  final state + matching `GameEnded` event) ⇒ no violations; final phase
  `Ended` with no `GameEnded` event ⇒ violation, and vice versa;
  `GameEnded` not the final event, or emitted twice ⇒ violation; a doctored
  `scores` entry ⇒ violation (the checker recomputes with `score` from
  `Card.ts` reduced over each final hand — **not** `gameScores`, which
  would be a tautology); doctored `winners` (not the min-set) ⇒ violation;
  a zero-card hand scores 0; a negative total (red kings) is handled.

Then create `test/sim/invariants.ts` per the layout table. The partition
checker takes `baselineSorted: ReadonlyArray<CardSlug>` rather than
hardcoding all 52 so Coverage scenarios (M5) can start from constructed
full-partition states while the driver asserts dealt games against the full
deck.

**Step 2.2 — Wire per-step checking into the driver, start the batch.**
Extend `Driver.test.ts` first: a run over a corrupted *initial* state (via
`params.initial` with a duplicated card) throws `SimFailure` whose message
names the violation and both seeds. Then wire `stepViolations` into
`simulateGame` after every accepted command (baseline = sorted
`allCards` of the initial state; for dealt games the driver additionally
asserts that baseline equals the full 52 — C2.1 verbatim).

Create `packages/domain/test/sim/Simulation.test.ts` with the batch
skeleton — for now a literal `GAMES = 250` and `BASE_SEED = 20260831`
(env wiring is M6):

```ts
const runs: GameRun[] = []
beforeAll(() => {
  for (let i = 0; i < GAMES; i++) {
    const [gameSeed, driverSeed] = seedPair(BASE_SEED, i)
    runs.push(simulateGame({ gameSeed, driverSeed, playerCount: playerCountFor(i), config }))
  }
}, BATCH_TIMEOUT_MS)
```

(`beforeAll` from `"vitest"`; `config` = `{ slamWindowMs: 4000 }` like
EndToEnd; playing once and asserting many times keeps the suite fast.)
Initial `it`s, titles verbatim:

- "every accepted command preserves the 52-card partition (C2.1, §4.5)" —
  the driver threw for nobody; assert `runs.length === GAMES` (the per-step
  checks live inside `simulateGame`; this test documents where).
- "hand slots stay unique and sorted; the roster never changes (C2.2, §4.5
  restated)" — same shape: per-step in driver; here also assert each run's
  `finalState.players` ids equal its `roster`.
- "Ended iff GameEnded, exactly once, as the final event (C2.3)" — per run,
  `endViolations` is empty.
- "ended games reject every command from every player (C2.3)" — per run:
  `legalCommandKinds` returns `[]` for every player, and a spot-check
  `applyCommand` of a `DrawFromDeck` and a `Slam` per player returns
  `Either.left` with `_tag === "GameAlreadyEnded"`.
- "GameEnded scores match an independent recomputation (C2.4, §1.8)" —
  covered by `endViolations`; kept as its own `it` reading each run's final
  `GameEnded` event so the clause has a named home.

Checkpoint: suite green. This is the moment the harness first plays 250
random games — **if any seed fails here, that is the task doing its job**:
capture the seeds + trace, diagnose; engine defect or rule gap ⇒ C7.1 stop
and ask; harness bug ⇒ fix and continue; genuine engine bug confirmed with
the user ⇒ the fix lands with a pinned seed in `Regressions.test.ts`
(C6.3).

### M3 — Policy tuning & liveness

Extend `Simulation.test.ts` first:

- "every game reaches Ended within the step cap (C3.1)" — all runs ended
  (redundant with the driver's cap throw, asserted explicitly per run:
  `steps < stepCap`, phase `Ended`).
- "no reachable state is stuck (C3.2)" — assertion lives in the driver's
  loop: at every non-`Ended` state, either the phase is `SlamWindow` (where
  the clock action is always available once `now >= closesAt` — verified
  via `checkCommand` returning `None` for the close at `closesAt`) or
  `legalCandidates` is non-empty; violation ⇒ `SimFailure`. The `it` here
  documents the property and asserts the batch completed under it. Per the
  root plan's C3.2 note, **no** assertion anywhere compares state-before to
  state-after for inequality.

Then implement in `driver.ts`/`policy.ts`: the C3.2 check, plus the
`turnCount` plumbing into `chooseTurnCommand` (count of `TurnAdvanced`
events so far). Tune `defaultKnobs` until (a) the batch's wall time is well
under a minute and (b) as many C5.2 counters as possible are non-zero
(measured ahead of M5 with a throwaway log — the real counters land next
milestone). Expected levers, from the mechanics: raise
`informedSlam*` to shrink hands (unlocks zero-card keeps, gives, 7/8
fizzles, ADR-0012 skips); 2-player games (`playerCountFor` yields 63 of
them per 250) are where 9/T and J/Q fizzles are least unlikely. Record
final knob values here when tuned.

Checkpoint: suite green; batch < 60 s locally.

### M4 — Illegal fuzz & legality cross-check

Write `packages/domain/test/sim/Fuzz.test.ts` first (its own small batch —
literal `FUZZ_GAMES = 25`, seeds derived from `BASE_SEED + 1_000_000` so
they never collide with the main batch; fuzzing rides real game states via
`params.onStep`, and since `applyCommand` is pure the probes cannot perturb
the run):

- "illegal commands return typed GameErrors and never mutate state (C4.1)"
  — on every step (or every k-th for speed; keep deterministic), generate 3
  commands with `randomCommand(state, rng)` (fuzz rng seeded separately);
  for each: snapshot `structuredClone(state)`; run
  `applyCommand(state, cmd, now)` inside try/catch — a **throw** is an
  instant failure with seeds + step; if `checkCommand` said
  `Option.some(err)`, assert the result is `Either.left` with the same
  `_tag`, and the input state still `toStrictEqual`s the snapshot. The
  generator's mix must cover the root-plan list: wrong player, wrong phase,
  empty-slot targets, out-of-window slams (`at >= closesAt`), premature
  closes (`at < closesAt`), and an unknown (non-roster) `playerId`.
- "legalCommandKinds agrees with checkCommand (C4.2)" — on sampled steps,
  for every seated player and every one of the 10 command tags: if the tag
  is listed, at least one candidate from `legalCandidates` for that
  (player, tag) passes `checkCommand` (this also proves the driver's
  argument-filling never fabricates illegal candidates — C1.2); if
  unlisted, every one of `sampleFillings(state, playerId, tag, rng, 8)` is
  rejected. `CloseSlamWindow` is special-cased (no `playerId`): checked
  directly — legal iff phase is `SlamWindow` and `now >= closesAt`.

Then create `test/sim/fuzz.ts`: `randomCommand` picks a tag uniformly, then
fills fields from pools that deliberately include bad values — roster
players plus one fixed non-roster `uid(99)`, occupied refs plus fabricated
unoccupied refs (`slotIndex` up to 7, all seats), random `giveSlot ∈
{null, 0..7}`; `sampleFillings` is the same field-pool machinery for one
(player, tag). Checkpoint: suite green.

### M5 — Counters & reporting

**Step 5.1 — Counters.**
Extend `Invariants.test.ts` (or a small `describe` in `Simulation.test.ts` —
implementer's choice, note it in Progress) first with unit tests for the
event-derivation rules, on synthetic batches:

- `DrawSkipped` kind `"penalty"` vs `"give"` counted separately
  (`src/GameEvent.ts:143`).
- `PowerFizzled` counted per `power` (`:92`); `DeckReshuffled` (`:149`);
  `HeldKept` ⇒ zero-card keep (every keep is one — `KeepRequiresEmptyHand`
  guarantees it); `CardGivenFromDeck` ⇒ zero-card give.
- discard-source keep: `command._tag === "KeepHeld"` while
  `stateBefore.phase` is `HoldingCard` with `source: "discard"` — the
  ADR-0009.2 shape C5.2 names.
- empty-discard window skip (ADR-0012): a batch containing `TurnAdvanced`
  **without** `SlamWindowClosed` (the close path emits both, `src/Engine.ts:326-330`;
  the skip path emits `TurnAdvanced` alone, `:61-63`).

Then create `test/sim/counters.ts` (`SimCounters` also carries plain volume
stats for the summary: games, steps, turns, slams succeeded/failed,
penalties, peeks, blind swaps) and replace the driver's stub with real
`recordStep` calls.

**Step 5.2 — Summary line and coverage assertions.**
Extend `Simulation.test.ts`:

- "prints one summary line per run (C5.1)" — merge all runs' counters and
  `console.log(formatSummary(merged))` — a single line, e.g.
  `[sim] games=250 steps=41302 turns=9120 reshuffles=214 fizzles={78:9,9T:2,J:1,Q:1} skips={penalty:0,give:0} keeps={zero:31,discard:12} givesFromDeck=4 emptyDiscardSkips=3`
  (root decision log: one `console.log`, nothing fancier). No assertion on
  `DrawSkipped` — ADR-0011 predicted it near-impossible; the counter exists
  to check that prediction (root Validation).
- "the default run reaches every ADR rare case (C5.2)" — `expect(x).toBeGreaterThan(0)`
  for: discard-source keeps (ADR-0009.2), zero-card gives —
  `givesFromDeck + drawSkippedGive` (ADR-0009.1/0011), each fizzle *shape* —
  7/8 combined, 9/T combined, J, Q (ADR-0010), and empty-discard skips
  (ADR-0012). Stable because the default seeds make the batch
  deterministic.

If tuning (M3 knobs revisited here) cannot make a counter non-zero in the
default batch, add `test/sim/Coverage.test.ts`: dedicated seeded scenarios
that run `simulateGame` from constructed full-partition mid-game states via
`params.initial` (all 52 cards distributed; e.g. for J/Q fizzles: 2
players, one empty-handed, the other holding one card, deck stacked with
J/Q on top, the rest of the deck below; for 9/T: opponent empty, 9s/10s on
top), each with a pinned `driverSeed` verified once to reach its counter,
asserted from that scenario's own run. Move the corresponding assertion out
of the batch test into the scenario. Either way every C5.2 shape ends up
asserted `> 0` somewhere deterministic — record which home each got in the
coverage table and Progress.

Checkpoint: suite green; eyeball the summary — reshuffles and fizzles
plausibly frequent, `DrawSkipped` rare or zero.

### M6 — Wiring & knobs

All config, no new logic. Edit in this order:

1. `packages/domain/test/sim/Simulation.test.ts` — replace the literals:

   ```ts
   const SIM_GAMES = Number(process.env.SIM_GAMES ?? "250")
   const SIM_SEED = Number(process.env.SIM_SEED ?? "20260831")
   const BATCH_TIMEOUT_MS = Math.max(120_000, SIM_GAMES * 120)
   ```

   `BATCH_TIMEOUT_MS` goes on the `beforeAll`. Header comment documents both
   knobs, their defaults, and the repro recipe ("a failure prints gameSeed +
   driverSeed + step; replay with `simulateGame({...literals})` in a scratch
   test") (C6.2).
2. `packages/domain/vitest.config.ts` — add `testTimeout: 30_000` inside
   `test: {}` (headroom for `Driver`/`Fuzz`/`Coverage` on slow CI; the batch
   carries its own computed timeout) (C6.1).
3. `turbo.json` — the `test` task gains `"env": ["SIM_GAMES", "SIM_SEED"]`
   (strict env mode strips undeclared vars; `env` not passThrough — a
   different game count must be a different cache entry) (C6.2).
4. Deep run: `SIM_GAMES=5000 pnpm --filter @cambio/domain test` locally —
   the acceptance "thousands" deliverable. Any failing seed ⇒ diagnose;
   engine/rule issue ⇒ C7.1 stop-and-ask; once resolved, pin the literal
   seeds in `test/sim/Regressions.test.ts` (C6.3, repo convention). If the
   deep run surfaces nothing, `Regressions.test.ts` is *not* created — note
   that in the coverage table.

Checkpoint: full gate (below).

## Concrete steps & validation

Run from the repo root. If `pnpm` is missing:
`source ~/.nvm/nvm.sh && nvm use 22`.

After every step:

```bash
pnpm --filter @cambio/domain test        # all green, no skips
pnpm --filter @cambio/domain typecheck   # clean
pnpm --filter @cambio/domain lint        # clean — .js extensions, inline type imports, no zod
```

Expected signals as milestones land:

- **M1**: `test/sim/Driver.test.ts` green — rng determinism, candidate
  enumeration, C1.1 replay equality, C1.3 clock, C1.4/C1.5 `SimFailure`
  shape, one full random game ended. Existing 111 tests untouched and green.
- **M2**: `Invariants.test.ts` corrupt-state units green;
  `Simulation.test.ts` plays 250 games with per-step checks — watch the
  batch wall time (target: well under 60 s).
- **M3**: liveness `it`s green; note tuned knob values in Progress.
- **M4**: `Fuzz.test.ts` green — zero throws, zero mutations, legality
  agreement on all sampled steps.
- **M5**: summary line visible in test output; C5.2 coverage assertions all
  `> 0` (in the batch or in `Coverage.test.ts` scenarios).
- **M6**:

```bash
pnpm --filter @cambio/domain test                    # default: 250 games + summary line
SIM_GAMES=5000 pnpm --filter @cambio/domain test     # deep run, passes locally
SIM_GAMES=12 SIM_SEED=7 pnpm --filter @cambio/domain test  # knobs actually rescale/reseed
SIM_GAMES=5000 pnpm turbo test --filter=@cambio/domain     # proves the turbo.json env declaration
```

Untouched-surface checks (root acceptance criteria; all must print
nothing):

```bash
git diff --name-only origin/release-v0...HEAD -- packages/domain/src packages/domain/test/EndToEnd.test.ts
git diff --name-only origin/release-v0...HEAD -- packages/domain/package.json pnpm-lock.yaml  # no new deps (ADR-0013)
grep -rn "Math.random\|Date.now\|new Date(" packages/domain/test/sim              # harness determinism
```

Final gate (must pass before /ship):

```bash
pnpm turbo build typecheck lint test
```

Beyond the gate (root plan Validation): eyeball the 5000-game summary —
reshuffles/fizzles plausibly frequent, `DrawSkipped` rare or zero; then a
one-off destructive check — in a scratch copy, weaken one checker (e.g.
drop the multiset comparison), confirm a corrupted run's `SimFailure`
message alone (seeds + step) is enough to reproduce and debug, then revert.

## Contract coverage

*(maintained by `/implement`, verified by `/review`: one row per root-plan
contract clause this side owns — the test that pins it, or why none can.
Planned homes below; implement keeps them true.)*

| Clause | Test (file + name) |
| --- | --- |
| C1.1 | `test/sim/Driver.test.ts` — "replaying the same seeds yields the identical game (C1.1)" |
| C1.2 | `test/sim/Driver.test.ts` — "candidate enumeration (C1.2)" describe; scale proof in `Fuzz.test.ts` C4.2 |
| C1.3 | `test/sim/Driver.test.ts` — "the simulated clock is monotone and window actions respect closesAt (C1.3)" |
| C1.4 | `test/sim/Driver.test.ts` — "hitting the step cap fails with full repro info (C1.4, C1.5)"; pressure proven batch-wide by C3.1 |
| C1.5 | same test — `SimFailure` message + `trace` field assertions |
| C2.1 | `test/sim/Invariants.test.ts` corrupt-state units; live in-driver per step — `Simulation.test.ts` "every accepted command preserves the 52-card partition (C2.1, §4.5)" |
| C2.2 | `test/sim/Invariants.test.ts` units; `Simulation.test.ts` "hand slots stay unique and sorted; the roster never changes (C2.2, §4.5 restated)" |
| C2.3 | `Simulation.test.ts` "Ended iff GameEnded, exactly once, as the final event (C2.3)" + "ended games reject every command from every player (C2.3)" |
| C2.4 | `Simulation.test.ts` "GameEnded scores match an independent recomputation (C2.4, §1.8)" — runs the local per-card recomputation + min-set winners check directly (post-review fix; previously delegated to the C2.3 `endViolations` test) — plus `Invariants.test.ts` doctored-event units |
| C3.1 | `Simulation.test.ts` "every game reaches Ended within the step cap (C3.1)" |
| C3.2 | driver in-loop check (throws `SimFailure`); documented by `Simulation.test.ts` "no reachable state is stuck (C3.2)" |
| C4.1 | `test/sim/Fuzz.test.ts` "illegal commands return typed GameErrors and never mutate state (C4.1)" |
| C4.2 | `test/sim/Fuzz.test.ts` "legalCommandKinds agrees with checkCommand (C4.2)" |
| C5.1 | `Simulation.test.ts` "prints one summary line per run (C5.1)" |
| C5.2 | Split (final): `Simulation.test.ts` "the default run reaches the batch-reachable ADR rare cases (C5.2)" pins discard-keeps, zero-keeps, deck-gives, 7/8 and 9/T fizzles, reshuffles (guarded `skipIf` off the default batch); `Coverage.test.ts` seeded scenarios pin J + Q fizzles (plus 7/8, 9/T again) and the ADR-0012 empty-discard skip |
| C6.1 | config, not a test: `vitest.config.ts` `testTimeout` + computed batch timeout; verified by the gate |
| C6.2 | `turbo.json` test `env` + `Simulation.test.ts` header; verified by the M6 command matrix (`SIM_GAMES=5000` under both pnpm and turbo) |
| C6.3 | **No failing seed was ever found** — default batch, fuzz batches, and the `SIM_GAMES=5000` deep run (737k steps) all passed, so `Regressions.test.ts` was not created (per plan) |
| C7.1 | process, not a test: any `SimFailure` that classifies as an engine defect or uncovered rule situation halts implementation for a user decision (each resolution ⇒ ADR + engine change in a follow-up, per the standing directive) |

## Progress

- [x] 2026-08-31 14:20 — M1 complete. `rng.ts`, `candidates.ts`, `policy.ts`, `driver.ts` plus `counters.ts` (interface + `emptyCounters` only; `recordStep` lands in M5). `Driver.test.ts` 17 tests green; typecheck + lint clean.
- [x] 2026-08-31 14:22 — M2 complete. `invariants.ts` + `Invariants.test.ts` (16 corrupt-state units); per-step checks wired into the driver; `Simulation.test.ts` batch skeleton green — 250 games, zero violations, ~0.6 s. Deviation: the driver validates *every* starting state (dealt or `initial`) against the full 52-card baseline at step 0 — Coverage scenarios must be full-partition states, which the plan already required; this makes the corrupted-initial test fail at step 0 rather than at first accepted command.
- [x] 2026-08-31 14:28 — M3 complete. Liveness `it`s added; knobs tuned over three probe rounds to `forceCallTurn: 128, callRampStart: 24/128, slamAttempt: 4/5, informedSlam: 3/4, maxSlamsPerWindow: 3, zeroCardTake: 4/5`, plus policy changes (see Surprises): informed-but-no-match slams pass instead of slamming blind; informed slams prefer own-card matches. Batch probe at 250 games: 198 zero-card keeps, 5 deck-gives, 26 fizzles, 149 reshuffles, 0 empty-discard skips (Coverage scenario planned), ~1 s wall.
- [x] 2026-08-31 17:28 — M4 complete. `fuzz.ts` + `Fuzz.test.ts`: C4.1 (typed errors, no throw, no mutation, all six named illegal shapes observed) and C4.2 (legality agreement incl. CloseSlamWindow clock special-case) green over 25 offset-seeded games each. C4.2 ran 4.8 s — pulled M6's `vitest.config.ts` `testTimeout: 30_000` forward to avoid flaking the 5 s default.
- [x] 2026-08-31 17:40 — M5 complete. `counters.ts` (`recordStep`, `mergeCounters`, `formatSummary`) unit-tested in `Simulation.test.ts`'s "counter derivation" describe, wired into the driver; summary line printing; batch C5.2 assertions for the batch-reachable shapes; `Coverage.test.ts` with two seeded scenarios (slams disabled via knobs) pinning all four fizzle shapes and the ADR-0012 skip — both hit on the first pinned driver seed.
- [x] 2026-08-31 17:50 — M6 complete. `SIM_GAMES`/`SIM_SEED` env knobs (guarded C5.2 via `it.skipIf` off the default batch), computed batch timeout, `turbo.json` test-task `env` declaration proven live (`SIM_GAMES=300` under turbo printed `games=300`). Deep run `SIM_GAMES=5000`: 737,189 steps, zero violations, 17.5 s — at that scale the batch reaches J fizzles (7), Q fizzles (6), and empty-discard skips (22) naturally; `drawSkipped` stayed 0, confirming ADR-0011's prediction. Full gate `pnpm turbo build typecheck lint test` 18/18 green; untouched-surface greps print nothing. No failing seed found ⇒ no `Regressions.test.ts`.

## Surprises & notes for the root plan

- 2026-08-31 — **Policy fix found by the step-cap test:** `CallCambio` must be excluded from the uniform candidate pool (it is always legal in `AwaitingDraw`, so uniform choice ended ~⅓ of games on turn one, starving every rare path). It is now reachable only via the ramp/backstop — except when it is the *only* candidate, where it is taken directly. `chooseTurnCommand` also takes `state` as a first parameter (the zero-card take bias needs the active player's hand size), a small signature deviation from this plan's sketch.

*(anything the root plan's Decision Log or the reviewer must know)*
