# CAM-31 — Deck mechanics: no initial face-up discard + eager reshuffle (frontend)

- **Root plan:** [root/CAM-31.md](../root/CAM-31.md) — the functional
  contract lives there; this document is implementation detail for one side.

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

This side owns root-plan clauses **13–16** (milestone **M5**) plus the
frontend share of **M6** (rendered walkthrough + gate). Governing skills:
`frontend-architecture` (projection renderer; logic in custom hooks;
`apps/web` imports only `@cambio/contracts` and `@cambio/ui`),
`design-system` (canon lives in `design-system/` on this release branch and
outranks all tooling; the creation gate applies to every canonical change),
`hidden-information` (nothing here touches entitlement — verified below).
Governing ADRs: 0039/0040 (the two rule/mechanism changes), 0033
(broadcasts are animation triggers only; the refetched view is the sole
state authority), 0034 (hand-rolled FLIP flight layer), 0027 (every visual
value maps to a token), 0030 (component tests on jsdom +
@testing-library/react).

**Dependency:** M5 starts after root-plan **M2** freezes contracts. In
practice the only contracts change is the removed `GameStarted.firstDiscard`
field, which has **zero production readers** in `apps/web` and
`packages/ui` — the only client decoder that touches `GameStarted` at all
is `apps/web/src/containers/room/use-room.ts:168-174` (tag check +
navigate, no field access) — so no client code breaks when the field goes;
the web work can proceed the moment M2 lands.

Current state of everything this side touches (all line refs verified
2026-09-08 on `release-v0`; re-verify before editing — backend milestones
may land first, and `src/` anchors rot):

> **Superseded by implementation (close-out note):** every line number
> below is a pre-diff (`release-v0`) snapshot, kept as planning history —
> M5 touched `affordances.ts`, `use-game.ts`, `draw-deck.tsx`, and
> `gallery/game.tsx`, so these offsets no longer match the as-built files.
> For current locations, read the coverage table below or the files
> themselves; do not navigate by these numbers.

