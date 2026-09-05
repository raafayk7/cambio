# CAM-18 — Game table screen (frontend)

- **Root plan:** [root/CAM-18.md](../root/CAM-18.md) — the functional
  contract lives there; this document is implementation detail for the
  frontend side: clauses **G1–G3, S1–S2, C1–C5, H1, T1–T5, SL1–SL3,
  E1–E3, CH1–CH3** (the whole task — CAM-18 is frontend-only; the wire
  is consumed as frozen).

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

This section preserves the planning explorers' evidence (frontend +
wire surveys, probe-verified on `release-v0`, 2026-09-05). Line anchors
are given for files this task does **not** modify (contracts, apps/api,
canon docs at their current revision); for files the diff will touch,
anchors are symbolic (export/prop names) so close-out's `:<digits>` grep
stays quiet.

### What exists — the foundation reused wholesale (CAM-17)

- `apps/web/src/services/api.ts` — `apiRequest(path, {method?, body?, decode})`
  with `credentials: "include"` on every call, contracts decode at the
  edge, typed `ApiError {status, tag, message}` from
  `decodeErrorBodyEither` with a generic fallback. Adding an endpoint is
  one call site with a decoder.
- `apps/web/src/services/realtime.ts` — lazy browser-only client
  (ADR-0032 env), one subscription function:
  `subscribeTopic(topic, {onEvent, onResubscribe})` returning an
  unsubscribe. Events arrive **undecoded** (`payload: unknown`); each
  caller decodes. `onResubscribe` fires only after a drop. Connection
  status is a `useSyncExternalStore` pair consumed via
  `apps/web/src/hooks/use-connection.ts`. Test seam:
  `setRealtimeClientForTests`.
- `apps/web/src/hooks/use-session.ts` — `["me"]` query resolving 401 to
  `{state: "unauthenticated"}` data, `POST /users` mutation seeding the
  cache. **The view carries no `viewerId`** (wire gap G3) — the game
  hook threads the session user's id explicitly, as `use-room.ts` does.
- `apps/web/src/containers/room/use-room.ts` + `room-screen.tsx` — the
  container template: co-located hook, resource-keyed query with
  `retry: false`, denial state machine with a copy table,
  effect-scoped subscriptions dropped on unmount, decode-then-act event
  handling, refetch-on-resubscribe, `failed` classification that
  excludes the bootstrap 404 (the no-flash discipline — a naive
  classification produced a one-frame alarm flash, root CAM-17 plan),
  300ms no-flash skeleton, identity-in-place (NameForm renders without
  changing the URL), container owns its AppShell, route is a one-line
  picker (deviation recorded in [frontend/CAM-17.md](CAM-17.md)
  Surprises).
- `apps/web/src/routes/game.$gameId.tsx` — the logic-free placeholder
  (`GameHoldingPage`, `shuffling…` caption). Never reads params. Pinned
  by `apps/web/test/game-placeholder.test.tsx` "renders the holding
  state — shell, loading object, flavor caption" — **replaced by this
  task, not silently deleted**.

### The game objects — exact prop surfaces (all presentational today)

All in `apps/web/src/components/game/`. **Only `Hand` takes a click
handler.** Flight props are static styling with no movement.

| Component     | Props today                                                                                                                         | Gaps this task fills                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| PlayingCard   | `face: down \| up{card} \| peeking{card}`, `size`, `selected`, `slamEligible`, `inFlight`, `leavingPlay`                            | no ref forwarding, no `onClick` — flight anchors and click affordances attach via wrapping elements, never the card itself |
| Hand          | `variant`, `slots` (occupancy), `faces?`, `slamWindow?`, `awaitingGiveSlot?`, `inFlightSlot?`, `leaving?`, `inert?`, `onSlotClick?` | no `selectedSlots`; empty slots never clickable (give-target gap); `slamEligible` auto-derived, cannot mark a subset       |
| DrawDeck      | `count` only                                                                                                                        | no `onClick`/`interactive`; no `reshuffling`/`draw` states (canon `draw-deck.md` requires both)                            |
| DiscardPile   | `top?`, `underCount?`, `slamTarget?`                                                                                                | no `onClick`; no `receiving` state (canon `discard-pile.md` requires it)                                                   |
| SlamTimer     | `window? {closesAt, durationMs}`, `resolving?`                                                                                      | complete — `resolving` must be driven by the screen from slam events                                                       |
| TurnIndicator | `state: your-turn \| other-turn \| slam-window \| game-over`, `children`                                                            | complete — all copy is caller-supplied; this task owns every phase string in voice.md register                             |
| ScoreSheet    | `reveal`, `playerName`                                                                                                              | no `revealing` entrance state (canon `score-sheet.md` requires the simultaneous flip)                                      |
| Seat          | `name`, `seatIndex`, `cardCount?`, `state`, `own?`                                                                                  | no children slot — seat+hand compose as one `seats[]` node in the screen                                                   |
| TableSurface  | `seats: ReactNode[]`, `viewerSeatIndex`, `center?`, `state`                                                                         | game-over scrim paints over `center` (§hazards); opponent z-order (§hazards)                                               |

The four canon choreography states with no props (`draw-deck`
`empty→reshuffling` + `draw`, `discard-pile` `receiving`, `score-sheet`
`revealing`) are the CAM-15 carve-out this task repays
(`docs/plans/root/CAM-15.md`, R1 amendment). All extensions above are in
the **approved canon batch** (root plan, interview 2026-09-05) but each
still goes through its own creation-gate round with the canon doc
revision landing alongside the code.

### Geometry — the arithmetic nobody wrote down

- `seat-arc.ts` exports `RING_RADIUS_PCT = 42` with a **wrong comment**
  ("percent of the container's half-size" — it is actually 42% of
  container _width_, i.e. 84% of half-width). `seatArc(seatCount,
viewerSeatIndex)` places seats at `50 + 42*cos/sin`, viewer at 90°
  (bottom). Pure, pinned by `apps/web/test/seat-arc.test.ts` (viewer at
  (50, 92), heads-up opponent at (50, 8), compass points).
