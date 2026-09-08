# CAM-23 — Opponent-slam give-pick flow — too slow for the window, copy misleads

- **Linear:** [CAM-23](https://linear.app/raafayk7/issue/CAM-23)
- **Scope:** frontend
- **Child plans:** [frontend](../frontend/CAM-23.md)
- **ADRs:** none needed — the chosen fix is a client-side interaction/copy
  change; it preserves "the slammer explicitly names their own give slot"
  (no rule changes to the domain), doesn't resolve a HANDOFF §9 item, and
  doesn't deviate from an existing ADR. See Decision Log for the
  task-scoped calls this planning session made instead.

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

Today, slamming an opponent's card during the slam window requires two taps
inside the same countdown (tap the opponent's card, then tap one of your own
cards to name the give) — by the time the second tap lands, the window has
usually closed. After this task, a player can pre-arm which of their own
cards they'll give _before_ they spot a slam opportunity, so the actual slam
tap is a single action inside the window; a player who didn't pre-arm still
gets the old two-tap flow, now with copy that doesn't lie about why they're
picking a card. Observe it by opening the game screen during a slam window
with a non-empty hand, tapping "Ready a give", tapping one of your own
cards, then tapping an opponent's card — the `Slam` command should fire
immediately with no second tap needed.

## Context & orientation

- `apps/web/src/containers/game/game-screen.tsx` (`GameTable` component) owns
  all slam-click wiring: `handleSlamClick` (as built: lines 382-427, before
  this task 353-376), the `slamPendingGive` local state (as built: line 351,
  reset at 360-366 alongside `selection`, `slamReadyMode`, and
  `slamArmedGive` — the two pieces of state this task added — whenever the
  acting phase's tag/playerId changes; `SlamWindow` has no `playerId` field,
  so this reset only fires on an actual transition away from `SlamWindow`,
  not per individual slam attempt within one still-open window), the
  fallback give-pick prompt JSX (as built: lines 613-622) and the new
  "Ready a give" control (as built: lines 596-612), and the per-seat
  `slamOnSlotClick` wiring in `seatNodes.map` (as built: lines 509-513,
  which already gates opponent hands `inert` and unclickable the moment
  `slamPendingGive` is non-null — the `ref.playerId !== viewerId` guard
  inside `handleSlamClick` is unreachable via the UI today).
- `apps/web/src/containers/game/use-game.ts` owns command-error copy:
  `COMMAND_ERROR_COPY`/`commandErrorCopy` (as built: lines 88-122, before
  this task 90-104 — `commandErrorCopy` now takes the last-submitted
  command as a second parameter) and the `sendCommand` mutation (as built:
  lines 632-663, a plain `useMutation`; its `onError` now reads the failed
  command straight from TanStack Query's own second `onError` argument
  rather than `sendCommand.variables`, which would also have worked but is
  one indirection further away — see Decision Log).
- `apps/web/src/containers/game/affordances.ts` owns the pure rule helper
  `slamGiveSlotRequired` (62-69, opponent-target + non-empty slammer hand →
  `true`; same-player or zero-card slammer → `false`, ADR-0009) and
  `isOccupiedSlot` (201-203, currently unused in `game-screen.tsx`, exists
  and is unit-tested for exactly the revalidation this task needs).
- `apps/web/src/components/game/hand.tsx` already exposes `selectedSlots`
  (54-57 — "the in-progress pick for a J/Q swap or the slot a power is
  currently targeting… same visual language as keyboard focus") and
  `awaitingGiveSlot` (a different concept — the _receiving_ hand's vacancy,
  not the giving hand's pick). Neither is wired to the give-pick sub-state
  today.
- `apps/web/src/components/game/slam-timer.tsx` has no visibility/placement
  props beyond `className`; it renders in normal document flow, not
  sticky/fixed.
- The server's `Slam` wire command (`packages/contracts/src/GameCommand.ts:38-41`)
  is atomic — `{target, giveSlot}` — with no `AwaitingGive` server phase;
  this task does not touch the wire, only how the client assembles that one
  command.
- `apps/api/src/config.ts` / `.env.example` both defaulted `SLAM_WINDOW_MS`
  to `5000` before this task; `apps/api/test/Config.test.ts:90` pinned that
  default in an assertion. A dev-only bump to `10000` was already applied
  locally in `.env` ahead of this ticket (user call, 2026-09-06); this task
  made that the checked-in default (as built: `config.ts:43`,
  `.env.example:42`, `Config.test.ts:90` now asserting `10000`).
- Governing skills: `frontend-architecture` (containers own state, hooks
  co-located, no `domain`/`application` imports), `design-system` (no new
  component states without a creation-gate stop — resolved during planning
  by reusing `selectedSlots`, see Decision Log), `hidden-information` (N/A
  rule-wise here — no new payload fields; the give-slot value stays exactly
  as blind as it is today, chosen locally and sent, never previewed), and
  `cambio-rules` (§1.5 Slamming — "the slammer gives one of their own cards,
  blind, slammer's choice of slot" — the fix must keep the choice explicit
  and the resulting placement blind; it does).
- HANDOFF §1.5, §9 (the zero-card-slammer/J-Q-empty-hand items are resolved
  by ADR-0009/0010, unaffected by this task); ADR-0009 (draw-then-give);
  ADR-0011 (fixed `closesAt`, config-sourced duration).

## Functional contract

1. **Own-card slam, unaffected.** Tapping the viewer's own occupied slot
   during an open `SlamWindow`, while not in ready-mode (see 3) and not
   mid-fallback (see 8), sends `Slam{target: thatSlot, giveSlot: null}`
   immediately — identical to current behavior.
2. **Zero-card slammer, unaffected.** Tapping an opponent's occupied slot
   when `slamGiveSlotRequired` is `false` (the slammer holds no cards) sends
   `Slam{target, giveSlot: null}` immediately regardless of any armed state
   — identical to current behavior (ADR-0009 draw-then-give).
3. **"Ready a give" control.** Visible whenever a `SlamWindow` is open, the
   viewer holds at least one occupied slot, and the fallback sub-state
   (clause 9) is not already active for the viewer; hidden otherwise (no
   window, an empty hand, or a pending fallback target already held).
   Activating it enters ready-mode.
4. **Arming.** While in ready-mode, tapping one of the viewer's own occupied
   slots arms that slot as the give-slot pick, exits ready-mode, and sends
   no wire command. The control now offers a way to clear the arm ("Cancel
   give" or equivalent) instead of "Ready a give".
5. **Canceling.** From ready-mode with nothing yet armed, the control offers
   a way to exit ready-mode without arming ("Cancel"). Once something is
   armed, activating the control's cleared-state action un-arms it (returns
   to state 3) — sends no wire command either way.
6. **Armed-slot highlight.** An armed give-slot renders with the existing
   `selectedSlots` treatment on the viewer's own hand (`Hand`'s
   already-shipped "in-progress pick" visual language) — no new component
   state.
7. **Staleness.** If the armed slot becomes unoccupied before it's spent
   (e.g. slammed away by any player, including the viewer via case 1 firing
   on that same slot), it is cleared automatically on the next render — the
   control and highlight both return to their unarmed state without user
   action.
8. **Consuming the arm.** Tapping an opponent's occupied slot when a give is
   required (`slamGiveSlotRequired` true) and a give-slot is currently armed
   and still valid (case 7 hasn't cleared it) sends
   `Slam{target, giveSlot: armedSlot}` immediately and clears the armed
   state (and exits ready-mode if somehow still engaged).
9. **Fallback, unaffected mechanically.** Tapping an opponent's occupied
   slot when a give is required and nothing valid is armed falls back to
   today's two-tap flow exactly as it works now: the target is held pending,
   the viewer's own hand becomes clickable for a one-off give pick, and that
   pick fires `Slam{target, giveSlot: pickedSlot}` — the only change is the
   prompt copy (10). This includes the case where ready-mode is currently
   engaged but nothing is armed yet: the opponent tap still falls into this
   fallback, and ready-mode exits as a side effect — ready-mode and the
   fallback's pending target are mutually exclusive, never simultaneous.
10. **Copy.** The fallback pending-give prompt reads "If you're right, which
    card do you give them?" (sentence case), replacing "Pick a card to
    give".
11. **State lifecycle.** Ready-mode and the armed give-slot reset whenever
    the acting phase transitions away from `SlamWindow` — the same
    render-time `phaseKey`-comparison mechanism that already resets
    `selection`/`slamPendingGive` (as built: `game-screen.tsx:345-366`).
12. **Late-slam copy.** A command failure tagged `WrongPhase` whose
    just-submitted command was a `Slam` displays the same copy `SlamTooLate`
    already uses ("Too slow. The slam window had already closed.") instead
    of the generic WrongPhase copy ("That move isn't available right
    now."). A `WrongPhase` failure on any other command tag is unaffected.
13. **Dev slam window default.** `apps/api/src/config.ts`'s `SLAM_WINDOW_MS`
    default, `.env.example`'s value, and `apps/api/test/Config.test.ts`'s
    pinning assertion all read `10000` (was `5000`).

### Acceptance criteria

- [x] All 13 contract clauses above hold, each covered by a test (frontend
      child plan's Contract coverage table).
- [x] `pnpm turbo build typecheck lint test` passes.

## Plan of work

1. **Local interaction state** — add ready-mode and armed-give-slot state to
   `GameTable`, wired into the existing `phaseKey` reset block, plus a
   render-time staleness check (clause 7) following the same
   derived-state-during-render convention already used there (no new
   `useEffect`).
2. **"Ready a give" control** — one new instance of the existing `Button`
   component (no new design-system component), three label/action states
   per clauses 3-5, placed near `SlamTimer` (visible for the open-window
   duration, same as the timer).
3. **Targeting logic** — extend `handleSlamClick` to check the armed state
   first for opponent targets (clause 8) before falling back to the
   existing `slamPendingGive` sub-state (clause 9); own-card and zero-card
   paths (clauses 1-2) stay untouched.
4. **Highlight wiring** — pass the armed slot into the viewer's own `Hand`
   via `selectedSlots` (clause 6); no `hand.tsx`/`hand.md` changes.
5. **Copy** — update the fallback prompt string (clause 10).
6. **Late-slam error remap** — thread `sendCommand.variables` into
   `commandErrorCopy` in `use-game.ts` so a `WrongPhase` error on a
   just-sent `Slam` renders `SlamTooLate`'s copy (clause 12).
7. **Config default** — bump `SLAM_WINDOW_MS` to `10000` in
   `apps/api/src/config.ts`, `.env.example`, and the pinning assertion in
   `apps/api/test/Config.test.ts` (clause 13); this is the one file outside
   `apps/web` this task touches, folded in here rather than a separate
   backend child plan (Decision Log).
8. **Tests** — rewrite the existing two-tap assertion
   (`game-screen.test.tsx` SL1 describe block, currently asserting the
   literal "Pick a card to give" string) for the new arm/fallback behavior;
   add coverage for arming, canceling, staleness, and consumption; add a
   `WrongPhase`-on-`Slam` remap test to the SL3 describe block; update
   `Config.test.ts`'s assertion.

No sequencing dependency on other in-flight tickets: proceeds against the
current (non-docked) game-screen layout at every width (Decision Log).

## Validation

- `pnpm turbo test --filter @cambio/web` — the primary gate for this task;
  expect the rewritten/added cases in `game-screen.test.tsx`'s SL1/SL3
  describe blocks to cover all 13 contract clauses (see the frontend child
  plan's Contract coverage table for the file+test-name mapping, filled in
  as `/implement` lands each test).
- `pnpm turbo test --filter @cambio/api` — covers clause 13
  (`Config.test.ts`).
- `pnpm turbo build typecheck lint test` — the full gate, must pass clean.
- Manual walkthrough (dev server, two browser sessions/tabs as different
  players in a 2+ player game): confirm pre-arming lets a single opponent
  tap fire the slam with no visible second-tap delay, confirm the fallback
  path still works and shows the new copy, confirm a late slam attempt
  (window closed before the tap lands) shows "Too slow…" copy.

## Progress

_(updated continuously; append new entries at the BOTTOM — newest last;
timestamp each entry)_

- [x] 2026-09-06 — plan drafted and signed off.
- [x] 2026-09-06 08:05 — all 8 plan-of-work steps implemented on
      `raafaykazmi/cam-23-opponent-slam-give-pick-flow-too-slow-for-the-window-copy`:
      ready-mode/armed-give state + staleness check, "Ready a give" control,
      `handleSlamClick` branch reordering, `selectedSlots` highlight reuse,
      copy swap, late-slam error remap, `SLAM_WINDOW_MS` default bump, and
      the full test suite (13 new/rewritten cases across SL1/SL3 plus the
      `Config.test.ts` assertion).
- [x] 2026-09-06 08:10 — gate green:
      `pnpm turbo build typecheck lint test` (25/25 tasks); `@cambio/web`
      204/204 tests, `@cambio/api` 118/118 tests.
- [x] 2026-09-06 08:20 — both plan docs reconciled with as-built code (line
      citations updated where this task's diff shifted them; the frontend
      child plan's Contract coverage table restructured to the 4-column
      Clause/Planned-approach/Test/Asserted shape `fill-coverage-row.mjs`
      expects — the 3-column shape the child-plan template currently
      produces isn't compatible with that script, see Surprises — then
      filled for all 13 clauses). Manual browser walkthrough not run this
      session (see Surprises); everything else in the root plan's
      Validation section is green.
- [x] 2026-09-06 08:30 — `/review`: fix-then-ship verdict, one test-coverage
      finding on clause 11 (see Outcomes & Retrospective).
- [x] 2026-09-06 08:45 — fix cycle: strengthened clause 11's test with a
      real phase round-trip, verified by an actual mutant kill (temporarily
      deleted the two reset lines, confirmed the test fails, restored,
      confirmed it passes and `game-screen.tsx` is byte-identical to
      pre-fix-cycle HEAD). Fixed an incidental version-guard bug in the new
      test fixture along the way (see retrospective). Fresh gate re-run:
      `@cambio/web` 204/204 (`--force`),
      `pnpm turbo build typecheck lint test` 25/25. Verdict updated to ship.

## Decision log

- 2026-09-06 — Flow mechanism: arm-first with fallback (not pure
  target-first speedup, not mandatory arm-first) — rationale: the root
  cause is that both taps happen inside the reaction-time-critical window;
  arm-first removes the time pressure from the give-pick entirely for
  players who plan ahead, while the fallback preserves the ability to slam
  for players who didn't pre-arm. User call, round 2 of planning interview.
- 2026-09-06 — Clauses 3/9 tightened during frontend child-plan review: the
  "Ready a give" control hides while the fallback sub-state is already
  active (avoids a functionally-dead control showing alongside the fallback
  prompt), and tapping an opponent's slot with ready-mode on but nothing
  armed explicitly falls into the fallback and exits ready-mode — closing a
  transition the first contract draft left implicit.
- 2026-09-06 — Own-hand-tap disambiguation: an explicit "Ready a give"
  toggle control, not an overloaded double-tap-same-slot gesture —
  rationale: overloading own-hand taps (tap 1 arms, tap 2 on the same slot
  confirms an own-slam) would reintroduce a two-tap-under-pressure problem
  for own-card slams, which today are a single, unpressured tap. User call.
- 2026-09-06 — Armed-slot highlight reuses `Hand`'s existing `selectedSlots`
  prop rather than a new component state — no design-system creation-gate
  stop needed for this task. User call.
- 2026-09-06 — Design option (c) (a default give-slot sent with no explicit
  pick) is ruled out — it is a rule softening ("slammer's choice of slot"
  becoming choice-by-default) that would need its own ADR-track ruling, and
  the chosen arm-first/fallback design doesn't need it: the slammer always
  explicitly names their give slot, just possibly earlier. User call.
- 2026-09-06 — CAM-23 proceeds against the current (non-docked) layout at
  every width; CAM-21 (compact/mobile dock) is a separate, still-unbuilt
  ticket and is not a blocking dependency. The pre-existing legibility gap
  at compact width (the slam timer/controls can scroll out of view while
  the viewer is scrolled down to their own hand) is a known limitation this
  task does not attempt to fix. User call.
- 2026-09-06 — The `SLAM_WINDOW_MS` default bump (5000→10000) is folded into
  this plan's Plan of Work as a work item rather than a separate backend
  child plan — it touches one config default, one `.env.example` line, and
  one test assertion, with no new use case, port, or architectural
  decision. User call.
- 2026-09-06 — Implementation: the late-slam error remap reads the failed
  command from TanStack Query's own second `onError` callback argument
  (`onError: (error, command) => ...`) rather than `sendCommand.variables`
  as the frontend child plan's advisory sketch suggested — both carry the
  same value here, but the callback argument is guaranteed correct
  per-invocation with no dependence on `sendCommand` not having started a
  newer overlapping mutation before this `onError` fires. Small tactical
  deviation, logged per `/implement`'s rules of engagement.
- 2026-09-06 — No ADR: this task changes client-side interaction/copy only;
  it neither resolves a HANDOFF §9 item nor deviates from an existing ADR,
  and the road not taken (option (c) above) is recorded here, not promoted,
  per the `adr` skill's bar.

## Surprises & discoveries

_(anything found mid-implementation that the plan didn't predict — wrong
assumptions, upstream bugs, better approaches. Evidence included.)_

- 2026-09-06 — `.agents/templates/child-plan.md`'s Contract coverage table
  is 3 columns (`Clause | Test (file + name) | What is asserted`), but
  `.agents/scripts/fill-coverage-row.mjs` is hard-coded to a 4-column shape
  (`Clause | Planned approach | Test | What is asserted` — see its own
  header comment and CAM-18's plan, which the script was written against).
  Following the current template produced a table the fill script cannot
  correctly write into (it would overwrite the Test/Asserted columns with
  the wrong values, since the column indices don't line up). Worked around
  it here by restructuring this task's frontend child plan to the
  4-column shape before filling it — but the template and script are out
  of sync repo-wide, and every plan written since the template moved to 3
  columns (this task's own frontend plan started that way, before this
  fix) would have the same problem. Worth a harness fix (either updating
  the template back to 4 columns, or updating the script to handle 3), out
  of scope for this task.
- 2026-09-06 — The root plan's Validation section's manual two-browser
  walkthrough was not run this session. The automated coverage added
  (`game-screen.test.tsx`'s 13 new/rewritten cases) renders the real
  `GameScreen` component tree against a real DOM via testing-library, at
  high fidelity for the interaction/state/copy logic that changed — no CSS
  or visual layout changed, so a live rendered check would mostly confirm
  what the integration tests already exercise. Reaching an actual
  `SlamWindow` phase in a live two-player game requires playing turns
  until a drawn card matches the discard top, which isn't directly
  controllable through the UI — flagged for `/review` or a follow-up
  manual pass rather than attempted here under this turn's scope.

## Outcomes & retrospective

**Verdict: ship** (updated after the fix cycle — was fix-then-ship). One
finding, resolved.

**What shipped:** exactly the 13-clause contract, implemented as planned —
arm-first give-pick with the two-tap fallback preserved, the late-slam
`WrongPhase`→`SlamTooLate` copy remap, and the `SLAM_WINDOW_MS` 5000→10000
dev-default bump. No scope creep: two independent reviewers (contract +
architecture) traced every line of the diff back to a specific clause and
found nothing implemented beyond the contract.

**Independent verification this cycle:**

- `pnpm turbo test --filter @cambio/web --force` and
  `--filter @cambio/api --force` (bypassing turbo's cache, since
  `/implement`'s own gate run would otherwise just replay as cached green):
  204/204 and 118/118 respectively, fresh, against live Postgres/Realtime
  containers. `pnpm turbo build typecheck lint test`: 25/25 (12/12 on a
  scoped web+api re-run) tasks clean.
- Two parallel read-only subagents: a **contract reviewer** (all 13 clauses,
  verdict + file:line evidence, explicitly told not to grade coverage by
  grepping clause numbers out of test titles) and an **architecture
  reviewer** (import boundaries, render-time-state-vs-`useEffect`
  discipline, design-system reuse, hidden-information, `ai-tells` voice
  compliance, the backend config touch).
- I independently re-verified the one finding below by reading the cited
  test and the render guard myself before accepting the subagent's claim.

**Architecture review: clean bill on all six checks** — no `domain`/
`application` imports introduced; no new `useEffect` (the two new state
variables and the staleness check are genuine render-time derived state,
correctly guarded against an infinite-render loop, same pattern as the
pre-existing `phaseKey` block); no hardcoded visual values or new
design-system state (the "Ready a give"/"Cancel give" control is a plain
reuse of `Button`'s existing `ghost` variant, the highlight a plain reuse
of `Hand`'s existing `selectedSlots`); no card value ever entered a payload
or render path it wasn't already in (`slamArmedGive` carries only a slot
index, never a card); new copy is clean against `voice.md` (verb-first
buttons, sentence-case functional copy, no AI-tell defaults).

**Contract review: 12 of 13 clauses satisfied with real, mechanism-verified
tests** — including a full trace of every `setSlamPendingGive`/
`setSlamReadyMode` call site in `handleSlamClick` to confirm clause 9's
mutual-exclusivity claim holds by construction across every branch, not
just the one the test exercises, and confirmation that clause 12's
`WrongPhase`→`SlamTooLate` remap is keyed on the failed command's own tag
(TanStack Query's `onError(error, command)` argument) and structurally
cannot fire for a non-`Slam` command.

**Finding (test-coverage, not a functional defect):**

- **Clause 11's cited test doesn't discriminate the reset it claims to
  cover.** The test "(CAM-23) ready-mode and an armed give-slot reset the
  moment the acting phase moves on from SlamWindow"
  (`apps/web/test/game-screen.test.tsx:1346-1383`) arms a give-slot, closes
  the window (`SlamWindowClosed`+`TurnAdvanced` → phase becomes
  `AwaitingDraw`), and asserts the "Cancel give"/"Ready a give" buttons are
  gone. But the control's own render guard
  (`game-screen.tsx:596`: `slamPhase !== undefined && ...`) already hides
  it the instant `slamPhase` is `undefined`, **regardless of whether
  `slamReadyMode`/`slamArmedGive` were actually reset** by the `phaseKey`
  block (`game-screen.tsx:360-366`). Deleting those two reset lines would
  not fail this test. The underlying code is correct on inspection (I
  traced it independently) — clause 11 genuinely holds — but the test is a
  false positive as a regression guard, and the claim that it "covers"
  clause 11 appears in two places: the root plan's own clause 11 text
  (this file, "Functional contract" §11, which the test is meant to prove)
  and the frontend plan's Contract coverage table row 11
  (`docs/plans/frontend/CAM-23.md`, the "Test (file + name)" and "What is
  asserted" cells for clause 11). Neither is false as _written_ — the
  functional claim is true and the test does exist — but the row's implicit
  claim that this test would catch a regression in the reset itself does
  not hold up.
  **Recommended fix:** strengthen (not replace) the existing test with a
  genuine round-trip: after the window closes, reopen a **new**
  `SlamWindow` (a second `GET_VIEW`/broadcast) and assert the control
  reappears as unarmed `"Ready a give"` rather than `"Cancel give"` — that
  version would fail if the reset lines were removed, because a real leak
  would carry the old armed slot index into the new window.

  **RESOLVED (fix cycle, 2026-09-06):** test strengthened, not the claim —
  the underlying behavior was always correct, only the regression guard was
  weak. `apps/web/test/game-screen.test.tsx`'s test (renamed "...and don't
  leak into the next one") now reopens a second `SlamWindow` after the
  first closes and asserts the control comes back reading "Ready a give,"
  not "Cancel give." Verified by an actual mutant kill, not just reasoning:
  temporarily deleted the two reset lines
  (`setSlamReadyMode(false)`/`setSlamArmedGive(null)`,
  `game-screen.tsx:364-365`) — the strengthened test failed as expected;
  restored the lines — it passed. `game-screen.tsx` diffs to byte-identical
  with pre-fix-cycle HEAD (confirmed via `git diff --stat`), so the mutant
  probe left no residue. One incidental bug caught while writing the
  round-trip: the second `SlamWindow` fixture initially reused the
  `slamWindowView()` helper, whose default `version: 3`
  (`test/support/harness.tsx:198`) is lower than the intervening
  `AwaitingDraw` view's explicit `version: 5` — ADR-0033's staleness guard
  silently discarded it, which masked the real assertion behind a
  version-guard artifact having nothing to do with clause 11. Fixed by
  building the second fixture with an explicit `version: 6`. Full gate
  re-run clean afterward: `@cambio/web` 204/204 fresh (`--force`),
  `pnpm turbo build typecheck lint test` 25/25.
  Both citing locations (this clause's text and the frontend plan's
  Contract coverage table row 11) are updated to name the new test title.

**Deferred, not a finding:** the root plan's Validation section's manual
two-browser walkthrough still hasn't been run (flagged at `/implement`
close-out, reconfirmed here) — the automated suite's fidelity (real
component tree, real DOM, via testing-library) covers the interaction/copy
logic that changed, but nothing replaces a live check. Left for whoever
picks up the fix cycle, or a follow-up manual pass before `/ship`.

**Harness issue, out of this task's scope:** `.agents/scripts/fill-coverage-row.mjs`
expects a 4-column Contract coverage table but `.agents/templates/child-plan.md`
currently produces 3 columns (already logged in Surprises at
`/implement` close-out). Not re-litigated here; carries forward as a
harness fix for a separate task.

**What should carry into the next task:** when a test's assertion could
pass for a reason OTHER than the behavior under test (here: an outer
visibility gate masking an inner state reset), that's worth catching at
`/implement` time, not `/review` time — the "does this test's failure mode
actually match the clause" question is cheap to ask before checking a
coverage-table row filled.
