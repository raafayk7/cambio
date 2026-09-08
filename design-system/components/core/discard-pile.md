name: discard-pile
status: draft
version: 3
extends: none

The face-up pile slams match against. Class: **Game object**.

## Anatomy

- Top card face-up and dominant (full size); 1–2 under-card edges peek out
  at thrown angles (rotation ±4–9°) — the pile looks played-onto, not
  stacked by a machine.
- Sits beside the draw-deck at the table center.

## States

- `populated` — top card face-up.
- `empty` — dashed outline where the pile was: every game's opening state
  (ADR-0039, r3 — no card is turned face up at the deal), and reachable
  again mid-game by a zero-card keep taking the last card. No slam window
  opens on an empty pile and taking from it is illegal — the empty state
  must read as "nothing to act on", not "loading".
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
- The click affordance (r2) is presentation only — legality (a non-power
  top) is the server's and the client mirrors it via H1; omitting `onClick`
  entirely renders the pile as static rather than a disabled button.
- The pile exposes `data-flight-anchor="discard"` for the flight layer.

## Revisions

- r1: initial, from the CAM-13 specimen board.
- r2 (CAM-18, T1/T2/CH1): `onClick` (accessible-button wrap, same
  precedent as `hand.md`/`draw-deck.md`) and the `receiving` state — the
  CAM-15 carve-out this task repays.
- r3 (CAM-31, 2026-09-08): `empty` is now also the opening state of every
  game (ADR-0039 — no face-up card at the deal), not only the ADR-0012
  zero-card-keep edge case — a first-run experience, still "nothing to act
  on", never "loading". Pre-authorized through the creation gate by the
  CAM-31 root plan's Decision Log (2026-09-08).
