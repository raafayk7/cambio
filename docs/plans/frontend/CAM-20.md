# CAM-20 — Four-player cap and the bench-anchored table (frontend)

- **Root plan:** [root/CAM-20.md](../root/CAM-20.md) — the functional
  contract lives there; this document is implementation detail for the
  frontend side. This side owns layout clauses **5–12** (the room-screen
  copy strings in clause 4 belong to the backend child plan).

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

Line refs below were current at HEAD `63272a7` on `release-v0` (plan
time). This task rewrites most of the files they point into — treat them
as orientation for the PRE-task shape, and prefer the symbol names.

- **Governing skills/ADRs:** `frontend-architecture` (projection
  renderer; containers own composition; no business rules in the
  client — this task is pure layout, zero payload change),
  `design-system` (tokens only; creation gate — two candidate new
  canonical values are flagged below as explicit STOPs),
  ADR-0036 (this task: bench doctrine, 2–4 cap, rotation constraint),
  ADR-0035 (no `transform: scale` above the flight root — extended to
  rotation by ADR-0036 §5), ADR-0034 (FLIP flights,
  capture-then-cancel), ADR-0030 (jsdom asserts structure, never
  geometry — geometry claims route to the design-gate rendered path),
  ADR-0027 (two-layer tokens, Tailwind v4 `@theme`).
- **Geometry engine** — `apps/web/src/components/game/table-geometry.ts`:
  the count-agnostic polar engine. `ringPositions` (viewer at 90° =
  bottom-center), `seatArc`, `handArc`, `inwardSide` (reduces a ring
  point to `top|bottom|left|right`), constants `SEAT_RING_GAP_PCT`,
  `SEAT_RING_RADIUS_PCT`, `HAND_RING_INSET_PCT`, `HAND_RING_RADIUS_PCT`,
  `TABLE_DISC_FRACTION` (0.54, spec-carried from the asset's alpha —
  survives this task), `ART_HALF_PCT`. **`handArc` and
  `HAND_RING_RADIUS_PCT` are dead** — no production consumer, only
  `apps/web/test/table-geometry.test.ts` reads them (verified at plan
  time: production consumers of the module are `table-surface.tsx` and
  `game-screen.tsx`, via `seatArc` + `inwardSide` only).
- **TableSurface** — `apps/web/src/components/game/table-surface.tsx`
  (canon: `design-system/components/core/table-surface.md` v4). Seat
  wrappers are `regular:absolute regular:z-10` at ring-point inline
  percentages with `EDGE_ANCHOR_CLASS` (a regular-only translate map
  keyed by `inwardSide`). The art is `w-3/4` of a
  `regular:max-w-2xl regular:aspect-square` root; compact art is capped
  by `--size-table-art-compact` (128px,
  `packages/ui/src/styles.css`) — **keyed to `viewerSeat="external"`
  only** (CAM-21 review F1: the room screen keeps the uncapped default
  path, byte-for-byte). Center overlay + game-over scrim size to the
  54% disc. The compact flow is opponents-row → art → (own seat skipped
  under `"external"`).
- **Hand** — `apps/web/src/components/game/hand.tsx` (canon:
  `design-system/components/core/hand.md` v2). One component, variants
  `own`/`opponent`; currently `grid w-fit grid-cols-2 gap-2`. Slot count
  rounds `highest + 1` up to even with a minimum of 4; stable slot
  indices; dashed vacancies at genuinely-empty indices; invisible pad
  cells beyond the highest real signal (one mark, one meaning — CAM-18
  gate finding). Every slot, occupied or not, carries
  `data-flight-anchor` via `slotAnchorId(playerId, slotIndex)`. Card
  sizes: `card-lg` (own, 96px regular / 48px compact) and `card-md`
  (opponent, 64px / 32px), from `packages/ui/src/styles.css`.
- **Game screen** — `apps/web/src/containers/game/game-screen.tsx`:
  `SeatWithHand` + `REGULAR_SIDE_FLEX_CLASS` (an `inwardSide`-keyed
  flex-direction map, `regular:`-prefixed since CAM-21), seat-node
  assembly, and the CAM-21 own-seat dock. **The dock duplication this
  task absorbs** (deferred from CAM-21 explicitly): the extracted
  own-seat wrapper hand-copies the centered translate that
  `EDGE_ANCHOR_CLASS` gives the viewer's bottom seat and reproduces the
  ring point from its own `seatArc` call, resting on a containing-block
  coincidence — the wrapper positions against `table-root` while
  opponents position against the `max-w-2xl` square, and the two boxes
  coincide only because the surface is the middle div's only in-flow
  content and both center at x=50%. `table-root`
  (`data-region="table-root"`) is the flight-measurement root
  (ADR-0034) and must not move.
