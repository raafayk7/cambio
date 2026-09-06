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
5. **Side-bench rotation lives below the anchors.** ~~For `left`/`right`
   benches the hand's rows run vertically along the bench. Mechanism
   per ADR-0036 §5: the grid flows column-major (e.g. a fixed row count
   with `grid-flow-col`, so slot indices run down the bench — the
   row-major layout turned 90° as a LAYOUT, not a transform); each slot
   anchor stays an upright box sized to the rotated footprint (w/h
   swapped — 7/5 where `card-frame` is 5/7); the card VISUAL inside the
   anchor takes the rotate~~ **As implemented, the anchor sizing sketch
   above is superseded** (discovered at the creation-gate follow-up,
   full account in Surprises): the flight anchor keeps plain UPRIGHT
   `card-frame` (5/7) — it is the grid's real reserved track space and
   must stay sized like an upright card — while only the card VISUAL
   inside it takes the new `card-frame-rotated` utility (7/5) plus the
   rotate class (90° one way on the left bench, the other way on the
   right, so both read as facing the table center), comfortably smaller
   than its upright anchor on both axes and centered via
   `flex items-center justify-center`. A first attempt that swapped the
   anchor's own footprint (matching this sketch literally) fixed one
   clearance axis while silently breaking the other — see Surprises for
   the measurements. The FLIP clone renders upright and the resting
   card is rotated — a one-beat landing artifact, accepted under
   ADR-0034's capture-then-cancel stance (same class as the
   mid-flight-scroll desync ADR-0035 records); noted in the canon
   revision so nobody "fixes" it with a transform on the anchor chain.
   **Creation-gate STOP (resolved):** the swapped slot footprint needed
   a canonical utility — the user chose minting `card-frame-rotated` in
   `packages/ui/src/styles.css`, mirrored in
   `design-system/references/tokens.md`, over a shared `--card-aspect`
   variable or a spacing-only fix. `rotate-90` itself is an enumerated
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

