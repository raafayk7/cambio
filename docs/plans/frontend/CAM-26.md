# CAM-26 — Slam window liveness: expiry recovery on every layer (frontend)

- **Root plan:** [root/CAM-26.md](../root/CAM-26.md) — the functional
  contract lives there; this document is implementation detail for the
  client side (clauses C1–C5, milestone M2).

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

Governing skills: **frontend-architecture** (projection renderer; logic in
custom hooks; `useEffect` only for genuine side effects; components receive
data and callbacks as props), **design-system** (every visual value maps to
a token; the creation gate — the new `DrawDeck` state is **already
authorized**, root plan Decision Log 2026-09-07), and the standing
**hidden-information** law (nothing here touches payloads or channels; no
new data reaches the client — the nudge is a plain refetch of the view the
player already receives).

Governing ADRs: **0037** (this task's layered-recovery design — the client
nudge is one of four layers, none individually load-bearing), **0033**
(refetched view is authoritative; broadcasts are triggers only; the
version guard), **0011** (fixed `closesAt`; duration from
`config.slamWindowMs`, never a design constant).

Files this side touches (line anchors current as of `release-v0` @
40c2318):

- **`apps/web/src/components/game/slam-timer.tsx`** (71 lines) — purely
  presentational, no callbacks today. Props (`:18-22`):
  `window?: { closesAt; durationMs }`, `resolving?`, `className?`. A 50ms
  `window.setInterval` (`:31-38`) recomputes `remaining` against raw
  `Date.now()`; the effect early-returns (interval torn down) when the
  window is undefined **or** `resolving`. At zero (`:42`, `:49`) it renders
  `data-state="closed"` and fades out — but the interval keeps firing,
  clamped at 0, forever. C1's fire-once guard must live here: a naive
  callback inside `update` would fire every 50ms.
- **`apps/web/src/containers/game/use-game.ts`** (698 lines) — the game
  container hook. Decode-failure early returns in **both** subscriptions
  (room `:607`, player `:618`) skip `scheduleRefetch` — the C3 fix sites.
  `scheduleRefetch` (`:186-192`) is a 100ms trailing debounce
  (`REFETCH_DEBOUNCE_MS`, `:42`) cleared on unmount (`:194-198`). The
  version guard (`isNewerVersion`, `:135-137`) drops equal-version
  responses in the query fn (`:160-167`) and in `sendCommand.onSuccess`
  (`:643`) — the C5 hazard: a poke-served stale view arrives at an
  unchanged version and is never applied to the cache. Existing refetch
  triggers, exhaustively: decoded room broadcast (`:609`), decoded player
  broadcast (`:620`), `onResubscribe` on both topics (`:611-613`,
  `:622-624`), `sendCommand.onError` (`:654`), mount. No polling anywhere;
  `apps/web/src/router.tsx:13` sets `staleTime: 30_000`.
- **`apps/web/src/containers/game/game-screen.tsx`** (1089 lines) —
  **note: this is `containers/game/`, not `components/game/`** (the
  CAM-20 rewrite moved it; older briefs cite the old path). `GameScreen`
  (`:968`) calls `useGame` directly (`:989`) and passes its returns as
  plain props to the inner `GameTable` component (`:302-331`,
  `props typed as ReturnType<typeof useGame>[...]`) — the wiring pattern
  for any new hook output. `slamPhase` derived at `:357`; `SlamTimer`
  mounted at `:625-635` with `closesAt` + `view.config.slamWindowMs`,
  `resolving={slamReveal !== null}`. `DrawDeck` rendered at `:704-716`
  (spread-or-nothing `onClick`); `DiscardPile` gets
  `slamTarget: true` when `slamPhase !== undefined` at `:721` — the
  precedent the deck's new state copies. All `slamPhase` consumers are
  phase-tag-only; `closesAt` is never consulted for gating — keep it that
  way (server authority; no client-side legality).
