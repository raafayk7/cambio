# CAM-23 — Opponent-slam give-pick flow — too slow for the window, copy misleads (frontend)

- **Root plan:** [root/CAM-23.md](../root/CAM-23.md) — the functional
  contract lives there; this document is implementation detail for one side.

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

Everything this task touches on the frontend side lives in
`apps/web/src/containers/game/` and `apps/web/src/containers/game/*.ts`
plus one backend config file folded into this side's Plan of Work per the
root plan's Decision Log (step 7 below). No `packages/ui` or
`design-system/` changes: the fix reuses the existing `Button` component
and `Hand`'s existing `selectedSlots` prop (root plan Decision Log — no
creation-gate stop needed). As built (line numbers below are post-implementation,
superseding the pre-implementation citations this plan carried at sign-off):

- `apps/web/src/containers/game/game-screen.tsx` — the `GameTable`
  component.
  - `slamPhase` derivation: line 337.
  - `phaseKey` computation and the render-time reset block for
    `selection`/`slamPendingGive`/`slamReadyMode`/`slamArmedGive`: lines
    345-366. This is the frontend-architecture "derived state during
    render" pattern (no `useEffect`).
  - The clause-7 staleness check (a sibling render-time check, keyed on
    `isOccupiedSlot` rather than `phaseKey`): lines 370-380.
  - `handleSlamClick`: lines 382-427.
  - `seatNodes = view.players.map(...)`: starts line 491; `slamOnSlotClick`
    wiring: lines 509-513; the `Hand` JSX consuming the merged
    `selectedSlots` (existing `wiring.selectedSlots` plus `slamArmedGive`
    for the viewer's own seat): lines 546-556.
  - `SlamTimer` render: lines 580-589.
  - The "Ready a give" control (three label/action states): lines 590-612.
  - The fallback give-pick prompt JSX (now "If you're right, which card do
    you give them?"): lines 613-622.
  - `handSlotWiring` (the function computing `selectedSlots` per seat from
    `selection`/`publicPeekSlot`, filtered by `playerId`, unchanged by this
    task): lines 173-213+.
- `apps/web/src/containers/game/use-game.ts`:
  - `SLAM_TOO_LATE_COPY` / `COMMAND_ERROR_COPY` / `commandErrorCopy`: lines
    88-122. `commandErrorCopy` now takes the failed command as a second
    parameter.
  - The `sendCommand` mutation (`useMutation`, plain TanStack Query): lines
    632-663. `onError`'s own second callback argument — not
    `sendCommand.variables` as this plan's step 6 sketch advised — supplies
    the failed command; see the root plan's Decision Log for why (both
    carry the same value here, but the callback argument needs no
    assumption about a newer overlapping mutation not having started).
- `apps/web/src/containers/game/affordances.ts` (unchanged by this task):
  - `slamGiveSlotRequired`: lines 62-69.
  - `isOccupiedSlot`: lines 201-203 — this task is its first production
    call site (from the staleness check above).
- `apps/web/src/components/game/hand.tsx` — `selectedSlots` prop:
  lines 54-57. No changes to this file or its spec
  (`design-system/components/core/hand.md`).
- `apps/web/src/components/game/slam-timer.tsx` — no changes; cited only
  as the visual anchor the new control renders near.
- `packages/ui/src/components/button.tsx` /
  `design-system/components/core/button.md` — no changes. Variants:
  `primary`/`secondary`/`ghost`/`icon`/`danger`; the existing fallback
  prompt's "Cancel" button (game-screen.tsx:618-620) already uses
  `variant="ghost"` — the pattern this task's new control follows.
- `design-system/references/voice.md` — Buttons section: verb-first,
  sentence case, one primary action per surface (the primary here is
  still the slot tap itself; this control is a secondary/prep action, so
  `ghost` is the right variant, matching the existing Cancel button).
- `apps/api/src/config.ts:43`, `.env.example:42`,
  `apps/api/test/Config.test.ts:90` (assertion `"slam window and realtime
URL take the documented defaults"`, now asserting `slamWindowMs` is
  `10000`) — the one
  non-`apps/web` file group this side's plan of work touches, per the root
  plan's Decision Log (folded in rather than a separate backend child
  plan).

