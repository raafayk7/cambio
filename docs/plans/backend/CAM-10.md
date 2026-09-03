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

- **`packages/domain/src/Phase.ts`** — `HoldingCard` (currently a plain
  `Schema.TaggedStruct`, lines 25–29) needs a `Schema.filter` refinement so
  decode rejects a power-rank `card`. Current imports at the top of the file
  are `import { CardSlug, Rank } from "./Card.js"` — `isPowerRank` and `rank`
  join that import list. Per the `effect-domain-modeling` skill, this file's
  own docstring reserves "is this move legal right now" for `Legality.ts`
  and explicitly says "do not add transition functions to this module" —
  the filter added here is a **structural** fact ("is this the right shape
  for this tagged case"), not a legality check, so it does not violate that
  boundary; ADR-0026 makes exactly this distinction in its "Alternative
  considered" section.
- **`packages/domain/src/Legality.ts`** — `drawable` (line 43) is today
  file-private. Per this file's own docstring ("the single source of
  legality... no rule check may exist anywhere else"), exporting it and
  having `Engine.ts` call it instead of re-deriving the same fact is the
  only conforming shape — there is no real alternative to weigh here (also
  recorded in the root plan's Decision Log).
- **`packages/domain/src/Engine.ts`** — `reshuffleIfEmpty` (lines 68–69)
  currently spells out its own `state.discard.length <= 1` half instead of
  calling `drawable`. `Engine.ts:16` already imports `checkCommand,
powerHasValidTarget` from `./Legality.js`; `drawable` joins that import.
- **Test fixtures affected:** `packages/domain/test/Phase.test.ts:12` builds
  a `HoldingCard` from `card("7H")` (rank `7`, a power rank) inside the
  round-trip test `"round-trips each member of the union"` — this becomes an
  illegal fixture the moment the filter lands and must be changed to a
  non-power card before that test can pass again.

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
     `Schema.TaggedStruct` definition (lines 25–29). **Advisory sketch only**
     — the implementer confirms the exact call shape against the installed
     `effect` package's type defs before committing to it (this repo has no
     existing `Schema.filter` call to copy; the closest local precedent is
     `packages/contracts`' generated `.d.ts` output, which shows
     `Schema.filter<typeof Schema.Int>` results from `Schema.Int.pipe(...)`
     — i.e. `filter` composes via `.pipe`, not as a wrapping call):
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
     Confirm at implementation time whether `Schema.filter`'s predicate
     signature (checked against
     `node_modules/.pnpm/effect@3.22.1/node_modules/effect/dist/dts/Schema.d.ts`
     during planning) accepts the `boolean | string` return used above
     without an explicit type parameter, or needs one spelled out.
   - `HoldingCard`'s exported `type HoldingCard = typeof HoldingCard.Type`
     (line 79) is derived from the schema, so it does not need a separate
     edit — confirm at implementation time that the `.pipe(...)` chain
     doesn't change the inferred `Type` shape (it shouldn't; `Schema.filter`
     narrows what decode accepts, not the TS type, per ADR-0026's
     Consequences section).
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

_(Plan-time: Clause + planned-approach only. `/implement` fills in the
actual test file, test name, and assertion phrase when each test lands —
inventing test titles here would be an overclaim per the template's
explicit rule.)_

| Clause                                                                             | Planned approach                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1.1 — decode rejects a power-rank `HoldingCard.card`                              | New `it` in `Phase.test.ts`'s `describe("Phase", ...)` block, patterned on the existing ADR-0010 rejection test (lines 34–38); asserts `decodePhase(...)` throws for a power-rank card                                                                                                                                                                 |
| C1.2 — decode still accepts a non-power-rank `HoldingCard.card`                    | Covered by the existing (fixture-corrected) round-trip test `"round-trips each member of the union"` in the same file — a positive-case regression guard, not a new test                                                                                                                                                                               |
| C1.3 — `GameRepository.load` inherits the rejection with no repository code change | Not a new `apps/api` test per the confirmed test-scope decision (root plan Decision Log) — proven by C1.1 plus inspection of the existing `Effect.mapError(storage("games.load.decode"))` wrapping at `apps/api/src/infra/game-repository.ts:285–287`, unchanged by this task                                                                          |
| C1.4 — no legitimate engine/fold code path regresses                               | Full `pnpm turbo test --filter @cambio/domain` run staying green (no dedicated new test; this is a non-regression clause)                                                                                                                                                                                                                              |
| C2.1 — `drawable` exported, remains sole "can draw" definition                     | Add `export` to `Legality.ts:43`; new `describe("drawable", ...)` block in `Legality.test.ts` directly pinning the boundary (deck empty + discard length ≤1 vs. >1)                                                                                                                                                                                    |
| C2.2 — `reshuffleIfEmpty` derives from `drawable`, zero behavior change            | `Engine.ts:68–69` substitution; regression cover already exists at `TurnActions.test.ts` (`"reshuffles the pile (keeping its top) when the deck is empty (C6.1)"`) and `Slam.test.ts`'s `"exhaustion during slams (C4.5, ADR-0011)"` block (both boundary sides) — all three expected to stay green unchanged, plus the new `drawable` unit test above |
| C2.3 — full suite incl. CAM-2 sim harness stays green, zero behavior change        | `pnpm turbo test --filter @cambio/domain` run after Step 2, and again as part of the final gate                                                                                                                                                                                                                                                        |

## Progress

- [ ] 2026-09-03 — backend child plan written

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
