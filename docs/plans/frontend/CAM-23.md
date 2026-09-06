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
creation-gate stop needed). Confirmed against the current tree (nothing
edited yet this session):

- `apps/web/src/containers/game/game-screen.tsx` — the `GameTable`
  component. Relevant anchors, verified at time of writing:
  - `slamPhase` derivation: line 332.
  - `phaseKey` computation and the render-time reset block for
    `selection`/`slamPendingGive`: lines 340-351. This is the
    frontend-architecture "derived state during render" pattern (no
    `useEffect`) — new interaction state joins this same block.
  - `handleSlamClick`: lines 353-376.
  - `seatNodes = view.players.map(...)`: starts line 440;
    `slamOnSlotClick` wiring: lines 458-461; the `Hand` JSX consuming
    `wiring.selectedSlots`: line 496.
  - `SlamTimer` render: lines 519-528.
  - The fallback give-pick prompt JSX (the literal string "Pick a card to
    give"): lines 529-536.
  - `handSlotWiring` (the function computing `selectedSlots` per seat from
    `selection`/`publicPeekSlot`, filtered by `playerId`): lines 173-213+.
- `apps/web/src/containers/game/use-game.ts`:
  - `COMMAND_ERROR_COPY` / `commandErrorCopy`: lines 90-104.
  - The `sendCommand` mutation (`useMutation`, plain TanStack Query):
    lines 612-637. `sendCommand.variables` holds the last-submitted
    `WireCommand` through `onError` — already available, unused today.
- `apps/web/src/containers/game/affordances.ts`:
  - `slamGiveSlotRequired`: lines 62-69.
  - `isOccupiedSlot`: lines 201-203 — currently unused outside its own
    test; this task is its first production call site.
- `apps/web/src/components/game/hand.tsx` — `selectedSlots` prop:
  lines 54-57. No changes to this file or its spec
  (`design-system/components/core/hand.md`).
- `apps/web/src/components/game/slam-timer.tsx` — no changes; cited only
  as the visual anchor the new control renders near.
- `packages/ui/src/components/button.tsx` /
  `design-system/components/core/button.md` — no changes. Variants:
  `primary`/`secondary`/`ghost`/`icon`/`danger`; the existing fallback
  prompt's "Cancel" button (game-screen.tsx:532-534) already uses
  `variant="ghost"` — the pattern this task's new control follows.
- `design-system/references/voice.md` — Buttons section: verb-first,
  sentence case, one primary action per surface (the primary here is
  still the slot tap itself; this control is a secondary/prep action, so
  `ghost` is the right variant, matching the existing Cancel button).
- `apps/api/src/config.ts:41`, `.env.example:41`,
  `apps/api/test/Config.test.ts` (existing assertion: `"slam window and
realtime URL take the documented defaults"`, asserting
  `slamWindowMs` is `5000`) — the one non-`apps/web` file group this
  side's plan of work touches, per the root plan's Decision Log (folded
  in rather than a separate backend child plan).

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

1. **Local interaction state (`game-screen.tsx`, `GameTable`).** Add two
   pieces of state alongside `slamPendingGive` (line 346):
   `slamReadyMode` (boolean, default `false`) and `slamArmedGive`
   (`SlotIndex | null`, default `null`). Both reset in the existing
   `phaseKey`-comparison block (340-351) exactly where
   `slamPendingGive` already resets — same block, same trigger (a
   transition away from `SlamWindow`), no new `useEffect`.

   Immediately after that reset block, add a second render-time check for
   clause 7 (staleness): if `slamArmedGive` is non-null and
   `!isOccupiedSlot(view, { playerId: viewerId, slotIndex: slamArmedGive })`,
   clear it (`setSlamArmedGive(null)`). This is the same
   "adjust state during render, guarded so it only fires when the
   condition is newly true" pattern as the `phaseKey` block just above it
   — not a copy of that block, a sibling one, because it's keyed on
   occupancy, not on phase identity. `isOccupiedSlot` (affordances.ts
   201-203) is an exact fit and already unit-tested for this shape.

   Hoist the `viewerHand` lookup (`view.players.find((player) => player.id
=== viewerId)?.hand ?? []`, currently computed inline inside
   `handleSlamClick` at line 368) to a `const` near the top of `GameTable`
   so both `handleSlamClick` and the new control's visibility check
   (step 2) can read it without duplicating the lookup.

2. **"Ready a give" control.** One new `Button` (`variant="ghost"`,
   matching the existing Cancel button's variant at line 532), rendered
   directly after the `SlamTimer` block (currently 519-528), gated on
   clause 3's condition (root plan, tightened at sign-off) —
   `slamPhase !== undefined && viewerHand.length > 0 && slamPendingGive ===
null` — hidden while the fallback sub-state already holds a pending
   target, so it never shows alongside the fallback's own prompt.

   Three label/action states, per clauses 3-5:
   - Unarmed, ready-mode off → label **"Ready a give"**, `onClick` turns
     `slamReadyMode` on.
   - Ready-mode on, nothing armed → label **"Cancel"** (reuses the exact
     word the existing fallback prompt's Cancel button already uses),
     `onClick` turns `slamReadyMode` off.
   - Something armed → label **"Cancel give"**, `onClick` clears
     `slamArmedGive`.

   These three strings are a copy proposal, not locked — they follow
   voice.md's verb-first/sentence-case buttons rule and reuse the
   existing "Cancel" word, but `/implement` should sanity-check them
   against voice.md rather than treat them as final (flagged per the
   planning brief).

3. **Targeting logic (`handleSlamClick`).** Extend in this order — each
   new branch slots in around the existing ones, none of which change
   their own bodies:

   1. `slamPendingGive !== null` (existing, unchanged — lines 354-361).
      This check stays first and unconditionally wins, which is what
      keeps step 2's control harmless even in the (contract-permitted,
      since clause 3 doesn't hide it) case where it's visible during an
      active fallback: an own-slot tap still resolves the pending give
      exactly as today, regardless of `slamReadyMode`/`slamArmedGive`.
   2. **New:** `slamReadyMode && ref.playerId === viewerId` → arm
      (clause 4): `setSlamArmedGive(ref.slotIndex)`,
      `setSlamReadyMode(false)`, send no command, return.
   3. `ref.playerId === viewerId` (existing own-slam, clause 1, unchanged
      — lines 363-367). Note: if this slot happens to be the currently
      armed one, this branch still fires the immediate own-slam
      unaffected — clause 1 does not gate on armed state. The now-vacated
      armed slot is cleaned up by step 1's staleness check on the next
      render, not by special-casing here (this is the "via case 1 firing
      on that same slot" example clause 7 names explicitly).
   4. Existing `slamGiveSlotRequired(...)` branch (lines 369-375), with
      one new branch inserted at its top:
      - **New:** required and `slamArmedGive !== null` → consume the arm
        (clause 8): `sendCommand.mutate({ _tag: "Slam", target: ref,
giveSlot: slamArmedGive })`, `setSlamArmedGive(null)`, return.
      - Existing: required and nothing armed → `setSlamPendingGive(ref)`
        (clause 9, unchanged) — **plus** `setSlamReadyMode(false)`. This
        second line is not defensive filler: it is the only place an
        opponent-slot tap can land while `slamReadyMode` is still `true`
        (ready-mode's own arm-check in 3.2 only intercepts taps on the
        viewer's own slots), so it is what keeps ready-mode and
        `slamPendingGive` mutually exclusive per clause 9's own text
        (tightened at sign-off to spell this transition out explicitly).
      - Existing: not required → immediate zero-card slam (clause 2,
        unchanged).

4. **Highlight wiring (`seatNodes.map`, around lines 440-496).** For the
   viewer's own seat only (`own === true`), pass `slamArmedGive` into that
   seat's `Hand` alongside the existing `wiring.selectedSlots`: something
   like `selectedSlots={own && slamArmedGive !== null ? [...wiring.selectedSlots,
slamArmedGive] : wiring.selectedSlots}` (advisory shape — the exact
   merge expression is `/implement`'s call). `wiring.selectedSlots` is
   already empty for the viewer's own seat during `SlamWindow` (it only
   ever holds power-targeting picks or a public-peek slot, both reset or
   inapplicable while a slam window is open), so no de-duplication logic
   is needed. No changes to `hand.tsx` or its design-system spec — this
   is exactly the reuse the root plan's Decision Log calls for.

5. **Copy (clause 10).** Replace the literal string "Pick a card to give"
   (game-screen.tsx:531) with "If you're right, which card do you give
   them?" — this string is given verbatim by the root plan's contract,
   not a proposal.

6. **Late-slam error remap (`use-game.ts`, clause 12).** Change
   `commandErrorCopy`'s signature from `(error: unknown)` to take the
   last-submitted command too — `sendCommand.variables` (already
   populated through `onError` per the TanStack Query mutation contract,
   confirmed unused elsewhere in the codebase) is the source, passed at
   the call site (line 635: `commandErrorCopy(error)` becomes
   `commandErrorCopy(error, sendCommand.variables)` or equivalent —
   advisory shape). Inside, when the decoded error tag is `WrongPhase`
   and the last command's `_tag` was `"Slam"`, return the same string
   `COMMAND_ERROR_COPY.SlamTooLate` already holds ("Too slow. The slam
   window had already closed.") instead of
   `COMMAND_ERROR_COPY.WrongPhase`. Every other tag combination — any
   other error tag, or `WrongPhase` on any non-`Slam` command — keeps
   today's lookup untouched.

7. **Config default (clause 13, the one non-`apps/web` file group).**
   Bump `5000` → `10000` in `apps/api/src/config.ts:41` and
   `.env.example:41`; update the existing assertion in
   `apps/api/test/Config.test.ts` ("slam window and realtime URL take the
   documented defaults") from `expect(result.right.slamWindowMs).toBe(5000)`
   to `toBe(10000)`. No other line in that test changes (the
   `realtimeUrl` assertion alongside it is untouched).

8. **Tests (`apps/web/test/game-screen.test.tsx`, `apps/api/test/Config.test.ts`).**
   No changes needed to `apps/web/test/affordances.test.ts` — its existing
   `slamGiveSlotRequired` and `isOccupiedSlot` describe blocks already
   cover both pure helpers this task reuses; this task adds no new pure
   helper functions. In `game-screen.test.tsx`'s `"slam window rendering +
targeting (SL1)"` describe block:
   - Rewrite `"slamming an opponent's card with a non-empty hand requires
a give pick, then sends exactly one Slam command"` for the new
     arm/fallback split and the new copy string — it currently asserts
     the literal old string and the exact two-command-free/one-command
     sequence; both need updating.
   - Leave `"clicking an own face-down card slams it immediately, sending
giveSlot null"` and `"a zero-card slammer's opponent slam sends
giveSlot null immediately — no give pick (ADR-0009)"` as regression
     coverage for clauses 1-2 — expected to pass unmodified.
   - Add new cases for: control visibility (shown/hidden per clause 3),
     arming plus the highlight (clauses 4 + 6 — can be one test), canceling
     from both ready-mode-unarmed and armed states (clause 5, likely two
     cases or one parameterized), staleness (clause 7 — armed slot vacated
     by the viewer's own case-1 slam on that same slot, then the control
     and highlight both auto-clear on the next render with no further
     user action), and consuming the arm for a true single-tap slam
     (clause 8 — arm, then one opponent tap, exactly one `Slam` command
     with `giveSlot` set to the armed index).
   - Add one lifecycle case (clause 11) confirming `slamReadyMode`/
     `slamArmedGive` reset on the same phase-transition batch the existing
     `"SlamWindowClosed + TurnAdvanced arrive as one batch..."` test
     already exercises for `selection`/`slamPendingGive` — either extend
     that test or add a sibling.
   - In the `"late slams and window close (SL3)"` describe block, add a
     case for clause 12: a `WrongPhase` 422 whose just-submitted command
     was `Slam` renders the `SlamTooLate` copy; and a regression case that
     a `WrongPhase` 422 on a non-`Slam` command (e.g. the existing
     `NotYourTurn`-on-`DrawCard` pattern at
     `"a 422 surfaces inline failure copy and refetches — never a
toast"`, adapted to the `WrongPhase` tag) still shows the generic
     "That move isn't available right now." copy.
   - Update `apps/api/test/Config.test.ts`'s existing assertion per step 7.

No sequencing dependency on other in-flight tickets (root plan Decision
Log) — proceed against the current, non-docked game-screen layout at every
width.

## Concrete steps & validation

- After steps 1-6: `pnpm turbo test --filter @cambio/web` — expect every
  test in the `"slam window rendering + targeting (SL1)"` and `"late
slams and window close (SL3)"` describe blocks green, including the
  rewritten fallback test and the newly added arm/cancel/highlight/
  staleness/consume/lifecycle/WrongPhase-remap cases; no unrelated
  `game-screen.test.tsx` or `hand`/`affordances` suite regressions.
- After step 7: `pnpm turbo test --filter @cambio/api` — `Config.test.ts`
  green with the `10000` default assertion.
- Final gate: `pnpm turbo build typecheck lint test` — must pass clean,
  bare (never piped, per AGENTS.md).
- Manual walkthrough (dev server, two browser sessions as different
  players in a 2+ player game, per the root plan's Validation section):
  pre-arm a give, confirm a single opponent tap fires the slam with no
  visible second-tap delay; confirm the un-armed fallback path still
  works end to end and shows the new prompt copy; confirm a late slam
  attempt (window already closed) shows "Too slow…" copy. Before this
  walkthrough, verify the dev server isn't serving stale transforms
  (AGENTS.md's "Distrust long-running dev servers" — fetch a
  recently-changed module through the running server and grep for a new
  symbol before trusting anything rendered).

## Contract coverage

_(plan-time: Clause + planned approach only. Test file, test name, and
assertion phrase are filled in by `/implement` as each test actually
lands — an invented test title here would be an overclaim.)_

| Clause                               | Test (file + name)                                                                                                                                                                                                    | What is asserted         |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1. Own-card slam, unaffected         | _Planned:_ regression — existing SL1 own-slam test stays green unmodified.                                                                                                                                            | _(filled by /implement)_ |
| 2. Zero-card slammer, unaffected     | _Planned:_ regression — existing SL1 zero-card test stays green unmodified.                                                                                                                                           | _(filled by /implement)_ |
| 3. "Ready a give" control visibility | _Planned:_ new SL1 case(s) — control renders when a `SlamWindow` is open and the viewer's hand is non-empty; absent with no window, an empty hand, or an already-active fallback pending target.                      | _(filled by /implement)_ |
| 4. Arming                            | _Planned:_ new SL1 case — from ready-mode, tapping an own occupied slot arms it, exits ready-mode, sends no command, and flips the control to its armed label.                                                        | _(filled by /implement)_ |
| 5. Canceling                         | _Planned:_ new SL1 case(s) — canceling from ready-mode-unarmed returns to the unarmed control with no command sent; canceling from armed un-arms with no command sent.                                                | _(filled by /implement)_ |
| 6. Armed-slot highlight              | _Planned:_ folded into the arming test (4) — asserts the armed slot renders with the same `selectedSlots` treatment `Hand` already uses for in-progress picks.                                                        | _(filled by /implement)_ |
| 7. Staleness                         | _Planned:_ new SL1 case — the armed slot is vacated (e.g. the viewer's own case-1 slam on that exact slot) and the control/highlight both auto-clear on the next render with no further user action.                  | _(filled by /implement)_ |
| 8. Consuming the arm                 | _Planned:_ new SL1 case — with a valid armed slot, one opponent tap sends exactly one `Slam` with `giveSlot` set to the armed index, and clears the armed state.                                                      | _(filled by /implement)_ |
| 9. Fallback, unaffected mechanically | _Planned:_ the rewritten two-tap SL1 test — same target-held/own-hand-clickable/one-`Slam` mechanics as today, new copy.                                                                                              | _(filled by /implement)_ |
| 10. Copy                             | _Planned:_ folded into the rewritten fallback test (9) — asserts the new string "If you're right, which card do you give them?" and the absence of the old "Pick a card to give" string.                              | _(filled by /implement)_ |
| 11. State lifecycle                  | _Planned:_ new or extended SL3 case, alongside the existing `SlamWindowClosed`+`TurnAdvanced` batch test — ready-mode/armed state resets on the same phase transition `selection`/`slamPendingGive` already reset on. | _(filled by /implement)_ |
| 12. Late-slam copy                   | _Planned:_ two new SL3 cases — a `WrongPhase` 422 on a just-sent `Slam` shows the `SlamTooLate` copy; a `WrongPhase` 422 on a non-`Slam` command still shows the generic copy (regression).                           | _(filled by /implement)_ |
| 13. Dev slam window default          | _Planned:_ the existing `apps/api/test/Config.test.ts` default-pinning assertion, updated to `10000`.                                                                                                                 | _(filled by /implement)_ |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [ ] 2026-09-06 — frontend child plan drafted, pending sign-off alongside
      the root plan.

## Surprises & notes for the root plan

_(anything the root plan's Decision Log or the reviewer must know)_