- **`apps/web/src/containers/game/affordances.ts`** — `SlamWindow` maps to
  bare `{ phase: "SlamWindow" }` (`:189-190`). **Untouched by this task**
  (decision below).
- **`apps/web/src/components/game/draw-deck.tsx`** (104 lines) — props
  (`:19-31`): `count`, `onClick?`,
  `state?: "reshuffling" | "draw"`, `className?`. `data-state` (`:67`) is
  `state ?? (count === 0 ? "empty" : low ? "low" : "populated")`. With
  `onClick` the stack wraps in a button (`:70-78`); without, a bare static
  stack (`:80`). The C4 site.
- **`design-system/components/core/draw-deck.md`** (r2) — the canonical
  spec; gains the authorized `slam-window` state as r3. Revision
  convention: dated `## Revisions` entries citing the task (see
  `discard-pile.md` r2, `slam-timer.md` r3).
- **Tests** — `apps/web/test/slam-timer.test.tsx` (4 tests, fake timers,
  reads `aria-valuenow`), `apps/web/test/draw-deck.test.tsx` (4 tests),
  `apps/web/test/game-screen.test.tsx` (2172 lines, **deliberately real
  timers + `waitFor`** per its header comment), `apps/web/test/support/harness.tsx`
  (`stubApi` fetch-table stub whose `calls: string[]` is the
  refetch-count instrument; `renderGameApp`; `viewResponse` fixture),
  `apps/web/test/support/fake-realtime.ts` (`FakeRealtimeClient` /
  `FakeChannel.emit` / `setStatus`). The `slamWindowView` fixture lives in
  `game-screen.test.tsx:112-121` (default `closesAt = Date.now() + 8000`).
  Nothing in the harness currently emits a malformed payload — C3 needs
  that new move (it's just `channel.emit("X", garbage)` inside `act()`;
  no new helper file required).

Relevant design tokens (all existing — nothing new crosses the gate):
`accent.alarm` / `accent.alarm-deep` (`design-system/references/tokens.md`
Semantic roles table; small-text-on-alarm rule in Contrast rules),
`--animate-pulse-soft` (`packages/ui/src/styles.css:188`, used by
`playing-card.tsx:144` for `slamEligible`), the `border-2 border-accent-alarm`
frame idiom (`playing-card.tsx:138-146`, echoed by `DiscardPile`'s
`slamTarget` via `slamEligible` on its top card, `discard-pile.tsx:81`).
No copy changes: `TurnIndicator` already says "Slam window open — match
the X" (`game-screen.tsx:622-624`), and the root plan's creation-gate
authorization is explicit — no caption, no button.

### Decisions taken at plan time

- **Affordances untouched.** `DrawDeck`'s slam-window signal is driven off
  `slamPhase` in `game-screen.tsx`, exactly like `DiscardPile.slamTarget`
  at `:721` — not through `affordancesFor`. Smaller surface, consistent
  precedent, and `apps/web/test/affordances.test.ts` ("SlamWindow and
  Ended map to a bare phase marker, for any viewer") keeps pinning
  `{ phase: "SlamWindow" }` exactly, unchanged. The idiom there is
  omit-the-affordance, never disabled-with-reason — a slam-window field
  would be the first non-affordance in the union.
- **`DrawDeck` gets a separate boolean prop (`slamWindow?: boolean`), not
  a new member of the `state` enum.** `reshuffling`/`draw` are transient
  choreography states (they render for a flight's duration, occupancy-
  independent); `slam-window` is a phase overlay that could coincide with
  one (a discard's settle choreography can still be playing as the window
  opens). A boolean composes; an enum member would force a false
  either/or. This mirrors `DiscardPile` exactly, whose `slamTarget`
  boolean coexists with `receiving`. `data-state` precedence follows the
  discard's precedent (`discard-pile.tsx:89`): choreography wins, then
  `slam-window`, then the count split — so
  `state ?? (slamWindow ? "slam-window" : count === 0 ? "empty" : low ? "low" : "populated")`.
- **No `slam-timer.md` revision.** C1 adds behavior (`onExpire`), not a
  visual state: the bar's rendering at zero is unchanged (`closed`, snaps
  away), and the transient "bar hit zero but the phase hasn't moved yet"
  moment stays visually `closed` — with this task's recovery it lasts at
  most a nudge round-trip, which the doc's "play proceeds" now honestly
  describes. The recovery mechanism is ADR-0037's to document, not the
  design system's; touching the canonical doc for it would also exceed
  the creation-gate authorization, which covers `draw-deck.md` only. If
  review disagrees, the fix is a one-sentence Rules addition (r4) —
  flagged here so that's a conscious call, not an omission.
