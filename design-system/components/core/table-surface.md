name: table-surface
status: draft
version: 1
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
