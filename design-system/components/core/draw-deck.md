name: draw-deck
status: draft
version: 1
extends: none

The face-down stock. Class: **Game object**.

## Anatomy

- Stack of 2–3 offset card backs (offset = `space.1`, shadows stacked) +
  a count badge (`surface.raised` pill, `1.5px` `ink.primary` border,
  `numeral` type).
- Sits on `surface.table` beside the discard-pile; the pair is the table's
  center.

## States

- `populated` — stack + count.
- `low` — count ≤ 5: badge text shifts to `accent.alarm-deep` (reshuffle is
  near; that tension is real information).
- `empty→reshuffling` — the discard pile (minus its retained top card)
  flights over and becomes the new stack. Public, designed moment at
  `duration.track`: every player must see the reshuffle happen.
- `draw` — top card flights to the active player at `duration.track`,
  face-down for everyone except the drawer.

## Variants

None.

## Rules

- Deck count is public state; the exact card order must never reach any
  client (the shuffled future of the game).
- A drawn card's value travels only on the drawer's per-player channel; the
  public animation shows a back.
- The reshuffle retains the current top discard — visibly: it stays put
  while the rest flights.

## Revisions

- r1: initial, from the CAM-13 specimen board.
