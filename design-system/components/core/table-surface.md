name: table-surface
status: draft
version: 2
extends: none

The play surface — the top-down khoka table. Class: **Game object**.

## Anatomy

- Round `surface.table` tabletop with a `green-deep` rim, `elevation.float`
  offset shadow, on the checkered `surface.warm` paving (the game screen's
  scene depth, per the CAM-13 scene map).
- Four curved `green-deep` benches around it — always four, from the
  reference furniture.
- Center: draw-deck + discard-pile. Seats arranged radially at the rim.
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