- `table-surface.tsx` holds `TABLE_DISC_PCT = "54%"` (of the **asset**
  width) and renders the art at `w-3/4` of the square container. So the
  painted table's half-width is 37.5% of the container and the tabletop
  disc's is 20.25% — **seats at 42% sit outside the painted asset
  entirely**, ~9 points beyond the ~33% bench ring the CAM-17 judge
  measured. The judge's enumerated fix options are not preserved
  anywhere in the repo; only the direction survived: **one radius
  source** (frontend/CAM-17.md, forward notes).
- Motion tokens: `--duration-snap: 140ms`, `--duration-track: 340ms`,
  `--ease-snap` in `packages/ui/src/styles.css`; Tailwind's stock
  easings/animations are wiped (`--animate-*: initial`). `duration.peek`
  does not exist — `design-system/references/tokens.md:132-148` says
  "two durations only" and calls peek "game config", both lines amended
  by G3 (round-1 user decision: fixed client duration).
- **No FLIP/measurement code or animation dependency exists anywhere**
  (grep: zero hits for `getBoundingClientRect`, `FLIP`,
  `requestAnimationFrame`, framer/motion/gsap in apps/ + packages/).
  Reduced motion is entirely Tailwind's `motion-reduce:` variant; the
  canon origin/destination `accent.focus` highlight is unimplemented
  (deferred at `docs/plans/root/CAM-15.md`, now due).

### Wire surface consumed (frozen — any gap is stop-and-surface)

| Call                           | Response                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /games/:gameId/view`      | 200 `ViewResponse {view, version, grants}` (`packages/contracts/src/Responses.ts:41-46`); non-participant + unknown id → **byte-identical 404** `GameNotFound "not found"` (`apps/api/src/presentation/games.ts:83-90`; pinned `GameCommands.test.ts` non-participant block). Works after game end — reads the persisted state row. **This single GET is the complete bootstrap: snapshot + version + both topics.** |
| `POST /games/:gameId/commands` | 200 `GameReply {view, version}` (`Responses.ts:34-38`); 400 undecodable, 401, 404 identical, 422 + exact `GameError` tag with message `"illegal move"` (16 tags incl. `NotYourTurn`, `WrongPhase`, `SlamTooLate`, `InvalidGiveSlot`)                                                                                                                                                                                 |

`PlayerGameView` (`packages/contracts/src/GameView.ts:109-128`):
`players` (array index = seat; `ViewPlayer {id, name, hand}` — `hand` is
**occupancy only, holes preserved, own hand included**), `deckCount`,
`discard` (whole pile, index 0 = top), `phase`, `config {slamWindowMs}`,
`reveal?` (present iff phase `Ended`). No `viewerId` — supplied from
session. Event payloads name players by UUID only; **names map through
the snapshot's `players`** (names-in-GameStarted refactor deferred,
root Decision Log).

`ViewPhase` variants and the affordances derivable from them (the spec
for `affordances.ts`; engine mirrors cited in root H1/T1–T3):

| Variant              | Payload                          | Client affordances (phase + occupancy + H1 helpers only)                                                                                                                      |
| -------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AwaitingDraw`       | `{playerId}`                     | holder: `CallCambio` always; `TakeDiscard` iff `discard[0]` exists and is non-power; `DrawFromDeck` iff `deckCount > 0 \|\| discard.length > 1`                               |
| `HoldingCard`        | `{playerId, source, card?}`      | `card` present iff viewer is holder **or** `source === "discard"`; holder: `SwapHeld{slotIndex}` iff hand non-empty; `DiscardHeld` iff source deck; `KeepHeld` iff hand empty |
| `ResolvingPower`     | `{playerId, card?}`              | `card` to holder only; power = rank: 7/8 peek own occupied slot, 9/10 peek opponent's, J `PowerSwap` two distinct occupied slots across any players                           |
| `ResolvingQueenSwap` | `{playerId, card?}`              | only `PowerSwap`, holder only; the peeked value is NOT carried — the player swaps from memory                                                                                 |
| `SlamWindow`         | `{turnPlayerId, closesAt, rank}` | fully public; `Slam {target, giveSlot}` for anyone while open; timer duration `config.slamWindowMs`, deadline `closesAt` (fixed, never moves — ADR-0011)                      |
| `Ended`              | `{calledBy}`                     | score sheet from `view.reveal`                                                                                                                                                |

There is **no `AwaitingGive` phase** — the give rides on
`Slam.giveSlot` atomically; `hand.md`'s `awaiting-give` is client-local
animation state only. There is no `CloseSlamWindow` command (server
closes: timer fiber or lazy close; a live client receives
`SlamWindowClosed` + `TurnAdvanced` as one batch — pinned
`SlamWindow.test.ts` close-batch assertions).

Room-channel events (22 `RoomGameEvent` variants,
`packages/contracts/src/GameEvents.ts:181-204`) — the ones that carry
card values: `GameStarted.firstDiscard`, `DiscardTaken.card`,
`HeldSwapped.discarded`, `HeldDiscarded.card`, `PowerDiscarded.card`,
and the §1.5 reveals `SlamSucceeded.card` / `SlamFailed.card` (these
two exist **only** in events — `viewFor` never re-sends them; ADR-0033
consequence: reveals must be driven from event payloads).
Value-free by design: `CardDrawn`, `CardPeeked`, `CardsBlindSwapped`,
`CardGivenFromHand`, `CardGivenFromDeck`, `PenaltyDrawn` (unseen by
everyone including the slammer, ADR-0022), `DrawSkipped {kind}`,
`DeckReshuffled {deckCount}`, `SlamWindowClosed {}`,
`TurnAdvanced {playerId}`, `CambioCalled`, `GameEnded {calledBy,
scores, winners}` (**no hands** — non-callers refetch for the reveal),
`SlamWindowOpened`, `PowerFizzled`, `HeldKept`. Per-player topic:
`PrivateCardDrawn {card}` and `PrivateCardPeeked {target, card}`
(single delivery, unrecoverable on a drop — ADR-0021; the UI degrades
gracefully, no reveal ≠ broken screen). **No game event carries a
version** — the whole reason for ADR-0033. Decoders:
`decodeRoomGameEventEither` / `decodePlayerGameEventEither`
(`GameEvents.ts:248-251`).