- **Skew-grace and nudge constants are component/hook constants, not
  tokens** — they are liveness mechanics, not design values (the design
  doc's "duration from config, never a design constant" rule governs the
  drain, which is untouched). Advisory values from the root plan Decision
  Log: ~500ms skew grace, ~2s re-nudge interval, cap ~5 attempts. Tune at
  implement; name them (`SLAM_EXPIRY_SKEW_GRACE_MS`, `NUDGE_INTERVAL_MS`,
  `NUDGE_MAX_ATTEMPTS` or similar) so tests read intent.

## Plan of work

Component-level TDD throughout: each step writes its failing tests first,
then the implementation, and leaves the repo compiling and green.

### Step 1 — C1: `SlamTimer.onExpire`, fire-once with skew grace

`apps/web/test/slam-timer.test.tsx` first (the file already runs fake
timers — the natural home). Extend the existing suite — the "shows closed
(empty bar), never negative, once closesAt passes" test is the seam —
with intents:

- `onExpire` fires exactly once when time passes `closesAt` plus the
  grace, even as the 50ms interval keeps ticking long after (advance well
  past expiry, assert one call).
- It does **not** fire while `resolving` (the interval is torn down
  there); when `resolving` clears after `closesAt` has already passed,
  it fires then — once.
- It does not fire early (advance to just before `closesAt + grace`,
  assert zero calls) and never fires for a window that unmounts first.
- A **new** window (different `closesAt` after rerender) re-arms: the
  guard is per-window, not per-component-lifetime.
- Omitting `onExpire` changes nothing (all four existing tests stay
  green untouched).

Then `apps/web/src/components/game/slam-timer.tsx`: add
`onExpire?: () => void` to `SlamTimerProps`; inside the existing effect's
`update`, when `closesAt + SLAM_EXPIRY_SKEW_GRACE_MS <= Date.now()`, fire
through a ref-guard keyed on `closesAt` (e.g. a
`firedForRef: React.useRef<number | null>` compared to
`slamWindow.closesAt`) so repeated ticks, `resolving` round-trips, and
re-renders of the same window cannot double-fire, while a genuinely new
window resets the guard. Keep `onExpire` out of the render path and read
it via a ref (the component re-renders every 50ms; the effect must not
re-subscribe on a new callback identity — same pattern as the hook's
`handleRoomEventRef`). Skew note, documented in the code: the timer
compares `closesAt` to raw `Date.now()` (no server-clock offset exists in
`apps/web` or `contracts`); the grace absorbs small skew, and a client
whose clock runs slow simply never fires — the server timer, poke-on-read
from any other client, and the close broadcast cover that side (ADR-0037:
no layer is individually load-bearing).

Gate: `pnpm turbo test --filter @cambio/web` green. Nothing calls
`onExpire` yet.

### Step 2 — C3: decode failure still schedules the refetch

`apps/web/test/game-screen.test.tsx` first (real timers are fine here —
the assertion is a `waitFor` on the `stubApi` `calls` counter, the
established refetch instrument). Two test intents, one per subscription,
in the existing realtime/broadcast describe:

- A malformed payload emitted on the **room** channel
  (`room.emit("GameEvent", { not: "a game event" })` inside `act()`)
  produces no choreography and no crash, but the view **is** refetched
  (calls counter goes up by one after the debounce).
