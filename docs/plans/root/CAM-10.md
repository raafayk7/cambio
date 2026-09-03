# CAM-10 — Engine hardening — HoldingCard power-card schema hole + drawable/reshuffle predicate duplication

- **Linear:** [CAM-10](https://linear.app/raafayk7/issue/CAM-10/engine-hardening-holdingcard-power-card-schema-hole-drawablereshuffle)
- **Scope:** backend
- **Child plans:** [backend](../backend/CAM-10.md)
- **ADRs:** [0026](../../adr/0026-holdingcard-power-rank-schema-filter.md)

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

After this task, two latent CAM-1 engine risks — carried forward explicitly
into CAM-10 — are closed: (1) a corrupted or hand-edited `games.phase` jsonb
row can no longer decode into a `GameState` that illegally holds a power-rank
card in `HoldingCard` (HANDOFF §1.3's "powers must be played" rule becomes
enforced at the schema boundary, not just by the engine's own discipline),
and (2) the two independent "can we get another card" spellings in
`Legality.ts` and `Engine.ts` collapse to one exported source of truth, so
they cannot silently diverge into a thrown `Option.getOrThrow` defect.
Observe both working by running `pnpm turbo test --filter @cambio/domain`:
the full suite (including the CAM-2 simulation harness) stays green, plus two
new assertions — one that `decodePhase`/`decodeGameState` now rejects a
power-rank card inside `HoldingCard`, one pinning the unified predicate.

## Context & orientation

Everything changes inside `packages/domain/src` (may import only `effect`;
ESLint-enforced). No other package changes — confirmed during planning that
`apps/web/src` has zero imports of `@cambio/domain`, so this is backend-only,
and `apps/api` needs no code change (only benefits automatically from the
schema tightening, since `apps/api/src/infra/game-repository.ts:285-287`
already wraps every `GameState` decode failure via
`Effect.mapError(storage("games.load.decode"))`).

- `packages/domain/src/Phase.ts` — the `HoldingCard` `Schema.TaggedStruct`
  (lines 25–35, as built) now carries a `Schema.filter` refinement rejecting
  a power-rank `card`. Every legitimate constructor of `HoldingCard` was
  confirmed during planning to already guarantee a non-power card:
  `Engine.ts`'s `takeDiscard` (line 112, guarded by `checkCommand`'s
  `TakeDiscard` branch rejecting a power-rank top discard) and `drawFromDeck`
  (line 126, guarded by `!isPowerRank(cardRank)` at line 124), and
  `Fold.ts`'s `CardDrawn` case (lines 101–115, which branches to
  `ResolvingPower` for power ranks) — none needed a change. The one existing
  test fixture that was illegal under the new rule —
  `packages/domain/test/Phase.test.ts:12`, which built a `HoldingCard` from
  `card("7H")` (rank `7` is a power rank) — is now `card("2H")`.
- `packages/domain/src/Legality.ts:43-44` — `drawable(state)` is now
  exported and remains "the" answer to "can this player draw at all" (deck
  has a card, or the discard pile has more than its top to reshuffle from).
  Used at lines 104 and 252 (unchanged call sites).
- `packages/domain/src/Engine.ts:68-69` — `reshuffleIfEmpty` now calls the
  exported `drawable` (`if (state.deck.length > 0 || !drawable(state))
return [state, []]`) instead of independently reimplementing the same fact.
  Proven during planning (case analysis on `deck.length > 0` vs. `=== 0`)
  that this skip condition is exactly equivalent to the prior inline
  `state.deck.length > 0 || state.discard.length <= 1` — a substitution, not
  a behavior change, confirmed by the full domain suite (194/194) staying
  green with zero other test changes.

Governing docs: HANDOFF §1.3 (powers must always be played, never held) and
§1.7 (reshuffle-when-empty) via the `cambio-rules` skill; `Legality.ts`'s own
docstring ("the single source of legality... no rule check may exist anywhere
else") per the `effect-domain-modeling` skill; ADR-0026 (this task, item 1's
mechanism decision); CAM-1's root plan Advisory section
(`docs/plans/root/CAM-1.md`, which first named both items) and CAM-2's root
plan decision log (`docs/plans/root/CAM-2.md`, which carried them forward
into this task, purely as regression cover — no CAM-2 code changes here).

Out of scope (confirmed during planning, not attempted): a _second_,
unrelated hole where a corrupted `game_events` payload (as opposed to a
corrupted `games.phase` row) could give a `DiscardTaken` event a power-rank
`card` — `Fold.ts`'s plain object-literal phase construction (lines 126–133)
is not itself schema-validated, so this ADR's `Schema.filter` does not close
that path. Documented in ADR-0026's Consequences; revisit only if event-log
integrity becomes a real concern.

## Functional contract

### C1. HoldingCard schema rejects power-rank cards

1. `Schema.decodeUnknown(Phase)` (and by extension `Schema.decodeUnknown(GameState)`,
   since `Phase` is a field of `GameState`) rejects any `HoldingCard`-tagged
   value whose `card` has a power rank (7, 8, 9, 10, J, Q) — decode fails
   with a `ParseError`, it does not silently pass.
2. `Schema.decodeUnknown(Phase)` continues to accept a `HoldingCard`-tagged
   value whose `card` is a non-power rank (A, 2–6, K), unchanged from current
   behavior — a positive-case regression guard, not just the negative case.
3. `GameRepository.load` (`apps/api/src/infra/game-repository.ts:285-287`)
   inherits the rejection through its existing `Schema.decodeUnknown(GameState)`
   call and its pre-existing `Effect.mapError(storage("games.load.decode"))`
   wrapping — no new error type, no repository code change. Per the
   confirmed test-scope decision, this clause is proven by C1.1 plus
   inspection of the existing wrapping, not by a new `apps/api` integration
   test.
