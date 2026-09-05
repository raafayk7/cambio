name: draw-deck
status: draft
version: 2
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
- The click affordance (r2) is presentation only — legality is the server's
  and the client mirrors it via H1 (`deckCount > 0 || discard.length > 1`);
  omitting `onClick` entirely renders the deck as a static, non-interactive
  stack rather than a disabled button.
- The stock exposes `data-flight-anchor="deck"` for the flight layer.

## Revisions

- r1: initial, from the CAM-13 specimen board.
- r2 (CAM-18, T1/T2): `onClick` (accessible-button wrap, Hand's internal
  slot-button precedent) and the `reshuffling`/`draw` choreography states —
  the CAM-15 carve-out this task repays.
