name: table-surface
status: draft
version: 6
extends: none

The play surface — the top-down khoka table. Class: **Game object**.

## Anatomy

- The table and its four curved benches render as ONE painted asset (r2):
  the moodboard's own top-down khoka table — weathered green planks,
  umbrella hole, cast shadows baked into the alpha — on the painted plaid
  paving ground (scenes.md). The greens in the painting are the
  `surface.table` / `green-deep` family by regeneration prompt, not by
  CSS token reference.
- Always four benches, from the reference furniture. > **Amended (r5,
  ADR-0036):** no longer "scenery, never a constraint" — the visual
  metaphor is now load-bearing. The game caps at **2–4 players**, one per
  bench; see the Rules section below.
- Center: draw-deck + discard-pile, overlaid programmatically on the
  tabletop disc (54% of the asset width, measured from the alpha). Seats
  anchor to the four benches (r5) — the viewer's bench is always bottom,
  opponents take top (2P), left+right (3P), or left+top+right (4P) in
  seat-arc order. No radial/polar placement remains in the rendered
  output.
- The viewer's own seat is always at the bottom bench; the bench
  assignment rotates per viewer, never the table art itself.
- Compact art cap (CAM-21, docked composition only): under
  `viewerSeat="external"` the painted table asset's width is capped at a
  token max-width (`--size-table-art-compact`, tokens.md) so the whole
  composition fits the 360×640 fold — square asset, so the cap is also the
  height cap. Regular is unaffected (the cap is cancelled there), and the
  default `"internal"` path (the room screen) takes no cap at all (review
  F1).

## States

- `seating` — players joining/leaving during room phase; empty positions
  show no chip (benches are unoccupied, not slots to fill in a particular
  order).
- `in-game` — 2–4 seats active with hands laid at each bench (r5).
- `compact` (< breakpoint `regular`) — the bench arrangement compresses:
  own hand docks to the screen bottom (CAM-21: rendered by the SCREEN, not
  this component — see r4), opponents wrap in a row along the top, each
  seat+hand group uniformly oriented (name above hand) regardless of its
  regular-mode bench.
- `game-over` — the score-sheet overlays; the table dims to
  `green-deep`-tinted rest.

## Variants

None.

## Rules

- **The visual metaphor is load-bearing (r5, ADR-0036):** the game caps at
  2–4 players, one per bench — the viewer's bench is always bottom;
  opponents take top (2P), left+right (3P), or left+top+right (4P), in
  seat-arc order (the seat after the viewer takes the leftmost occupied
  bench, sweeping left → top → right). > **Amended (r5):** supersedes r1's
  "presentation only, never a constraint" and the prior rule here ("the
  backend is never capped by the visual metaphor") — ADR-0036 inverts that
  doctrine deliberately: the rule now bends to the layout.
- Bench assignment derives from seat order, rotated so the viewer always
  anchors bottom — every player sees themself nearest. > **Amended (r5):**
  supersedes "radial positions derive from seat order" — placement is a
  fixed per-bench assignment now, not an angle computed from seat count.
- The table never displays derived game facts (scores, known cards) — it is
  ground, not HUD.

## Revisions

- r1: initial, from the CAM-13 specimen board.
- r2 (CAM-17, user-directed art revision): the table + benches render as
  the moodboard's own painted asset (a hi-res regeneration of
  lums-illustrated image7 with cast shadows baked into its alpha;
  production copy `apps/web/src/assets/table-top.webp`), restoring the
  CURVED benches this spec always specified — CAM-15's straight-bar
  benches were drift. The paving ground likewise became the painted
  top-down plaid (image10 regeneration). Center content, the game-over
  scrim, and seats stay programmatic overlays; the tabletop disc
  measures 54% of the asset width (spec-carried, measured from the
  alpha channel).
