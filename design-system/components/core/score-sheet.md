name: score-sheet
status: draft
version: 1
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
  own pace rather than sitting through ceremony).
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
