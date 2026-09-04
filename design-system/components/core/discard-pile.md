name: discard-pile
status: draft
version: 1
extends: none

The face-up pile slams match against. Class: **Game object**.

## Anatomy

- Top card face-up and dominant (full size); 1–2 under-card edges peek out
  at thrown angles (rotation ±4–9°) — the pile looks played-onto, not
  stacked by a machine.
- Sits beside the draw-deck at the table center.

## States

- `populated` — top card face-up.
- `empty` — a zero-card keep took the last card: dashed outline where the
  pile was. No slam window opens on an empty pile and taking from it is
  illegal — the empty state must read as "nothing to act on", not "loading".
- `receiving` — a discarded/slammed card arrives `leaving-play` and settles
  as the new top.
- `slam-target` — while the slam window is open, the top card gets the
  `accent.alarm` frame the slam-eligible cards echo: this is the rank being
  matched.

## Variants

None.

## Rules

- Everything in the pile was publicly played; face-up rendering leaks
  nothing. Only the top card is takeable (and only when it is not a power
  card) — takeability is server logic; the component only renders an
  affordance the view grants.
- Under-card edges are decorative history; the pile is not browsable — no
  scrubbing or history list (memory fidelity applies to discards too:
  remembering what went by is part of the game).
- The top card is the only card in the game that is always public — it
  anchors the slam-rank match visually.

## Revisions

- r1: initial, from the CAM-13 specimen board.
