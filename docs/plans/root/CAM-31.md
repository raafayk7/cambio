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

> **Superseded by implementation (close-out note):** the line numbers
> below are a pre-diff (`release-v0`) snapshot, kept as planning history —
> `Deal.ts`, `GameEvent.ts`, `Fold.ts`, `Engine.ts`,
> `packages/contracts/src/GameEvents.ts`, `EventProjection.ts`, both
> leak-sweep allowlists, and `use-game.ts` all changed shape in this diff.
> For current locations, read the child plans' coverage tables or the
> files themselves; do not navigate by these numbers.

- **Deal:** `packages/domain/src/Deal.ts` selects `firstDiscard` (line 37)
  and seeds `discard: [firstDiscard]`; `GameStarted`
  (`packages/domain/src/GameEvent.ts`) carries it; the fold's
  `initialState` (`packages/domain/src/Fold.ts`, ~line 64) transcribes it.
- **Reshuffle today (lazy):** `reshuffleIfEmpty` is called only from
  `drawOne` (`packages/domain/src/Engine.ts`), which serves three
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
  (`apps/web/src/containers/game/use-game.ts`); flights play
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

- [x] All contract clauses above are covered by tests named in the child
      plans' coverage tables (or carry a documented reason why none can).
- [x] `pnpm turbo build typecheck lint test` passes, run bare (no pipe).
- [x] Dev data wiped (old `GameStarted` payloads discarded) and a fresh
      game verified end-to-end against a **fresh** dev server (AGENTS.md
      staleness check: curl a changed module through Vite before trusting
      any rendered verification).
- [x] Rendered walkthrough: game start shows empty discard with correct
      affordances (observed rendered); the deck-emptying draw's
      draw-then-reshuffle behavior verified over HTTP (deckCount 1→42 in
      one command response) with the flight sequencing pinned by the jsdom
      gate tests and the reshuffle motion confirmed on the gallery card.
      _(Amended in the review fix cycle, F2: the original wording claimed
      the draw flight → reshuffle flight sequence was itself observed
      rendered — it was not, and for non-acting players the draw flight
      cancels on a missing anchor pre-refetch, so the visual observer-side
      read of that batch remains an open observation for a future
      two-browser walkthrough.)_

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
- [x] 2026-09-08 16:10 — M6 (both): HANDOFF §1.1/§1.7 and `cambio-rules`
      SKILL.md amendment blockquotes landed (ADR-0036 pattern); dev data
      wiped via volume recreate + fresh migrate. Rendered walkthrough
      against fresh `api`/`web` dev servers (AGENTS.md staleness check
      passed — curled `draw-deck.tsx` through Vite, confirmed 3
      `animate-pulse-soft` occurrences before trusting anything rendered):
      (1) fresh 2-player game via the real UI — discard renders
      `data-state="empty"`, only "Draw a card"/"Call Cambio" are visible
      buttons, no slam timer, `deckCount` is 44 (52 − 4·2); (2) the
      gallery's new "deck empty, reshuffling" state card confirmed live in
      the DOM carrying `animate-pulse-soft` on the dashed outline; (3) a
      scripted 2-player game driven entirely over HTTP (draw + resolve +
      discard every turn, never slamming, waiting out each 10s window)
      played to deck exhaustion — round 44's draw took the last deck card
      and `deckCount` jumped **1 → 42** in that same command's response
      (43 discarded cards minus the retained top, reshuffled), live on the
      running dev server — direct confirmation of clause 6 (draw-then-
      reshuffle, same batch) outside the test suite. Full gate re-run
      after the wipe: green, 25/25. All four root-plan acceptance criteria
      checked off. _(Amended in the review fix cycle, F2: criterion 4's
      visual draw-flight→reshuffle-flight sequence was verified over HTTP
      and via the jsdom sequencing pins, not observed rendered — see the
      amended criterion.)_ Backend/frontend implementation complete; only
      close-out (plan reconciliation, commit, push, Linear comment)
      remains.

- [x] 2026-09-08 15:30 — review fix cycle: F1 latch-guarded drain landed in
      `use-game.ts` with a distinguishing test (mutant-verified — the test
      fails against the unguarded drain); F2 claim amendments at all three
      instances; F3 liveness test strengthened to observe the gate flush;
      F4's seven false comments corrected (Engine.ts's `eagerReshuffle` now
      guards with its own inline predicate, `drawable` import dropped);
      F5a fold pin added for the re-arm batch position, F5b invariant test
      trips all three checkers; F6 quick wins (row 15, canon r5 draw-state
      text, refetch settles). Domain 209/209, full re-review gate pending
      in this entry's commit.

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
  **Not exercised by the M6 walkthrough**: the automated 2-player game
  used for it never slams (deliberately, to keep the deck-depletion
  script simple), so this residual's specific batch shape was never
  rendered. Still open for `/review` to judge directly if it wants a
  visual read.

