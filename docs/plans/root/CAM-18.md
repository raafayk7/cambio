# CAM-18 — Game table screen — turn flow, powers, slam window, choreography

- **Linear:** [CAM-18](https://linear.app/raafayk7/issue/CAM-18) (sub-issue of
  [CAM-16](https://linear.app/raafayk7/issue/CAM-16); was blocked by
  [CAM-17](https://linear.app/raafayk7/issue/CAM-17), now shipped)
- **Scope:** frontend
- **Child plans:** [frontend](../frontend/CAM-18.md)
- **ADRs:** 0033 (game screen state is the refetched view; broadcasts are
  animation triggers only) · 0034 (card flights via a hand-rolled FLIP
  layer, no animation dependency)

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

After this task, players who start a game from the room screen land on a
real game table instead of the "shuffling…" placeholder: a top-down khoka
table with every player seated radially, hands laid at seats, deck and
discard in the center. The active player takes turns (draw, take the
discard, call Cambio), powers resolve with peeks and blind swaps, anyone
can slam during the timed window, and a Cambio call ends the game with the
score-sheet reveal and a path back to the lobby. Cards visibly fly between
deck, discard, and slots — tracking a moving card is the memory mechanic.
Observe it working by running `pnpm dev` (Docker Postgres + Realtime up)
and playing a full two-browser game from `http://localhost:3000`:
create → join → start → play to a Cambio call.

## Context & orientation

The entire game engine, HTTP command surface, and realtime publishing
exist (CAM-1 through CAM-12) and CAM-17 shipped the web foundation this
task reuses wholesale: `apps/web/src/services/api.ts` (fetch + contracts
decode + `ApiError`), `services/realtime.ts` (`subscribeTopic`, connection
status), `hooks/use-session.ts` / `use-connection.ts`, and the container
pattern in `apps/web/src/containers/room/` (co-located hook, version
staleness guard, denial states, refetch-on-resubscribe). The game route
`apps/web/src/routes/game.$gameId.tsx` is a logic-free placeholder that
this task replaces with a route→container pick, following the
container-owns-its-AppShell deviation recorded in the CAM-17 frontend
plan.

All ten game objects exist in `apps/web/src/components/game/`
(playing-card, hand, draw-deck, discard-pile, slam-timer, turn-indicator,
score-sheet, seat, seat-arc.ts, table-surface) — but as presentational
pieces: only `Hand` takes a click handler, flight props are static styling
with no movement, and four canon choreography states (deck
`empty→reshuffling` and `draw`, discard `receiving`, score-sheet
`revealing`) have no props at all — the CAM-15 carve-out this task was
always going to repay. There is no animation dependency and no
FLIP/measurement code anywhere in the repo.

The one bootstrap call the screen needs exists and is pinned:
`GET /games/:gameId/view` returns `{view, version, grants}`
(`GameCommands.test.ts` "view returns grants" block), works after game
end (state row persists; the room actor is evicted on `Ended`), and 404s
byte-identically for non-participants. Commands go to
`POST /games/:gameId/commands` (nine `WireCommand` variants; the session
user is injected server-side). Game events fan out on the room and
per-player topics, but **carry no version** — which is why ADR-0033
makes the versioned view the only state source and demotes broadcasts to
animation triggers.

Governing law: `frontend-architecture` (projection renderer;
pages → containers → components; logic in hooks), `hidden-information`
(never receive what the viewer isn't entitled to; memory fidelity),
`cambio-rules` (every rule question; anti-prior guard), `design-system`
(canon + creation gate; the approved canon batch below), ADR-0021
(private values delivered once, never re-sent), ADR-0030 (jsdom asserts
behavior/structure, never geometry), ADR-0032 (realtime wiring),
ADR-0033/0034 (written with this plan). HANDOFF §1 via `cambio-rules`;
§4.4 (knowledge follows cards); §5 (channel topology).

**Approved canon work (interview 2026-09-05, batch approval):** Hand
selection + empty-slot give-targeting; click affordances for
deck/discard/cards; DrawDeck `reshuffling`/`draw`, DiscardPile
`receiving`, ScoreSheet `revealing` states; a held-card presentation
spot; AppShell reconnecting banner orthogonal to the collapsed `game`
state; a `duration.peek` token (revising tokens.md's "two durations
only" and "peek is game config" lines). Each still goes through the
creation-gate process individually (canon doc revisions land with the
code); conflicts get surfaced, never auto-resolved.

## Functional contract

All claims about existing engine/API behavior are pinned by the cited
suites (probe-verified via exploration of this branch; the explorer
evidence is carried — condensed, with file:line references — in the
frontend child plan's orientation). Affordance clauses derive from `ViewPhase` +
occupancy + the two public-rule helpers (H1) only — never from domain
imports (lint-enforced).

### Groundwork (M1)

- G1. One geometry source: seat placement, hand placement, and flight
  anchor lookup derive from a single pure module (superseding the
  divergent `RING_RADIUS_PCT = 42` vs painted-bench ~33% pair); the
  stale "percent of the container's half-size" comment is corrected.
  The module is unit-tested numerically; visual tuning happens against
  the rendered table (jsdom cannot see layout, ADR-0030).
- G2. Flight layer per ADR-0034: a FLIP overlay animates a card
  travel between any two registered anchors (deck, discard top, any
  seat slot) at `duration.track`/`ease.snap`; face shown per
  entitlement only (a value-free flight renders a card back). Under
  `prefers-reduced-motion` no movement occurs: origin and destination
  get the canon cross-fade + `accent.focus` highlight instead. A
  flight interrupted by unmount or a newer snapshot completes or
  cancels without ever retargeting mid-air (flights reference their
  event payload, not live state).
- G3. `duration.peek` exists as a motion token through the creation
  gate; `playing-card.md`'s "game-configured peek duration" wording and
  `tokens.md`'s "two durations only" / "duration.peek is game config"
  lines are amended to match (round-1 user decision: fixed client
  duration).

### Shell & connection (M2)

- S1. The game screen uses the collapsed `game` chrome AND still
  renders the reconnecting banner + dot when the connection drops —
  `AppShell` gains an orthogonal reconnecting treatment (canon
  app-shell.md revision) instead of the current mutually exclusive
  `state` union.
- S2. The connection dot gains shape redundancy: hollow ring at
  ~10–12px when reconnecting, filled when connected (canon amendment;
  closes the color-only C1 exposure permanently, per the CAM-17
  forward note).

### Container & state sync (M3)

- C1. Bootstrap: on mount the container calls `GET /games/:gameId/view`
  and receives `{view, version, grants}` (pinned:
  `GameCommands.test.ts` view-grants block), subscribes both granted
  topics, and renders the table from the snapshot. The skeleton
  follows the room screen's 300ms no-flash discipline.
- C2. Refetch-authority per ADR-0033: every decoded broadcast schedules
  one debounced refetch per event batch; snapshot updates apply only
  when `version` is greater than the current snapshot's; the caller's
  own `GameReply {view, version}` applies directly by the same rule;
  `onResubscribe` triggers the same refetch. No broadcast payload is
  ever written into the snapshot.
- C3. Denials and errors: a non-participant or unknown id gets the
  byte-identical 404 (pinned `GameCommands.test.ts` non-participant
  block) and renders a no-access panel; an unauthenticated visitor
  completes the identity flow in place (room-screen pattern) and then
  resolves; network/5xx renders the page-error state.
- C4. The 8-state page MVS is answered: loaded, first-load skeleton,
  page error, no-access, and reconnecting are built; first-use empty,
  no-results empty are N/A (no list/filter surface) and partial
  failure is N/A for v0 (own-connection presence only — the
  screen-states.md seat-level rule is a surfaced canon conflict
  deferred until presence data exists; `Seat.disconnected` stays
  dormant). Justifications live in the child plan's ledger.
- C5. Hidden information holds structurally: face-down cards render
  from occupancy only (no value prop exists to leak); the only values
  rendered are those the wire delivered to this viewer (own view
  fields, public event payloads, `PrivateCardDrawn`/`PrivateCardPeeked`
  on the player topic); nothing persists a peeked value after its
  reveal window (memory fidelity — no markers, no "known cards"
  affordances of any kind).

### Turn flow (M4)

- H1. Two pure client helpers encode the only duplicated public rules
  (round-2 user decision): rank-of-slug + the power set {7,8,9,10,J,Q}
  (mirrors `Legality.ts` `takeable`, pinned by
  `GameCommands.test.ts`/engine suites) and the slam give-slot rule
  (opponent slam + non-empty hand ⇒ giveSlot required; own slam or
  zero-card slammer ⇒ null — pinned `SlamWindow.test.ts` own-slam-null
  and opponent-give blocks). Unit-tested against `cambio-rules`; the
  server remains the authority via 422s.
- T1. `AwaitingDraw` (viewer is `phase.playerId`): exactly three
  affordances — Call Cambio (always; opens the confirm modal "Call
  Cambio — ends the game" per modal.md, sending `CallCambio` on
  confirm), Take discard (enabled iff `discard[0]` exists and is
  non-power per H1; sends `TakeDiscard`), Draw (enabled iff
  `deckCount > 0 || discard.length > 1`, mirroring the engine's
  `drawable`; sends `DrawFromDeck`). Non-holders see the turn
  indicator name the active player; their hands are inert.
- T2. `HoldingCard`: the holder sees the held card at the held-card
  spot (canon batch item) — `phase.card` is present for the holder,
  and for everyone when `source === "discard"` (pinned
  `ViewFor.test.ts` holding-card entitlement) — and chooses: swap into
  an own occupied slot (`SwapHeld {slotIndex}`), discard
  (`DiscardHeld`, deck-source only), or keep (`KeepHeld`, empty hand
  only). A discard-source take can never be discarded back (no such
  affordance renders — rule §1(b)); other players see the seat acting
  and, for discard takes, the taken card.
- T3. Powers (`ResolvingPower`, holder): the affordance is targeting,
  never declining — 7/8 target one own occupied slot, 9/10 one
  opponent occupied slot (`PowerPeek {target}`); J targets two
  distinct occupied slots across any players (`PowerSwap`); Q is
  `PowerPeek` (any occupied slot) then `ResolvingQueenSwap` →
  `PowerSwap` (pinned: Queen two-step in the engine suites). Selection
  state renders via the extended Hand props. `PowerFizzled` renders as
  a public no-op beat. Non-holders see the seat acting + which power
  (`phase` has no card for them — pinned `ViewFor.test.ts`).
- T4. Peeks are memory-faithful: the entitled viewer's
  `PrivateCardPeeked` value flips the target card up for
  `duration.peek`, then back, never to return (round-1 decision);
  the Queen's peeked value likewise flips back before the swap —
  the player swaps from memory (round-1 decision). Everyone else
  sees the public `CardPeeked` beat (which slot was looked at, no
  value).
- T5. Command failures surface non-fatally: a 422 (`NotYourTurn`,
  `WrongPhase`, `SlamTooLate`, etc.) never breaks the table — the
  screen re-syncs (refetch) and shows the failure inline near the
  action in voice.md register; game events never arrive as toasts
  (toast.md law).

### Slam window (M5)

- SL1. `SlamWindow` phase renders the slam-timer (duration
  `config.slamWindowMs`, deadline `closesAt` — fixed close, no
  resets, pinned ADR-0011 + `SlamWindow.test.ts` close-at blocks) and
  marks every face-down card slam-eligible. Any player may slam any
  occupied slot: own card sends `Slam {target, giveSlot: null}`;
  an opponent's card prompts the slammer's give-slot pick first when
  their hand is non-empty (H1), else null (zero-card slammer,
  ADR-0009).
- SL2. Resolutions animate from event payloads (they exist nowhere
  else — `viewFor` never re-sends them): `SlamSucceeded` /
  `SlamFailed` publicly reveal the slammed card momentarily (§1.5 —
  both carry the card, pinned `SlamWindow.test.ts` reveal
  assertions), then: own-correct — card flights to the pile, slot
  outline remains; opponent-correct — the give flights value-free
  into the vacated slot (`CardGivenFromHand`/`CardGivenFromDeck`,
  value-free pinned); incorrect — a penalty card flights face-down
  into the slammer's lowest free slot, unseen by everyone including
  the slammer (ADR-0022, pinned). `DrawSkipped` renders as a beat
  with no card movement. The timer shows `resolving` during reveals
  and never restarts its drain (multiple slams per window supported).
- SL3. The window closes only by the server's word:
  `SlamWindowClosed` + `TurnAdvanced` arrive as one batch (pinned
  `SlamWindow.test.ts` close-batch assertions) and the refetched
  snapshot moves play on; a late slam's `422 SlamTooLate` surfaces
  per T5. The client never closes the window itself; `closesAt`
  drives only the visual drain. When the discard pile is empty no
  window exists and none is rendered (ADR-0012).

### Endgame (M6)

- E1. `CambioCalled` flips the turn indicator to game-over copy ("X
  called Cambio", poster register) before the reveal (turn-indicator
  canon order).
- E2. The reveal is refetch-driven: `view.reveal` is present exactly
  when phase is `Ended` (pinned `ViewFor` reveal-at-Ended) — the
  caller has it in their own `GameReply` immediately (pinned
  `EndToEndGame.test.ts` caller-reveal), everyone else refetches on
  `GameEnded`. The score sheet enters with the `revealing`
  simultaneous flip at `duration.track` (canon batch item), sorted
  ascending, ties showing plural winners (pinned `ViewFor.test.ts`
  tie block), negative totals formatted with the true minus, the
  caller unmarked, zero-card hands never styled as winning.
- E3. The table dims under the game-over treatment and the score
  sheet offers exactly one exit: back to the lobby (`/`) — the v0
  post-game path. The view remains fetchable after game end (state
  row persists), so a reload on the ended game re-renders the score
  sheet, not an error.

### Choreography (woven through M4–M6, mechanism from M1)

- CH1. Every public card movement is a visible flight (hand.md:
  "never teleport a card"): draw (deck→holder, face-down to all —
  the drawer's value appears at the held-card spot, not mid-flight),
  discard placements (slot→pile, face-up `leaving-play`), blind
  swaps (slot↔slot, backs only, both flights), gives, penalties, and
  slam removals. The pile's `receiving` and the deck's `draw` states
  render during their flights (canon batch items).
- CH2. The reshuffle is the designed public moment: on
  `DeckReshuffled`, the pile minus its retained top flights to the
  deck (the top visibly stays), and the deck count updates
  (retained-top pinned by the engine reshuffle suites).
- CH3. Reduced-motion parity: every flight in CH1/CH2 has the
  cross-fade + `accent.focus` origin/destination treatment; no
  information exists only in motion.

### Acceptance criteria

- [x] `pnpm turbo build typecheck lint test` passes, run bare (no
      pipes) — forced, 25/25 tasks, 0 cached: api 118, domain 194,
      application 86, contracts 11, config 16, ui 25, web 185 = 635
      tests.
- [x] Full live game executed (in-app browser + cookie-jar HTTP
      session): create → join-on-visit → start → played to a Cambio
      call. Covered: draws both ways; every DEALT power class (9/10
      peeks, Queen two-step with a cross-player swap, J two-pick from
      the browser — 7/8 never drawn, so per "if dealt" satisfied); a
      failed slam → penalty (closesAt fixed through the attempt,
      ADR-0011 live); reshuffle not reached (deck never emptied — "if
      reached"); confirm-modal call → CAMBIO! indicator → score sheet
      byte-identical to the server reveal → back to lobby; ended-game
      reload re-renders the sheet. Realtime kill/restart mid-game
      showed the in-game reconnecting treatment and a correct table on
      recovery.
- [x] The 8-state MVS ledger answered in the frontend child plan
      (5 built with branch tests, 3 N/A justified), including the
      partial-failure N/A with its surfaced canon conflict.
- [x] Hidden-information sweep green: face-down renders carry no
      value anywhere in the DOM, penalty values never exist
      client-side, peeked values disappear after the reveal and never
      re-render, and recorded calls are limited to the view GET +
      commands POST (+ /me).
- [x] Design-gate pipeline (decompose→map→judge) run on live
      authenticated renders (mid-game, ended, compact): hard checks
      PASS everywhere (0 constraint fails), verdict flagged with 6
      accidental default-tier points and ZERO blocking findings — all
      six fixed in the same cycle and re-verified rendered (child plan
      step-15 Progress); 5 further findings judged controlled/allowed
      and left as-is. `ai-tells` 1/30 (invisible; its one finding
      fixed); impeccable deterministic detector clean on all changed
      UI files. Reduced-motion verified: flight-layer structural tests + a clean render under emulated prefers-reduced-motion.
- [x] All canon revisions landed as r-revisions alongside their code:
      tokens.md r2 (duration.peek), playing-card.md r2, hand.md r2
      (+amendment), draw-deck.md r2, discard-pile.md r2, held-card.md
      r1 (new), score-sheet.md r2 (+footer amendment), app-shell.md
      r3, table-surface.md r3.

## Plan of work

**M1 — Flight layer + geometry (the mechanism before the screen).**
The pure geometry module (one radius source, anchor registry) and the
FLIP flight layer per ADR-0034, with the reduced-motion path designed
in from the start; the `duration.peek` token and motion-canon
amendments land here. Unit tests cover the math; the gallery hosts a
flight demo so the mechanism is visually verifiable before any screen
exists.

**M2 — Shell & connection groundwork.** AppShell's orthogonal
reconnecting treatment and the connection-dot shape redundancy (canon
revisions + `packages/ui` changes + tests). Landed before the screen
so the gate sees final chrome.

**M3 — Game container & state sync.** `containers/game/use-game.ts` +
`game-screen.tsx` skeleton per ADR-0033: bootstrap, subscriptions,
debounced refetch, version guard, command mutations, denial/error/MVS
states, table composed in its static form (seats + hands + center
from the snapshot, no interactions yet). The test-harness route
question (game-route stub vs real screen) is settled here.

**M4 — Turn flow & powers.** Affordance derivation (H1 helpers +
phase mapping), the Hand/deck/discard/card interaction extensions
through the creation gate, held-card spot, Cambio confirm modal, peek
reveals with `duration.peek`, Queen two-step, turn-indicator copy.
Draw/discard flights wire up as these actions land.

**M5 — Slam window.** Timer wiring, slam targeting incl. give-slot
pick, resolution reveals and flights (give, penalty, removal), close
batch handling, `SlamTooLate` surfacing, reshuffle moment.

**M6 — Endgame + audit.** Score-sheet `revealing` entrance, game-over
composition (resolving the scrim-over-center conflict), back-to-lobby,
then the full audit pass: design gate, ai-tells, impeccable,
reduced-motion verification, the live full-game walkthrough, final
bare gate.

Order rationale: the flight mechanism and geometry are the riskiest
unknowns and everything composes on them (M1 first); chrome changes
move every screen so they precede composition (M2); the container must
be correct before interactions multiply states (M3); slam depends on
turn flow existing (M4→M5); the endgame is the only strictly terminal
surface (M6). No contracts work exists — the wire is consumed as
frozen (verified against the running branch during planning; any gap
discovered mid-implementation is a stop-and-surface, fixed
server-side per `hidden-information`, never worked around).

## Validation

- Unit (jsdom, ADR-0030): geometry and flight-planner math as pure
  modules (seat-arc precedent); H1 helpers against `cambio-rules`;
  container behavior driven through the existing harness + fake
  realtime (bootstrap, version guard, debounced refetch, denial
  branches, phase→affordance mapping, command dispatch, memory
  fidelity, endgame). Test intents live in the child plan's coverage
  table (test-nameless until `/implement` lands them).
- Rendered: the design gate's screenshot path covers geometry,
  contrast (the tabletop's decorative-contrast exemption expires now
  that it carries the deck/discard — re-check), and reduced motion.
- Manual: the full live two-session game in the acceptance criteria.
- Regression: the room/lobby suites stay green (the harness change
  must not break their navigation assertions); the placeholder test
  is replaced, not deleted silently.

## Progress

_(updated continuously; append new entries at the BOTTOM — newest last;
timestamp each entry)_

- [x] 2026-09-05 — plan written
- [x] 2026-09-05 17:00–17:30 — M1 (flight layer + one-radius geometry +
      duration.peek 2800ms) and M2 (AppShell orthogonal reconnecting +
      hollow-ring dot, app-shell.md r3) complete, parallel lanes.
- [x] 2026-09-05 18:00 — M3 complete: game container per ADR-0033
      (refetch authority, version guard, debounced batch refetch),
      harness render path, MVS branches, route swap. web 111.
- [x] 2026-09-05 19:00 — M4 complete: H1 helpers + affordances, canon
      interaction extensions (hand.md/draw-deck.md/discard-pile.md r2,
      held-card.md r1), Cambio confirm modal, memory-faithful peeks,
      Queen two-step. web 164.
- [x] 2026-09-05 20:00–20:30 — M5 (slam window SL1–SL3 + reshuffle
      CH2) and M6 endgame (E1–E3, score-sheet revealing, sibling
      overlay, back-to-lobby) complete. web 185.
- [x] 2026-09-06 02:00 — M6 close: full forced gate 25/25 (635 tests);
      live two-session full game to a Cambio call (details in the
      child plan step-15 Progress); ai-tells 1/30; impeccable detector
      clean; design-gate pipeline on live authenticated renders —
      hard checks PASS (mid-game, ended, compact), verdict flagged 6
      accidental / 0 blocking.
- [x] 2026-09-06 02:45 — gate fix cycle: all six flagged points
      resolved (seat edge-anchoring + viewer-dock exception, Call
      Cambio docked by the viewer, full-region game-over rest,
      score-sheet footer slot, phantom-slot spacer, badge clearance)
      plus the ai-tells copy finding and the CAMBIO! pill overflow;
      canon r3/amendments landed with the code; re-rendered and
      re-verified; final forced full gate 25/25 green.

## Decision log

- 2026-09-05 — CAM-18 planned after CAM-17 shipped, per the CAM-16
  split decision; the CAM-17 retrospective's forward notes are inputs
  here (geometry reconciliation, connection dot, contrast expiry).
- 2026-09-05 — **Names-in-GameStarted refactor deferred** (user call,
  round 1): the advisory stays logged; the frontend maps event UUIDs
  to names via the snapshot's `players`. Task stays frontend-only.
- 2026-09-05 — **Peek ends on a fixed client duration** (user call,
  round 1): `duration.peek` becomes a motion token through the
  creation gate; playing-card.md + tokens.md amended. Rejected:
  `peekDurationMs` in GameConfig (backend touch for a display
  concern); tap-to-dismiss (more interaction during a ticking window).
- 2026-09-05 — **Queen's peek flips back before the swap; the player
  swaps from memory** (user call, round 1) — matches the physical
  game and memory fidelity. Rejected: reveal persisting through swap
  selection.
- 2026-09-05 — **Acceptance is a full live two-session game to a
  Cambio call** (user call, round 1). Rejected: targeted-flows-only
  verification.
- 2026-09-05 — **Refetch-authority state sync** (user call, round 2)
  — promoted to ADR-0033. Rejected: versioning game events
  server-side; unguarded event folding.
- 2026-09-05 — **Hand-rolled FLIP flight layer** (user call, round 2)
  — promoted to ADR-0034. Rejected: motion library; no-true-flights.
- 2026-09-05 — **Client-side legality helpers** for the two public
  rules (user call, round 2): rank/power-set + give-slot rule as pure
  tested helpers; consistent with the standing "affordances derive
  from ViewPhase + occupancy" decision. Rejected: `legalCommands` on
  the view (contract change for data the phase implies).
- 2026-09-05 — **Canon extension batch approved** (user call, round
  2): Hand selection + empty-slot give-targeting, deck/discard/card
  click affordances, DrawDeck/DiscardPile/ScoreSheet choreography
  states, held-card spot, AppShell orthogonal reconnecting,
  `duration.peek` token. Each lands through the creation-gate process
  individually.
- 2026-09-05 — **Partial-failure MVS row is N/A for v0**: the
  screen-states.md seat-level rule requires presence data the wire
  deliberately lacks (own-connection-only v0 decision). Surfaced as a
  canon conflict, not silently skipped; revisit when presence lands.
- 2026-09-05 — **Endgame hands via refetch** (follows ADR-0033): the
  caller renders `reveal` from their `GameReply`; everyone else
  refetches on `GameEnded`. Rejected: adding hands to the `GameEnded`
  event (legal — endgame is public — but a contract change with no
  v0 need).
- 2026-09-06 — (gate fix cycle) **Seat anchoring is asymmetric by
  design**: non-viewer seats edge-anchor at the ring point growing
  inward (fixes the chrome occlusion — the judged top defect); the
  viewer's dock stays centered because an own-size hand grown inward
  covers the deck/discard (caught in the first fix re-render). The
  hands-over-benches read the judge ruled a controlled break is kept.
  table-surface.md r3.
- 2026-09-06 — (gate fix cycle) **Call Cambio docks at the stage's
  bottom-right at regular** — it is the viewer's action and lives by
  their hand; removing it from the top band is also what brings the
  viewer's own seat inside the fold mid-game. Compact keeps it in
  flow.
- 2026-09-06 — (gate fix cycle) **Game-over dims the whole surface**:
  a full-region green-deep rest above the seat layer joins the disc
  scrim (which the score sheet almost entirely covered) —
  table-surface.md r3. The ended state's own-hand tail below the fold
  is accepted as an authored scroll (no countdown post-game; child
  plan Surprises).
- 2026-09-06 — (gate fix cycle) **The game-over "CAMBIO!" drops the
  poster text-shadow** — at the indicator's 15px it muddied and
  overflowed the pill; the display face alone carries the shout. The
  shadow stays for the big display moments (SCORES, SLAM!).
- 2026-09-06 — (audit) ai-tells' one finding (the five-peat error-copy
  suffix) fixed by varying copy per voice.md's error formula; the
  judge's five controlled/allowed reads (hands-over-benches, face-down
  hands at ended, score-row stagger, wide flanks, deck-under-panel)
  deliberately left as-is.
- 2026-09-05 — (plan reconciliation) **Game-over composition: the
  score sheet renders as a screen-level sibling overlay above
  TableSurface** (which takes `state="game-over"` for the dim);
  `center` never hosts the sheet — it sits beneath the scrim by
  construction, and "table is ground, not HUD". Surfaced again in the
  M6 gate round; if canon is read differently there, the resolution
  is a table-surface.md wording clarification, never a silent
  divergence.

## Surprises & discoveries

_(anything found mid-implementation that the plan didn't predict — wrong
assumptions, upstream bugs, better approaches. Evidence included.)_

- (from planning exploration, for the implementer) The seat-arc
  comment "percent of the container's half-size" is wrong — 42 means
  42% of container _width_ (84% of half-width); seats currently sit
  outside the painted asset entirely. Quantified in the explorer
  report carried in the child plan.
- (from planning exploration) At `regular`, opponent seat wrappers
  paint _under_ the table art (DOM order + auto z-index) while the
  own seat paints over — invisible in jsdom, will bite the moment
  hands extend inward. Plan the z-order deliberately.
- (from planning exploration) The `game-over` scrim in TableSurface
  paints over `center` (sibling after it, same size) — the score
  sheet cannot live in `center` during game-over; composition must
  resolve this.
- (from planning exploration) The test harness's `/game/$gameId`
  stub is what keeps the room screen's navigation assertions cheap —
  replacing it naively breaks them; the child plan settles the
  harness shape.
- (from planning exploration) `PrivateCardPeeked` is single-delivery
  (ADR-0021): a channel drop in the delivery window loses the peek
  with no recovery. Accepted as designed; the UI must degrade
  gracefully (no reveal ≠ broken screen).

## Outcomes & retrospective

_(filled at the end, typically by `/review`)_
