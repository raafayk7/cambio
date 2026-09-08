# CAM-31 — Deck mechanics: no initial face-up discard + eager reshuffle

- **Linear:** [CAM-31](https://linear.app/raafayk7/issue/CAM-31/deck-mechanics-no-initial-face-up-discard-eager-reshuffle)
- **Scope:** fullstack
- **Child plans:** [backend](../backend/CAM-31.md) · [frontend](../frontend/CAM-31.md)
- **ADRs:** [0039](../../adr/0039-game-starts-with-empty-discard-pile.md) (empty discard at game start), [0040](../../adr/0040-eager-single-mechanism-deck-reshuffle.md) (eager single-mechanism reshuffle)

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

Two table-decided rule/mechanism changes: the game now begins with an
**empty discard pile** (no card turned face up at the deal — ADR-0039), and
the deck **reshuffles eagerly** the moment it empties instead of waiting
for the next draw/tap (ADR-0040). Observably: start a game and the discard
slot renders its dashed empty state with only Draw and Call available;
play until the deck runs out and the reshuffle animates immediately as a
consequence of the draw that emptied it — the deck never rests visibly
empty while cards are available.

## Context & orientation

Everything below was mapped by exploration on 2026-09-08 against a green
domain suite (196 tests passing); cited tests were verified to exist and
pass.

- **Deal:** `packages/domain/src/Deal.ts` selects `firstDiscard` (line 37)
  and seeds `discard: [firstDiscard]`; `GameStarted`
  (`packages/domain/src/GameEvent.ts`) carries it; the fold's
  `initialState` (`packages/domain/src/Fold.ts`, ~line 64) transcribes it.
- **Reshuffle today (lazy):** `reshuffleIfEmpty` is called only from
  `drawOne` (`packages/domain/src/Engine.ts:82-89`), which serves three
  draw sites: normal draw (~~:120), failed-slam penalty (~~:253), zero-card
  draw-then-give (~:302). Six sites land cards on the discard; five funnel
  through `openWindowOrAdvance` (:56-65), the slam path (site 6) returns
  separately. The reshufflable predicate already exists as the
  `reshuffleIfEmpty` guard (deck empty AND `discard.length > 1`, via
  `drawable` in `packages/domain/src/Legality.ts:43-44`).
- **Contracts/projection:** wire `GameStarted` in
  `packages/contracts/src/GameEvents.ts` (field at :47); projection in
  `packages/application/src/projection/EventProjection.ts` (:50); leak
  sweeps whitelist `firstDiscard` in
  `packages/application/test/AdversarialProjection.test.ts` and
  `apps/api/test/support/leaks.ts` — both are type-level breaks when the
  field goes.
- **Persistence:** `firstDiscard` exists only inside `game_events.payload`
  jsonb (the schema deliberately stores no derivable columns). No
  migration; dev data is wiped instead (ADR-0039).
- **Client:** `firstDiscard` has zero production readers. The empty-discard
  render state exists and is tested (`discard-pile.tsx`, ADR-0012 path).
  `DeckReshuffled` already triggers a discard→deck flight
  (`apps/web/src/containers/game/use-game.ts:653-666`); flights play
  concurrently (no queue), and the deck's `reshuffling` choreography state
  renders no motion when `count === 0` — a latent bug that eager timing
  makes the guaranteed path.
- **Governing docs:** HANDOFF §1.1 (face-up line — superseded by
  ADR-0039), §1.7 (reshuffle — timing semantics recorded by ADR-0040),
  ADR-0011 (skipped draws), ADR-0012 (empty-discard machinery), ADR-0014
  (events record PrngState; fold transcribes), ADR-0033/0034 (broadcasts
  are animation triggers; FLIP flight layer).

## Functional contract

Each clause cites the probe that verified current behavior or names the new
behavior it specifies. "Resting state" means the state returned by a
completed command application.

**Game start (ADR-0039):**

1. `dealGame` with n players produces `discard: []`, a deck of `52 − 4n`
   cards, four hand cards per player, and a `GameStarted` event with **no
   `firstDiscard` field**; the 52-card partition across hands + deck +
   discard holds. (Current single-discard behavior pinned by
   `packages/domain/test/Deal.test.ts` "one discard, rest as deck" —
   verified passing.)
2. In the opening state (AwaitingDraw, empty discard): `TakeDiscard` fails
   with `EmptyDiscard`, and `legalCommandKinds` omits `TakeDiscard` —
   draw-or-call only. (Existing ADR-0012 machinery, pinned by
   `packages/domain/test/TurnActions.test.ts` empty-discard cases —
   verified passing; this clause extends them to the opening state.)
3. The wire `GameStarted` (`packages/contracts`) has no `firstDiscard`;
   `EventProjection` compiles and projects it without the field; the two
   leak-sweep allowlists no longer reference it. Breaking change — no
   optional-field compatibility (interview decision).
4. Folding a `GameStarted` yields `discard: []`; the existing
   fold-equals-dealt-state round-trip still holds
   (`packages/domain/test/Fold.test.ts` — verified passing).
5. A game persisted immediately after start round-trips an **empty**
   `discard_pile` array through save/load (new integration coverage —
   exploration found no existing test persists an empty discard or deck).

**Eager reshuffle (ADR-0040):**

6. A normal draw that takes the last deck card emits `CardDrawn` then
   `DeckReshuffled` in the same batch; the post state has the shuffled
   former discard (minus retained top) as the deck and exactly the retained
   top as the discard. (Order **flips** from today's reshuffle-then-draw,
   pinned by `packages/domain/test/TurnActions.test.ts` C6.1 — that test's
   hand-built lazy state becomes unreachable and is reframed.)
7. A failed-slam penalty draw that takes the last deck card emits
   `SlamFailed`, `PenaltyDrawn`, `DeckReshuffled` (order flips from
   today's `SlamFailed`, `DeckReshuffled`, `PenaltyDrawn` pinned in
   `packages/domain/test/Slam.test.ts`).
8. A zero-card slammer's correct slam onto a reshufflable pile with an
   empty deck emits `SlamSucceeded`, `DeckReshuffled`,
   `CardGivenFromDeck` — **byte-identical order to today** (pinned by
   `packages/domain/test/Slam.test.ts` "zero-card slammer" reshuffle case —
   verified passing; the eager trigger at the slam's discard-landing site
   reproduces it). A draw-then-give that itself empties the deck emits
   `DeckReshuffled` after `CardGivenFromDeck`.
9. A discard landing while the deck is empty and making the pile
   reshufflable (≥ 2 cards) fires the reshuffle immediately from that
   site, before any slam window opens: e.g. `HeldDiscarded`,
   `DeckReshuffled`, `SlamWindowOpened`, with the window rank equal to the
   retained top. This applies at all six discard-landing sites.
10. Degenerate case: deck empty and discard ≤ 1 → no reshuffle fires; a
    normal draw is illegal (`NoCardToDraw`), a penalty/give draw is
    skipped with the existing `DrawSkipped` event (ADR-0011 outcome
    preserved — pinned by `packages/domain/test/Slam.test.ts` ADR-0011
    skip case, verified passing).
11. The lazy path is removed: `drawOne` performs no reshuffle (single
    mechanism, interview decision). Resting invariant: **deck empty ⟹
    discard ≤ 1**, checked per step by the simulation harness's violation
    checks over the seeded batch.
12. Every `DeckReshuffled` records the resulting deck order and
    `PrngState` (ADR-0014 — shape unchanged), and the fold transcribes
    eager reshuffles at their batch position such that
    fold-equals-live-state holds across the seeded simulation round-trip.

**Client (both changes):**

13. At game start the discard renders the existing empty state; the
    affordance set is take-discard **off**, draw **on**, call **on** (the
    client mirror `affordances.ts` simplifies `drawFromDeck` to
    `deckCount > 0`; the stale "reshuffle fuel" affordance test is
    replaced by an opening-empty-discard case).
14. A `DeckReshuffled` arriving in the same batch as its causing flight
    (draw or discard-landing) animates **after** that flight settles — a
    deferral gate in `use-game.ts` following the existing
    `runAfterReveal` pattern (interview decision). The refetched view
    remains the sole authority (ADR-0033).
15. The deck's `reshuffling` choreography state renders visible motion
    when `count === 0` (today's empty branch is static — fix in scope per
    interview), with the design-system canon r-bumped accordingly.
16. Stale surfaces updated: gallery "deck empty (reshuffle imminent)"
    label, `use-game.ts` stale fall-through comment, `room-screen` test
    fixture carrying `firstDiscard`.

**Docs (both changes):**

17. HANDOFF §1.1 gets an ADR-0039 amendment blockquote; §1.7 gets an
    ADR-0040 amendment blockquote recording the timing semantics;
    `cambio-rules` SKILL.md gets both amendments (ADR-0036 pattern;
    committed on the task branch per the CAM-20 precedent, commit
    `9dc922d`).

### Acceptance criteria

- [ ] All contract clauses above are covered by tests named in the child
      plans' coverage tables (or carry a documented reason why none can).
- [ ] `pnpm turbo build typecheck lint test` passes, run bare (no pipe).
- [ ] Dev data wiped (old `GameStarted` payloads discarded) and a fresh
      game verified end-to-end against a **fresh** dev server (AGENTS.md
      staleness check: curl a changed module through Vite before trusting
      any rendered verification).
- [ ] Rendered walkthrough: game start shows empty discard with correct
      affordances; a deck-emptying draw shows draw flight → reshuffle
      flight in sequence with visible reshuffle motion.

## Plan of work

Milestone order exists so the wire schema freezes before the two sides
proceed, and so the domain (test-first per HANDOFF §12) leads.

- **M1 — Domain, game start (backend child).** Test-first: rewrite the
  Deal tests for `discard: []` / `52 − 4n`, then `Deal.ts`,
  `GameEvent.ts` (drop the field), `Fold.ts` `initialState`. Clauses 1, 2, 4.
- **M2 — Contracts freeze + projection sweep (backend child).** Remove
  `firstDiscard` from `packages/contracts/src/GameEvents.ts`, fix
  `EventProjection.ts` and both leak-sweep allowlists, update projection
  tests. After M2 the wire shape is frozen; frontend work may proceed in
  parallel with M3–M4. Clause 3.
- **M3 — Domain, eager reshuffle (backend child).** Test-first: reframe
  the three ordering tests, add the discard-landing trigger cases and the
  degenerate/skip cases, then implement the single eager mechanism
  (helper composed at `openWindowOrAdvance`, the slam returns, and the
  post-draw sites; `drawOne` sheds `reshuffleIfEmpty`). Add the resting
  invariant to the simulation harness. Clauses 6–12.
- **M4 — API/persistence coverage (backend child).** Empty-discard
  save/load round-trip test; confirm the seeded round-trip suite
  (fold-vs-load-vs-live) stays green. Clause 5, remainder of 12.
- **M5 — Client (frontend child).** Affordance simplification + tests,
  reshuffle-after-cause sequencing gate, empty-branch reshuffle motion +
  canon r-bumps, stale copy/comment/fixture sweep. Clauses 13–16.
- **M6 — Docs + verification (both).** HANDOFF and `cambio-rules`
  amendments (clause 17), dev-data wipe, rendered walkthrough, full gate.

## Validation

- Domain: the reframed and new engine tests plus the seeded simulation
  batch (`packages/domain/test/sim/`) — the new invariant makes every
  seeded game assert clause 11 at each step; the existing
  `reshuffles > 0` reachability assertion proves eager reshuffle actually
  fires under simulation.
- Application/api: projection tests without `firstDiscard`; adversarial
  leak sweeps still pass (they are the hidden-information guard);
  `RoundTrip.test.ts` fold-vs-load-vs-live equality.
- Web: component/affordance tests for the opening state; a sequencing
  test for draw+reshuffle in one batch; existing CH2 reshuffle
  choreography test still green.
- Full gate: `pnpm turbo build typecheck lint test`, bare.

## Progress

_(updated continuously; append new entries at the BOTTOM — newest last;
timestamp each entry)_

- [x] 2026-09-08 13:35 — planning complete: ADRs 0039/0040 written, root +
      child plans drafted, user sign-off pending
- [x] 2026-09-08 14:20 — M1+M2 (backend, contiguous session per plan):
      empty-discard deal landed (`Deal.ts`, `GameEvent.ts`, `Fold.ts`),
      wire `firstDiscard` removed (contracts freeze), projection and both
      leak-sweep allowlists fixed. Full gate green (`pnpm turbo build
typecheck lint test`, 25/25 tasks) — contract wire frozen, frontend M5
      unblocked. Two seed-hunt casualties from the deck-cut shift, both
      resolved: `packages/domain/test/sim/Simulation.test.ts`'s C5.2
      default batch reseeded (`20260831` → `20260908`) and
      `apps/api/test/support/http.ts`'s `TEST_SEED` reseeded (`424_242` →
      `424_243`) to restore `SlamWindow.test.ts`'s offline seed survey.
      Full detail in the backend child plan's Progress/Surprises. Clauses
      1–4 covered (backend coverage table); M3 (eager reshuffle) next.