- **Flight anchors** — `apps/web/src/components/game/flight/anchors.ts`:
  anchors found by `data-flight-anchor` inside the root; flights
  measure `getBoundingClientRect` and write untransformed pixels.
  ADR-0036 §5: **no rotate transform on any ancestor of a flight
  anchor** (same corruption class as ADR-0035's scale ban). Rotation
  goes on card visuals inside/below the slot anchor elements; anchor
  boxes stay upright, sized to the rotated footprint (w/h swapped).
  Note: `playing-card.tsx` (`rotate-6` on leaving-play, `rotate-y-180`
  in the flip) and `discard-pile.tsx` (under-card fan) already use
  rotate classes BELOW their anchors — legal, and the reason the new
  test pin must walk anchor ANCESTORS, not the whole tree.
- **Tests** — `apps/web/test/table-geometry.test.ts` (2–5 loops plus a
  dedicated 72°-step 5-player test — retired/replaced here),
  `apps/web/test/hand.test.tsx` (anchors/vacancies/footprint),
  `apps/web/test/game-screen.test.tsx` (68 tests; the
  "compact docked composition (CAM-21)" describe block holds the
  fold-fit structural pins and the ADR-0035 scale pin
  "carries no scale-transform class on any ancestor of the flight root (ADR-0035)" —
  extended here to rotation), `apps/web/test/room-screen.test.tsx`
  (pins TableSurface's default internal-viewer path).
- **5-player remnants to retire (clause 11):** the gallery's 5-player
  StateCard and "2–5 seats space radially" note in
  `apps/web/src/components/gallery/game.tsx:344-346`; the
  "5 ≥ max seats" comment on `AVATAR_CYCLE` in
  `apps/web/src/components/game/seat.tsx:15` (the 5-entry palette cycle
  itself is seat.md canon and stays — comment-only fix); doc comments in
  `table-geometry.ts` ("any count 2–5") and `table-surface.tsx`
  ("the 2–5 seats"); table-surface.md r4's 5-player scroll-fallback
  prose (retired in the canon revision, M3).
- **CAM-21 protections (clause 10):** read
  [frontend/CAM-21.md](CAM-21.md) "The chosen compact architecture"
  before touching anything compact. The traps recorded there that this
  task can re-spring: the own-seat OUTER wrapper must stay
  `position: static` at compact (a `relative` there resurrects inert
  inline offsets and shoves the hand off-screen — happened once); the
  compact art cap and `gap-2` are keyed to `viewerSeat="external"` and
  must not leak to the room screen (review F1); regular restorations
  (`regular:flex-initial`, `regular:min-h-auto`) exist because flex-item
  properties stay live against the stage even when a wrapper is
  `regular:contents`-dissolved.

### Design decisions (made here, constraints not code)

1. **The bench model replaces the polar engine.** `table-geometry.ts`
   keeps its name and its art-anatomy constants (`ART_HALF_PCT`,
   `TABLE_DISC_FRACTION`, `SEAT_RING_GAP_PCT` if the bench offsets still
   want a named gap) and swaps `ringPositions`/`seatArc`/`handArc`/
   `inwardSide` for a bench-assignment model. Advisory sketch: a
   `Bench = "bottom" | "top" | "left" | "right"` type and one pure
   function mapping `(seatCount 2–4, viewerSeatIndex)` to a per-seat
   bench, per root clause 5 — viewer always `bottom`; opponents `top`
   (2P), `left` + `right` (3P), `left` + `top` + `right` (4P), assigned
   in seat-arc order sweeping left → top → right (the next player after
   the viewer takes the leftmost occupied bench). Out-of-range counts
   are unreachable once the domain cap lands (backend M1) but the
   function should degrade honestly (stop-and-ask territory if a real
   need appears, never a silent 5th placement).
2. **Bench anchoring is classes, not inline ring percentages.** Each
   bench gets a static placement (top bench → top-center of the square,
   left bench → left-middle, etc.) expressed as a
   `regular:`-prefixed class map in `table-surface.tsx`, replacing both
   the inline `left`/`top` percentage styles and `EDGE_ANCHOR_CLASS`.
   Growth direction stays inward (the CAM-18 lesson: outboard edge at
   the bench, growth toward the table center), with the viewer's bottom
   bench keeping its hang-below exception (the gate-judged controlled
   break — a full own hand grown inward would lie across the deck and
   discard).
3. **The dock duplication dissolves by exporting the anchor map, not by
   extracting a component.** The game screen imports the bench anchor
   class map (and the bench-assignment function) from the same module
   TableSurface uses, and applies the `bottom` entry to the extracted
   own-seat wrapper — one source, no hand-copy, no reproduced
   geometry call. A `ViewerSeatDock` component extraction was weighed
   and rejected: the wrapper carries screen concerns (the compact
   `shrink-0` dock half, the compact-only game-over rest from CAM-21
   review F2, `data-seat-index`) that belong in the container per
   `frontend-architecture` layering — moving them into `components/`
   would smear the composition across two files to save one class
   string. The containing-block subtlety (wrapper positions against
   `table-root`, opponents against the square) does not dissolve with
   the map — it stays true and stays load-bearing at x=50%; the comment
   documenting it survives, now next to a shared import instead of a
   copy.
4. **Row-major hand: 6-wide rows, same slot semantics.** Advisory
   sketch: slot count becomes `max(4, highest + 1)`, padded up to a
   multiple of the row width only once it exceeds one row; the grid
   renders `min(slotCount, 6)` columns, row-major, so the 4-card deal
   is one straight line of 4 along the bench, 6×2 is the designed-for
   footprint (12 cards), a third row is tolerated, and no client code
   caps or truncates hand data (root clause 7 — >18 is accepted
   breakage, ADR-0036). Vacancy vs pad semantics carry over unchanged:
   dashed outlines only at genuinely-empty indices ≤ the highest real
   signal, invisible pad cells beyond it. The column count is derived
   from data, so it may need a dynamic `style` value
   (`gridTemplateColumns`) — legitimate under the frontend-architecture
   inline-style rule (genuinely dynamic), but prefer an enumerated
   class map (`grid-cols-4`…`grid-cols-6`) if the value space stays
   this small.
5. **Side-bench rotation lives below the anchors.** For `left`/`right`
   benches the hand's rows run vertically along the bench. Mechanism
   per ADR-0036 §5: the grid flows column-major (e.g. a fixed row count
   with `grid-flow-col`, so slot indices run down the bench — the
   row-major layout turned 90° as a LAYOUT, not a transform); each slot
   anchor stays an upright box sized to the rotated footprint (w/h
   swapped — 7/5 where `card-frame` is 5/7); the card VISUAL inside the
   anchor takes the rotate (90° one way on the left bench, the other
   way on the right, so both read as facing the table center). The
   FLIP clone renders upright and the resting card is rotated — a
   one-beat landing artifact, accepted under ADR-0034's
   capture-then-cancel stance (same class as the mid-flight-scroll
   desync ADR-0035 records); note it in the canon revision so nobody
   "fixes" it with a transform on the anchor chain.
   **Creation-gate STOP:** the swapped slot footprint needs a canonical
   utility (a rotated sibling of `card-frame` in
   `packages/ui/src/styles.css`, mirrored in
   `design-system/references/tokens.md`) — name the gap and get the
   user's call before minting it. `rotate-90` itself is an enumerated
   Tailwind step, not a new value.
6. **Fluid table at regular, scoped to the docked composition.** The
   regular table square grows to claim the vertical space between the
   pinned chrome, capped at `max-w-4xl` (enumerated scale step — no new
   token), by real CSS sizing only (ADR-0035; no `transform: scale`
   anywhere in the chain). Candidate mechanism, to be proven at the
   rendered pass: extend the screen wrapper's dvh bound to regular
   (today it's compact-only, `regular:max-h-none` cancels it), keep the
   `flex-1` + `min-h-0` chain alive at regular down through stage →
   `table-root` (revisiting CAM-21's `regular:flex-initial` /
   `regular:min-h-auto` restorations — they existed to preserve the
   OLD regular layout, which this clause deliberately changes), and let
   the surface square derive width from height
   (`aspect-square` + a height-driven size + `max-w-4xl`; CSS transfers
   a max-width clamp back through `aspect-ratio`, so the square respects
   whichever axis binds). The disc overlay is %-sized and follows at
   54% of the art with zero changes. The viewer's own group hangs below
   the square (decision 2), so the height derivation must budget for
   that overhang — expect rendered tuning, and route every geometry
   claim to the rendered path per ADR-0030. **Scope guard (the CAM-21
   review-F1 lesson):** the fluid sizing and the `max-w-4xl` cap key to
   `viewerSeat="external"` — the room screen's default path keeps
   `max-w-2xl` and its normal flow, byte-for-byte.
7. **Compact is untouched except hand internals — with one surfaced
   risk.** Clause 10 keeps CAM-21's docked composition; every change
   here is `regular:`-prefixed, keyed to `viewerSeat="external"`, or
   internal to `Hand`. But row-major DOES change compact widths: a
   4-card opponent hand goes from a ~72px 2-column grid to a ~152px
   single row, so fewer opponent groups fit per wrapped line at 360px
   and the fold budget CAM-21 closed gets re-measured, not assumed.
   The M6 rendered pass re-runs the 360×640 checks at 2/3/4 players;
   the sanctioned degradation is unchanged (the middle region's own
   scroll, chrome and dock pinned — a page-level scroll is still a
   failure). Tuning knobs if it's short, in order: compact hand gap,
   opponent-group wrap behavior. Do NOT reach for a compact row-width
   exception without surfacing it — clause 6 says row-major at both
   breakpoints.

## Plan of work

Milestones mirror the root plan's M2–M6 (M1 is the backend lane). Each
step leaves the repo compiling and the web suite green. Code sketches
are advisory; the Contract coverage table and the constraints above are
what get reconciled at close-out.

### M2 — Row-major hands (clause 6; ordered first because bench anchoring is sized around row-shaped footprints)

1. `apps/web/src/test/`-first where practical: update
   `apps/web/test/hand.test.tsx` intents for the new footprint rule
   (min 4 slots, one row; vacancy-in-place; pad cells beyond the
   highest signal; stable indices under growth/shrink — the existing
   tests' behaviors survive, their footprint expectations change), then
   rework `apps/web/src/components/game/hand.tsx` from `grid-cols-2` to
   the row-major layout (decision 4). Keep the anchor scheme, the
   filler-vs-vacancy distinction, `selectedSlots`,
   `emptySlotsClickable`, and the in-flight/leaving branches
   byte-equivalent in behavior.
2. Revise `design-system/components/core/hand.md` to **v3**: row-major
   anatomy (rows of up to 6; 4-card deal is one line; designed-for 6×2;
   third row tolerated; >18 accepted breakage per ADR-0036), keeping
   the r1/r2 revision-entry style — new version number, changelog entry
   under Revisions, superseded anatomy text amended in place, never
   silently contradicted.
3. Gate: `pnpm turbo test --filter @cambio/web` green; the CAM-21
   compact structural pins in `game-screen.test.tsx` must pass
   unmodified (hand internals are invisible to them).

### M3 — Bench geometry + table-surface + dock cleanup + 5P retirement (clauses 5, 11)

1. Replace the polar engine in
   `apps/web/src/components/game/table-geometry.ts` with the bench
   model (decision 1): delete `ringPositions`, `seatArc`, `handArc`,
   `inwardSide`, `HAND_RING_RADIUS_PCT`, `HAND_RING_INSET_PCT`, and the
   `RadialPosition` family; keep the art-anatomy constants that still
   have consumers. Rewrite `apps/web/test/table-geometry.test.ts` as
   bench-map tests (assignment per count 2/3/4, viewer-bottom
   invariant for every viewer index, seat-arc sweep order) — the
   5-player 72° test and the 2–5 loops retire with the engine.
2. Rework `apps/web/src/components/game/table-surface.tsx`: seat
   wrappers anchor by bench class map (decision 2), `EDGE_ANCHOR_CLASS`
   and the inline ring-point styles go; the map and the bench
   assignment are exported for the game screen (decision 3). The
   compact flow (opponents row → art → skipped own seat), the
   `viewerSeat`/`seatAnchor` props, the z-10 seat layer, the disc
   overlay, and the game-over rests all survive untouched in behavior.
   Update the component doc comment (radial prose, "2–5 seats").
3. Rework `apps/web/src/containers/game/game-screen.tsx`: seat-node
   assembly reads each seat's bench instead of `inwardSide(seatArc(…))`;
   `REGULAR_SIDE_FLEX_CLASS` re-keys by bench (hand extends inward from
   its bench; the viewer's own group keeps its hang-below form via the
   existing `own` flag); the extracted own-seat wrapper drops its
   hand-copied translate + reproduced ring point and applies the
   imported `bottom` bench anchor (decision 3). The CAM-21 traps in
   Context apply verbatim — especially the outer wrapper's
   `position: static` at compact.
4. 5-player retirement sweep (clause 11): the gallery StateCard in
   `apps/web/src/components/gallery/game.tsx` becomes a 4-player
   showcase and its section note reads 2–4 bench placement; the
   `AVATAR_CYCLE` comment in `seat.tsx` stops claiming "5 ≥ max seats"
   (the palette cycle itself is seat.md canon and stays); grep the
   frontend for remaining `2–5` / 5-player prose.
5. Revise `design-system/components/core/table-surface.md` to **v5**:
   bench doctrine replaces radial placement; the r1 "scenery, never a
   constraint" rule and the Rules section's "never capped by the visual
   metaphor" are superseded per ADR-0036 (the metaphor is now
   load-bearing; 2–5 → 2–4 everywhere); r4's 5-player scroll-fallback
   prose is retired in the same revision (the middle scroll survives
   only as generic overflow degradation — long names, overgrown
   hands — not as a player-count fallback). Follow the file's own
   r3/r4 amendment style: new version number, changelog entry,
   amendment blockquotes on superseded text.
6. Gate: `pnpm turbo test --filter @cambio/web` green, including
   `room-screen.test.tsx` (the internal-viewer default path now renders
   seats on benches — structural pins must still hold; if any asserts
   radial specifics, adapt knowingly and log it here).

### M4 — Side-bench rotation (clause 8; depends on M3)

1. Give `Hand` the rotated presentation for `left`/`right` benches
   (decision 5): column-major flow for the slot grid, upright anchors
   at the swapped footprint, per-side rotate on the card visual inside
   each anchor. **Creation-gate STOP first** for the swapped-footprint
   utility (decision 5) — do not mint it unilaterally.
2. Extend the transform pin in `apps/web/test/game-screen.test.tsx`:
   the existing ADR-0035 pin
   ("carries no scale-transform class on any ancestor of the flight root (ADR-0035)")
   gains a sibling (or widens) to walk from EVERY flight anchor up
   through the root's ancestors asserting no class matches a
   scale-or-rotate transform pattern — anchors' descendants stay
   exempt (playing-card's own `rotate-6`/`rotate-y-180` and the discard
   fan are below their anchors and legal). Reuse the F5.1-widened
   pattern discipline (variant-prefixed and negative utilities must
   match too).
3. Note the one-beat landing artifact (upright clone → rotated resting
   card) in the hand.md v3 revision if not already there from M2.
4. Gate: `pnpm turbo test --filter @cambio/web`.

### M5 — The big table (clauses 7, 9; depends on M3)

1. Implement the fluid regular sizing (decision 6) in
   `game-screen.tsx` (wrapper/stage/table-root height chain) and
   `table-surface.tsx` (height-driven square, `max-w-4xl` cap keyed to
   `viewerSeat="external"`). No transform, no new token
   (`max-w-4xl` is an enumerated scale step); if the mechanism turns
   out to need a computed height value, that is a semantic utility in
   `packages/ui/src/styles.css` mirrored in tokens.md — a
   creation-gate STOP, not an arbitrary value.
2. Verify clause 7's overlap claim on the rendered path (ADR-0030 —
   jsdom cannot pin geometry): 12-card (6×2) hands at every seat at the
   regular reference viewport, no overlap with the deck/discard
   cluster, other seats, or pinned chrome; 13–18 renders with
   compression permitted. Drive growth with false slams against a live
   game (the CAM-21 M5 scripted-setup precedent).
3. Gate: `pnpm turbo test --filter @cambio/web`; the CAM-21 compact
   pins stay green (clause 10).

### M6 — Verification & canon close-out (clauses 7, 10, 12 evidence)

1. Rendered design-gate pass at 2, 3, and 4 players × both breakpoints
   (compact 360×640, regular 1280×900), per the commands below —
   **freshness check first, every time** (AGENTS.md: stale Vite
   transforms produced a phantom finding in CAM-18). Verdicts are
   advisory; record them in the root plan's Progress and surface any
   conflict with deliberate identity rather than auto-fixing.
2. Compact re-measure (decision 7): the CAM-21 fold-fit invariants at
   2/3/4 players — no page-level scroll, chrome and dock pinned, any
   overflow confined to the middle scroll.
3. Gallery polish: the row-major hand and bench layout render honestly
   in `apps/web/src/components/gallery/game.tsx` (the M3 sweep already
   retired 5P; this step is a rendered look, not a rewrite).
4. Update this document and the root plan (Progress, Decision Log,
   Surprises). **Do not touch HANDOFF §1.1 or the `cambio-rules`
   skill** — those close-out amendments are the backend child plan's
   steps (they ride ADR-0028's main-branch harness flow).
5. Final gate, bare: `pnpm turbo build typecheck lint test`.

## Concrete steps & validation

Never pipe the gate — run bare and check the exit status;
`set -o pipefail` first if output must ever be filtered (mechanically
enforced by the PreToolUse hook).

- Per-milestone: `pnpm turbo test --filter @cambio/web` (turbo builds
  workspace deps first; the bare package script runs against stale
  dist). Iterating on one suite after a build, from `apps/web`:
  `npx vitest run test/hand.test.tsx`,
  `npx vitest run test/table-geometry.test.ts`,
  `npx vitest run test/game-screen.test.tsx`.
- If `packages/ui/src/styles.css` is touched (the gate-approved swapped
  footprint, or a fluid-height utility):
  `pnpm turbo test --filter @cambio/ui` too.
- M6 rendered pass:
  1. `docker compose -f docker/docker-compose.yml up -d`, then
     `pnpm dev` (api :3001, web :3000; `WEB_PORT` overrides).
  2. **Freshness check (mandatory):** fetch a just-changed module
     through Vite and grep for a new symbol, e.g.
     `curl -s http://localhost:3000/@fs/$PWD/apps/web/src/components/game/table-geometry.ts | grep -i bench`
     — restart the dev server if the grep comes back empty; when in
     doubt, restart.
  3. Rendered runs from `.agents/scripts/design-gate/` (one-time setup
     if missing: `npm install --omit=dev` then
     `npx playwright install chromium`): `render.js` against a live
     authenticated game at 2, 3, and 4 players, at
     `--width 1280 --height 900` (regular: bench placement, no
     overlap, table fills the fold under the `max-w-4xl` cap) and
     `--width 360 --height 640` (compact: CAM-21 invariants intact).
     Repeat the regular run with a false-slam-grown 12-card hand at
     each bench (clause 7), and capture a game-over state at both
     breakpoints (the rests moved containers in M3).
  4. `/gate` on the game screen at both breakpoints; advisory.
- Success signals: bench-map suite green; hand suite green with the new
  footprint rule; `game-screen.test.tsx` green including the widened
  transform pin and every CAM-21 compact pin; `room-screen.test.tsx`
  green (or adaptations logged); zero geometry assertions added to
  jsdom (ADR-0030); final bare gate exits 0.

## Contract coverage

_(maintained by `/implement`, verified by `/review`: one row per
root-plan contract clause this side owns — the test that pins it, or why
none can. Each row must also say **what is asserted**, in one phrase.
**At plan time, fill only the Clause column plus a planned-approach
note**; test file, name, and assertion phrase are written by
`/implement` when the test actually lands. A plan-time row that invents
a test title and assertion is an overclaim waiting to become a review
finding.)_

| Clause                                | Planned approach (plan-time)                                                                                                                                                                                                                                                                                       | Test (file + name)         | What is asserted           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | -------------------------- |
| 5. Bench anchoring, no radial remnant | jsdom unit tests on the bench-assignment model (per-count maps, viewer-bottom for every viewer index, left→top→right sweep) in `table-geometry.test.ts`'s successor; a structural pin that seat wrappers carry bench-class anchors, not ring-point inline styles; rendered evidence at 2/3/4 for the visual claim. | _(filled by `/implement`)_ | _(filled by `/implement`)_ |
| 6. Row-major hands, stable slots      | `hand.test.tsx`: footprint rule (min 4 one-row; 6-wide wrap; pads beyond highest signal), vacancy-in-place on removal, growth appends at lowest free slot — behaviors carried from the existing suite with new footprint expectations, both variants.                                                              | _(filled by `/implement`)_ | _(filled by `/implement`)_ |
| 7. 12-card fit; no data cap           | Rendered-path only for the fit (ADR-0030): 6×2 hands at every seat at 1280×900, no overlap, archived captures; the no-cap half is jsdom-able (a >18-slot hand still renders every slot) plus review grep that no clamping entered `hand.tsx`/`game-screen.tsx`.                                                    | _(filled by `/implement`)_ | _(filled by `/implement`)_ |
| 8. Rotation below flight anchors      | Extend the CAM-21 ADR-0035 pin in `game-screen.test.tsx`: walk every flight anchor's ancestor chain asserting no scale-or-rotate class (variant-prefixed and negative forms included); rendered look confirms the rotated reading at 3/4 players.                                                                  | _(filled by `/implement`)_ | _(filled by `/implement`)_ |
| 9. Fluid regular table, real CSS      | By construction (no transform introduced) + the widened clause-8 pin covers the chain; `max-w-4xl` scoping to the docked composition gets a structural pin mirroring CAM-21's viewerSeat scoping tests; fill-the-fold itself is rendered evidence at 1280×900.                                                     | _(filled by `/implement`)_ | _(filled by `/implement`)_ |
| 10. Compact untouched, CAM-21 pins    | The existing "compact docked composition (CAM-21)" pins in `game-screen.test.tsx` pass unmodified (adaptations logged if the bench rework forces any); rendered 360×640 at 2/3/4 players re-verifies fold fit with row-major hand widths (decision 7's risk).                                                      | _(filled by `/implement`)_ | _(filled by `/implement`)_ |
| 11. 5-player retirement               | Bench model accepts 2–4 only (unit-pinned); repo grep for 5-player/2–5 prose in `apps/web`; gallery renders no 5-seat fixture; the canon revision retires the r4 fallback — verified by review reading table-surface.md v5.                                                                                        | _(filled by `/implement`)_ | _(filled by `/implement`)_ |
| 12. Canon revised, not contradicted   | No test — verified by review: `table-surface.md` v5 and `hand.md` v3 exist with changelog entries and in-place amendments in the r3/r4 style; HANDOFF/cambio-rules untouched by this side's diff (backend-owned).                                                                                                  | _(filled by `/implement`)_ | _(filled by `/implement`)_ |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [x] 2026-09-06 — `/plan` pass: child plan drafted from the explorer's
      code map; bench-model shape, dock-cleanup choice (export the
      anchor map), rotation mechanism, and fluid-table candidate
      mechanism decided; two creation-gate STOPs flagged (swapped slot
      footprint; possible fluid-height utility).

## Surprises & notes for the root plan

- Planning: `handArc` and `HAND_RING_RADIUS_PCT` are confirmed dead —
  only their own tests consume them. They retire with the polar engine
  in M3; no production behavior depends on the hand ring.
- Planning: row-major hands change COMPACT opponent-group widths
  (~72px → ~152px at the 4-card deal), so CAM-21's fold budget is
  re-measured at M6, not assumed (decision 7). The sanctioned
  degradation (middle scroll, chrome/dock pinned) is unchanged; if 2–4
  players stop fitting outright, that's a root-plan Surprise and a
  user conversation, not a silent compact row-width exception.
- Planning: the fluid regular table (clause 9) implies bounding the
  regular viewport the way CAM-21 bounded compact — CAM-21's
  `regular:max-h-none` / `regular:flex-initial` / `regular:min-h-auto`
  restorations were pinned as "regular untouched" THERE and are
  deliberately revised HERE. The reviewer should read those diffs as
  clause-9 intent, not as CAM-21 regressions.
- Planning: the flight clone lands upright on a rotated resting card
  (side benches) — a one-beat artifact accepted under ADR-0034's
  capture-then-cancel stance, recorded in ADR-0036 §5 and the canon
  revision. Do not "fix" it with a transform above an anchor.