## Outcomes & retrospective

_(review of 2026-09-08, four reviewers — backend/frontend × contract/architecture — plus independent verification)_

**Verdict: fix-then-ship.**

**What passed.** All 17 contract clauses verified satisfied on the backend
and clauses 13/15/16 on the frontend, with file:line evidence; no
hidden-information regressions anywhere (both leak sweeps got strictly
stronger, `DeckReshuffled` stays `deckCount`-only on the wire, flight specs
stay value-free). Independent verification: full gate green; **forced
fresh** (non-cached) suite runs all green against live Postgres — domain
208/208, application 92/92, api 122/122, web 260/260; sim summary
`reshuffles=129`, all six C5.2 rare cases nonzero. A throwaway sequencing
probe (written, run, deleted) exercised the clause-8 zero-card batch
(`SlamSucceeded, DeckReshuffled, CardGivenFromDeck`) through the real hook:
no wedge, the reshuffle is neither lost nor deferred forever, and it plays
after its true cause settles. The backend contract reviewer additionally
probed both 250-game batches: 131 `DeckReshuffled` events fold at their
eager positions (86 after `CardDrawn`, 45 after `PenaltyDrawn`).

**Findings** (rank order; none block on re-plan):

- **F1 — clause-14 defect (narrow): the cause gate's pending-drain is
  unconditional** (`use-game.ts` `onDone`: the latch clear is guarded by
  flight id, the drain is not). With two causes armed in one batch, the
  **first** cause to settle flushes the queued reshuffle. Correct by
  accident for the zero-card batch (the first cause is the true cause —
  probe-confirmed live); **wrong for the reachable fizzle batch**
  `CardDrawn, PowerFizzled, PowerDiscarded, DeckReshuffled,
SlamWindowOpened` (Engine.ts fizzle path), where `CardDrawn` arms A,
  `PowerDiscarded` arms B (the true cause), and A's settle flies the
  reshuffle concurrent with B. The handler comment ("composing both is
  what makes a slam batch's penalty/give-then-reshuffle order correct")
  overclaims the same semantics. Candidate fix: drain only when the latch
  actually clears (reshuffle then waits for the last armed cause — still
  "after its causing flight settles", and it also removes the documented
  clause-8 give/reshuffle concurrency residual); pin the fizzle batch in
  a test. **RESOLVED (fix cycle 2026-09-08): fix applied** — the drain now
  runs only when the settling flight IS the armed cause; a distinguishing
  test pins it (early-settling non-cause holds the reshuffle, the last
  armed cause releases it) and was verified to FAIL against the unguarded
  drain (mutant run). The handler comment was rewritten; the clause-8
  give/reshuffle concurrency residual is gone as a side effect (the
  reshuffle now follows the give — frontend plan Surprises updated).
- **F2 — acceptance-criterion overclaim, 3 instances**: AC4's "deck-
  emptying draw shows draw flight → reshuffle flight in sequence" was
  never visually observed — the M6 walkthrough verified clause 6 over
  HTTP only (deckCount 1→42 in one response; honest in the progress
  entry, overclaimed by the checked box). Compounding: for non-actors the
  draw batch plausibly degrades to immediate-reshuffle (the `held` anchor
  mounts only on a held-phase snapshot, so the `CardDrawn` flight cancels
  on a missing anchor pre-refetch — pre-existing characteristic, logged
  in the frontend plan's deviation note). Instances: root AC4 checkbox
  (:177), root M6 progress "all four … checked off", frontend step-5
  walkthrough item 2. **RESOLVED (fix cycle): claim amended** at all three instances (root AC4,
  the root M6 progress claim, frontend step-5 item 2), each with an inline
  amendment note; the observer-side visual read is recorded as an open
  observation for a future two-browser walkthrough, not a met criterion.
  Sweep re-run: `grep -rn "draw flight"` across all three plan docs — no
  further instances beyond the three amended and the test-plan rows that
  describe the jsdom pins accurately.
- **F3 — vacuous liveness test**: the gate's "is live under jsdom's
  default auto-cancelling measure" test asserts only the refetched view,
  which the unconditional `scheduleRefetch` guarantees even with a wedged
  gate; the child plan's sketch asked for "the reshuffle choreography is
  enqueued" too. **RESOLVED (fix cycle): test strengthened** — a new case cancels the cause
  on its missing `held` anchor while stubbing rects so the flushed
  reshuffle flight observably animates (`data-state="reshuffling"`); the
  original refetch-outcome case is kept for the degenerate-measure pathway.
- **F4 — false-comment cluster** (each a one-line fix; all verified
  against code):
  - a. `Legality.test.ts` drawable-describe comment claims the eager
    reshuffle "is no longer sourced from" `drawable` — `Engine.ts`'s
    `eagerReshuffle` guard literally reads `drawable`, and the adjoining
    "equivalent to `deck > 0`" note invites a simplification that would
    no-op the entire ADR-0040 mechanism. **RESOLVED (fix cycle): both** —
    `eagerReshuffle` now guards with its own inline predicate (the
    `drawable` import is gone from Engine.ts) and both the Engine
    docstring and the Legality.test comment now state why the two
    predicates must never collapse into each other.
  - b. `Engine.ts` `drawFromDeck` comment attributes `getOrThrow` safety
    to C6.2 legality; post-diff it rests on ADR-0040's resting invariant
    (legality still admits `deck 0 / discard > 1`, which `drawOne` can no
    longer serve). **RESOLVED (fix cycle): claim amended** — the comment now
    rests the unreachability on ADR-0040's resting invariant and names the
    hand-built-state gap explicitly.
  - c. `Fold.test.ts` header claims the batch shares the simulation
    suite's `SIM_SEED` — defaults diverged in this diff (20260831 vs
    20260908). **RESOLVED (fix cycle): claim amended** — the header now
    records the deliberately distinct defaults and why.
  - d. `use-game.ts` handler preamble: "Endgame tags (M6) fall through to
    `default`" — false; `CambioCalled`/`GameEnded` have explicit cases. **RESOLVED (fix cycle): claim amended** — the comment names the actual
    default tags (`GameStarted`, `SlamWindowOpened`, `TurnAdvanced`).
  - e. `discard-pile.tsx` JSDoc still framed `empty` as "a zero-card keep
    took the last card" — its own canon r3 superseded that. **RESOLVED (fix cycle): claim
    amended** — the JSDoc now carries the r3 framing (opening state per
    ADR-0039, zero-card keep as the mid-game route).
  - f. `draw-deck.tsx` header cited canon "(r4, CAM-29)" while canon is
    r5, and the file's inline revision-note convention lacked an r5
    paragraph. **RESOLVED (fix cycle)** — header bumped to (r5, CAM-31),
    r5 paragraph added in the file's inline-revision convention.
  - g. `Engine.ts` `eagerReshuffle` docstring miscounted the slam-path
    composition ("two non-window returns" vs the actual sites). **RESOLVED
    (fix cycle): claim amended** — the docstring now describes the shared
    slam-landing composition plus the post-give-draw second composition.
- **F5 — coverage gaps**:
  - a. The clause-9 (`…, DeckReshuffled, SlamWindowOpened`) and clause-8
    give-draw (`…, CardGivenFromDeck, DeckReshuffled`) event positions
    never pass through the fold in any suite (probed: zero instances in
    both 250-game batches). **RESOLVED (fix cycle): test added** — a crafted
    fold-consistent log reaches the re-arm pre-state (two real draws plus
    one synthetic transcription-jump `DeckReshuffled`, same license as the
    impossible-deck test), then asserts the live `DiscardHeld` batch is
    `HeldDiscarded, DeckReshuffled, SlamWindowOpened` AND that refolding
    the extended log deep-equals the live state. The give-draw position
    stays engine-order-pinned only (crafting a zero-card slam through the
    fold needs four slam rounds of scaffolding — declined as
    disproportionate; noted in the backend coverage table).
  - b. `Invariants.test.ts` "combines all three checkers" corrupts only
    the deck. **RESOLVED (fix cycle): test strengthened** — it now trips
    each of the three checkers distinctly (partition, hand-integrity,
    resting invariant), asserting each checker's message substring.
  - c. `powerPeek`/`powerSwap` landing sites have no dedicated trigger
    test — accepted on the shared-helper argument (all five funnel
    through `openWindowOrAdvance`'s entry); noted, not fixed.
- **F6 — advisory**: coverage-table row 15's malformed extra cell —
  RESOLVED (fix cycle): row repaired. Canon draw-deck r5 documented the
  empty-branch motion for `reshuffling` only — RESOLVED (fix cycle): r5
  text extended to cover `draw` too (same-revision clarification, matching
  the as-built component). The sequencing test's in-flight debounced
  refetch — RESOLVED (fix cycle): both gate tests now settle the flight
  and await the refetched view. DECLINED, deliberately: HANDOFF §4.5's
  invariant list stays persistence-level (the engine-level resting
  invariant lives in ADR-0040 and the harness); ADR-0014's Context keeps
  its historical `firstDiscard` mention (history is the point; ADR-0039
  is indexed as the superseding decision). Noted for the record, no
  action: `FlightLayer`'s null-root caveat, the affordance-mirror/
  `drawable` decoupling having no coupling test.

**What was run**: `pnpm turbo build typecheck lint test` (bare);
`pnpm turbo test --filter … --force` for domain/application/api/web
against live Postgres; one throwaway browser-hook probe (deleted);
reviewer-side domain suite runs and batch probes.

**Deferred/carry-forward**: F5c (power-path trigger tests) if the eager
helper ever de-shares; the observer-side visual read of the draw batch
(F2's open observation) belongs to the next session that runs a
two-browser walkthrough.