| Clause                                | Planned approach (plan-time)                                                                                                                                                                                                                                                                                       | Test (file + name)                                                                                                                                                                                                                                                                                                                                         | What is asserted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5. Bench anchoring, no radial remnant | jsdom unit tests on the bench-assignment model (per-count maps, viewer-bottom for every viewer index, left→top→right sweep) in `table-geometry.test.ts`'s successor; a structural pin that seat wrappers carry bench-class anchors, not ring-point inline styles; rendered evidence at 2/3/4 for the visual claim. | table-geometry.test.ts > benchAssignment > per-count + viewer-bottom + sweep-order tests; table-surface.tsx seatWrapper (review grep: no inline left/top style remains)                                                                                                                                                                                    | viewer always bottom for every count 2–4 and viewer index; opponents assigned left→top→right sweep order; seat wrappers carry regular:top-[...]/left-[...] bench classes, zero inline ring-point styles                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 6. Row-major hands, stable slots      | `hand.test.tsx`: footprint rule (min 4 one-row; 6-wide wrap; pads beyond highest signal), vacancy-in-place on removal, growth appends at lowest free slot — behaviors carried from the existing suite with new footprint expectations, both variants.                                                              | hand.test.tsx > "renders a 4-card deal as one straight row of four..." / "keeps a single row up to six cards..." / "pads a hand exceeding one row up to a full 6-wide grid..." / "removal keeps the slot..." / "renders vacancies at exactly the missing indices..."                                                                                       | 4-card hand is one row (grid-cols-4); 6-card hand stays one row (grid-cols-6); 7-card hand pads to 12 slots (grid-cols-6, invisible fillers beyond the highest signal); vacancy-in-place on removal; stable slot indices                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 7. 12-card fit; no data cap           | Rendered-path only for the fit (ADR-0030): 6×2 hands at every seat at 1280×900, no overlap, archived captures; the no-cap half is jsdom-able (a >18-slot hand still renders every slot) plus review grep that no clamping entered `hand.tsx`/`game-screen.tsx`.                                                    | hand.test.tsx > "tolerates a third row..." / "never caps or truncates hand data..."; rendered pass (M6): live 4P game, Zara (top bench) grown to exactly 12 via scripted false-slams, 1280×900                                                                                                                                                             | jsdom: no client-side cap, pads correctly; RENDERED (M6, pre-creation-gate): Zara's 12-card upright hand clears deck/discard by 62px (measured); Sam's 12-card ROTATED (left-bench) hand clears by only ~2px (measured) — technically zero overlap but a tight margin flagged for the pending creation-gate anchor-footprint decision; a 16-card rotated overshoot (13–18 tolerated-compression band) visibly grazes the deck, accepted per ADR-0036. **Re-verified post-resolution (creation-gate follow-up, 2026-09-06)** with `card-frame-rotated` wired in: rendered `TableSurface` + `Hand` composition (real `seatAnchor="edge"`/`viewerSeat="external"` sizing, live measurement) — rotated (left-bench) 12-card hand clears deck/discard by ~50px, upright (top-bench) 12-card hand by ~86px; inter-row/column clearance INSIDE the rotated hand itself (a distinct axis the placeholder also risked) measured ~26–34px, comfortably positive on both axes. No overlap anywhere; the rotated/upright asymmetry shrank from ~31× to ~1.7×, no longer reading as a leftover bug. |
| 8. Rotation below flight anchors      | Extend the CAM-21 ADR-0035 pin in `game-screen.test.tsx`: walk every flight anchor's ancestor chain asserting no scale-or-rotate class (variant-prefixed and negative forms included); rendered look confirms the rotated reading at 3/4 players.                                                                  | game-screen.test.tsx > "carries no scale-or-rotate transform class from every flight anchor up through the root's ancestors (ADR-0035, widened to rotation by ADR-0036 §5)"; side-bench rotation (CAM-20) > "actually exercises rotation..." / "...still carries no scale-or-rotate transform above any flight anchor with a rotated hand on the table..." | every flight anchor's ancestor chain carries no scale-or-rotate class/inline transform; a left-bench opponent's card visual gets -rotate-90 and a right-bench one rotate-90, both strictly INSIDE (below) their anchor div, never on it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 9. Fluid regular table, real CSS      | By construction (no transform introduced) + the widened clause-8 pin covers the chain; `max-w-4xl` scoping to the docked composition gets a structural pin mirroring CAM-21's viewerSeat scoping tests; fill-the-fold itself is rendered evidence at 1280×900.                                                     | game-screen.test.tsx > fluid regular table (CAM-20 M5); room-screen.test.tsx > fluid regular table scope guard; rendered pass (M6): playwright measurement of the live 4P table at 1280×900                                                                                                                                                                | structural pins hold (see above); RENDERED/MEASURED: TableSurface resolves to a 809.5×809.5px square (height-driven, table-root's exact height) vs the old fixed 672px (max-w-2xl) cap — a real, measured fill-the-fold gain; room screen unaffected (not measured further, byte-for-byte class guard suffices)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 10. Compact untouched, CAM-21 pins    | The existing "compact docked composition (CAM-21)" pins in `game-screen.test.tsx` pass unmodified (adaptations logged if the bench rework forces any); rendered 360×640 at 2/3/4 players re-verifies fold fit with row-major hand widths (decision 7's risk).                                                      | game-screen.test.tsx > "compact docked composition (CAM-21)" describe block (9 pins, green); rendered pass (M6): live 2/3/4P games at 360×640, including grown hands (12–16 cards) and an active own-turn state                                                                                                                                            | jsdom pins hold; RENDERED/MEASURED: page height stays exactly 640px (documentElement.scrollHeight) at every count and hand size tried, including Zara-12/Sam-16; dock-actions renders 0x0 with no affordance when it's not the viewer's turn (expected, not a bug) and a real 44px-tall Call Cambio button pinned at the bottom edge when it is; table-scroll absorbs the excess (scrollHeight 465 vs clientHeight ~390-430) — chrome/dock pinned, no page scroll, confirming decision 7's risk did not materialize. One REAL BUG found and fixed here: the rotate prop's classes were unprefixed and leaked a 3-column rotated grid into compact, breaking the fold at 3-4 players — fixed by making the rotated presentation regular-only-scoped (hand.tsx), with jsdom regression coverage added                                                                                                                                                                                                                                                                                    |
| 11. 5-player retirement               | Bench model accepts 2–4 only (unit-pinned); repo grep for 5-player/2–5 prose in `apps/web`; gallery renders no 5-seat fixture; the canon revision retires the r4 fallback — verified by review reading table-surface.md v5.                                                                                        | table-geometry.test.ts > "degrades honestly for an out-of-range count instead of inventing a 5th placement"; review grep of apps/web for 2–5/5-player prose (gallery/game.tsx, seat.tsx, table-geometry.ts, table-surface.tsx, game-screen.tsx all swept)                                                                                                  | benchAssignment(5, …) throws rather than seating a 5th player; the gallery's TableSurfaceSection renders a 4-player showcase (no 5-seat fixture); zero remaining 2–5/5-player prose outside historical revision-history text                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 12. Canon revised, not contradicted   | No test — verified by review: `table-surface.md` v5 and `hand.md` v3 exist with changelog entries and in-place amendments in the r3/r4 style; HANDOFF/cambio-rules untouched by this side's diff (backend-owned).                                                                                                  | No test — verified by review                                                                                                                                                                                                                                                                                                                               | table-surface.md v5 and hand.md v3 carry Revisions changelog entries and amendment blockquotes on superseded r1/r4 text; this side's diff touches nothing under docs/HANDOFF.md or .agents/skills/cambio-rules/                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [x] 2026-09-06 — `/plan` pass: child plan drafted from the explorer's
      code map; bench-model shape, dock-cleanup choice (export the
      anchor map), rotation mechanism, and fluid-table candidate
      mechanism decided; two creation-gate STOPs flagged (swapped slot
      footprint; possible fluid-height utility).