- r3 (CAM-18, 2026-09-05, gate fix cycle): two changes from the game
  screen's gate run. (1) **Seat anchoring** — `seatAnchor` prop:
  `center` (default; the pre-game lone-pill case) centers a seat node on
  its ring point; `edge` (the game screen) anchors the node's outboard
  edge at the point so seat + hand grow inward toward the table — a
  centered seat+hand group escaped the surface and occluded the chrome
  above it. **Exception (part of `edge`'s contract):** the VIEWER's own
  seat keeps the centered anchor even under `edge` — its dock hangs
  below the table with the hand over the near bench (the gate-judged
  controlled break), because a full own-size hand grown inward would
  lie across the tabletop and occlude the deck and discard. (2) **Game-over rest** — "the table dims" now means the
  whole surface: alongside the tabletop-disc scrim, a full-region
  `green-deep` tint sits above the seat layer and below the score-sheet
  overlay, so the terminal state visibly subordinates hands, seats, and
  ground (the disc-only scrim was almost entirely hidden behind the
  score sheet).
- r4 (CAM-21, 2026-09-06, compact fold-fit): the docked composition —
  "own hand docks to screen bottom" is realized. **`viewerSeat` prop**
  (`"internal"` default | `"external"`): `external` (the game screen)
  skips rendering the viewer's own seat wrapper here while still deriving
  every position from the full `seats.length`, so the game screen can
  render it itself inside its own bottom dock, outside this component's
  scroll region; `internal` (the room screen's pre-game view, unchanged)
  renders every seat as before. **Root is unconditionally `relative`**
  (was `regular:relative`) so the game-over full-region rest (r3) scopes
  to the surface at compact too — previously it resolved against
  whatever positioned ancestor was next up the tree, a latent bug masked
  by compact never having been viewport-bounded before this task.
  **Compact opponent orientation is now uniform**, decoupled from the
  regular-mode radial side (game-screen.tsx's `SeatWithHand`, not this
  component) — see the root plan's Surprises: at 360px, a "row"-oriented
  group (name beside hand, ~175px) only allows ~2 per wrapped line, while
  a "column" one (name above hand, ~95px) allows 3; forcing every
  opponent to the column form at compact was the fix that closed the
  fold budget for 2–4 players. > **Retired (r5, ADR-0036):** this
  paragraph's next sentence originally read "5 players still don't fit
  the 360×640 floor by default (4 wide-enough groups need two wrapped
  rows regardless of orientation) — the middle region's own scroll ... is
  the sanctioned fallback" — a player-count fallback. The game caps at
  2–4 as of r5, so that 5th-player case is gone; the middle region's
  scroll survives only as generic overflow degradation (long names, an
  overgrown hand), never as a player-count fallback. _(Amended at review, 2026-09-06, F1/F4:
  two fold-fit values this revision originally left implicit or
  component-wide are DOCKED-COMPOSITION-ONLY, keyed to
  `viewerSeat="external"` — the compact art max-width cap
  (`--size-table-art-compact`, 128px — **superseded, r6: 158px**) and the
  root flow gap tightened `gap-4`→`gap-2` (a change r4 first omitted
  entirely). The default
  `"internal"` path — the room screen — keeps the uncapped `w-3/4` art
  and `gap-4`, byte-for-byte its pre-CAM-21 rendering; as shipped
  before this amendment both values leaked into the room screen at
  compact, halving its table art. The revision's "closed the fold
  budget for 2–4 players" is also name-width-sensitive: seat pills wide
  enough — e.g. 6-character names at 4 players — wrap the opponent row
  into the screen's sanctioned middle scroll; the invariants that hold
  at every count are page-level fit and pinned chrome/dock.)_
- r5 (CAM-20, ADR-0036): the doctrine inverts — the four benches become
  **load-bearing**, not scenery. The game caps at 2–4 players; every seat
  anchors to a bench (`benchAssignment`, table-geometry.ts) instead of
  spacing radially, and `seatArc`/`ringPositions`/`inwardSide` retire with
  the polar engine. `BENCH_POSITION_CLASS`/`BENCH_ANCHOR_CLASS`
  (table-surface.tsx, exported) place and anchor each bench as a static
  class map — no per-seat-count angle math, no inline ring-point
  percentages. `seatAnchor`/`viewerSeat` keep their r3/r4 contracts
  unchanged; only the geometry feeding them changed. Left/right benches
  additionally read their hand rotated along the bench (see hand.md r3,
  ADR-0036 §5) — a Hand-internal change, not a TableSurface one. r1's
  "presentation only, never a constraint" and r4's 5-player scroll
  fallback are superseded/retired above.
- r6 (CAM-20, design-gate fix cycle, 2026-09-06): three compact-only
  measurements from the docked composition's design-gate pass, all
  scoped to `viewerSeat="external"` like every other docked-composition
  value on this page. (1) **`--size-table-art-compact` raised 128px →
  158px** (tokens.md): at 128px the tabletop disc (54% of the art) was
  only 69.1px across, leaving the deck+discard pair effectively flush
  against its edge (~0.5px clearance) — 158px is the minimum that clears
  the pair by ≥8px on both sides, a newly re-measured value, not a
  revert to r4's original 160px. (2) **Opponent row's inter-seat gap**
  (`table-surface.tsx`) widened from `gap-2` to `gap-x-5` (8px→24px,
  vertical `gap-y` unchanged): it matched the gap INSIDE each opponent's
  hand, so two adjacent hands read as one continuous card strip with no
  visual seam between players — paired with hand.md r3's own intra-hand
  gap tightening (8px→4px, `hand.tsx`), the freed width still fits two
  opponent groups inside the 360px compact content width. (3) The draw
  deck's count badge inset flush to its own corner at compact instead of
  overhanging past it (`draw-deck.tsx`, `card-frame`'s sibling
  documentation, not this file's own anatomy) — noted here only because
  it was a direct consequence of (1)'s undersized disc; regular is
  unaffected by any of the three.