- [x] 2026-09-08 14:55 — M3+M4 (backend): eager single-mechanism reshuffle
      implemented in `Engine.ts` (`eagerReshuffle` composed at the
      discard-landing entry point, the slam's two non-window returns, and
      after each of the three draw sites); the resting invariant (deck
      empty ⟹ discard ≤ 1) added to the sim harness. Persistence
      round-trip coverage added for an empty discard pile. Full gate
      green throughout — both re-seeded values from M1/M2 held under the
      new mechanism, no further reseeding needed. Clauses 5–12 covered.
      Backend implementation (M1–M4) complete; backend's M6 share
      (HANDOFF/cambio-rules amendments, dev-data wipe) deferred to close
      out alongside frontend M5. Full detail in the backend child plan.
- [x] 2026-09-08 15:20 — M5 (frontend, steps 1-4): affordance mirror
      simplified to `deckCount > 0`; stale-surface sweep (fixture, CH1
      comment, gallery label); canon r-bumps (`draw-deck.md` r5,
      `discard-pile.md` r3) landed before the empty-branch motion fix per
      the plan's pre-authorized-gate convention; the reshuffle sequencing
      gate (`causeFlightIdRef`/`runAfterCausingFlight`) composed beside the
      existing slam-reveal gate in `use-game.ts`. `@cambio/web`: 260/260
      green; full gate green, 25/25. One deviation logged in the frontend
      child plan's Surprises (the sequencing test uses a discard-landing
      batch, not a draw batch — a pre-existing anchor-availability
      characteristic of the flight layer, not a gate-logic change).
      Clauses 13–16 covered. M6 (docs, dev-data wipe, rendered walkthrough,
      final gate) next.