- [x] 2026-09-06 — M2 (row-major hands): `hand.tsx` reworked from
      `grid-cols-2` to row-major (`GRID_COLS_CLASS`, 4/5/6-wide,
      `Math.max(4, highest+1)` floored at one row, padded to a full
      6-wide multiple only once it outgrows one row); `hand.test.tsx`
      rewritten with the new footprint expectations plus new coverage
      for the 12/18-slot pad cases and the >18 no-cap case; `hand.md` →
      v3. `pnpm turbo test --filter @cambio/web` green throughout.
- [x] 2026-09-06 — M3 (bench geometry): `table-geometry.ts` rewritten —
      `ringPositions`/`seatArc`/`handArc`/`inwardSide`/`RadialPosition`
      family deleted, replaced by `Bench` + `benchAssignment` (2–4,
      throws honestly outside that range); `table-surface.tsx` anchors
      seats via two exported static class maps (`BENCH_POSITION_CLASS`,
      `BENCH_ANCHOR_CLASS`) instead of inline ring percentages;
      `game-screen.tsx`'s seat-node assembly and the extracted own-seat
      wrapper both import those maps (decision 3 — no `ViewerSeatDock`
      extraction, per the plan's explicit rejection). 5-player retirement
      sweep done (gallery 4-player showcase, `seat.tsx` comment,
      `table-geometry.ts`/`table-surface.tsx` doc comments,
      `game-screen.tsx`'s `py-2` comment). `table-geometry.test.ts`
      rewritten as bench-map tests. `table-surface.md` → v5 (r1's
      "scenery, never a constraint" and r4's 5-player scroll fallback
      superseded/retired via amendment blockquotes, not silently
      dropped). Full web suite green (223/223 at this point).
- [x] 2026-09-06 — M4 (side-bench rotation): **creation-gate STOP hit**
      (swapped slot footprint) — implemented the rotation MECHANISM
      (column-major flow via `grid-flow-col` + `GRID_ROWS_CLASS`,
      `rotate` prop on `Hand`, rotate class on the card visual only,
      never the anchor) using `card-frame`'s existing upright dimensions
      as the placeholder anchor size, per the task's explicit
      instruction to keep moving. The ADR-0035 transform pin in
      `game-screen.test.tsx` widened to walk from every flight anchor
      (not just table-root) and to catch rotate as well as scale; a new
      "side-bench rotation (CAM-20)" describe block added with a
      3-player fixture that actually exercises both rotation directions
      (proving the mechanism fires, not just that it's absent when
      unused). `hand.md` v3 already carried the one-beat-landing-artifact
      note from the M2 pass. Full web suite green (225/225).
- [x] 2026-09-06 — M5 (the big table): implemented the fluid regular
      sizing using EXISTING tokens only — no creation-gate STOP hit
      here (the `aspect-square` + height-driven-flex-item + `max-w-4xl`
      approach expressed entirely in enumerated Tailwind utilities, no
      new computed-height utility needed). `TableSurface`'s root gets
      `regular:flex-1 regular:min-h-0 regular:w-auto regular:max-w-4xl`
      under `viewerSeat="external"` only; the room screen's default path
      keeps `regular:block regular:max-w-2xl` byte-for-byte (new
      structural pins in both `game-screen.test.tsx` and
      `room-screen.test.tsx` guard the scope split, mirroring CAM-21
      review F1). `game-screen.tsx`'s three-link flex chain
      (screen wrapper → stage → table-root) has its CAM-21
      `regular:max-h-none`/`regular:overflow-visible`/
      `regular:flex-initial`/`regular:min-h-auto` restorations removed
      so the bound and the `flex-1 min-h-0` chain stay live at regular
      too — deliberately revising, not regressing, the CAM-21 pins those
      restorations satisfied (per the plan's Surprises note below).
      Fill-the-fold itself and the 12-card no-overlap claim are rendered-
      path evidence (ADR-0030), deferred to M6. Full web suite green
      (227/227); typecheck and prettier clean throughout M2–M5.
- [x] 2026-09-06 — M6 (verification & canon close-out): rendered pass run
      against live authenticated games (users/lobbies/games created
      directly via the API, cookies captured, both breakpoints via
      `render.js` + targeted Playwright measurements for exact pixel
      claims — see Surprises for the numbers). Freshness check done
      before trusting anything rendered (curled a changed module,
      grepped for `bench`, restarted the stale `pnpm dev` processes
      that predated this session's edits). **One real bug found and
      fixed**: the M4 `rotate` presentation was unprefixed and leaked
      into compact, breaking the fold outright at 3–4 players (a
      3-column rotated grid where a flat uniform row belongs) — fixed
      by making the whole rotated presentation (`grid-flow-col`,
      `grid-rows-N`, the card rotate class) `regular:`-scoped in
      `hand.tsx`, with `hand.test.tsx` and `game-screen.test.tsx`
      updated to assert the prefixed classes (closing the coverage gap
      that let it through — the tests had checked the classes existed,
      not that they were breakpoint-gated). Re-verified clean after the
      fix. Gallery polish (M6 step 3) folded into M3's sweep — no
      separate rendered gallery pass beyond what M3 already covered by
      code inspection; not re-verified rendered here, logged as a minor
      scope note. Coverage table clauses 7/9/10 updated with final
      rendered/measured evidence (not just "pending"). Final bare gate
      (`pnpm turbo build typecheck lint test`) green: 25/25 tasks.
      Dev servers stopped after the pass. **HANDOFF §1.1 and the
      cambio-rules skill were NOT touched** (backend lane's job per
      ADR-0028). **One creation-gate item remains genuinely open** (M4's
      swapped slot footprint) — see the final report for the candidate
      options; M5 resolved its own maybe-STOP to "no creation-gate
      utility needed."
- [x] 2026-09-06 — Creation-gate follow-up (M4's swapped slot footprint,
      resolved): the user picked minting a new canonical utility,
      **`card-frame-rotated`** (`aspect-ratio: 7 / 5`, mirroring
      `card-frame`'s `5 / 7` otherwise), over the two alternatives raised
      at the STOP (a shared `--card-aspect` variable on `card-frame`
      itself, or tuning bench spacing without a new footprint token) —
      decided via `AskUserQuestion`. Added to
      `packages/ui/src/styles.css` right after `card-frame`, and mirrored
      in `design-system/references/tokens.md` §Shape (`card-frame`
      wasn't previously documented there by name either, so both the
      base utility and its new sibling landed together). Wired into
      `hand.tsx`/`playing-card.tsx`: the flight anchor (`data-slot-index`)
      keeps plain upright `card-frame` always — it's the grid track's
      real estate and needs to stay the size an upright card of that
      variant needs, not the swapped one — while the rotated card VISUAL
      (`PlayingCard`'s new `rotated` prop, threaded through all three
      `Hand` call sites, plus the empty-slot span's own class) takes
      `card-frame-rotated` at the same `--card-width`; the anchor centers
      the now-smaller rotated visual (`flex items-center
justify-center`, rotated only). This split was NOT the first thing
      tried — an initial pass put `card-frame-rotated` directly on the
      same element being rotated (mirroring the plan sketch's literal
      wording literally), which fixed the horizontal (column-to-column)
      clearance but flipped a NEW ~10px vertical (row-to-row) overlap
      into existence for card-md at regular, caught only by rendered
      measurement, not by eyeballing the classes — see Surprises.
      `hand.md` r3 amended again (the placeholder note superseded).
      Re-verified clause 7's rendered-path claim (Surprises has the
      numbers): no overlap on any axis, comfortable clearance,
      asymmetry no longer reads as a bug. `pnpm turbo test --filter
@cambio/ui` (25/25) and `--filter @cambio/web` (227/227) green;
      final bare gate (`pnpm turbo build typecheck lint test`) green,
      25/25 tasks, twice (once mid-fix, once after the corrected
      wiring). Dev server stopped after the pass.
- [x] 2026-09-06 — Bug-report follow-up (untested-viewport gap coverage,
      user-reported at 723×770 and 421×770, neither a plan-time reference
      viewport): confirmed the full bare gate green (25/25) before
      touching anything, per instruction. Live-rendered investigation
      (real 2P and 4P authenticated games, users/lobbies/games created
      directly via the API — `POST /users` → `POST /lobbies` →
      `POST /lobbies/:id/join` ×N → `POST /lobbies/:id/start` — cookie
      captured per session, same recipe as M6) against a
      freshness-checked dev server (curled `table-surface.tsx` through
      Vite, grepped `bench`, confirmed live before trusting anything
      rendered). Measured via `getBoundingClientRect`/`getComputedStyle`
      in-page (ADR-0030: geometry claims route to the rendered path, not
      jsdom) rather than eyeballed screenshots — the Browser pane's
      compositor wasn't available for actual screenshots in this
      session, so every claim below is a live DOM measurement, which is
      the stricter form of evidence this task's own M6 pass already
      established as canonical (its own 809.5×809.5 figure, reproduced
      exactly below). **Two independent findings, opposite verdicts:** 1. **723×770 (regular, in-scope): NOT REPRODUCIBLE — no code
      change made.** At 723×770, `table-root` resolves to 679.5×679.5
      and `TableSurface` fills it exactly (0px unclaimed slack,
      `docScrollHeight` === viewport height, no page scroll) — the M5
      mechanism working exactly as designed. Swept the surrounding
      regular range to rule out a narrow failure band: 720×770 (the
      exact breakpoint floor) and 768×770 both also resolve to
      679.5×679.5 with zero slack; 1280×900 reproduces the M6 pass's
      own recorded 809.5×809.5 figure exactly. Re-checked at both 2P
      and 4P (723×770) — identical 679.5×679.5, confirming the
      mechanism is player-count-independent, as designed. Every
      measurement across this sweep is clean; **the M5 fluid-table
      mechanism could not be made to fail anywhere in the regular
      range** on this branch's current code. Given AGENTS.md's own
      documented precedent (CAM-18's stale-Vite-transform phantom
      finding, the exact failure class this task's M6 step 2
      mandates a freshness check for) and that this session's `pnpm
 dev` bound to port 3100 (3000 was free, but a config/prior-
      session artifact could easily have left an OLD server answering
      on 3000 in a different session — not verifiable after the
      fact), the most likely explanation for the user's screenshots
      is a stale dev server or cached page predating this task's M5
      landing (pre-M5 code used `regular:max-h-none` +
      `regular:max-w-2xl` width-driven sizing with no height bound,
      which would produce exactly the reported symptom — a smaller,
      non-height-filling table with dead space below, on a viewport
      taller than the fixed square). Recommend the user hard-refresh
      against a freshly-started `pnpm dev` before treating this as an
      open defect; no evidence of a real defect was found after
      thorough, repeated, measured attempts. 2. **421×770 (compact, out-of-scope): REPRODUCIBLE, confirmed
      PRE-EXISTING to CAM-21 — not fixed, flagged for a separate
      Linear issue instead.** At 421×770, `table-scroll` resolves to
      518.3px tall but its actual content (`TableSurface`) is only
      317.6px tall, leaving ~200.7px of dead space between the
      compact table art and the own-hand dock below it (confirmed at
      719×770 too: same shape, 222.8px content in a 635.5px
      `table-root`). Root-caused to `table-scroll`'s `flex-1`
      class in `game-screen.tsx` — confirmed **byte-identical** to
      `release-v0` via `git diff release-v0 --
 apps/web/src/containers/game/game-screen.tsx` (the exact
      className string `"w-full flex-1 min-h-0 overflow-y-auto
 regular:contents"` is untouched by this task). The removed-but-
      quoted CAM-21 comment this task's diff carried forward
      (Progress, M6 entry above) already named this exact mechanism
      and accepted it as "~37-53px of ACCEPTED FLEX RESIDUE" at the
      one height CAM-21 ever validated, 640px. The residue scales
      ~1:1 with any excess viewport height beyond that: measured
      70.7px slack at 360×640 (this task's own validated reference,
      consistent with CAM-21's figure) vs. 200.7px at 360×770 and
      421×770 (both 130px taller than 640) — 70.7 + 130 ≈ 200.7,
      confirming the mechanism is exactly linear and untouched by
      CAM-20. This is a gap in CAM-21's validation coverage (it was
      only ever measured at one height, 640px) that CAM-20 did not
      cause or worsen — per the task's explicit instruction, NOT
      fixed here. Flagging for the user's call on a new Linear issue,
      the same way planning spun out CAM-26 for an unrelated bug.
      No source files were touched by this follow-up (investigation
      only); `docs/plans/frontend/CAM-20.md` (this file) is the only
      diff. Final bare gate re-confirmed green (`pnpm turbo build
typecheck lint test`, 25/25) after this doc update. Dev server and
      the temporary users/lobbies created for this investigation's live
      games were left in the dev Postgres instance (soft-delete/TTL
      territory, same as any other manual dev-server testing); the dev
      server itself was stopped after the pass.

- [x] 2026-09-07 — Design-gate fix cycle (the `/gate` pass against a live
      4-player game at 1280×900 and 360×640 came back "flagged" —
      advisory findings, zero constraint-tier failures — user asked to
      fix the accidental ones before close-out; findings marked
      "controlled" were left untouched). Confirmed the full bare gate
      green (25/25) before touching anything, per instruction. All
      7 fixes verified live against real authenticated games (same
      API-driven recipe as every prior rendered pass this task has
      used: `POST /users` → `POST /lobbies` → `POST /lobbies/:id/join`
      ×N → `POST /lobbies/:id/start`, cookies captured, freshness
      checked via `curl .../@fs/... | grep <new-symbol>` before
      trusting anything rendered). One capability gap this pass hit:
      the Browser pane's compositor was unavailable for actual
      screenshots this session (`computer`/`zoom` both timed out with
      "pane is not displayed") — every geometry claim below is a live
      `getBoundingClientRect()`/`getComputedStyle()` measurement instead
      (the stricter form of evidence this task's own M6 pass already
      established as canonical), and the one visual judgment call this
      cycle needed (the side-bench arc, finding 3) was made by cropping
      and annotating the actual `table-top.webp` asset with PIL and
      reading the crop via the Read tool — not a page screenshot, but
      still a direct look at the real painted art, not a guess.

      Regular breakpoint (1280x900), three fixes. Finding 1 (own-seat overshoot): the extracted own-seat wrapper's vertical translate in `game-screen.tsx` changed from the shared `BENCH_ANCHOR_CLASS.bottom` constant (a plain `-translate-y-1/2`) to an inline translate that layers a 4px nudge on top of it, scoped to this one wrapper (the shared constant, and TableSurface's own internal seatWrapper, are untouched). Measured: bottom edge moved from 903.38px to 899.38px at the 900px regular reference viewport. New structural pin (jsdom cannot measure real geometry, ADR-0030): a test in `game-screen.test.tsx` asserts the new translate-y class is present, the old bare `-translate-y-1/2` is gone from that wrapper, and the shared constant itself is untouched. Finding 2 (Call Cambio 260-415px from the hand): the fixed bottom-right corner offset was replaced with a horizontal offset computed from the stage's own center plus half of the hand's row-width ceiling (six columns of card-lg at regular, 616px, per `hand.tsx`'s `ROW_WIDTH` cap) plus one spacing step. The button's DOM location stays inside the dock-actions region unchanged (an existing test pins that containment, and moving it would also disturb compact's deliberate placement, which this finding never flagged); a true JS-measured dock was considered and rejected as disproportionate for a reposition-only fix (no existing breakpoint-detection hook in this codebase). Measured: the gap dropped from 260.5px to 120px at the live 4-card hand this session's game used — exact for hands of six or more cards (the row-width ceiling), an approximation for smaller ones. Finding 3 (2 of 4 side-bench cards over the shadow gap): the straight rotated-column mechanism from M4 never matched the painted bench's actual shape. Measured the real asset directly by cropping and annotating `table-top.webp` with PIL and reading the crop as an image, rather than guessing from color sampling alone (a first color-based attempt was misleading, since the bench and tabletop paint in similar greens — the useful signal was the dark shadow-gap band and the fully transparent corner gaps, not hue). The bench is a shallow crescent, widest at its vertical middle and tapering to the corner posts at both ends. Added a per-row margin-left on the card visual only, never the anchor, fit to two measured points and generalized by a row-index formula to the 5/6-row cases (not independently re-verified on the rendered path — see Surprises). Two real bugs found only by measuring the rendered rect, not by reading the classes: (a) the actual visual shift from a margin turned out to be exactly half of the class's own pixel value, because the anchor's centering flex layout centers the child's whole margin box, not its content box, so every table value had to be doubled; (b) the right bench's positive margin collapsed the card visual to zero-by-zero, because the anchor is narrower than the margin plus the visual's own width, triggering the browser's default shrinkable flex behavior, fixed with a shrink-disabling class on the visual. Measured after both fixes: all four left-bench cards land squarely on the painted bench (confirmed by annotating the actual crop); the right bench mirrors it within a fraction of a pixel of the expected symmetric distance from table center. Compact breakpoint (360x640), all four fixes. Finding 4 (opponent hands read as one continuous 8-card strip, highest priority per the Judge): the intra-hand grid gap tightened to 4px at compact (regular's 8px is unchanged); the opponent row's inter-seat gap widened to 24px horizontally (the vertical wrap-row gap was never the diagnosed problem, so it stays untouched to avoid re-opening the CAM-21 wrap-budget question). Measured: a 4-card opponent hand is now 140px wide (was 152px); two adjacent hands sit 24px apart (was 8px) — confirmed live in a 4P game. New structural pin: a test in `game-screen.test.tsx` asserts both gap classes and a numeric comparison of the two underlying constants. Finding 5 (deck-count badge escaping onto the discard pile): the badge's corner overhang (an 8px push past the deck's own edge on both axes, fine at regular's larger scale) is now flush to the deck's own corner at compact specifically; regular keeps the original overhang byte-for-byte. Measured: badge right edge now exactly flush with the deck's own right edge (was 8px past it, 4px into the discard's own space); badge bottom now flush with the deck's bottom (was 8px past it). Finding 6 (compact table art capped too small for its contents): the compact table-art size token was raised from 128px to 158px, the minimum that clears the deck-and-discard pair by at least 8px inside the 54% tabletop disc on both sides, not a revert to CAM-21's original 160px (which was tuned down for a fold-budget shortfall that does not reproduce today, now that this task's row-major hands and tightened card scale free enough of the same budget). Measured: disc clearance went from about half a pixel to 8.66px per side; re-verified the CAM-21 fold-fit invariant at 2, 3, AND 4 players (not just 4) at the compact reference viewport — the document's scroll height stayed exactly equal to the viewport height at every count. Updated the tokens reference and the table-surface component doc (new revision, changelog entry, amendment blockquote on the prior revision's mention of the old value) per this task's own revised-not-contradicted discipline. Cross-reference for CAM-27 (out of this task's scope, filed separately): raising the art size claims a little more of the same vertical budget CAM-27's flex-residue slack measures, not observed to shrink that residue measurably at the one height checked, but a taller compact viewport would need re-measuring if CAM-27 is ever picked up. Finding 7 (connection dot relies on color alone) — not a live defect, already fixed: a diff against release-v0 for the app-shell component shows zero changes — the connection dot already carries a status role and an accessible name that reads Connected or Reconnecting, and the existing ui test suite already asserts both label strings. No code or test change made. The Judge's finding likely reflects a stale render, the same failure class AGENTS.md documents from CAM-18. Validation: the web suite stayed green throughout (227 to 230 tests, 3 new); the ui suite stayed green (25/25, unaffected by the token change). One prettier formatting issue surfaced only at the final bare-gate run, on the two files with the most new inline comments and tests — fixed with a formatter pass on those two files, then the full bare gate re-ran clean: 25/25 tasks, exit 0. The dev server and the temporary users, lobbies, and games created for this pass's live verification were left in the dev Postgres instance (the same soft-delete/TTL territory as every other manual dev-server testing pass this task has done); both dev processes were stopped after the pass.

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
- M3: the bench-anchor class map (`BENCH_POSITION_CLASS`) needed literal
  arbitrary-value percentages (`top-[8.5%]`, `top-[91.5%]`) rather than a
  value computed from `table-geometry.ts`'s constants at runtime —
  Tailwind's build-time scanner needs the class text to appear verbatim
  in source, so a template-literal-interpolated percentage would never
  generate CSS. `table-geometry.test.ts` pins `BENCH_INSET_PCT` (41.5) so
  a future change to the art's proportions is caught even though the
  hardcoded `8.5%`/`91.5%` literals in `table-surface.tsx` won't update
  themselves — flagged in a code comment there, not a silent drift risk.
- M4: **creation-gate STOP** — decision 5's swapped slot-footprint
  utility (7/5 anchor aspect ratio, mirroring `card-frame`'s 5/7) was NOT
  minted. `Hand`'s rotated presentation currently sizes rotated anchors
  with `card-frame`'s existing upright (5/7) dimensions as a placeholder,
  per the task's explicit "keep moving" instruction. Visible consequence
  at the M6 rendered pass: a rotated card's painted footprint will not
  exactly match its slot box (a portrait box holding a visually-rotated
  card reads slightly squished/overhanging until the real utility lands).
  Candidate options for the user's call, in the final report below.
- M5: no creation-gate STOP was needed — the fluid-height mechanism
  expresses entirely in existing enumerated utilities (`flex-1`,
  `min-h-0`, `w-auto`, `aspect-square`, `max-w-4xl`); no new computed-
  height utility in `packages/ui/src/styles.css` was required. The
  plan's decision 6 flagged this as a maybe, not a certainty, and it
  resolved to "no."
- M6 rendered pass, exact numbers (all measured live, not eyeballed):
  the regular table square resolves to **809.5×809.5px** (height-driven,
  exactly `table-root`'s own height) at 4 players/1280×900, up from the
  old fixed 672px (`max-w-2xl`) cap — a real, substantial fill-the-fold
  gain, and well under the 896px (`max-w-4xl`) ceiling, so the cap never
  bound in this configuration. The DESIGNED 12-card (6×2) case is clean
  at every bench tried: an UPRIGHT (top) bench clears the deck/discard
  cluster by **~62px**; a ROTATED (left) bench clears by only **~2px** —
  technically zero overlap (clause 7 holds) but riding the edge of it,
  and the margin asymmetry traces directly to the pending creation-gate
  placeholder (the rotated anchor's un-swapped 5/7 footprint doesn't
  match the true rotated card shape, so its true clearance is
  under-stated or over-stated versus what the real utility will produce
  — this can't be resolved until that decision lands). A 16-card
  rotated hand (13–18 "tolerated compression" band) visibly grazes the
  deck at regular — accepted per ADR-0036, but worth the record: there
  is no actual compression MECHANISM (no shrinking, no reflow) for that
  band, "tolerated" just means the grid keeps padding via the same rule
  and is allowed to look tight, not that anything adapts.
- M6 rendered pass also caught a compact/regular scoping bug (see
  Progress) — the fix and its regression coverage are the only
  mid-M6 code change; everything else in M6 was verification only.
- Creation-gate follow-up: minting `card-frame-rotated` was NOT
  sufficient by itself — WHERE it gets applied mattered as much as the
  utility's own CSS. A rotated element's LAYOUT box (what a CSS grid
  reserves track space for) is always its PRE-transform box; `rotate`
  only changes what gets PAINTED, and a non-square box rotated 90°
  necessarily paints a box with width/height swapped from its own
  layout box. The first attempt applied `card-frame-rotated` directly
  to the same element carrying the `rotate-90` transform (matching the
  plan sketch's literal wording, decision 5) — this DID fix the
  horizontal clearance the M6 pass measured (~2px), but silently
  introduced a NEW ~10px VERTICAL overlap between rotated rows at
  card-md/regular, because `card-frame-rotated`'s formula
  (`width: var(--card-width)`) leaves the anchor's WIDTH unchanged from
  `card-frame`'s — only the height changes — so swapping the class on
  the rotated element alone shrinks the wrong dimension. This was only
  caught by rendering the actual page and measuring
  `getBoundingClientRect()` on adjacent rows — reading the class names
  alone (or jsdom) could not have surfaced it (ADR-0030's whole
  rationale). The fix that resolved BOTH axes: keep the flight anchor
  on plain upright `card-frame` (unrotated, sized like an upright card
  of that variant — the grid's real reserved footprint) and apply
  `card-frame-rotated` only to the CARD VISUAL inside it (still
  rotated) — a rotated card-frame-rotated box, at the same
  `--card-width`, paints width×height-reversed from `card-frame`'s own
  box, so it's comfortably smaller in BOTH dimensions than the upright
  anchor it sits inside, centered via `flex items-center
justify-center`. Trade-off worth recording: a rotated card's visual
  is now genuinely smaller in area than an upright card of the "same"
  nominal size (`card-md`) — roughly half the footprint — because the
  same `--card-width` scalar plays a different edge in each formula.
  Nobody surfaced this as a concern during the interview; if the
  smaller rotated-card size reads as visually off at a future design
  pass, it's this trade-off, not a bug.
- Re-verified numbers (rendered, not eyeballed; `TableSurface` +
  `Hand` composed with the real `seatAnchor="edge"` / `viewerSeat=
"external"` sizing so the measurement reflects production geometry,
  not an undersized default-width stand-in — an untried first
  reproduction using the room-screen's default `max-w-2xl` sizing
  actually measured NEGATIVE clearance, i.e. looked broken, purely
  because the table itself was too small; switching to the real
  `viewerSeat="external"` fluid sizing resolved that artifact). At a
  1280×900-equivalent regular table: a 12-card ROTATED (left-bench)
  hand clears the deck/discard cluster by **~50px**; a 12-card UPRIGHT
  (top-bench) hand clears by **~86px** — both comfortably positive, no
  overlap, and the asymmetry between them shrank from the M6 pass's
  ~31× (2px vs 62px) down to ~1.7× (50px vs 86px). Separately, the
  INTERNAL clearance between adjacent rows/columns within the rotated
  hand itself (not measured at M6, but the axis the first fix attempt
  broke) came out to ~26px (column-to-column) and ~34px
  (row-to-row) — also comfortably positive. Absolute pixel values here
  won't match a from-scratch live-game measurement exactly (this
  reproduction approximates the game screen's real flex/height chain
  rather than rendering the actual route against a live authenticated
  game), but the mechanism, the classes applied, and the sign/order of
  magnitude of every clearance are the real production ones.
- Bug-report follow-up (full detail in Progress above): a user-reported
  "table renders much smaller than the fold allows" at two DevTools
  viewport sizes outside this task's two reference viewports turned out
  to be two unrelated things wearing one symptom. **723×770 (regular)**
  did not reproduce after a thorough, repeated, measured sweep (720
  through 1280px wide, 2P and 4P) — the M5 mechanism fills the fold at
  every point tried; likely a stale dev server/cache on the reporter's
  side (AGENTS.md's own CAM-18 precedent). **421×770 (compact)** DID
  reproduce (~200px of dead space) but traces to `table-scroll`'s
  `flex-1` in `game-screen.tsx`, confirmed byte-identical to
  `release-v0` — a CAM-21-era mechanism (their own comment named it
  "accepted flex residue" at the one height, 640px, they ever validated)
  that scales ~1:1 with any excess viewport height beyond 640, not
  something this task's diff touched. Left unfixed per the task's own
  scope rule; flagged for a possible new Linear issue rather than
  silently patched under CAM-20.
- Design-gate fix cycle: two CSS mechanisms bit twice in one afternoon,
  both caught only by measuring the rendered rect (ADR-0030's whole
  point) and not by reading the class names. (1) On a flex container
  with `justify-content: center` and a single child, an ASYMMETRIC
  margin on that child (e.g. `margin-left` only) moves the child's
  RENDERED position by exactly HALF the margin's own value — the
  browser centers the child's whole margin box, so widening one side of
  it only shifts the center by half the width added. The side-bench arc
  fix's first pass used the raw fitted offsets directly and landed at
  exactly half the intended shift on every row; the fix was doubling
  every value in `SIDE_BENCH_MARGIN_CLASS`, not changing the fit. (2) A
  flex child with an explicit `width` still SHRINKS below that width
  (down to 0 in the extreme) if `margin + width` exceeds the flex
  container's own size and the child's `flex-shrink` is left at its
  default of 1 — the container doesn't just let the margin box overflow.
  This hit only the RIGHT bench (whose margin is positive, mirroring the
  left bench's negative one): the anchor is 64px wide, and a 114px
  positive margin plus the 64px-wide visual is way past that, so the
  browser shrank the visual to 0×0 to fit. The left bench's negative
  margin never exceeds the container so it never triggered this,
  masking the bug for exactly half of the mirrored pair until the right
  bench was checked independently — `regular:shrink-0` on the visual
  fixed it. Worth remembering for ANY future per-item nudge inside a
  centered flex/grid cell in this codebase: verify the actual rendered
  rect, not just that the intended class landed.
