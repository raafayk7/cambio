name: score-sheet
status: draft
version: 2
extends: none

The endgame reveal. Class: **Game object**.

## Anatomy

- Panel: `surface.raised`, `2px` border, `elevation.float`, "SCORES" in
  `display` face.
- Per-player rows: name, revealed cards (mini playing-cards, face-up),
  total in `numeral` type (tabular, true minus).
- Winner rows (plural on ties) in `accent.action` weight-700.

## States

- `revealing` — every hand flips face-up simultaneously at `duration.track`
  (decided CAM-13: instant full reveal; players scan the outcome at their
  own pace rather than sitting through ceremony). r2 (CAM-18): the sheet
  mounts with every mini card face-down and, once, flips every card up in
  the same beat after `duration.track` elapses, then settles — never
  re-triggered by a later re-render (a refetch landing after the reveal
  already settled does not re-flip it). A caller with no live "moment" to
  dramatize (e.g. a fresh page load straight into an already-`Ended` game)
  may skip straight to `final`.
- `final` — all totals settled, winner(s) marked.
- `tie` — two or more winner rows, both green: ties are a real outcome and
  must be representable (no tiebreak exists).

## Variants

None.

## Rules

- Renders only after the game ends by a Cambio call — scores exist at
  reveal, never during play (a running total would leak hidden state).
- Totals derive from rank **and** suit (red kings −2, black kings −1);
  the mini cards shown must make the negative-king rows self-explanatory.
- Zero cards scores 0 and can lose to negatives — the sheet orders by
  total, not card count, and never styles 0 as automatically winning.
- The caller gets no bonus, penalty, or special marker beyond the
  turn-indicator's announcement.

## Revisions

- r1: initial, from the CAM-13 specimen board.
- r2 (CAM-18, 2026-09-05): the `revealing` entrance — `ScoreSheet` gains a
  `revealing` prop (default off, already-`final`); when true, mounted
  cards start face-down and the whole sheet carries
  `data-state="revealing"` until a `duration.track`-timed flip to
  face-up settles it to `data-state="final"`. Composition: the sheet
  renders as a screen-level sibling overlay above `TableSurface`
  (`state="game-over"` dims the table beneath), never inside `center`
  (table-surface.md: "table is ground, not HUD"; the disc-sized scrim
  cannot contain a full sheet on compact). The turn-indicator's game-over
  announcement ("X called Cambio") always precedes this entrance.
  Amended same day (gate fix cycle): the sheet gains a `footer` slot —
  its single exit action renders ON the panel surface below the rows,
  separated by the row hairline, so the action groups with the scores;
  a detached chip floating over the card backs did not (gate D2
  finding).
