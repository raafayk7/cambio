name: table-surface
status: draft
version: 4
extends: none

The play surface — the top-down khoka table. Class: **Game object**.

## Anatomy

- The table and its four curved benches render as ONE painted asset (r2):
  the moodboard's own top-down khoka table — weathered green planks,
  umbrella hole, cast shadows baked into the alpha — on the painted plaid
  paving ground (scenes.md). The greens in the painting are the
  `surface.table` / `green-deep` family by regeneration prompt, not by
  CSS token reference.
- Always four benches, from the reference furniture — scenery, never a
  constraint.
- Center: draw-deck + discard-pile, overlaid programmatically on the
  tabletop disc (54% of the asset width, measured from the alpha). Seats
  arranged radially around the asset.
- The viewer's own seat is always at the bottom; the table rotates per
  viewer.
- Compact art cap (CAM-21, docked composition only): under
  `viewerSeat="external"` the painted table asset's width is capped at a
  token max-width (`--size-table-art-compact`, tokens.md) so the whole
  composition fits the 360×640 fold — square asset, so the cap is also the
  height cap. Regular is unaffected (the cap is cancelled there), and the
  default `"internal"` path (the room screen) takes no cap at all (review
  F1).

## States

- `seating` — players joining/leaving during room phase; empty positions
  show no chip (benches are scenery, not slots).
- `in-game` — 2–5 seats active with hands laid at each seat.
- `compact` (< breakpoint `regular`) — the radial arrangement compresses:
  own hand docks to the screen bottom (CAM-21: rendered by the SCREEN, not
  this component — see r4), opponents wrap in a row along the top, each
  seat+hand group uniformly oriented (name above hand) regardless of its
  regular-mode arc side.
- `game-over` — the score-sheet overlays; the table dims to
  `green-deep`-tinted rest.

## Variants

None.

## Rules

- **Presentation only, never a constraint**: four benches seat any player
  count 2–5; the backend is never capped by the visual metaphor.
- Radial positions derive from seat order, rotated so the viewer sits
  bottom-center — every player sees themself nearest.
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
  fold budget for 2–4 players. 5 players still don't fit the 360×640
  floor by default (4 wide-enough groups need two wrapped rows
  regardless of orientation) — the middle region's own scroll (the
  screen's `data-region="table-scroll"`) is the sanctioned fallback,
  chrome and dock stay pinned. _(Amended at review, 2026-09-06, F1/F4:
  two fold-fit values this revision originally left implicit or
  component-wide are DOCKED-COMPOSITION-ONLY, keyed to
  `viewerSeat="external"` — the compact art max-width cap
  (`--size-table-art-compact`, 128px) and the root flow gap tightened
  `gap-4`→`gap-2` (a change r4 first omitted entirely). The default
  `"internal"` path — the room screen — keeps the uncapped `w-3/4` art
  and `gap-4`, byte-for-byte its pre-CAM-21 rendering; as shipped
  before this amendment both values leaked into the room screen at
  compact, halving its table art. The revision's "closed the fold
  budget for 2–4 players" is also name-width-sensitive: seat pills wide
  enough — e.g. 6-character names at 4 players — wrap the opponent row
  into the screen's sanctioned middle scroll; the invariants that hold
  at every count are page-level fit and pinned chrome/dock.)_
