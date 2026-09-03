# CAM-10 — Engine hardening — HoldingCard power-card schema hole + drawable/reshuffle predicate duplication (backend)

- **Root plan:** [root/CAM-10.md](../root/CAM-10.md) — the functional
  contract lives there; this document is implementation detail for the
  backend side (the only side — this task has no frontend or contracts
  changes).

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

Both items live entirely in `packages/domain/src`, which per the
`architecture` skill's import table may depend on `effect` only — no new
imports from outside `effect` are introduced by either change.

- **`packages/domain/src/Phase.ts`** — `HoldingCard` (`Schema.TaggedStruct`,
  now lines 25–35 with its `.pipe(Schema.filter(...))` refinement) rejects a
  power-rank `card` at decode time. Imports at the top of the file are now
  `import { CardSlug, isPowerRank, Rank, rank } from "./Card.js"`. Per the
  `effect-domain-modeling` skill, this file's own docstring reserves "is
  this move legal right now" for `Legality.ts` and explicitly says "do not
  add transition functions to this module" — the filter added here is a
  **structural** fact ("is this the right shape for this tagged case"), not
  a legality check, so it does not violate that boundary; ADR-0026 makes
  exactly this distinction in its "Alternative considered" section.
- **`packages/domain/src/Legality.ts`** — `drawable` (lines 43–44, now
  exported) was previously file-private. Per this file's own docstring ("the
  single source of legality... no rule check may exist anywhere else"),
  exporting it and having `Engine.ts` call it instead of re-deriving the
  same fact is the only conforming shape — there was no real alternative to
  weigh (also recorded in the root plan's Decision Log).
- **`packages/domain/src/Engine.ts`** — `reshuffleIfEmpty` (lines 68–69) now
  calls `drawable` instead of spelling out its own `state.discard.length <=
1` half. `Engine.ts:16` now reads `import { checkCommand, drawable,
powerHasValidTarget } from "./Legality.js"`.
- **Test fixtures affected:** `packages/domain/test/Phase.test.ts:12` built
  a `HoldingCard` from `card("7H")` (rank `7`, a power rank) inside the
  round-trip test `"round-trips each member of the union"` — now
  `card("2H")`, keeping meaningful variety against the other `HoldingCard`
  fixture on line 13 (`card("5C")`).

No other package is touched: `apps/web/src` has zero imports of
`@cambio/domain` (confirmed in the root plan's Context section), and
`apps/api` needs no code change — `GameRepository.load`
(`apps/api/src/infra/game-repository.ts:285–287`) already wraps every
`Schema.decodeUnknown(GameState)` failure via
`Effect.mapError(storage("games.load.decode"))`, so it inherits the new
rejection for free.

## Plan of work

Two independent, same-package steps; no ordering dependency, but domain work
is test-first per the `effect-domain-modeling` skill, so each step lands its
test before (or atomically with) its implementation.

### Step 1 — `HoldingCard` rejects power-rank cards (C1)

1. In `packages/domain/test/Phase.test.ts`:
   - Change line 12's `card("7H")` to a non-power card, distinct from the
     other `HoldingCard` fixture already on line 13 (`card("5C")`) — e.g.
     `card("2H")` — so the round-trip test keeps meaningful variety across
     ranks/suits rather than accidentally testing the same rank twice.
   - Add a new `it` in the same `describe("Phase", ...)` block asserting
     `decodePhase` rejects a power-rank card inside `HoldingCard`. Follow
     the exact precedent already in this file at the
     `"rejects the deleted provisional ResolvingPower shape (ADR-0010)"`
     test (lines 34–38): plain `it` (not `it.effect` — this is a pure,
     synchronous decode), `expect(() => decodePhase({ _tag: "HoldingCard",
playerId: p0, card: card("7H"), source: "deck" })).toThrow()` (or any
     other power-rank card — `"7H"` is convenient since it is already in
     scope as a literal in this file today).
2. In `packages/domain/src/Phase.ts`:
   - Add `isPowerRank` and `rank` to the existing `import { CardSlug, Rank }
from "./Card.js"` line.
   - Add a `.pipe(Schema.filter(...))` refinement to the `HoldingCard`
     `Schema.TaggedStruct` definition (originally lines 25–29; as built,
     lines 25–35 once the `.pipe(...)` chain is added). **As implemented**
     (the advisory sketch below matched exactly — no `Schema.filter` call
     existed elsewhere in the repo to copy at plan time; confirmed against
     `effect@3.22.1`'s `Schema.d.ts` and it typechecked unmodified):
     ```ts
     export const HoldingCard = Schema.TaggedStruct("HoldingCard", {
       playerId: UserId,
       card: CardSlug,
       source: HeldCardSource,
     }).pipe(
       Schema.filter(
         (holding) =>
           !isPowerRank(rank(holding.card)) ||
           "a power-rank card must be resolved through ResolvingPower, never held (§1.3)",
       ),
     )
     ```
     Confirmed at implementation time: `Schema.filter`'s general overload
     (`Schema.d.ts:1909`) accepts a predicate returning
     `undefined | boolean | string | ParseIssue | FilterIssue` with no
     explicit type parameter needed — `Types.NoInfer<Schema.Type<S>>` is
     inferred from `self` in the `.pipe(...)` chain.
   - `HoldingCard`'s exported `type HoldingCard = typeof HoldingCard.Type`
     (originally line 79, now line 85 as built) is derived from the schema
     and needed no edit — confirmed the `.pipe(...)` chain does not change
     the inferred `Type` shape (`Schema.filter` narrows what decode accepts,
     not the TS type, per ADR-0026's Consequences section).
3. Run `pnpm turbo test --filter @cambio/domain` and confirm
   `Phase.test.ts` passes with the new fixture and new test, and that no
   other domain test regresses (per the root plan's C1.4, no other
   production file should need a change — `Engine.ts`'s `takeDiscard` /
   `drawFromDeck` and `Fold.ts`'s `CardDrawn` handling already only ever
   construct `HoldingCard` from non-power cards).

### Step 2 — unify `drawable` / `reshuffleIfEmpty` (C2)

1. In `packages/domain/src/Legality.ts` line 43: add `export` to `drawable`.
   No signature or behavior change.
2. In `packages/domain/src/Engine.ts`:
   - Line 16: add `drawable` to the existing
     `import { checkCommand, powerHasValidTarget } from "./Legality.js"`.
   - Lines 68–69: replace the skip condition's `state.discard.length <= 1`
     half with `!drawable(state)`. **Advisory sketch**:
     ```ts
     const reshuffleIfEmpty = (state: GameState): Step => {
       if (state.deck.length > 0 || !drawable(state)) return [state, []]
       // ... unchanged below
     }
     ```
     This substitution was proven logically equivalent during planning (case
     split on `state.deck.length > 0` vs. `=== 0`; when `deck.length === 0`,
     `drawable(state)` reduces to exactly `state.discard.length > 1`, so
     `!drawable(state)` is exactly the original `state.discard.length <= 1`)
     — it is a pure refactor, not a behavior change, and is call-site
     verified in the root plan's Context section.
3. Regression cover located during planning (do not invent new test names
   beyond what's below — confirmed to exist at these locations):
   - `packages/domain/test/TurnActions.test.ts`, `describe("DrawFromDeck
(C2.4–5)", ...)`, `it("reshuffles the pile (keeping its top) when the deck
is empty (C6.1)", ...)` (line 202) — exercises the reshuffle-triggers side
     with `deck: []`, `discard` length 3.
   - `packages/domain/test/Slam.test.ts`, `describe("exhaustion during slams
(C4.5, ADR-0011)", ...)`:
     - `it("penalty draws reshuffle the pile (minus top) first", ...)`
       (line 277) — `deck: []`, `discard` length **2**: reshuffle triggers.
     - `it("skips the penalty when no card exists anywhere (dedicated
ADR-0011 test)", ...)` (line 293) — `deck: []`, `discard` length **1**:
       reshuffle does **not** trigger (the `DrawSkipped` path instead).
       These two `Slam.test.ts` tests already straddle the exact
       `discard.length <= 1` vs. `> 1` boundary that changes hands from an
       inline check to `!drawable(state)` — they are strong existing regression
       cover for the equivalence, and per the root plan should stay green
       unchanged.
       Additionally, add one small **new**, direct pinning test for the
       newly-exported `drawable` itself in `packages/domain/test/Legality.test.ts`
       (a new `describe("drawable", ...)` block, following this file's existing
       `describe`-per-function convention — see `describe("powerHasValidTarget
(ADR-0010)", ...)` at line 125 for the pattern) asserting the boundary
       directly: `drawable` is `false` when `deck` is empty and `discard` has
       length `1` or less, and `true` when `deck` is non-empty OR `discard` has
       length `> 1`. This is the most direct pin for C2.1/C2.2 — a test of the
       unified predicate itself, not just of engine behavior that happens to
       route through it — and is new coverage the existing tests above do not
       provide (they exercise `reshuffleIfEmpty`/`drawOne` end-to-end, not
       `drawable` in isolation).
4. Run `pnpm turbo test --filter @cambio/domain`, confirming the CAM-2
   randomized simulation suite (`packages/domain/test/sim/`) and all tests
   listed above stay green with zero behavior change.

### Final gate

1. `pnpm turbo build typecheck lint test` — run bare, never piped (this
   repo's `.agents/hooks/block-piped-gate.sh` PreToolUse hook denies a piped
   gate invocation without `pipefail`).

## Concrete steps & validation

| #   | Command                                                  | Signals success                                                                                                                                                                                                                |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `pnpm turbo test --filter @cambio/domain` (after Step 1) | `Phase.test.ts` passes: round-trip test with the new fixture, plus the new power-rank-rejection test; no other domain test file regresses                                                                                      |
| 2   | `pnpm turbo test --filter @cambio/domain` (after Step 2) | `Legality.test.ts`'s new `drawable` block passes; `TurnActions.test.ts:202` and both `Slam.test.ts` exhaustion tests (lines 277, 293) stay green unchanged; the full CAM-2 sim suite (`packages/domain/test/sim/`) stays green |
| 3   | `pnpm turbo build typecheck lint test`                   | Full gate exits 0 — build, typecheck, lint (incl. repo-wide prettier check), and every package's tests all pass                                                                                                                |

Per `AGENTS.md`: use `pnpm turbo test --filter @cambio/domain`, not the bare
`pnpm --filter @cambio/domain test` script, since turbo builds workspace
dependencies first and the bare script can run against a stale `dist`.

## Contract coverage

_(As built — filled in once each test landed.)_

| Clause                                                                             | Test (file + name)                                                                                                                                                                                                                                                                                                                                             | What is asserted                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1.1 — decode rejects a power-rank `HoldingCard.card`                              | `Phase.test.ts` › `Phase` › `"rejects a power-rank card held in HoldingCard (§1.3, CAM-10)"`                                                                                                                                                                                                                                                                   | `decodePhase({ _tag: "HoldingCard", ..., card: card("7H"), ... })` throws                                                                                                                                                                                                                       |
| C1.2 — decode still accepts a non-power-rank `HoldingCard.card`                    | `Phase.test.ts` › `Phase` › `"round-trips each member of the union"` (fixture corrected to `card("2H")`)                                                                                                                                                                                                                                                       | `decodePhase(encodePhase(phase))` round-trips a non-power `HoldingCard` unchanged                                                                                                                                                                                                               |
| C1.3 — `GameRepository.load` inherits the rejection with no repository code change | No new `apps/api` test, per the confirmed test-scope decision (root plan Decision Log)                                                                                                                                                                                                                                                                         | Proven by C1.1 plus inspection: `apps/api/src/infra/game-repository.ts:285-287`'s `Schema.decodeUnknown(GameState).pipe(Effect.mapError(storage("games.load.decode")))` is unchanged, and `apps/api`'s existing `GameRepository.test.ts` (9 tests, unmodified) stayed green under the full gate |
| C1.4 — no legitimate engine/fold code path regresses                               | Full `pnpm turbo test --filter @cambio/domain` run (194/194) plus the full gate's `apps/api` suite (112/112)                                                                                                                                                                                                                                                   | No production file outside `Phase.ts` needed a change; zero regressions                                                                                                                                                                                                                         |
| C2.1 — `drawable` exported, remains sole "can draw" definition                     | `Legality.test.ts` › `"drawable (§1.7, CAM-10 — single source for Engine.ts's reshuffleIfEmpty)"` › all 3 `it`s (`"is true when the deck has a card, regardless of discard length"`, `"is true when the deck is empty but the discard has more than its top card"`, `"is false when the deck is empty and the discard has at most its top card"`)              | Direct boundary pin: `drawable` is `true`/`false` exactly per `deck.length > 0 \|\| discard.length > 1`, independent of `reshuffleIfEmpty`/`drawOne`                                                                                                                                            |
| C2.2 — `reshuffleIfEmpty` derives from `drawable`, zero behavior change            | Pre-existing, unmodified: `TurnActions.test.ts` › `"DrawFromDeck (C2.4–5)"` › `"reshuffles the pile (keeping its top) when the deck is empty (C6.1)"`; `Slam.test.ts` › `"exhaustion during slams (C4.5, ADR-0011)"` › `"penalty draws reshuffle the pile (minus top) first"` and `"skips the penalty when no card exists anywhere (dedicated ADR-0011 test)"` | All three stayed green unchanged after the `Engine.ts:69` substitution — the two `Slam.test.ts` tests straddle the exact `discard.length ≤1` vs. `>1` boundary the refactor touches                                                                                                             |
| C2.3 — full suite incl. CAM-2 sim harness stays green, zero behavior change        | `pnpm turbo test --filter @cambio/domain` (194/194, incl. `sim/Simulation.test.ts`, `sim/Fuzz.test.ts`, `sim/Invariants.test.ts`) and the full gate (`pnpm turbo build typecheck lint test`, 22/22 tasks)                                                                                                                                                      | Zero test changes beyond the additive ones above; CAM-2 harness green                                                                                                                                                                                                                           |

## Progress

- [x] 2026-09-03 — backend child plan written
- [x] 2026-09-03 13:32 — Step 1 (C1) implemented and green: `Phase.test.ts`
      fixture fixed + rejection test added, `Phase.ts` `Schema.filter`
      added; `pnpm turbo test --filter @cambio/domain` 191/191
- [x] 2026-09-03 13:33 — Step 2 (C2) implemented and green: `drawable`
      exported, `Engine.ts`'s `reshuffleIfEmpty` substitution, new
      `Legality.test.ts` `drawable` block added; `pnpm turbo test --filter
@cambio/domain` 194/194
- [x] 2026-09-03 13:35 — final gate `pnpm turbo build typecheck lint test`
      green, 22/22 tasks (7 cached, 15 executed), run bare

## Surprises & notes for the root plan

- The root plan's Plan of work (step 2) left "the child plan locates the
  exact file" open for where `reshuffleIfEmpty`'s behavior is currently
  exercised. Found: **not** a single file — coverage of the specific
  `deck.length === 0` boundary is split across
  `packages/domain/test/TurnActions.test.ts` (non-boundary trigger case,
  line 202) and `packages/domain/test/Slam.test.ts` (both boundary sides,
  lines 277 and 293, via `drawOne`'s penalty/give-draw paths rather than the
  `DrawFromDeck` command path). No test previously exercised the
  newly-exported `drawable` directly, since it wasn't exported — that gap is
  what the new `Legality.test.ts` `drawable` block closes.