### Laws that govern this side

- **ADR-0033** — the versioned view is the only state source; every
  decoded broadcast does two things only: enqueue its animation/reveal
  and schedule **one debounced refetch per event batch**; snapshot
  updates apply only when `version` is greater; `onResubscribe` →
  same refetch; ephemeral private values live in component-local
  display state, never the snapshot.
- **ADR-0034** — hand-rolled FLIP flight layer, no dependency; pure
  geometry modules unit-tested; flights reference their event payload,
  never live state; reduced-motion = cross-fade + `accent.focus`
  origin/destination; we own interruption/unmount/resize behavior.
- `frontend-architecture` — projection renderer; pages → containers →
  components; logic in co-located hooks; `apps/web` imports `contracts`
  - `ui` only (lint-enforced); no hardcoded visual values (inline
    `style={{}}` is legitimate only for genuinely dynamic values —
    computed seat positions and FLIP transforms qualify; constants don't).
- `hidden-information` — never receive what the viewer isn't entitled
  to; a missing field is a `viewFor`/contracts change, never a client
  workaround; **memory fidelity**: a peeked card shows briefly then
  never again — no markers, no known-cards affordances.
- `cambio-rules` — every rule question; anti-prior guard (no opening
  peek, no caller bonus, no final round; ADR-0009/0010/0011/0012 are
  rules).
- `design-system` — entered through `design-system/design-system.md`;
  the approved canon batch (root plan) still goes through the creation
  gate per item; conflicts surfaced, never auto-fixed. Key canon:
  `hand.md` "never teleport a card"; `draw-deck.md` "every player must
  see the reshuffle happen"; `slam-timer.md` fixed close, no refills;
  `turn-indicator.md` one per screen, public events only, game-over
  copy before the reveal; `modal.md` "Call Cambio — ends the game",
  never during the slam window; `toast.md` game events never arrive as
  toasts; `score-sheet.md` simultaneous flip, caller unmarked,
  zero-card hands never styled as winning.
- ADR-0021 (private values delivered once), ADR-0030 (jsdom asserts
  behavior/structure, never geometry — flights and radii are pure-math
  tests + the design gate's rendered path), ADR-0027 (tokens as
  `@theme` variables), ADR-0032 (realtime wiring).
- TS constraints: `exactOptionalPropertyTypes` +
  `noUncheckedIndexedAccess` ON (conditional-spread idiom); relative
  imports with `.js` extensions; `routeTree.gen.ts` never hand-edited.

### Known hazards (planned around explicitly)

1. **Opponent seats paint under the table art at `regular`.** Opponent
   seat wrappers are absolutely-positioned children **before** the art
   wrapper in DOM order (via `regular:contents`), the viewer's own seat
   after — with auto z-index, opponent nodes overlapping the opaque art
   are occluded while the viewer's aren't. Invisible in jsdom; bites
   the moment hands extend inward. Step 8 gives seat nodes an explicit
   z-index above the art layer in `table-surface.tsx`.
2. **`Seat` has no children slot** — each `seats[]` entry composes
   `<><Seat/><Hand/></>` as one node; the hand-at-seat arrangement
   (radial orientation relative to the arc angle) is new layout the
   screen owns, tuned in the rendered pass.
3. **Memory fidelity vs component state** — peeked values
   (`PrivateCardPeeked`, `PrivateCardDrawn`) live in ephemeral display
   state inside `use-game.ts`, cleared on timer expiry, **never written
   into the query cache** — a cache write would survive the reveal
   window and violate the law.
4. **The game-over scrim paints over `center`** — TableSurface renders
   the scrim disc after (and same-size as) the `center` overlay, so the
   score sheet cannot live in `center` at game-over. Resolution decided
   below (step 13).
5. **The `/game/$gameId` harness stub** keeps the room suite's
   navigation assertions cheap. Resolution decided below (step 5).

## Module layout

This table (plus the coverage table) is what close-out reconciles
against as-built code. Paths under `apps/web/src/` unless noted.

| File                                       | Status  | Purpose                                                                                                                                                                                                            |
| ------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `components/game/table-geometry.ts`        | new     | the **one radius source**: named anatomy constants (art fraction, disc fraction, seat ring), `seatArc` (absorbed from seat-arc.ts), hand/anchor placement math (G1)                                                |
| `components/game/seat-arc.ts`              | remove  | folded into table-geometry.ts; imports in table-surface.tsx updated; test migrated                                                                                                                                 |
| `components/game/flight/flip.ts`           | new     | pure FLIP planner: origin/destination rects → transform plan; interruption policy as data (G2)                                                                                                                     |
| `components/game/flight/anchors.ts`        | new     | anchor id scheme (`deck`, `discard`, per-player slot ids) + `data-flight-anchor` DOM lookup (G2)                                                                                                                   |
| `components/game/flight/flight-layer.tsx`  | new     | overlay runner: renders in-flight PlayingCards from queued flight specs, drives the transform transition on `duration.track`/`ease.snap`, reduced-motion branch (G2, CH1–CH3)                                      |
| `components/game/held-card.tsx`            | new     | the held-card presentation spot (canon batch item; gate round decides canon doc form) (T2)                                                                                                                         |
| `components/game/hand.tsx`                 | edit    | `selectedSlots`, empty-slot give-target clickability, slot anchor attributes (canon `hand.md` revision)                                                                                                            |
| `components/game/draw-deck.tsx`            | edit    | click affordance + `reshuffling`/`draw` states + anchor attribute (canon `draw-deck.md` revision)                                                                                                                  |
| `components/game/discard-pile.tsx`         | edit    | click affordance + `receiving` state + anchor attribute (canon `discard-pile.md` revision)                                                                                                                         |
| `components/game/score-sheet.tsx`          | edit    | `revealing` entrance state (canon `score-sheet.md` revision)                                                                                                                                                       |
| `components/game/table-surface.tsx`        | edit    | geometry import swap, explicit seat z-order above the art, game-over composition per step 13                                                                                                                       |
| `containers/game/use-game.ts`              | new     | the hook: bootstrap, subscriptions, ADR-0033 refetch authority, version guard, denial machine, command dispatch, peek/flight/reveal display state (C1–C5)                                                          |
| `containers/game/game-screen.tsx`          | new     | the container: composes table/seats/hands/center/indicator/timer/modal/score-sheet, owns AppShell, MVS states (C1–C5, T1–T5, SL, E)                                                                                |
| `containers/game/affordances.ts`           | new     | H1 pure helpers (rank-of-slug, power set, give-slot rule) + `ViewPhase` → affordance mapping (H1, T1–T3)                                                                                                           |
| `routes/game.$gameId.tsx`                  | replace | one-line picker: `<GameScreen gameId={gameId} />`                                                                                                                                                                  |
| `components/gallery/game.tsx`              | edit    | flight demo card (M1) + new states (held card, selection, choreography states)                                                                                                                                     |
| `packages/ui/src/components/app-shell.tsx` | edit    | S1 orthogonal reconnecting treatment; S2 connection-dot shape redundancy                                                                                                                                           |
| `packages/ui/src/styles.css`               | edit    | `--duration-peek` token + utility (G3)                                                                                                                                                                             |
| `containers/room/room-screen.tsx`          | edit    | adapt to the revised AppShell prop surface (S1) — no behavior change                                                                                                                                               |
| `apps/web/test/support/harness.tsx`        | edit    | keep the `game-route-stub`; add the game render path (step 5)                                                                                                                                                      |
| `apps/web/test/game-placeholder.test.tsx`  | remove  | replaced by the game-screen suite (root: "replaced, not deleted silently" — noted in Progress when it happens)                                                                                                     |
| `design-system/` canon revisions           | edit    | tokens.md + playing-card.md (G3); app-shell.md r3 (S1/S2); hand.md, draw-deck.md, discard-pile.md, score-sheet.md r-revisions; held-card canon (gate round); table-surface.md clarification if step 13 requires it |

## Plan of work

Ordered; each step leaves the repo compiling and both web/ui suites
green. Steps 1–4 are root M1, 5 is harness groundwork, 6–7 root M2,
8–9 root M3, 10–12 root M4, 13 root M5 (numbering note: slam is step
13, endgame 14), 14–15 root M6. Code sketches are advisory; the
coverage table and module table are what get reconciled.

1. **Geometry unification (G1).** Create
   `components/game/table-geometry.ts` as the single source: named
   constants for the table anatomy (art width fraction 3/4, disc
   fraction 0.54 measured from the alpha — values carried from
   table-surface.md r2), one exported seat-ring radius **derived
   relative to the art's edge, not the container**, and the `seatArc`
   function absorbed from `seat-arc.ts` (same angle convention: viewer
   at 90°, bottom-center). Correct the wrong "half-size" comment with
   the real arithmetic. Add hand-placement math (per-seat hand offset
   along the radial axis) so seats and hands share the source. Delete
   `seat-arc.ts`; update the import in `table-surface.tsx`; migrate
   `apps/web/test/seat-arc.test.ts` to a `table-geometry` suite pinning
   the derivation relationships (ring inside the art's edge, viewer at
   bottom, symmetry, compass points) — **numeric pins update to the new
   derived values**; the final visual radius is tuned against the
   rendered table in step 15's gate pass, never in jsdom (ADR-0030).
   `TABLE_DISC_PCT` in table-surface.tsx now reads from this module
   (the CAM-17 inline-style advisory gets its documented spec-carried
   comment while we're here).

2. **Anchor registry + pure FLIP planner (G2, first half).**
   `components/game/flight/anchors.ts`: the anchor id vocabulary —
   `deck`, `discard`, and per-slot ids built from playerId + slotIndex
   — plus a resolver that finds `[data-flight-anchor="<id>"]` inside
   the table root. `components/game/flight/flip.ts`: pure functions
   from two DOMRect-shaped inputs to a flight plan (start transform,
   end transform, i.e. translate delta + scale ratio) and the
   interruption policy as pure data: a flight, once planned, carries
   its own card slug/face and coordinates — a newer snapshot or an
   unmounted destination **completes or cancels, never retargets**
   (ADR-0033/0034). Unit tests on the math (seat-arc precedent): delta
   computation, scale between card sizes, degenerate rects (jsdom
   all-zeros) plan to a no-op cancel rather than NaN.

3. **Flight layer overlay (G2, second half).**
   `components/game/flight/flight-layer.tsx`: an absolutely-positioned
   overlay inside the table root that renders one `PlayingCard` per
   active flight spec — **face per entitlement only: a value-free
   flight renders `face="down"`** (structural — the spec simply has no
   card slug to show). Runs the FLIP transition on
   `duration.track`/`ease.snap` via transform; on completion calls the
   spec's `onDone`. Under `prefers-reduced-motion` (matchMedia, the
   repo's first JS check — `motion-reduce:` can't gate JS-driven
   transforms): no overlay movement; instead the origin and destination
   elements get the canon cross-fade + `accent.focus` highlight
   treatment for the same duration. Flights are queued through a small
   imperative handle the hook owns (advisory: `useFlights()` returning
   `{enqueue, active}`); unmount cancels all. jsdom tests assert
   structure only: a value-free spec renders a card back, an entitled
   spec renders the face, reduced-motion branch renders highlights not
   an overlay card, cancellation clears the layer. Movement itself is
   untestable in jsdom — rendered path + live walkthrough (ADR-0030).

4. **`duration.peek` creation-gate round + gallery demo (G3).** STOP
   and run the gate round (batch-approved, still its own round): the
   token's value and its two canon amendments —
   `design-system/references/tokens.md` §Motion loses the "two
   durations only" absolutism and the "duration.peek is game config"
   line (revision entry records the round-1 decision: fixed client
   duration), and `design-system/components/core/playing-card.md`'s
   "game-configured peek duration" wording follows. Then
   `packages/ui/src/styles.css` gains `--duration-peek` + its utility.
   Add the flight demo card to `components/gallery/game.tsx`: two
   anchors and a button that fires a flight (plus its reduced-motion
   rendering) so the mechanism is visually verifiable before any
   screen exists.

5. **Test-harness decision (settled here, executed now).** **Keep the
   `/game/$gameId` stub in `renderApp`** — the room suite's navigation
   assertions stay cheap and untouched — **and add a separate game
   render path** to `apps/web/test/support/harness.tsx`: a
   `renderGameApp(gameId)` (advisory name) that mounts the real
   `GameScreen` at `/game/$gameId` with stub routes for `/` (E3
   navigates there) and `/room/$gameId`. Rationale: replacing the stub
   would force game-view fetch stubs into every room navigation test —
   coupling two suites for no assertion gain. Extend the harness
   fixtures as needed: `viewResponse()` already exists (minimal
   `AwaitingDraw` view); add phase/override parameters as the suites
   demand. `game-placeholder.test.tsx` is deleted in step 9 when the
   real screen's suite covers the route (recorded in Progress).

6. **AppShell orthogonal reconnecting (S1).** In
   `packages/ui/src/components/app-shell.tsx`, split the mutually
   exclusive `state` union: `state` keeps the chrome axis (`default` |
   `game`), and the reconnecting treatment derives from the existing
   `connection` prop on **both** chromes — banner under the header in
   default chrome, and a floating reconnecting treatment coexisting
   with the collapsed game chrome (exact form decided in the gate
   round; the shell root is already the positioned ancestor).
   Backwards migration: `room-screen.tsx` currently passes
   `state="reconnecting"` — update it to the new surface (no behavior
   change; its W4 test must stay green as the regression pin). Canon:
   `design-system/components/core/app-shell.md` → r3 recording the
   orthogonality. ui tests: game chrome + reconnecting render
   together; default chrome unchanged.

7. **Connection dot shape redundancy (S2).** Same file: the dot gains
   shape redundancy — filled disc when connected, **hollow ring at
   ~10–12px when reconnecting** (the CAM-17 judge's fix; closes the
   color-only exposure permanently — in game chrome the dot is the
   only signal). Sized from the ordinal scale (12px = `size-3`), no
   hardcoded values. `aria-label` redundancy already exists. Canon
   rides the same app-shell.md r3. ui test pins the structural shape
   difference (attribute/class presence per ADR-0030, ink verified by
   the rendered path).

8. **Container skeleton — `use-game.ts` + `game-screen.tsx` static
   composition (C1–C5 structure).** Follow `use-room.ts` /
   `room-screen.tsx` throughout:
   - **Bootstrap (C1):** `["game", gameId]` query on
     `GET /games/:gameId/view` via `apiRequest` + `decodeViewResponse`,
     `enabled: authenticated && denial === null`, `retry: false`.
     Subscribe both granted topics in an effect, unsubscribed on
     unmount.
   - **Version guard + refetch authority (C2, ADR-0033):**
     `lastVersionRef` advanced only by HTTP responses (query data and
     command `GameReply`s — both `setQueryData` through the same
     apply-if-newer function). Every decoded broadcast calls
     `scheduleRefetch()` — a **trailing debounce** so one command's
     5-event batch produces one GET (advisory window ~100ms; tuned at
     implement; the test asserts "one refetch per burst", not the
     number). `onResubscribe` calls the same `scheduleRefetch`. No
     broadcast payload is ever written into the snapshot.
   - **Denials/errors (C3):** 404 → `no-access` denial state
     (byte-identical for unknown/non-participant — one honest copy
     panel, voice.md register); unauthenticated → NameForm in place
     (URL unchanged), resolve on session; network/5xx → page error
     with retry, computed with the room's no-flash `failed`
     discipline. 300ms no-flash skeleton for first load.
   - **Composition:** the screen renders `AppShell` (game chrome,
     `connection` wired — S1/S2 give it the in-game treatment) with
     `TableSurface state="in-game"`: one `<><Seat/><Hand/></>` node
     per `view.players` entry (array index = seat, `viewerSeatIndex`
     from the session id, names from the projection), deck + discard
     in `center` from `deckCount`/`discard`, `TurnIndicator` docked,
     `FlightLayer` mounted in the table root. Hands render from
     occupancy only (`slots`), `faces` empty at this step. Fix hazard
     1 here: explicit z-index on seat wrappers above the art layer in
     `table-surface.tsx`. All interactions inert until step 10.
   - Peek/flight/reveal **display state** lives in the hook as
     ephemeral React state (hazard 3): never the query cache.
9. **Route swap + MVS ledger (C4).** Replace
   `routes/game.$gameId.tsx` with the one-line picker (per-route title
   kept). Delete `game-placeholder.test.tsx`; the game-screen suite
   now covers the route render. Run the room suite to prove the stub
   decision held. The 8-state ledger is answered below (this document,
   next section).

10. **H1 helpers + affordance mapping (H1, T1).**
    `containers/game/affordances.ts`: `rankOfSlug`, `isPowerRank` (the
    set {7,8,9,10,J,Q} — mirrors the engine's `takeable`), and
    `slamGiveSlotRequired(slammerId, targetOwnerId, slammerHand)`
    (opponent slam + non-empty hand ⇒ required; own slam or zero-card
    slammer ⇒ null — mirrors the engine, pinned server-side by
    `SlamWindow.test.ts` own-slam-null and opponent-give blocks). Unit
    tests against the `cambio-rules` tables — **written from the skill,
    not from memory**. Then the pure `affordancesFor(view, viewerId)`
    mapping implementing the ViewPhase table above; unit-tested per
    variant for holder and non-holder. Wire `AwaitingDraw` into the
    screen: Call Cambio button (opens the confirm modal titled
    "Call Cambio — ends the game" per modal.md; `CallCambio` on
    confirm), Take discard (enabled per H1 on `discard[0]`), Draw
    (enabled per the drawable rule) — commands POST through a
    `sendCommand` mutation (`encodeWireCommand` +
    `decodeGameReply`; reply applied via the version guard).
    Non-holders: turn indicator names the active player (voice.md
    register), hands inert. T5 wiring lands here too: a 422 never
    breaks the table — refetch + inline failure copy near the action
    (voice.md; **never a toast** — toast.md law).

11. **Interaction canon rounds + held card (T2).** Creation-gate
    rounds (batch-approved, one round each, canon doc revisions land
    with the code): Hand `selectedSlots` + empty-slot give-target
    clickability (hand.md), deck/discard click affordances wrapping in
    accessible buttons following Hand's internal slot-button precedent
    (draw-deck.md, discard-pile.md), and the **held-card spot** — new
    `components/game/held-card.tsx`, position/reading decided in the
    round (new canon file or a table-surface.md/playing-card.md
    extension — the round decides). Wire `HoldingCard`: holder sees
    `phase.card` at the spot; everyone sees it when
    `source === "discard"` (entitlement is structural — the field is
    simply absent otherwise, pinned `ViewFor.test.ts` holding-card
    entitlement); affordances swap-into-own-occupied-slot /
    discard (deck-source only — a discard take can never go back,
    §1(b): the affordance never renders) / keep (empty hand only).
    Draw and discard flights enqueue from their events (`CardDrawn` →
    deck→seat flight face-down for all; `DiscardTaken` → pile→seat;
    `HeldSwapped`/`HeldDiscarded`/`PowerDiscarded` → slot/spot→pile
    `leaving-play` face-up), with DrawDeck `draw` and DiscardPile
    `receiving` states rendering during their flights (CH1).

12. **Powers + peeks (T3, T4).** Targeting via the extended Hand
    props: `ResolvingPower` holder selects per power class (7/8 own
    occupied slot, 9/10 opponent occupied, J two distinct occupied
    slots across any players → `PowerSwap`), Q is `PowerPeek` then
    `ResolvingQueenSwap` → `PowerSwap`. The peek state machine in
    `use-game.ts`: `PrivateCardPeeked {target, card}` → ephemeral
    reveal entry → the target card renders `face="peeking"` for
    `duration.peek` → flips back → the entry is **deleted, never to
    return** (memory fidelity; the Queen's value likewise clears
    before the swap — the player swaps from memory, round-1 decision).
    Everyone else sees the public `CardPeeked` beat (seat `acting`,
    which slot, no value). `PowerFizzled` renders as a public no-op
    beat; blind swaps enqueue both slot↔slot flights, backs only
    (CH1). Non-holders see the seat acting + which power (phase
    carries no card for them). jsdom tests: reveal appears, disappears
    after the token duration (fake timers), **never re-renders**, and
    the value exists nowhere in the DOM afterward (C5 sweep).

13. **Slam window (SL1–SL3).** `SlamWindow` phase: `SlamTimer` wired
    with `{closesAt, durationMs: config.slamWindowMs}`; every
    face-down card marked slam-eligible via `slamWindow`; slam click
    on an own card sends `Slam {target, giveSlot: null}` immediately;
    on an opponent's card, when H1 says a give is required, the
    slammer's own hand enters the give-pick flow (awaiting selection
    of one own occupied slot, then the single `Slam` command) — else
    null (zero-card slammer, ADR-0009). Resolutions drive display
    state + flights **from event payloads only** (ADR-0033/G5):
    `SlamSucceeded`/`SlamFailed` reveal the slammed card momentarily
    (both carry it — §1.5), timer shows `resolving` during the
    reveal and **never restarts its drain**; then own-correct →
    slot→pile flight, vacancy stays; opponent-correct → the give
    flights **value-free** (card back) into the vacated slot
    (`CardGivenFromHand`/`CardGivenFromDeck`); incorrect → penalty
    flights face-down deck→slammer's lowest free slot, unseen by
    everyone including the slammer (ADR-0022); `DrawSkipped` renders
    as a beat with no movement. `SlamWindowClosed` + `TurnAdvanced`
    arrive as one batch → one debounced refetch moves play on; the
    client **never** closes the window itself (`closesAt` drives only
    the visual drain); a late `422 SlamTooLate` surfaces per T5,
    non-fatally. Empty pile ⇒ no window, no timer rendered
    (ADR-0012). The reshuffle moment (CH2): on `DeckReshuffled`, the
    pile-minus-top flights to the deck (the top **visibly stays**),
    deck count updates — DrawDeck `reshuffling` state renders during
    it; the reshuffle can precede `CardDrawn`/`PenaltyDrawn`/
    `CardGivenFromDeck` in one batch, so flight ordering follows
    batch order.

14. **Endgame (E1–E3) — including the composition decision.**
    `CambioCalled` → turn indicator flips to game-over copy ("X
    called Cambio", poster register) **before** the reveal
    (turn-indicator canon order). The reveal is refetch-driven: the
    caller has `view.reveal` in their own `GameReply`; everyone else's
    `GameEnded` handler schedules the refetch (ADR-0033's natural
    path). ScoreSheet gains the `revealing` entrance (simultaneous
    flip at `duration.track`, canon round) and renders sorted
    ascending, plural winners on ties, true-minus totals, caller
    unmarked, zero-card hands never styled as winning. **Game-over
    composition (hazard 4), decided:** the score sheet renders as a
    **screen-level sibling overlay above `TableSurface`** in
    `game-screen.tsx` — not in `center` — while TableSurface takes
    `state="game-over"` for the dim; `center` content stays beneath
    the scrim as the dimmed tabletop. Rationale: table-surface.md's
    "table is ground, not HUD" — the score sheet is page content, and
    the disc-sized scrim cannot contain a full sheet on compact.
    Surface this reading in the M6 gate round; if the judge or user
    reads table-surface.md's "the score-sheet overlays" differently,
    it becomes an r3 wording clarification, never a silent
    resolution. One exit: back to the lobby (`navigate({to: "/"})`).
    A reload on the ended game re-renders the score sheet (the view
    stays fetchable — persisted state row), not an error.

15. **Audit + walkthrough (M6 close).** Reduced-motion parity sweep
    (CH3): every CH1/CH2 flight has the cross-fade + `accent.focus`
    treatment; no information exists only in motion — verified in the
    rendered path (emulate reduced motion in the browser). Design-gate
    pipeline (decompose→map→judge) on the game screen's states —
    **the tabletop's decorative-contrast exemption has expired** now
    that it carries the deck/discard: re-check contrast on the table
    art. `ai-tells` on every new surface; impeccable pass; verdicts
    advisory, design system outranks, conflicts surfaced here.
    Radius/hand-placement visual tuning finalized against the
    rendered table (step 1's derivation tests keep the math honest).
    Then the live two-session walkthrough (root acceptance: full game
    to a Cambio call — draws, each dealt power class, at least one
    slam with give or penalty, reshuffle if reached, score sheet →
    lobby; kill/restart realtime to see the in-game reconnecting
    treatment and a correct table after recovery). Final gate, bare.

## Page-state ledger (C4 — the 8-state MVS answered)

Recipes from `design-system/patterns/screen-states.md`. Inherits the
open ledger recorded at [frontend/CAM-17.md](CAM-17.md) (game
placeholder section) — nothing silently skipped.

### Game (`/game/$gameId`)

| State            | Call                        | Realization / justification                                                                                                                                                                                                                                                                                                                                                         |
| ---------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| loaded           | built                       | the full table: seats + hands from the snapshot, deck/discard center, turn indicator, phase affordances                                                                                                                                                                                                                                                                             |
| first-load       | built                       | skeleton matching the table layout while the view GET resolves (Loading's 300ms no-flash discipline)                                                                                                                                                                                                                                                                                |
| first-use empty  | N/A                         | the screen always renders a dealt game — there is no pre-content moment distinct from loaded, and no list surface; the room screen owns the pre-game gathering                                                                                                                                                                                                                      |
| no-results empty | N/A                         | no list, no filter — nothing can produce "no matches"                                                                                                                                                                                                                                                                                                                               |
| page error       | built                       | view GET network/5xx → full-region alarm alert + retry; shell stays                                                                                                                                                                                                                                                                                                                 |
| partial failure  | N/A (v0, surfaced conflict) | screen-states.md's seat-level rule ("a player's connection state renders at their seat") requires presence data the wire deliberately lacks (own-connection-only v0 decision; `ViewPlayer` is id/name/hand, no event carries presence). `Seat.disconnected` stays dormant. **Surfaced as a canon conflict, not silently skipped** — revisit when presence lands (root Decision Log) |
| no-access        | built                       | the byte-identical 404 (unknown id and non-participant alike) → honest no-access panel: what this is, why you can't watch, where to go                                                                                                                                                                                                                                              |
| reconnecting     | built                       | the S1 orthogonal treatment: collapsed game chrome **plus** the reconnecting signal (S2 hollow-ring dot); the table stays live and current-as-of; refetch on resubscribe restores without reload                                                                                                                                                                                    |

## Concrete steps & validation

- Per-package suites, always through turbo (builds deps first):
  `pnpm turbo test --filter @cambio/web` and
  `pnpm turbo test --filter @cambio/ui`. Baseline at plan time: web 75,
  ui 19 — all must stay green through every canon revision. Single-suite
  iteration after a build: `npx vitest run test/<file>` inside the
  package.
- Room-suite regression after step 9 (the harness decision's proof):
  the room and lobby suites pass unchanged.
- Rendered checkpoints: gallery flight demo eyeballed after step 4;
  design-gate hardcheck + full pipeline in step 15 (one-time setup from
  `.agents/scripts/design-gate/`: `npm install --omit=dev` +
  `npx playwright install chromium`).
- Live walkthrough (step 15):
  `docker compose -f docker/docker-compose.yml up -d`, migrations
  applied, `pnpm dev`, two sessions from `http://localhost:3000` —
  create → join → start → full game to a Cambio call per the root
  acceptance list; kill/restart the realtime container mid-game for
  the reconnecting treatment + recovery check.
- Hidden-information sweep (root acceptance): jsdom assertions that
  face-down renders carry no value anywhere in the DOM, peeked values
  disappear and never re-render, and the recorded `stubApi` calls show
  no requests beyond the view GET + commands POST.
- Final gate, run **bare, never piped**:
  `pnpm turbo build typecheck lint test`.

## Contract coverage

_(maintained by `/implement`, verified by `/review`. **Plan-time rule:**
only the Clause column and the planned-approach note are filled here;
test file, name, and assertion phrase are written by `/implement` as
each test lands — invented test titles become review findings.)_

| Clause | Planned approach (plan-time)                                                                                                                                                                                                                           | Test (file + name) | What is asserted |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ---------------- |
| G1     | unit suite on `table-geometry.ts`: one derived radius source (ring inside the art edge), seat positions/symmetry, hand/anchor math; visual radius tuned in the step-15 rendered pass (ADR-0030)                                                        |                    |                  |
| G2     | pure `flip.ts` planner tests (delta/scale, degenerate-rect no-op, interruption-as-data); flight-layer structural tests (value-free spec renders a back, entitled spec a face, cancel clears, reduced-motion branch renders highlights)                 |                    |                  |
| G3     | non-vitest canon evidence: gate round run, tokens.md + playing-card.md amended with revision entries, `--duration-peek` in styles.css; consumption pinned by the T4 peek tests                                                                         |                    |                  |
| S1     | ui suite: game chrome and reconnecting treatment render together (orthogonal); default chrome regression; room W4 test stays green through the prop migration                                                                                          |                    |                  |
| S2     | ui suite: structural shape difference between connected (filled) and reconnecting (hollow ring) dot; aria-label redundancy retained; ink/size verified by the rendered gate path                                                                       |                    |                  |
| C1     | game-screen suite via the step-5 harness path: bootstrap GET decoded, both granted topics subscribed, table renders from the snapshot, 300ms no-flash skeleton                                                                                         |                    |                  |
| C2     | version guard: stale HTTP response discarded, newer applied; an event burst produces exactly one refetch (recorded calls); `onResubscribe` refetches; broadcast payloads never mutate the snapshot                                                     |                    |                  |
| C3     | denial branches: 404 → no-access panel; unauthenticated → NameForm in place (URL unchanged) then resolution; 5xx → page error with retry, no one-frame flash                                                                                           |                    |                  |
| C4     | ledger above (built states each pinned by their branch tests; N/A rows carried by justification, partial-failure conflict surfaced)                                                                                                                    |                    |                  |
| C5     | hidden-info sweep: face-down DOM carries no value; only wire-delivered values render; peeked values gone after the window; recorded calls limited to view GET + commands POST                                                                          |                    |                  |
| H1     | unit tests on `affordances.ts` helpers against the `cambio-rules` tables: rank-of-slug, power set {7,8,9,10,J,Q}, give-slot rule (opponent+non-empty ⇒ required; own or zero-card ⇒ null)                                                              |                    |                  |
| T1     | AwaitingDraw affordances for holder (Cambio always + confirm modal; take-discard gated on non-power top; draw gated on drawable) and non-holder (indicator names the player, hands inert); commands POSTed                                             |                    |                  |
| T2     | HoldingCard: held card at the spot for holder, public for discard-source; swap/discard/keep affordances per source and hand occupancy; discard-source take never offers discard-back                                                                   |                    |                  |
| T3     | power targeting per class incl. J two-distinct-slots and the Queen two-step (`PowerPeek` then `PowerSwap`); fizzle renders a public beat; non-holder sees seat acting + power, no card                                                                 |                    |                  |
| T4     | peek reveal state machine with fake timers: flips up for `duration.peek`, flips back, never re-renders, value absent from DOM after; Queen's value clears before swap selection                                                                        |                    |                  |
| T5     | a 422 (NotYourTurn/WrongPhase/…) leaves the table intact: refetch fired, inline failure copy near the action, no toast rendered                                                                                                                        |                    |                  |
| SL1    | timer wired from `closesAt` + `config.slamWindowMs`; all face-down cards slam-eligible; own slam sends giveSlot null immediately; opponent slam enters the give-pick flow when H1 requires, else null                                                  |                    |                  |
| SL2    | resolution display state from event payloads: SlamSucceeded/SlamFailed reveal the carried card, timer `resolving` without drain restart; give flight value-free; penalty arrives unseen; DrawSkipped is a beat                                         |                    |                  |
| SL3    | close only by the server's word: the SlamWindowClosed+TurnAdvanced batch → one refetch moves play; SlamTooLate surfaces per T5; empty pile renders no timer                                                                                            |                    |                  |
| E1     | CambioCalled flips the indicator to game-over copy before any reveal renders (ordering pinned structurally)                                                                                                                                            |                    |                  |
| E2     | caller renders reveal from their own GameReply; non-caller refetches on GameEnded; score sheet sorted ascending, plural tie winners, true-minus totals, caller unmarked, revealing entrance state present                                              |                    |                  |
| E3     | game-over dims the table under the sibling-overlay composition; single back-to-lobby exit navigates `/`; a fresh mount on an ended game renders the score sheet, not an error                                                                          |                    |                  |
| CH1    | flight specs enqueued for each public movement (draw, discard placements, blind swaps both directions, gives, penalties, slam removals) with deck `draw` / pile `receiving` states during; movement itself verified in the rendered path + walkthrough |                    |                  |
| CH2    | DeckReshuffled enqueues the pile→deck choreography with the top visibly retained (structural: top unchanged, `reshuffling` state renders); count updates on refetch                                                                                    |                    |                  |
| CH3    | reduced-motion branch covered structurally per flight kind (highlight treatment renders, no overlay card); full parity verified in the rendered pass (step 15)                                                                                         |                    |                  |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [x] 2026-09-05 — frontend child plan written

## Surprises & notes for the root plan

- **Harness decision (settled at plan time, step 5):** keep the
  `/game/$gameId` stub in `renderApp` for the room/lobby suites; add a
  separate game render path mounting the real `GameScreen`. Replacing
  the stub would couple the room navigation tests to game-view fetch
  stubs for zero assertion gain.
- **Game-over composition (settled at plan time, step 14):** score
  sheet as a screen-level sibling overlay above `TableSurface`
  (`state="game-over"` dims beneath); `center` never hosts the sheet.
  Consistent with "table is ground, not HUD"; to be surfaced in the M6
  gate round — if canon wants the overlay inside TableSurface instead,
  that lands as a table-surface.md r3 clarification, not a silent
  divergence.
- **Reduced-motion detection needs JS** (step 3): the flight layer
  drives transforms imperatively, so `motion-reduce:` utilities can't
  gate it — a `matchMedia("(prefers-reduced-motion: reduce)")` check is
  the repo's first JS motion gate. Recorded so the reviewer doesn't
  read it as a Tailwind-idiom violation.
- **The judge's seat-ring fix options were never preserved in the
  repo** — only the "one radius source" direction survived
  (frontend/CAM-17.md forward notes). Step 1 therefore derives the ring
  from the table anatomy and defers the final value to the rendered
  pass rather than reconstructing a lost recommendation.
- **`PrivateCardPeeked`/`PrivateCardDrawn` are single-delivery**
  (ADR-0021): a channel drop in the delivery window loses the reveal
  with no recovery — accepted as designed; the UI degrades gracefully
  (no reveal ≠ broken screen; `PrivateCardDrawn` is additionally
  covered because the holder's own phase carries the same slug).
