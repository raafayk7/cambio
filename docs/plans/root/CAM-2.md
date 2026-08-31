# CAM-2 — Randomized-game simulation harness + invariant property tests

- **Linear:** [CAM-2](https://linear.app/raafayk7/issue/CAM-2/randomized-game-simulation-harness-invariant-property-tests)
- **Scope:** backend
- **Child plans:** [backend](../backend/CAM-2.md)
- **ADRs:** [0013](../../adr/0013-hand-rolled-seeded-simulation-driver.md)
  (hand-rolled seeded driver, no property-testing library)

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

After this task, `pnpm turbo test` plays hundreds of seeded, fully random
Cambio games through the CAM-1 engine and asserts the HANDOFF §4.5
invariants after **every** accepted command — and a `SIM_GAMES=5000` run
scales that to thousands on demand. This is HANDOFF §12 step 2: the place
remaining rule ambiguity is designed to surface, before any DB or UI makes
fixing the engine expensive. Observe it working by running
`pnpm --filter @cambio/domain test` and reading the simulation summary
(games played, rare-case counters) it prints.

## Context & orientation

Everything lives in `packages/domain`; no other package changes.

- The engine is complete (CAM-1): `applyCommand(state, command, now)` in
  `src/Engine.ts:332` returns
  `Either<readonly [GameState, GameEvent[]], GameError>`; `dealGame` in
  `src/Deal.ts:16` creates a seeded initial state. Both are pure — time is a
  `Timestamp` parameter, randomness is a `PrngState` carried in
  `GameState.prng` (`src/Prng.ts`, wrapping effect's `Utils.PCGRandom`).
- `legalCommandKinds(state, playerId, now)` (`src/Legality.ts:237`) already
  enumerates legal command **tags** per player; the harness fills in
  arguments (slots, `SlotRef` targets) from state helpers `handOf`,
  `occupiedSlots`, `lowestFreeSlot` (`src/GameState.ts`).
- `allCards(state)` (`src/GameState.ts:126`) collects every card in play
  (deck + discard + hands + phase-held card) — the 52-partition workhorse.
- `test/EndToEnd.test.ts` already plays **one** scripted game (seed 42) with
  per-step partition checks. CAM-2 generalizes it to thousands of random
  games; that file is a pinned scenario and stays untouched.
- Governing docs: HANDOFF §4.5 (invariants), §12 step 2 (purpose); ADRs
  0009–0012 (the rule-gap resolutions this harness must exercise and count);
  ADR-0013 (this task's driver approach); skills `effect-domain-modeling`,
  `cambio-rules`.

**Invariant restatement (deliberate, not scope creep).** Two §4.5 clauses
are phrased against the persisted schema and are structurally unfalsifiable
against the domain's shapes: "no negative hand counts" (a `Hand` is an
array; length ≥ 0 by construction) and "contiguous seat indices" (seat *is*
the `players` array index). The contract below restates them as the
equivalent domain invariants the engine actually maintains (unique sorted
slot indices; fixed player roster). Likewise "phase/status consistency"
(`Ended` ⟺ status `completed`) refers to a `games.status` column that does
not exist in the domain; it is restated as the observable domain
equivalences. The DB-shaped originals become checkable verbatim in CAM-3.

## Functional contract

### C1 — Simulation driver

- **C1.1 (determinism)** A driver plays one complete game from
  `dealGame` to `Ended`, parameterized by
  `(gameSeed, driverSeed, playerCount, config)`. It is pure: identical
  inputs produce identical command traces, event traces, and final states
  (assertable by running twice and comparing).
- **C1.2 (legal generation)** At each step the driver builds its candidate
  set from `legalCommandKinds` across **all** seats (slamming is open to
  everyone during a window) and fills arguments from state helpers. It
  chooses among candidates with its own `Utils.PCGRandom` stream seeded by
  `driverSeed`, independent of `GameState.prng` (ADR-0013).
- **C1.3 (clock control)** The driver owns the simulated clock: it can act
  inside an open slam window (`now < closesAt`) and advance `now` to
  `closesAt` to issue `CloseSlamWindow`. `now` is monotonically
  non-decreasing within a game.
- **C1.4 (termination pressure)** The policy guarantees termination: the
  probability of choosing a legal `CallCambio` rises with turn count (or the
  call is forced beyond a turn threshold), under a hard step cap. Hitting
  the cap fails the test with full repro info.
- **C1.5 (repro output)** Every assertion failure message includes
  `gameSeed`, `driverSeed`, and step index, and the driver exposes the
  accumulated command trace so a failing seed can be replayed and inspected
  step by step.

### C2 — Invariants asserted after every accepted command

- **C2.1 (card partition, §4.5)** `allCards(state)` sorted equals
  `ALL_CARD_SLUGS` sorted — all 52 present, none duplicated or lost.
- **C2.2 (hand & seat integrity, §4.5 restated)** Every hand's
  `slotIndex` values are unique and sorted ascending; the player roster
  (count, ids, seat order) is identical to the dealt roster for the entire
  game; player count stays within 2–5.
- **C2.3 (ended-state consistency, §4.5 restated)** `phase._tag === "Ended"`
  holds iff a `GameEnded` event was emitted; from that point every command
  from every player is rejected with `GameAlreadyEnded` (spot-checked per
  ended game) and `legalCommandKinds` returns `[]` for every player.
- **C2.4 (score conservation, §4.5)** On `GameEnded`, the event's per-player
  scores equal an independent recomputation summing `score(card)` over each
  player's final hand (not via `gameScores`, which would be a tautology);
  the event's `winners` are exactly the players at the minimum total;
  zero-card hands score 0; negative totals are representable.

### C3 — Liveness

- **C3.1** Every simulated game reaches `Ended` within the step cap under
  the C1.4 policy.
- **C3.2** At every non-`Ended` state encountered, the candidate set across
  all players is non-empty — no reachable stuck state. (Note: individual
  legal commands may leave state unchanged — e.g. a failed slam with a
  skipped penalty draw — so progress is enforced by the clock and policy,
  never assumed from state churn.)

### C4 — Illegal-command robustness

- **C4.1 (fuzz)** Randomly generated illegal commands (wrong player, wrong
  phase, empty-slot targets, out-of-window slams, premature closes, unknown
  players) interleaved into running games always return `Either.left` of a
  typed `GameError` — never a thrown exception — and leave the state
  deep-equal unchanged.
- **C4.2 (legality cross-check)** `legalCommandKinds` agrees with
  `checkCommand`: every listed tag admits at least one argument-filling the
  engine accepts, and every unlisted tag is rejected for all sampled
  fillings. (A new property; CAM-1 never asserted the two agree.)

### C5 — Rare-case counters (the ADR-0011/0012 hooks)

- **C5.1** The harness aggregates counts across a run — `DrawSkipped`
  (penalty vs give), `PowerFizzled`, `DeckReshuffled`, empty-discard
  turn-advances (no slam window opened), zero-card keeps — and prints one
  summary line per run (games, steps, counters).
- **C5.2 (coverage)** With the default seeds, the default run provably
  reaches: a zero-card player's `TakeDiscard`→keep (ADR-0009), a zero-card
  slammer give or skipped give (ADR-0009/0011), each power-fizzle shape
  (ADR-0010), and an empty-discard window skip (ADR-0012). These are
  asserted (counter > 0), which is stable because fixed seeds make the run
  deterministic. If pure randomness can't reach one, the policy is tuned or
  a dedicated seeded scenario added until it is.

### C6 — Wiring & knobs

- **C6.1** The simulation runs as vitest tests in `packages/domain` under
  `pnpm turbo test`, with an explicit timeout override (default 5 s will not
  survive hundreds of games).
- **C6.2** `SIM_GAMES` (count, default 250) and `SIM_SEED` (base seed,
  default a fixed literal) scale/reseed the run; both are declared in
  `turbo.json`'s test task `env` (turbo strict env mode strips undeclared
  vars) and documented in the test file header.
- **C6.3** Any failing seed discovered during development is pinned as a
  permanent regression test with a literal seed constant (existing repo
  convention).

### C7 — Rule-gap protocol

- **C7.1** If a simulated game reaches a situation not covered by HANDOFF §1
  or ADRs 0009–0012 (engine defect/throw, unclassifiable state, rule
  ambiguity), implementation **stops and asks** — each resolution becomes an
  ADR and an engine change, per the standing directive. No gap is filled
  from other Cambio variants.

### Acceptance criteria

- [x] `pnpm turbo build typecheck lint test` passes — 18/18 tasks green
      (2026-08-31).
- [x] Default `pnpm --filter @cambio/domain test` plays ≥ 250 random
      complete games with all C2–C5 assertions active and finishes in
      reasonable time — sim suite ~8 s total, batch ~1 s.
- [x] `SIM_GAMES=5000 pnpm --filter @cambio/domain test` passes locally
      (the "thousands" deliverable) — 737,189 steps, zero violations, 17.5 s.
- [x] The C5.2 coverage counters are all non-zero in the default run —
      batch-reachable shapes asserted in `Simulation.test.ts`; J/Q fizzles
      and the ADR-0012 skip asserted from `Coverage.test.ts` seeded
      scenarios (per the plan's contingency).
- [x] `test/EndToEnd.test.ts` is unchanged; `src/` is unchanged — the
      C7.1 stop-and-ask was never triggered; `git diff` against
      `release-v0` for both paths prints nothing.
- [x] No new npm dependencies (ADR-0013) — `package.json`/lockfile
      untouched.

## Plan of work

No `contracts` freeze is needed — this task touches only
`packages/domain/test` plus a one-line `turbo.json` env declaration, so
there is a single backend lane.

1. **M1 — Driver core.** Seeded candidate-enumeration + argument-filling +
   clock policy around `applyCommand`, playing one full random game
   deterministically. TDD: the determinism and clock properties (C1.1,
   C1.3) come as tests first.
2. **M2 — Invariant checkers.** Pure `assertInvariants(state)`-style
   helpers for C2.1–C2.2, wired into the driver's per-step loop; C2.3/C2.4
   checks at game end.
3. **M3 — Policy tuning & liveness.** Termination pressure (C1.4), step
   cap, C3 assertions; tune slam/keep weights until the C5.2 coverage
   paths are all reachable in the default run.
4. **M4 — Illegal fuzz & cross-check.** The C4.1 illegal-command
   generator interleaved into games, and the C4.2 legality agreement
   property.
5. **M5 — Counters & reporting.** Event-derived counters and the run
   summary (C5.1), coverage assertions (C5.2).
6. **M6 — Wiring.** Timeout override, `SIM_GAMES`/`SIM_SEED` knobs,
   `turbo.json` env declaration (C6.1–C6.2); deep run `SIM_GAMES=5000`;
   pin any failing seeds found (C6.3).

Milestone order is dependency order: checkers need the driver, tuning needs
checkers (failures guide it), fuzzing reuses the driver's generators,
reporting reads the driver's event stream, wiring is last because the knobs
parameterize a finished harness.

## Validation

- File-level detail and exact commands live in the
  [backend child plan](../backend/CAM-2.md).
- Beyond the acceptance gate: run the deep sim
  (`SIM_GAMES=5000 pnpm --filter @cambio/domain test`) and eyeball the
  summary — reshuffles and fizzles should be plausibly frequent,
  `DrawSkipped` rare (ADR-0011 predicted it near-impossible; the counter
  exists to check that prediction). Deliberately corrupt one invariant
  locally (e.g. drop a card in a scratch copy of the checker) and confirm
  the failure message alone (seeds + step) is enough to reproduce and debug.
- Nothing in this task proves DB-shaped invariants; CAM-3 re-asserts §4.5
  verbatim against the persisted schema.

## Progress

*(updated continuously; newest last; timestamp each entry)*

- [x] 2026-08-31 14:20 — M1 driver core complete: `test/sim/` rng, candidates, policy, driver; 17 new tests green (C1.1–C1.5, C3.1 single-game), typecheck/lint clean.
- [x] 2026-08-31 14:22 — M2 invariant checkers complete and wired per-step; `Simulation.test.ts` batch plays 250 random games with zero violations on first contact (batch wall time ~0.6 s). Suite 150 tests green.
- [x] 2026-08-31 14:28 — M3 policy tuning + liveness: three probe rounds; final knobs and two policy design changes recorded in the child plan.
- [x] 2026-08-31 17:28 — M4 illegal fuzz + legality cross-check green (25 offset-seeded games each; all six named illegal shapes observed; zero throws, zero mutations).
- [x] 2026-08-31 17:40 — M5 counters + summary line + coverage assertions; `Coverage.test.ts` scenarios pin the J/Q fizzles and ADR-0012 skip the batch can't reach.
- [x] 2026-08-31 17:50 — M6 wiring: `SIM_GAMES`/`SIM_SEED` knobs live under turbo; deep run 5000 games / 737k steps clean; full gate 18/18; acceptance criteria all check off. No engine gap ever surfaced — C7.1 never triggered.

## Decision log

- 2026-08-31 — Hand-rolled seeded driver over fast-check — promoted to
  [ADR-0013](../../adr/0013-hand-rolled-seeded-simulation-driver.md); user
  call during planning interview.
- 2026-08-31 — Default 250 games per `turbo test` run + `SIM_GAMES` env
  knob for thousands-scale runs — user call: keep the everyday gate fast,
  scale on demand. Failing seeds get pinned (C6.3), so cheap default runs
  don't lose regressions.
- 2026-08-31 — Liveness (C3) and illegal-command robustness (C4) are in
  scope alongside the five §4.5 invariants — user call during interview.
- 2026-08-31 — The two CAM-1 carried hardening items (the
  `HoldingCard`-accepts-power schema hole; the `drawable`/`reshuffleIfEmpty`
  duplication) are **deferred out of CAM-2** — user call: keep this task
  purely additive test work; the sim only sees engine-constructed states so
  neither item is reachable by it. File as a separate task (the schema hole
  naturally lands with CAM-3, where decoded states first become real).
- 2026-08-31 — §4.5's DB-phrased invariants restated in domain terms (see
  Context & orientation) rather than asserted as tautologies — planning
  call; the verbatim forms return in CAM-3.
- 2026-08-31 — `test/EndToEnd.test.ts` stays untouched; the harness is new
  code under `test/sim/` — planning call: the scripted game is a pinned
  coverage scenario with its own value, and refactoring it into the driver
  would churn a reviewed test for no coverage gain.
- 2026-08-31 — Run summary via a single `console.log` line from the test —
  planning call: smallest thing that satisfies ADR-0011/0012's "count how
  often this occurs" request; revisit if it gets noisy.
- 2026-08-31 — (implementation) Policy design, found by probing: `CallCambio`
  is reachable only via the termination ramp, never uniform choice (uniform
  ended ~⅓ of games on turn one); an informed slam attempt with no true rank
  match on the table passes instead of slamming blind (blind-slam penalties
  inflated hands faster than informed slams drained them); informed slams
  prefer the slammer's own matching card (drains toward the zero-card
  states every ADR rare path needs).