- Same for the **player** channel.
- Both also assert a decoded follow-up still works (the handler skip is
  surgical — only the early return moved).

Then `apps/web/src/containers/game/use-game.ts`: at both sites
(`:604-610` room, `:615-621` player), restructure so the decode check
guards only the handler call, and `scheduleRefetch()` runs
unconditionally:

    onEvent: (_event, payload) => {
      const decoded = decodeRoomGameEventEither(payload)
      if (decoded._tag === "Right") handleRoomEventRef.current(decoded.right)
      scheduleRefetch()
    }

(Advisory sketch; the player site is identical in shape.) This upholds
ADR-0033 — the broadcast is only a trigger; the refetched view is the
authority, so an undecodable trigger still triggers.

Gate: web suite green. Watch the strict batch test ("SlamWindowClosed +
TurnAdvanced arrive as one batch: one refetch moves play on and slam
display state is swept", `game-screen.test.tsx`) — its `getsBefore + 1`
assertion counts every `GET /view`; this step adds no refetch to that
test's event stream (all its emits decode), so it should stay green
untouched. If it doesn't, that's a real leak — investigate, don't loosen.

### Step 3 — C2 + C5: the bounded nudge loop in `use-game`, wired to the timer

The mechanism (design, constants advisory):

- `useGame` grows an `onSlamExpire` callback (stable identity via
  `React.useCallback` + refs) returned from the hook. `GameScreen`
  destructures it (`game-screen.tsx:970-989`) and passes it through
  `GameTable`'s props (add to the props object and its
  `ReturnType<typeof useGame>[...]` type, `:302-331`) to the `SlamTimer`
  mount (`:625-635`) as `onExpire`.
- On fire, the hook records the expired window's identity — the
  `closesAt` it expired at plus `lastVersionRef.current` at that moment —
  in a ref, sets an attempt counter to 0, and starts the loop.
- Each attempt awaits `refetchRef.current()` and inspects **the fetched
  result** (the query result the refetch promise resolves with), never
  the applied cache: this is the C5 discipline. Because the query fn
  returns the existing cached data for a non-newer version (`:160-167`),
  "no progress" is directly observable as: the result still decodes to a
  `SlamWindow` phase with the **same** `closesAt`, at a version not
  greater than the recorded one. Anything else — new version, different
  phase, different window — is progress: stop the loop and clear the
  refs.
- On "no progress": if attempts < cap (~5), schedule the next attempt
  with `window.setTimeout` (~2s) into a dedicated ref (NOT
  `scheduleRefetch`'s debounce slot — the debounce is a coalescer for
  broadcast bursts; the nudge is a paced retry with its own lifecycle),
  then stop for good, leaving `onResubscribe` as the standing backstop.
- The loop also self-cancels when the rendered view moves on regardless
  of the loop's own fetches (a broadcast-triggered refetch applying a
  newer version counts as progress on the next inspection — no separate
  effect watching the cache is needed; keep `useEffect` out of it except
  the unmount cleanup). Unmount clears the pending nudge timeout
  alongside the existing debounce cleanup (`:194-198` pattern).
- Recovery completing **without** any nudge response being applied is
  the C5 point: the poke (server side, S3) closes the window and
  publishes `SlamWindowClosed` + `TurnAdvanced`; that broadcast schedules
  the ordinary debounced refetch, which carries a **new** version the
  guard applies. The nudge loop's only job is to keep GETs (= pokes)
  flowing while stale; it never needs its own responses applied.