4. No legitimate engine or fold code path regresses: `Engine.ts`'s
   `takeDiscard`/`drawFromDeck` and `Fold.ts`'s `CardDrawn` handling need no
   production-code change outside `Phase.ts` — `pnpm turbo test --filter @cambio/domain`
   stays green.

### C2. drawable/reshuffleIfEmpty unified to one predicate

1. `Legality.ts`'s `drawable(state)` becomes exported and remains the sole
   definition of "can this player draw at all."
2. `Engine.ts`'s `reshuffleIfEmpty` no longer contains an independently
   spelled length check; it derives its reshuffle-needed decision from the
   exported `drawable`, preserving byte-identical behavior (the skip
   condition `state.deck.length > 0 || !drawable(state)` is logically
   equivalent to the current `state.deck.length > 0 || state.discard.length <= 1`
   — proved by case split on `deck.length`).
3. `pnpm turbo test --filter @cambio/domain`, including the CAM-2 randomized
   simulation suite, stays green with zero behavior change — this is a
   refactor of the "how", not a change to the rule.

### Acceptance criteria

- [x] `HoldingCard` rejects a power-rank `card` at decode time; a new test
      pins this (and the existing `Phase.test.ts:12` fixture no longer uses a
      power-rank card).
- [x] `drawable` is exported from `Legality.ts` and is `Engine.ts`'s only
      source for the reshuffle-needed decision; no inline duplicate remains.
- [x] ADR-0026 written and indexed.
- [x] `pnpm turbo build typecheck lint test` passes.

## Plan of work

One milestone — both items are small, independent, same-package changes with
no sequencing dependency between them, so they land together in one PR:

1. `Phase.ts`: add the `Schema.filter` refinement to `HoldingCard` per
   ADR-0026. Fix the now-illegal `Phase.test.ts:12` fixture and add a
   rejection test (pattern: `Phase.test.ts:34-38`'s existing
   `decodePhase(...).toThrow()` precedent for an illegal shape in this same
   union).
2. `Legality.ts` / `Engine.ts`: export `drawable`, delete `reshuffleIfEmpty`'s
   independent length check in favor of calling it, add a test pinning the
   unified predicate (e.g. via `Legality.test.ts` or wherever
   `reshuffleIfEmpty`'s behavior is currently exercised — the child plan
   locates the exact file).
3. Full gate: `pnpm turbo build typecheck lint test`.

Contracts freezing / parallel frontend work does not apply — this task has
no `contracts` package changes and no frontend side.

## Validation

- `pnpm turbo test --filter @cambio/domain` — full domain suite, including
  the CAM-2 simulation harness (`packages/domain/test/sim/`), must stay
  green with the two additions above and zero other test changes beyond the
  one fixed fixture.
- `pnpm turbo build typecheck lint test` (the full gate, run bare — never
  piped) before close-out.

## Progress

- [x] 2026-09-03 — plan written and signed off
- [x] 2026-09-03 13:32 — C1 implemented: `HoldingCard` `Schema.filter` in
      `Phase.ts`, `Phase.test.ts` fixture fixed and rejection test added;
      `pnpm turbo test --filter @cambio/domain` green (191/191)
- [x] 2026-09-03 13:33 — C2 implemented: `drawable` exported from
      `Legality.ts`, `Engine.ts`'s `reshuffleIfEmpty` now calls it, new
      `Legality.test.ts` `drawable` block added; `pnpm turbo test --filter
@cambio/domain` green (194/194)
- [x] 2026-09-03 13:35 — full gate `pnpm turbo build typecheck lint test`
      green (22/22 tasks, run bare)

## Decision log

- 2026-09-03 — Item 1 mechanism: `Schema.filter` refinement on `HoldingCard`,
  not a separate runtime legality-style guard — promoted to
  [ADR-0026](../../adr/0026-holdingcard-power-rank-schema-filter.md) per the
  `adr` skill's bar (selects between two real, documented alternatives).
  Confirmed with the user during planning.
- 2026-09-03 — Item 1 test scope: domain-level decode test only, no new
  `apps/api` repository/integration test — the repository's existing
  `Effect.mapError(storage("games.load.decode"))` wrapping already covers the
  boundary generically, and duplicating that as an integration test would
  test Effect's own `Schema.decodeUnknown` plumbing, not new behavior.
  Confirmed with the user during planning.
- 2026-09-03 — Item 2 predicate location: unify into `Legality.ts`'s
  `drawable`, not a new shared helper in `GameState.ts` or elsewhere. No ADR
  — this is fully determined by the existing "single source of legality"
  convention already documented in `Legality.ts`'s own file docstring and the
  `effect-domain-modeling` skill; there was no real alternative to weigh.
- 2026-09-03 — Discovered during planning (not a decision, a correction):
  `packages/domain/test/Phase.test.ts:12`'s existing `HoldingCard` fixture
  uses `card("7H")`, a power-rank card, and will fail to round-trip once
  C1 lands — folded into step 1 above rather than treated as a separate item.

## Surprises & discoveries

None — implementation matched the plan exactly, including the advisory
`Schema.filter` sketch (verified against `effect@3.22.1`'s `Schema.d.ts`
during planning, and it typechecked and worked unmodified) and the
`reshuffleIfEmpty` equivalence proof (zero behavior change confirmed by the
full domain suite, including the CAM-2 simulation and fuzz harnesses,
staying green with only the two additive test files touched).

## Outcomes & retrospective

_(filled at close-out by `/review`)_
