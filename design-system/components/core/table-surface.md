name: table-surface
status: draft
version: 2
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

## States

- `seating` — players joining/leaving during room phase; empty positions
  show no chip (benches are scenery, not slots).
- `in-game` — 2–5 seats active with hands laid at each seat.
- `compact` (< breakpoint `compact`) — the radial arrangement compresses:
  own hand docks to the screen bottom, opponents arc along the top.
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