- 2026-08-31 — (implementation) C5.2 split per the plan's contingency:
  batch-reachable shapes asserted against the default batch (guarded with
  `it.skipIf` when `SIM_GAMES`/`SIM_SEED` differ — a rescaled run proves
  invariants, not rare-case reachability); J/Q fizzles and the ADR-0012
  skip pinned by two `Coverage.test.ts` seeded scenarios with slams
  disabled via knobs.
- 2026-08-31 — (implementation) The 5000-game deep run found no failing
  seed, so `Regressions.test.ts` was deliberately not created; `DrawSkipped`
  stayed 0 across 737k steps, confirming ADR-0011's "near-impossible"
  prediction.

## Surprises & discoveries

*(anything found mid-implementation that the plan didn't predict — wrong
assumptions, upstream bugs, better approaches. Evidence included.)*

- (from planning exploration, for the implementer) A **legal** command can
  return a byte-identical state: a failed slam whose penalty/give draw is
  skipped under ADR-0011 (`src/Engine.ts:262-265`, `:308-310`). Do not
  assert "every accepted command changes state", and do not treat it as a
  stuck game — termination is the clock's and policy's job (C3.2 note).
- (from planning exploration) `legalCommandKinds` requires a seated
  `playerId` even for `CloseSlamWindow`, which carries no issuer
  (`src/Legality.ts:243`, `src/Command.ts:72`) — the driver should treat
  window-closing as a clock action, not a player choice.

## Outcomes & retrospective

*(filled at the end, typically by `/review`: what shipped, what was cut,
what should carry into the next task.)*