Tests first, in a **new file** `apps/web/test/slam-expiry-nudge.test.tsx`
— a separate file keeps `game-screen.test.tsx`'s no-fake-timers
convention intact (its header comment `:31-35` is deliberate), while this
suite owns fake timers to pace an 8s expiry plus ~2s re-nudge intervals
without real waiting. It reuses `renderGameApp`, `stubApi` (+ `calls`),
`FakeRealtimeClient`, and a local already-expired or short-fuse
`SlamWindow` fixture (mirror `slamWindowView` from
`game-screen.test.tsx:112` — consider promoting it into
`test/support/harness.tsx` beside `viewResponse` rather than duplicating;
implementer's call). Fake-timer/`waitFor` interplay is the known hazard —
whichever of `vi.useFakeTimers({ shouldAdvanceTime: true })`, manual
microtask flushes, or an already-past `closesAt` (expiry fires on the
mount tick) proves least fragile is fine; the intents are what matter:

- An expired window with no broadcast produces a refetch (the nudge),
  then — while the stubbed view keeps answering the same stale
  same-version window — further refetches spaced by the interval, and
  **stops at the cap** (assert the exact `GET /view` count stops
  growing).
- A refetch that returns progress (new version, phase moved on) **ends
  the loop** — no further GETs after it (C2's "a view showing progress
  ends the nudge loop").
- Recovery completes through the broadcast path while nudging: stale
  same-version answers throughout the loop, then a `SlamWindowClosed` +
  `TurnAdvanced` emit whose refetch serves the new higher-version view —
  the table shows the next player's turn (C5: the version guard dropped
  every nudge response, and recovery still landed).
- Unmount mid-loop leaks no timers (no unhandled errors, counter frozen).

Then the implementation in `use-game.ts` and the three-hop wiring in
`game-screen.tsx`. Re-check the strict batch test after wiring: its
fixture window closes 8s out and the suite runs real timers, so
`onExpire` cannot fire within the test's lifetime — the `getsBefore + 1`
assertion should hold untouched. If implement finds it flaky anyway,
widen that fixture's `closesAt` margin (e.g. `Date.now() + 60_000`) in
the same commit, as the root plan already sanctions — never weaken the
count assertion itself.

Gate: web suite green.

### Step 4 — C4: `DrawDeck` slam-window state + `draw-deck.md` r3

Tests first, `apps/web/test/draw-deck.test.tsx`:

- The new prop renders `data-state="slam-window"` (over the count split),
  and the existing test "renders as a static, non-interactive stack when
  no onClick is given" still passes — extend with an explicit
  no-button-in-slam-window assertion (the state must never resurrect the
  button wrap).
- Choreography precedence: `state="draw"` (or `"reshuffling"`) with the
  slam prop set still shows the choreography `data-state` (mirrors the
  discard's receiving-over-slam-target precedence).

Then `apps/web/src/components/game/draw-deck.tsx`: add
`slamWindow?: boolean`; fold it into the `data-state` expression (`:67`)
per the precedence decision above; render the quiet treatment on the
stack — the established alarm-frame idiom: an `aria-hidden` overlay span
with `border-2 border-accent-alarm` + `animate-pulse-soft`, echoing
`playing-card.tsx:138-146` (`slamEligible`) so deck and discard pulse as
one system while the window is open. Existing tokens only; badge, count
label, and empty/low logic untouched; no `onClick`, no copy. Update the
component's doc comment to cite r3.

Wire in `game-screen.tsx:704-716`: add
`{...(slamPhase !== undefined ? { slamWindow: true } : {})}` to the
`DrawDeck` spread, symmetric with the `DiscardPile` line at `:721`. Add
one integration assertion to an existing slam describe in
`game-screen.test.tsx` (SL1 territory) that during an open window the
deck carries `data-state="slam-window"` — cheap, and it pins the wiring,
not just the component.

Revise `design-system/components/core/draw-deck.md` (same change, as the
root plan requires): version 2 → 3; add the `slam-window` state to
`## States` (phase overlay while the window is open: alarm frame +
soft pulse on the stack, no interaction, no copy; independent of the
populated/low/empty split and composable with the choreography states);
add a `## Rules` line that the state is presentational only — the deck
stays a static stack, never a disabled button (the r2 rule holds); add
the `## Revisions` entry
(r3, CAM-26, dated, citing the creation-gate authorization in the root
plan Decision Log). The design-gate/impeccable PostToolUse hooks will
nudge on the `.tsx` writes — advisory, per AGENTS.md; surface anything
they flag against the deliberate alarm treatment rather than auto-fixing.

Gate: web suite green.

### Step 5 — close out this side

Full gate (never piped), update this plan's Progress and coverage table
as tests landed (per `/implement`), flag Surprises. The end-to-end
restart-mid-window walkthrough is root-plan M3 (needs the backend's S3
poke on the same branch) — not this document's exit criterion.

## Concrete steps & validation

Per step: `pnpm turbo test --filter @cambio/web` (turbo builds workspace
deps first — never the bare package script against stale dist; AGENTS.md).
Single-suite iteration after a build: `npx vitest run test/slam-timer.test.tsx`
from `apps/web` (same for the other files).

Expected suite deltas: `slam-timer.test.tsx` grows from 4 tests by the
C1 set; `draw-deck.test.tsx` grows from 4 by the C4 set;
`game-screen.test.tsx` gains the two C3 tests + one C4 integration
assertion with **zero** existing-test changes expected (the strict batch
test's `getsBefore + 1` count included — see Steps 2–3);
`slam-expiry-nudge.test.tsx` is new (C2/C5). `affordances.test.ts`
unchanged.

Final gate, bare, exit status checked directly:

    pnpm turbo build typecheck lint test

## Contract coverage

_(maintained by `/implement`, verified by `/review`: one row per root-plan
contract clause this side owns — the test that pins it, or why none can.
Each row must also say **what is asserted**, in one phrase. **At plan
time, fill only the Clause column plus a planned-approach note**; test
file, name, and assertion phrase are written by `/implement` when the
test actually lands.)_

| Clause                                                                                                                                                                                                                                      | Test (file + name) | What is asserted |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------- |
| **C1** — planned: fake-timer component tests in the existing SlamTimer suite — fire-once past `closesAt` + grace despite the 50ms interval; suppressed during `resolving`, fires once when it clears; re-arms per new window; no early fire |                    |                  |
| **C2** — planned: new fake-timer screen-harness suite — expired window with stale same-version answers yields paced refetches counted via `stubApi.calls`, stopping at the cap; a progress response ends the loop early                     |                    |                  |
| **C3** — planned: garbage `FakeChannel.emit` on each of the room and player topics in the existing screen suite — refetch count still increments, decoded events still handled after                                                        |                    |                  |
| **C4** (component + wiring) — planned: DrawDeck suite pins `data-state="slam-window"`, no button, choreography precedence; one screen-suite assertion pins the `slamPhase`-driven wiring                                                    |                    |                  |
| **C4** (doc) — planned: no test can pin a design doc; `draw-deck.md` r3 lands in the same change and `/review` verifies it against the creation-gate authorization                                                                          |                    |                  |
| **C5** — planned: same new suite — every nudge response is same-version (guard-dropped), close arrives as a broadcast-triggered higher-version refetch, table moves on                                                                      |                    |                  |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [ ] 2026-09-07 — frontend child plan written; implementation not started

## Surprises & notes for the root plan

- The brief's path for the screen is stale: `game-screen.tsx` lives at
  `apps/web/src/containers/game/game-screen.tsx` (it is a container —
  `GameScreen` calls `useGame` itself and passes props to the inner
  `GameTable`), not `components/game/`. Anchors in this plan are current.
- Plan-time call, for the reviewer: **no `slam-timer.md` revision**
  (rationale under Decisions taken at plan time — `onExpire` is behavior,
  not a visual state, and the gate authorization covers `draw-deck.md`
  only). If review wants the transient bar-at-zero moment documented,
  it's a one-sentence r4, done through the design-system change process.
- `slam-timer.tsx`'s doc comment cites `slam-timer.md (r1)` while the
  canonical doc is at r3 — worth refreshing the citation while editing
  the file (comment-only; no behavior).