## Decision log

- 2026-09-08 — Two ADRs, not one — the rule change (0039) and the
  mechanism change (0040) have different blast radii and independent
  supersession futures. (User call, interview round 1.)
- 2026-09-08 — Fully eager: the re-arm trigger fires from discard-landing
  sites, not just draw sites — the deck never rests empty while a
  reshuffle is possible. (User call, interview round 1; recorded in
  ADR-0040.)
- 2026-09-08 — Breaking contracts change; wipe dev data rather than keep
  `firstDiscard` optional. (User call, interview round 1; recorded in
  ADR-0039.)
- 2026-09-08 — Single mechanism: lazy `reshuffleIfEmpty` removed from
  `drawOne` rather than kept as idempotent defense. (User call, interview
  round 2; recorded in ADR-0040.)
- 2026-09-08 — Client sequences the reshuffle flight after its causing
  flight via a `runAfterReveal`-shaped gate rather than accepting
  concurrent opposite-direction flights. (User call, interview round 2.)
- 2026-09-08 — The empty-branch reshuffle-motion fix and canon r-bumps are
  in scope for CAM-31, not deferred. (User call, interview round 2.)
- 2026-09-08 — Domain `drawable` predicate stays as-is (still the correct
  legality for `DrawFromDeck`; its disjunction is merely redundant for
  reachable states) while the **client** mirror simplifies to
  `deckCount > 0` — the issue brief called out only the client
  simplification, and domain legality of hand-built states is test
  infrastructure. Child plans may revisit with evidence.