- **Affordance mirror** — `apps/web/src/containers/game/affordances.ts`.
  The `AwaitingDraw` holder branch (:150-156): `takeDiscard` (:152-153) is
  already undefined-safe over an empty `view.discard` (correct for game
  start, no change); `drawFromDeck` (:154) is the lazy-era disjunction
  `view.deckCount > 0 || view.discard.length > 1` — ADR-0040's consequence
  says it simplifies to `deckCount > 0` (the "tap the empty deck to
  reshuffle" affordance disappears; interview decision, root Decision Log).
  The old formula is repeated verbatim in the `DrawDeck` prop doc
  (`apps/web/src/components/game/draw-deck.tsx`) and in canon
  (`design-system/components/core/draw-deck.md`, Rules — the
  click-affordance line).
- **Empty discard rendering** — already exists and is correct:
  `apps/web/src/components/game/discard-pile.tsx:51-60` renders
  `data-state="empty"` as the dashed outline **with**
  `data-flight-anchor="discard"` retained (pinned by
  `apps/web/test/discard-pile.test.tsx` "exposes the pile's flight anchor
  in every state, including empty"). The container is already
  undefined-safe: `game-screen.tsx:487-488` (`discardTop = view.discard[0]`)
  and :728-738 (conditional `top` prop). **No structural change** for
  game-start-empty — only affordances, tests, and canon copy.
- **DeckReshuffled today** —
  `apps/web/src/containers/game/use-game.ts` enqueues one
  representative discard→deck flight (comment :655-659 carries the ADR-0033
  rationale). Batch flow: every broadcast runs `handleRoomEvent` then
  `scheduleRefetch` (:714-718); the refetch is a trailing 100ms debounce
  (:222-228, `REFETCH_DEBOUNCE_MS` at :42). There is **no event queue**:
  flights play concurrently (`flight-layer.tsx:74-77` — `enqueue` just
  appends; :293-306 renders all active specs simultaneously; each `Flight`
  settles by clock at 680ms = `FLIGHT_TRACK_MS * 2`, :228-233, or by
  `transitionend`). The only sequencing machinery in the hook is the
  slam-reveal gate — `revealActiveRef` / `pendingAfterRevealRef`
  (:349-357) and `runAfterReveal` (:402-426) — used by SlamSucceeded,
  SlamFailed, PenaltyDrawn, CardGivenFromHand, CardGivenFromDeck, and
  DrawSkipped. `DeckReshuffled` and `CardDrawn` do **not** go through it.
- **Deck choreography states** — `game-screen.tsx:493-497` derives
  `drawing` / `reshuffling` / `receiving` from `flights.active`; :714-720
  makes `reshuffling` beat `drawing` on `DrawDeck.state`. Under eager
  timing with concurrent flights this precedence would swallow the draw
  beat whenever both are active; sequencing (step 4) makes them mutually
  exclusive in time, which is what fixes it — verify, expect no code
  change there.
- **The latent empty-branch bug, now the guaranteed path** —
  `draw-deck.tsx`: the `count === 0` branch (the empty branch) renders the
  dashed outline with **no** motion class; `animate-pulse-soft` rides only
  the populated branch (:73-76). During a re-arm reshuffle
  (discard-landing trigger, ADR-0040 case 2) the snapshot still says
  `deckCount: 0` when the flight starts (broadcasts never write the
  snapshot, ADR-0033), so `state="reshuffling"` renders a static dashed
  box. In scope per interview (root Decision Log): the fix reuses the
  existing token-declared animation (`--animate-pulse-soft`,
  `packages/ui/src/styles.css` — no new token, no creation-gate crossing
  for values) and r-bumps canon (authorized by the same Decision Log
  entry): `design-system/components/core/draw-deck.md` (its
  `empty→reshuffling` state text and the affordance-formula Rules line)
  and `design-system/components/core/discard-pile.md` (its `empty` state
  reads "a zero-card keep took the last card" — under ADR-0039 it is now
  also every game's opening state).
- **Stale surfaces (clause 16)** — gallery label
  `apps/web/src/components/gallery/game.tsx` "deck empty (reshuffle
  imminent)" (wrong under eager: a visible resting empty deck means
  nothing is reshufflable); stale comment `use-game.ts` (claims
  reshuffle tags fall through to `default` — the `DeckReshuffled` case
  has existed since CAM-18's CH2); stale test fixture
  `apps/web/test/room-screen.test.tsx` `gameStartedPayload()` includes
  `firstDiscard: "KH"` (excess props are ignored by
  `Schema.decodeUnknownEither`, so it won't fail — it just pins a field
  the wire no longer has).
- **Hidden information** — nothing in this side changes what reaches any
  client. The reshuffle flight spec stays value-free (`face: "down"`,
  built from anchor constants, no payload card fields), the gate reorders
  choreography only, and no contracts field is added. The one wire change
  (removed `firstDiscard`) shrinks the payload.

## Plan of work

Ordered so each step leaves `@cambio/web` compiling and green. Steps 1–4
are M5; step 5 is this side's M6 share. Code sketches are advisory
(template rule); the coverage table and this file layout are what
close-out reconciles.

### Step 1 — Opening-state affordances (clause 13)

Tests first (ADR-0030 suites; run via
`pnpm turbo test --filter @cambio/web`):

- `apps/web/test/affordances.test.ts` — the test "holder: Draw stays
  enabled with an empty deck if the discard has more than its top
  (reshuffle fuel)" now pins a view unreachable under ADR-0040's resting
  invariant (deck empty ⟹ discard ≤ 1). Replace it with the opening
  state: `deckCount: 44, discard: []`, AwaitingDraw holder →
  `takeDiscard: false`, `drawFromDeck: true`, `callCambio: true`. Keep
  "holder: Draw is disabled with an empty deck and a single-card discard
  pile" — that state remains reachable (deck exhausted, nothing
  reshufflable; root clause 10) and now pins the simplified predicate's
  false branch.
- `apps/web/test/game-screen.test.tsx` — add a game-start fixture beside
  `twoPlayerView` (which stays for mid-game cases): empty `discard: []`,
  `deckCount: 44` (52 − 4·2). Integration case: the discard renders its
  dashed empty state (`data-state="empty"` on the discard anchor), no
  "Take the top discard" button exists, the "Draw a card" button does,
  and the Call Cambio affordance is present. The existing ADR-0012 pin
  ("renders no slam timer outside the SlamWindow phase (ADR-0012, empty
  discard pile)") already covers no-window-over-empty; don't duplicate
  it.

Then the change: `affordances.ts` becomes `view.deckCount > 0`, and
the surrounding comment sheds the lazy-era rationale. Update the repeated
formula in the `DrawDeck` prop doc (`draw-deck.tsx:41-44`) in the same
commit (comment-only; the canonical Rules line updates in step 3's
r-bump).

### Step 2 — Stale-surface sweep (clause 16)

- `apps/web/test/room-screen.test.tsx` — drop `firstDiscard: "KH"` from
  `gameStartedPayload()` so the fixture matches the frozen wire shape.
- `use-game.ts` — rewrite the CH1 comment: reshuffle no longer
  falls through to `default` (and after step 4, point it at the
  sequencing gate instead).
- `apps/web/src/components/gallery/game.tsx` — relabel the
  `count={0}` state card; under eager, a resting empty deck means nothing
  is reshufflable (e.g. "deck empty (nothing left to reshuffle)").

### Step 3 — Empty-branch reshuffle motion + canon r-bumps (clause 15)

Canon first — the r-bumps are pre-authorized through the creation gate by
the root plan's Decision Log entry (2026-09-08, "empty-branch fix and
canon r-bumps are in scope"); do not re-ask, do cite it in the Revisions
entries:

- `design-system/components/core/draw-deck.md` → r5: (a) the
  `empty→reshuffling` state text — eager reshuffle (ADR-0040) means the
  deck never rests visibly empty while anything is reshufflable; the
  `reshuffling` choreography renders visible motion at **any** count,
  including over the empty dashed outline (the r2 "occupancy-independent"
  claim, made true); (b) the Rules click-affordance line — the mirror is
  now `deckCount > 0` (the tap-the-empty-deck affordance is gone).
- `design-system/components/core/discard-pile.md` → r3: the `empty`
  state is now also the opening state of every game (ADR-0039 — a
  first-run experience, not an edge case), still "nothing to act on",
  never "loading".

Then the component, test first:

- `apps/web/test/draw-deck.test.tsx` — extend the choreography coverage
  (beside "renders the draw/reshuffling choreography states on
  data-state, independent of populated/low/empty"): at `count={0}` with
  `state="reshuffling"`, `data-state` is "reshuffling" **and** the dashed
  outline carries the motion treatment (the pulse class — a class
  assertion is how jsdom can see motion presence, same trade the
  populated branch implicitly accepts).
- `draw-deck.tsx` — apply the same
  `(state === "draw" || state === "reshuffling") && "animate-pulse-soft"`
  treatment to the empty branch (the empty branch) that the populated branch
  already has (:73-76). Reuse only; no new tokens, no arbitrary values
  (ADR-0027).
- Optionally add a gallery state card for empty + `reshuffling` so the
  rendered walkthrough and design tooling can see the fixed state.

### Step 4 — The reshuffle sequencing gate (clause 14)

Interview decision (root Decision Log): the `DeckReshuffled` flight is
**sequenced after its causing flight** via a deferral gate copying the
existing `runAfterReveal` pattern (`use-game.ts`) — a second
instance of the same mechanism class, in `use-game.ts` beside it, not a
new event-queue abstraction. Server batch ordering (root clauses 6–9):
the causing event always precedes `DeckReshuffled` in its batch.

Advisory shape (the constraints are binding; the exact code is not):

- A cause latch beside the reveal gate: the id of the most recent
  **reshuffle-capable** flight enqueued, plus a pending-thunk slot, plus
  a `runAfterCausingFlight(thunk)` that runs immediately when no cause is
  in flight. Reshuffle-capable enqueues arm the latch and release it from
  their spec's `onDone` — which `useFlights` fires on **every** outcome,
  completed or cancelled (`flight-layer.tsx:59-72`), so jsdom's
  synchronous degenerate-rect cancellation, a missing anchor, and unmount
  `cancelAll` can never wedge the gate (liveness is structural).
- Reshuffle-capable flights, one per causing-event class the root plan
  names: the `CardDrawn` deck→held flight (clause 6); the `PenaltyDrawn`
  and `CardGivenFromDeck` deck→slot flights (clauses 7–8 — already
  routed through `runAfterReveal`, :570-583 and :599-611); every
  *→discard landing (`HeldDiscarded` / `PowerDiscarded` / `HeldSwapped`'s
  second flight, :461-492, and `SlamSucceeded`'s slot→discard flight,
  :543-560) for the re-arm case (clause 9).
- The `DeckReshuffled` handler wraps its existing enqueue as
  `runAfterReveal(() => runAfterCausingFlight(enqueue))`. Composing with
  the reveal gate is what makes the slam batches order correctly: the
  causing thunk (penalty/give/slam flight) was pushed onto
  `pendingAfterRevealRef` **first**, so when the reveal clears it enqueues
  and arms the cause latch before the reshuffle thunk consults it.
- No cause armed (undecoded causing event, resubscribe, reshuffle-only
  batch) → run immediately; the degraded mode is exactly today's
  concurrent behavior, never a hang.
- `SlamWindowClosed` (:630-642) clears the cause latch and its pending
  slot alongside the reveal queue, so nothing dangles into the next
  phase.
- ADR-0033 discipline unchanged: `scheduleRefetch` stays unconditional at
  the subscription site; the gate reorders choreography only; the
  reshuffle spec still references no snapshot state and stays
  `face: "down"`.
- Verify the `DrawDeck` state derivation (`game-screen.tsx:493-497`,
  :714-720): with sequencing, `drawing` and `reshuffling` are no longer
  simultaneously true from one batch, so the reshuffling-wins precedence
  stops swallowing the draw beat — expect no code change; note the
  verification in Progress.

Tests — read the CH2 block comment in `game-screen.test.tsx` ("reshuffle
choreography (CH2)" describe) before writing any of these: with the
default `measure`, jsdom's degenerate `getBoundingClientRect` cancels
every flight synchronously, so deferral has a zero-length window there.

- Sequencing order (the clause-14 pin): a focused game-screen (or
  hook-level) test that stubs `Element.prototype.getBoundingClientRect`
  to non-degenerate rects and uses fake timers — emit `CardDrawn` +
  `DeckReshuffled` in one `act` batch; only the draw flight is active
  (deck `data-state="draw"`); advance past the settle clock (2 ×
  `FLIGHT_TRACK_MS`); the reshuffle flight becomes active
  (`data-state="reshuffling"`).
- Liveness under auto-cancel: with the default measure (flights cancel
  synchronously), the same batch still resolves — the reshuffle
  choreography is enqueued (gate flushed by the cancelled cause) and the
  screen ends at the refetched state.
- Existing pins stay green untouched: "keeps the discard top visibly
  unchanged through a DeckReshuffled broadcast, updating the deck only
  once the refetch lands" (a reshuffle-only emit — no cause armed, so the
  gate is pass-through) and "fires exactly one refetch for a burst of
  several events in one batch" (the gate never touches the refetch path).
- `apps/web/test/flight-layer.test.tsx` currently has **no**
  multi-concurrent-flight test; add one (two active specs render
  simultaneously and settle independently) only if the gate's
  implementation comes to depend on that behavior — otherwise leave the
  layer's contract alone.

### Step 5 — M6 share: rendered walkthrough + gate

After backend M6's dev-data wipe, against a **fresh** dev server —
AGENTS.md staleness law first: curl a changed module through Vite (e.g.
`curl http://localhost:3000/@fs/<abs-path>/apps/web/src/components/game/draw-deck.tsx`
piped through a grep for a symbol added this task) and restart the server
if the grep comes back empty.

Walkthrough (root acceptance criteria):

1. Fresh game: the discard renders the dashed empty state; Draw and Call
   Cambio are the only affordances; no Take button, no slam timer.
2. Play until the deck runs out: the draw flight lands, **then** the
   reshuffle flight (discard→deck) plays — in sequence, with visible
   motion on the deck through both, including the empty-branch pulse when
   the snapshot still shows zero.
3. Confirm the retained discard top visibly stays put through the
   reshuffle.

Then the full gate, bare (never piped): `pnpm turbo build typecheck lint test`.

## Concrete steps & validation

Per checkpoint (steps 1–4), run through turbo so workspace deps build
first — the bare package script runs vitest against stale dist:

```
pnpm turbo test --filter @cambio/web
```

Success signal: the full web suite green, including the replaced
affordance case, the new game-start integration case (step 1), the
extended draw-deck choreography case (step 3), and the sequencing +
liveness cases (step 4) — `/implement` records exact names in the
coverage table as they land. While iterating on a single suite after a
build, bare `vitest run <file>` is fine.

Final gate (step 5, repo root, bare — the pipe ban is mechanically
enforced):

```
pnpm turbo build typecheck lint test
```

## Contract coverage

_(maintained by `/implement`, verified by `/review`: one row per root-plan
contract clause this side owns — the test that pins it, or why none can.
Each row must also say **what is asserted**, in one phrase. **At plan
time, fill only the Clause column plus a planned-approach note**; test
file, name, and assertion phrase are written by `/implement` when the test
actually lands.)_

Clauses 1–12 are backend-owned; their client-observable edges land inside
the rows below (clause 3's removed wire field → the row-16 fixture sweep;
clauses 6–9's causing-event-before-reshuffle batch order → the row-14
gate's ordering assumption).

| Clause                                                                                                                                                                                                                                                                                                                                                          | Test (file + name)                                                                                                                                                                                                                                                                                                                                                                                                                | What is asserted                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13 — planned: pure affordance case (opening state: take off, draw on, call on) replacing the unreachable "reshuffle fuel" pin, plus a game-start integration render (empty dashed discard, Draw present, no Take)                                                                                                                                               | apps/web/test/affordances.test.ts "holder: opening state — empty discard, Take off, Draw on, Call on (ADR-0039)"; apps/web/test/game-screen.test.tsx "game start (ADR-0039): empty discard, Draw present, no Take, Call Cambio present"                                                                                                                                                                                           | pure affordance mapping for the opening state; integration render shows the dashed empty discard, Draw present, no Take button, Call Cambio present                                                                     |
| 14 — planned: sequencing pin with stubbed non-degenerate rects + fake timers (draw flight active first, reshuffle flight only after its settle), plus a liveness case under jsdom auto-cancel; existing CH2 retained-top and one-refetch-per-batch pins stay green                                                                                              | apps/web/test/game-screen.test.tsx describe "reshuffle sequencing gate (C14, ADR-0040)": "defers the reshuffle flight behind its causing discard-landing flight — never simultaneously active" and "is live under jsdom's default auto-cancelling measure — the batch still resolves to the refetched state"; existing CH2 "keeps the discard top visibly unchanged..." and "fires exactly one refetch..." stayed green unchanged | with non-degenerate rects, the deck shows neither draw nor reshuffling until the causing flight settles, then reshuffling; with the default degenerate measure the batch still resolves to the refetched view (no hang) |
| 15 — planned: draw-deck component case — `count 0` + `state="reshuffling"` renders the reshuffling data-state **and** the motion treatment on the dashed outline; canon r-bumps (draw-deck.md r5, discard-pile.md r3) reconciled at review, not test-pinned                                                                                                     | apps/web/test/draw-deck.test.tsx "shows reshuffle motion over the empty dashed outline too (ADR-0040: the eager reshuffle re-arms a visibly empty deck)"                                                                                                                                                                                                                                                                          | count=0 + state=reshuffling                                                                                                                                                                                             | draw renders the dashed outline with animate-pulse-soft; count=0 with no state renders it without the class |
| 16 — planned: fixture/comment/label sweep — `gameStartedPayload()` sheds `firstDiscard`, the use-game CH1 comment stops claiming reshuffle falls through, the gallery empty-deck label stops promising an imminent reshuffle; pinned by the suite staying green against the frozen wire shape (no dedicated test — comment and label changes aren't assertable) | apps/web/test/room-screen.test.tsx gameStartedPayload() (no dedicated test — the fixture sheds firstDiscard and the suite stays green against the frozen wire shape); apps/web/src/components/gallery/game.tsx label sweep; apps/web/src/containers/game/use-game.ts CH1 comment rewrite                                                                                                                                          | no assertable pin for comment/label prose — the fixture change is proven by the suite staying green with no firstDiscard reference anywhere in apps/web                                                                 |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [x] 2026-09-08 — frontend child plan drafted (planning phase; no
      implementation yet)
- [x] 2026-09-08 15:20 — M5 steps 1-4 implemented. Step 1: `affordances.ts`
      simplified to `deckCount > 0`; `affordances.test.ts`'s unreachable
      "reshuffle fuel" case replaced with the opening-state pin;
      `game-screen.test.tsx` gained the game-start integration case.
      Step 2: `room-screen.test.tsx`'s `gameStartedPayload()` shed
      `firstDiscard`; `use-game.ts`'s CH1 comment rewritten (now describes
      the cause-latch composition, not a stale "falls through to default"
      claim); the gallery's `count={0}` label relabeled and a new
      empty+reshuffling state card added. Step 3: canon r-bumps landed
      first (`draw-deck.md` r5, `discard-pile.md` r3, both citing the root
      plan's pre-authorization); `draw-deck.tsx`'s empty branch gained the
      same `animate-pulse-soft` treatment the populated branch already
      had; `draw-deck.test.tsx` pins both the motion-present and
      motion-absent cases. Step 4: the reshuffle sequencing gate landed in
      `use-game.ts` (`causeFlightIdRef`/`pendingAfterCauseRef`/
      `runAfterCausingFlight`/`enqueueCausingFlight`, composed exactly as
      the plan's advisory shape describes — every reshuffle-capable
      enqueue site converted, `DeckReshuffled`'s handler wraps
      `runAfterReveal(() => runAfterCausingFlight(enqueue))`,
      `SlamWindowClosed` clears the latch alongside the reveal queue).
      `pnpm turbo test --filter @cambio/web`: 260/260 green. Full gate
      green, 25/25 (one prettier auto-fix on `draw-deck.test.tsx`).
      **Deviation from the plan's advisory test sketch**: the sequencing
      pin uses a `HeldSwapped` discard-landing batch, not a plain
      `CardDrawn` one — discovered while writing it that `CardDrawn`'s
      destination anchor (`held`) only mounts once the pre-refetch
      snapshot itself shows `HoldingCard`, so under the still-`AwaitingDraw`
      bootstrap fixture a draw flight cancels on a missing anchor
      regardless of rect stubbing, making it unusable for proving
      deferral. `HeldSwapped`'s second flight (slot → discard) has anchors
      that exist in every phase, so its lifetime is governed only by the
      stubbed measure — logged here since it's a real (pre-existing,
      not CAM-31-introduced) anchor-availability characteristic of the
      flight layer, not a change to the gate's own logic.

## Surprises & notes for the root plan

- (planning) **Correction of record for CAM-18:**
  `docs/plans/frontend/CAM-18.md`, step 13's reshuffle-moment paragraph,
  claims "the reshuffle can precede `CardDrawn`/`PenaltyDrawn`/
  `CardGivenFromDeck` in one batch, so flight ordering follows batch
  order." Both halves are stale: under ADR-0040 the reshuffle **follows**
  its causing draw in the batch (the direction flipped), and the "flight
  ordering follows batch order" guarantee was never implemented — flights
  play concurrently (`flight-layer.tsx` enqueue just appends). Recorded
  here per the root plan's Surprises entry; CAM-18's document is history
  and is not edited.
- (planning) **Known residual, deliberately out of scope:** in the
  zero-card-slammer batch `SlamSucceeded, DeckReshuffled,
CardGivenFromDeck` (root clause 8), the gate defers only the reshuffle
  flight after its cause (the slam's slot→discard flight); the
  `CardGivenFromDeck` deck→slot flight still fires as soon as the reveal
  clears and may fly concurrently with — or ahead of — the reshuffle
  flight. Sequencing the give behind the reshuffle would be a flight
  _chain_, a new mechanism class the interview decision explicitly
  declined. Surface at review if it reads badly in the walkthrough.
- (planning) The clause-13 simplification makes the affordance mirror
  strictly narrower than the domain's `drawable` predicate (which keeps
  its disjunction — root Decision Log). That asymmetry is intentional;
  don't "fix" the client back toward the domain formula.