Governing skills: `frontend-architecture` (containers own state, hooks
co-located, render-time derived state over `useEffect`, no
`domain`/`application` imports — this task adds no new imports across any
boundary) and `design-system` (branch check passed: `design-system/`
present on `release-v0`; no creation-gate stop needed since both the
`Button` variant and `Hand`'s `selectedSlots` are pre-existing canon).
`hidden-information` is not load-bearing here: no new payload field, no
new wire shape — the give-slot value is chosen locally and sent exactly
as blind as today (root plan's framing note).

## Plan of work

1. **Local interaction state (`game-screen.tsx`, `GameTable`).** ✅ As built:
   `slamReadyMode`/`slamArmedGive` declared at lines 358-359, alongside
   `slamPendingGive` (351), reset in the shared `phaseKey`-comparison block
   (345-366) — same block, same trigger (a transition away from
   `SlamWindow`), no new `useEffect`.

   The clause-7 staleness check landed as a sibling render-time check
   immediately after (lines 370-380): if `slamArmedGive` is non-null and
   `!isOccupiedSlot(view, { playerId: viewerId, slotIndex: slamArmedGive })`,
   it clears it. `isOccupiedSlot` (affordances.ts 201-203) was an exact fit,
   as planned.

   `viewerHand` was hoisted to a `const` (line 368) shared by
   `handleSlamClick` and the control's visibility check, as planned.

2. **"Ready a give" control.** ✅ As built (lines 590-612): one `Button`
   (`variant="ghost"`, matching the existing Cancel button's variant),
   rendered directly after the `SlamTimer` block, gated on clause 3's
   three conditions together (open window, non-empty hand, no pending
   fallback target) — hidden whenever any one of them fails, so it never
   shows alongside the fallback's own prompt.

Three label/action states, per clauses 3-5:

- Unarmed, ready-mode off → label **"Ready a give"**, `onClick` turns
  `slamReadyMode` on.
- Ready-mode on, nothing armed → label **"Cancel"** (reuses the exact
  word the existing fallback prompt's Cancel button already uses),
  `onClick` turns `slamReadyMode` off.
- Something armed → label **"Cancel give"**, `onClick` clears
  `slamArmedGive`.

✅ Shipped as proposed: all three strings follow voice.md's
verb-first/sentence-case buttons rule and reuse the existing "Cancel"
word; no further copy change made at implementation time.

3. **Targeting logic (`handleSlamClick`).** ✅ As built (lines 382-427), in
   this order:

   1. `slamPendingGive !== null` (existing, unchanged).
      This check stays first and unconditionally wins, which is what
      keeps step 2's control harmless even in the (contract-permitted,
      since clause 3 doesn't hide it) case where it's visible during an
      active fallback: an own-slot tap still resolves the pending give
      exactly as today, regardless of `slamReadyMode`/`slamArmedGive`.
   2. `slamReadyMode && ref.playerId === viewerId` → arm (clause 4):
      `setSlamArmedGive(ref.slotIndex)`, `setSlamReadyMode(false)`, send no
      command, return.
   3. `ref.playerId === viewerId` (existing own-slam, clause 1, unchanged).
      If this slot happens to be the currently armed one, this branch
      still fires the immediate own-slam
      unaffected — clause 1 does not gate on armed state. The now-vacated
      armed slot is cleaned up by step 1's staleness check on the next
      render, not by special-casing here (this is the "via case 1 firing
      on that same slot" example clause 7 names explicitly).
   4. Existing `slamGiveSlotRequired(...)` branch, with one new branch
      inserted at its top:
      - Required and `slamArmedGive !== null` → consume the arm (clause
        8): `sendCommand.mutate({ _tag: "Slam", target: ref, giveSlot:
slamArmedGive })`, `setSlamArmedGive(null)`, return.
      - Existing: required and nothing armed → `setSlamPendingGive(ref)`
        (clause 9, unchanged) — **plus** `setSlamReadyMode(false)`, which
        keeps ready-mode and `slamPendingGive` mutually exclusive per
        clause 9's own text (tightened at sign-off to spell this
        transition out explicitly).
      - Existing: not required → immediate zero-card slam (clause 2,
        unchanged).

4. **Highlight wiring (`seatNodes.map`, starting line 491).** ✅ As built
   (lines 546-556): for the viewer's own seat only (`own === true`),
   `slamArmedGive` is merged into that seat's `Hand`'s `selectedSlots`
   alongside the existing `wiring.selectedSlots`. `wiring.selectedSlots` is
   always empty for the viewer's own seat during `SlamWindow` (it only
   ever holds power-targeting picks or a public-peek slot, both reset or
   inapplicable while a slam window is open), so no de-duplication logic
   was needed. No changes to `hand.tsx` or its design-system spec — this
   is exactly the reuse the root plan's Decision Log calls for.

5. **Copy (clause 10).** ✅ As built (game-screen.tsx:616): the literal
   string "Pick a card to give" is replaced with "If you're right, which
   card do you give them?" — verbatim per the root plan's contract.

6. **Late-slam error remap (`use-game.ts`, clause 12).** ✅ As built (lines
   88-122, 651-660), with one tactical deviation from this step's sketch
   (logged in the root plan's Decision Log): `commandErrorCopy` takes the
   failed command as a second parameter, but the call site supplies it
   from `onError`'s own second callback argument
   (`onError: (error, command) => ...`) rather than reading
   `sendCommand.variables` back off the mutation object — both carry the
   same value here, but the callback argument is guaranteed correct
   per-invocation with no dependence on `sendCommand` not having started a
   newer overlapping mutation before this `onError` fires. The remap
   itself is exactly as planned: `WrongPhase` on a just-sent `Slam`
   returns the same `SLAM_TOO_LATE_COPY` string `SlamTooLate` already
   renders ("Too slow. The slam window had already closed."); every other
   tag combination keeps the prior lookup untouched.

7. **Config default (clause 13, the one non-`apps/web` file group).** ✅ As
   built: `5000` → `10000` in `apps/api/src/config.ts:43` and
   `.env.example:42`; the existing assertion in
   `apps/api/test/Config.test.ts` ("slam window and realtime URL take the
   documented defaults") now reads
   `expect(result.right.slamWindowMs).toBe(10000)`. No other line in that
   test changed (the `realtimeUrl` assertion alongside it is untouched).

8. **Tests (`apps/web/test/game-screen.test.tsx`, `apps/api/test/Config.test.ts`).**
   ✅ As built — see the Contract coverage table below for the exact test
   names landed for each clause. `apps/web/test/affordances.test.ts` needed
   no changes, as planned (both pure helpers this task reuses were already
   covered). The existing two-tap test was renamed and rewritten for the
   fallback-only path and the new copy; the two existing own-slam/zero-card
   tests needed no changes (clauses 1-2 regression coverage, confirmed
   green unmodified); ten new cases were added across the SL1 and SL3
   describe blocks for clauses 3-8 and 11-12.

No sequencing dependency on other in-flight tickets (root plan Decision
Log) — proceed against the current, non-docked game-screen layout at every
width.

## Concrete steps & validation

- ✅ `pnpm turbo test --filter @cambio/web` — `test/game-screen.test.tsx`
  59/59 green (including the rewritten fallback test and all ten new
  cases), 204/204 across the whole package, no regressions.
- ✅ `pnpm turbo test --filter @cambio/api` — `Config.test.ts` green with
  the `10000` default assertion, 118/118 across the whole package.
- ✅ Final gate: `pnpm turbo build typecheck lint test` — 25/25 tasks
  passed clean, run bare (never piped, per AGENTS.md).
- Manual walkthrough (dev server, two browser sessions as different
  players in a 2+ player game, per the root plan's Validation section) —
  **not yet run this session**; left for `/review` or a follow-up manual
  pass. Before it: verify the dev server isn't serving stale transforms
  (AGENTS.md's "Distrust long-running dev servers" — fetch a
  recently-changed module through the running server and grep for a new
  symbol before trusting anything rendered).

## Contract coverage

_(plan-time: Clause + planned approach only. Test file, test name, and
assertion phrase are filled in by `/implement` as each test actually
lands — an invented test title here would be an overclaim.)_

| Clause                               | Planned approach (plan-time)                                                                                                                                                                               | Test (file + name)                                                                                                                                                                                                                                                                              | What is asserted                                                                                                                                                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Own-card slam, unaffected         | Regression — existing SL1 own-slam test stays green unmodified.                                                                                                                                            | game-screen.test.tsx > "clicking an own face-down card slams it immediately, sending giveSlot null"                                                                                                                                                                                             | an own-slot tap posts exactly one Slam{target, giveSlot:null} immediately, unaffected by any ready-mode/armed state                                                                                                              |
| 2. Zero-card slammer, unaffected     | Regression — existing SL1 zero-card test stays green unmodified.                                                                                                                                           | game-screen.test.tsx > "a zero-card slammer's opponent slam sends giveSlot null immediately — no give pick, no 'Ready a give' control (ADR-0009)"                                                                                                                                               | an opponent-slot tap posts Slam{target, giveSlot:null} immediately with an empty hand, and the 'Ready a give' control never renders                                                                                              |
| 3. "Ready a give" control visibility | New SL1 case(s) — control renders when a `SlamWindow` is open and the viewer's hand is non-empty; absent with no window, an empty hand, or an already-active fallback pending target.                      | game-screen.test.tsx > "(CAM-23) the 'Ready a give' control appears during an open slam window when the viewer holds cards" / "...is absent outside a slam window" / "...hides once the two-tap fallback already holds a pending target"; plus the zero-card test above for the empty-hand case | the control renders exactly when a SlamWindow is open, the viewer holds cards, and no fallback target is pending — absent in all three named negative cases                                                                      |
| 4. Arming                            | New SL1 case — from ready-mode, tapping an own occupied slot arms it, exits ready-mode, sends no command, and flips the control to its armed label.                                                        | game-screen.test.tsx > "(CAM-23) arming a give-slot sends no command, highlights the slot, and offers a way to cancel the arm"                                                                                                                                                                  | after Ready a give then an own-slot tap: no command posted, the slot carries data-selected=true, and the control now reads Cancel give                                                                                           |
| 5. Canceling                         | New SL1 case(s) — canceling from ready-mode-unarmed returns to the unarmed control with no command sent; canceling from armed un-arms with no command sent.                                                | game-screen.test.tsx > "(CAM-23) canceling from ready-mode before anything is armed sends no command and returns to 'Ready a give'" / "(CAM-23) canceling an armed give-slot un-arms it, sending no command"                                                                                    | neither cancel path posts a command; both return the control to its unarmed 'Ready a give' label, and the un-arm case also clears the selected highlight                                                                         |
| 6. Armed-slot highlight              | Folded into the arming test (4) — asserts the armed slot renders with the same `selectedSlots` treatment `Hand` already uses for in-progress picks.                                                        | game-screen.test.tsx > "(CAM-23) arming a give-slot sends no command, highlights the slot, and offers a way to cancel the arm" (same test as clause 4)                                                                                                                                          | the armed slot's flight anchor contains an element with data-selected=true                                                                                                                                                       |
| 7. Staleness                         | New SL1 case — the armed slot is vacated (e.g. the viewer's own case-1 slam on that exact slot) and the control/highlight both auto-clear on the next render with no further user action.                  | game-screen.test.tsx > "(CAM-23) an armed give-slot clears automatically if it's slammed away (by the viewer's own case-1 slam) before it's spent"                                                                                                                                              | once the own-card slam response vacates the armed slot, the Cancel give control disappears and Ready a give reappears with no further click                                                                                      |
| 8. Consuming the arm                 | New SL1 case — with a valid armed slot, one opponent tap sends exactly one `Slam` with `giveSlot` set to the armed index, and clears the armed state.                                                      | game-screen.test.tsx > "(CAM-23) a valid armed give-slot is consumed by a single opponent tap — one Slam command, no fallback prompt"                                                                                                                                                           | exactly one Slam{target, giveSlot: armedIndex} is posted after a single opponent tap, and the fallback prompt never appears                                                                                                      |
| 9. Fallback, unaffected mechanically | The rewritten two-tap SL1 test — same target-held/own-hand-clickable/one-`Slam` mechanics as today, new copy.                                                                                              | game-screen.test.tsx > "(CAM-23 fallback) slamming an opponent's card with nothing armed holds the target, then one own-hand tap sends exactly one Slam command"                                                                                                                                | no command posts on the first (opponent) tap; the target is held pending; the second (own-hand) tap posts exactly one Slam{target, giveSlot: pickedSlot}                                                                         |
| 10. Copy                             | Folded into the rewritten fallback test (9) — asserts the new string "If you're right, which card do you give them?" and the absence of the old "Pick a card to give" string.                              | game-screen.test.tsx > same test as clause 9, plus the zero-card test (row 2) for the negative case                                                                                                                                                                                             | the fallback prompt reads exactly "If you're right, which card do you give them?" while pending, and is absent once resolved or when no fallback is active                                                                       |
| 11. State lifecycle                  | New or extended SL3 case, alongside the existing `SlamWindowClosed`+`TurnAdvanced` batch test — ready-mode/armed state resets on the same phase transition `selection`/`slamPendingGive` already reset on. | game-screen.test.tsx > "(CAM-23) ready-mode and an armed give-slot reset the moment the acting phase moves on from SlamWindow, and don't leak into the next one"                                                                                                                                | the controls hide when the window closes AND (the round-trip added in the fix cycle) reappear unarmed 'Ready a give' — not 'Cancel give' — once a genuinely new SlamWindow opens later, which a leaked-arm regression would fail |
| 12. Late-slam copy                   | Two new SL3 cases — a `WrongPhase` 422 on a just-sent `Slam` shows the `SlamTooLate` copy; a `WrongPhase` 422 on a non-`Slam` command still shows the generic copy (regression).                           | game-screen.test.tsx > "(CAM-23) a 422 WrongPhase on a just-sent Slam surfaces the SlamTooLate copy — the server's timer fiber already won the race" / "(CAM-23) a 422 WrongPhase on a non-Slam command still shows the generic copy — the remap is Slam-specific"                              | a WrongPhase 422 after a Slam renders "Too slow. The slam window had already closed."; a WrongPhase 422 after DrawFromDeck still renders "That move isn't available right now."                                                  |
| 13. Dev slam window default          | The existing `apps/api/test/Config.test.ts` default-pinning assertion, updated to `10000`.                                                                                                                 | apps/api/test/Config.test.ts > "slam window and realtime URL take the documented defaults"                                                                                                                                                                                                      | result.right.slamWindowMs equals 10000                                                                                                                                                                                           |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [x] 2026-09-06 — frontend child plan drafted, signed off alongside the
      root plan.
- [x] 2026-09-06 08:20 — all 8 steps implemented, gate green
      (`pnpm turbo build typecheck lint test`, 25/25), Contract coverage
      table filled for all 13 clauses via `fill-coverage-row.mjs` (after
      restructuring the table to the 4-column shape the script expects —
      see Surprises), Context & orientation / Plan of work line citations
      reconciled with as-built code.
- [x] 2026-09-06 08:35 — `/review` verdict: fix-then-ship. 12/13 clauses
      confirmed with real, mechanism-verified tests by an independent
      contract reviewer; architecture review clean on all six checks. One
      finding: row 11's cited test doesn't discriminate the reset it
      claims to cover (an outer visibility gate masks the same result) —
      code is correct, test needs strengthening. Full detail and the
      recommended fix are in the root plan's Outcomes & Retrospective;
      this row's cells stay as-is until the fix cycle lands a stronger
      test.
- [x] 2026-09-06 08:45 — fix cycle: row 11's test strengthened with a real
      phase round-trip (renamed "...and don't leak into the next one"),
      verified by an actual mutant kill (deleted the reset lines, confirmed
      failure, restored, confirmed pass and a byte-identical
      `game-screen.tsx`). Row 11's Test/Asserted cells updated via
      `fill-coverage-row.mjs` to name the real test and what it now proves.
      Fresh gate re-run clean: `@cambio/web` 204/204 (`--force`),
      `pnpm turbo build typecheck lint test` 25/25. See the root plan's
      Outcomes & Retrospective for the full account, including an
      incidental version-guard bug the round-trip's own fixture needed
      fixing along the way.

## Surprises & notes for the root plan

_(anything the root plan's Decision Log or the reviewer must know)_

- See the root plan's own Surprises entry: `fill-coverage-row.mjs` expects
  a 4-column Contract coverage table, but `.agents/templates/child-plan.md`
  currently produces 3 columns — this plan's table was restructured to
  4 columns at close-out to make the fill script usable. Future child
  plans following the current template will hit the same mismatch until
  the harness fixes one side or the other.
- The manual two-browser walkthrough (root plan Validation) wasn't run
  this session — flagged in the root plan's Surprises for `/review`.