- 2026-09-08 — The `cambio-rules` SKILL.md amendment commits on the task
  branch (CAM-20 precedent, commit `9dc922d`), not via the ADR-0028
  main-first harness path — rules amendments are issue-scoped content.

## Surprises & discoveries

- (planning) The zero-card slammer path is already implicitly eager: the
  existing `Slam.test.ts` order `SlamSucceeded, DeckReshuffled,
CardGivenFromDeck` is exactly what the eager trigger produces — a
  regression anchor, not churn.
- (planning) `docs/plans/frontend/CAM-18.md` recorded "the reshuffle can
  precede CardDrawn … in one batch" — stale in the opposite direction
  under eager timing, and the "flight ordering follows batch order"
  guarantee it describes was never actually implemented (flights play
  concurrently). The frontend child plan corrects the record.
- (planning) `draw-deck.tsx`'s `reshuffling` state over `count === 0`
  renders no motion — latent today, guaranteed under eager timing; pulled
  into scope.
- (planning, from the backend child) The cross-package `firstDiscard`
  removal has no compile-green intermediate ordering: M1's checkpoint is
  domain-scoped and the first repo-wide green gate is M2's. The transient
  red is the projection/leak-sweep exhaustiveness working as designed, not
  a process violation.
- (planning, from the frontend child) Known residual in the zero-card
  batch (clause 8): the sequencing gate defers only the reshuffle behind
  its causing flight; the `CardGivenFromDeck` flight may still fly
  concurrently with or ahead of the reshuffle. Chaining it too would be
  the new mechanism class the interview declined — surface at review if
  the walkthrough reads badly.

## Outcomes & retrospective

_(filled at the end, typically by `/review`)_
