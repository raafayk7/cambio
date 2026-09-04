name: seat
status: draft
version: 1
extends: none

A player at the table: identity + public status. Class: **Game object**.

## Anatomy

- Pill: avatar disc (initial on a palette-cycled `surface.warm`/`green-table`
  ground), player name (`ui` 600), card count (`ui` small, `ink.muted`).
- `surface.raised` ground, `1.5px` `ink.primary` border, `radius` full,
  `elevation.raised`.

## States

- `default` — name + card count.
- `active-turn` — `accent.focus` (mustard) ring; pairs with the
  turn-indicator banner.
- `acting` — brief state while their action animates (drew, took discard,
  called Cambio): the seat is the anchor the public event copy points at.
- `disconnected` — 55% opacity, dashed border, "reconnecting…" replaces the
  card count. The game does not pause visually; the seat tells the story.
- `left` — grayed, no count; slot history remains for the score-sheet.

## Variants

- `own` — rendered at the bottom position; identical anatomy (no privileged
  styling — your advantage is your memory, not your UI).

## Rules

- A seat displays only public state: name, card count, connection,
  turn status. Never hand values, never score-in-progress (scores exist
  only at reveal — a running total would leak entitled knowledge).
- Player names render as given (voice.md): no truncation without an
  ellipsis + full name on the score-sheet.
- The avatar color cycle draws from palette primitives only and never
  collides adjacent seats.

## Revisions

- r1: initial, from the CAM-13 specimen board.
