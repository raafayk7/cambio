name: playing-card
status: draft
version: 3
extends: none

The atom of the game. Class: **Game object**.

## Anatomy

- Body: `surface.raised` face / striped back, `radius.card` (6% of width),
  `1.5px` `ink.primary` border, `elevation.raised` at rest.
- Face: rank in `display` face (top-left) + suit pip (bottom-right). Hearts
  and diamonds use `accent.suit-red`; spades and clubs use `ink.primary`.
- Back: `brick-bright` stripes on card cream with a `mustard` inner frame —
  the back is the most-seen surface in the game; it carries the identity.
- Size scales by context (hand, pile, score reveal); rank scales with the
  card, floored at the type scale's 12px step (r3) so the smallest
  footprints stay legible.

## States

Required floor for this component (approved CAM-13; each must be designed,
none may be an animation accident):

1. `face-down` — rest state; back showing.
2. `face-up` — discard top, public reveals, endgame.
3. `peeking` — flips up at `duration.snap`, holds for `duration.peek`, flips
   back. Shown only to the entitled player.
4. `selected` — lifts, `accent.focus` ring, `elevation.float`. Same visual
   language as keyboard focus.
5. `slam-eligible` — slam window open: pulsing `accent.alarm` edge on the
   face-down back. Eligibility is public; the value stays hidden.
6. `in-flight` — moving slot-to-slot at `duration.track` with
   `elevation.float`. Tracking this move is the memory game; it must read
   from every seat.
7. `leaving-play` — reveals face-up while traveling to the discard pile
   (every slam publicly reveals the card) and settles at a thrown angle.

## Variants

- `card-back` only (no face data in the payload) — the default for every
  card the viewer is not entitled to see.
- Mini (score-sheet, discard under-cards) — same anatomy, smaller scale.

## Rules

- **A face-down card's value must not exist in the client payload.** The
  component renders `face-up`/`peeking` only from an entitled view
  (`viewFor`); there is no "face-down but value present" prop. This is
  structural, not stylistic.
- No tooltips, badges, or markers that persist knowledge — a peek ends and
  the card is a back again, indistinguishable from the others (memory
  fidelity).
- Rank + pip must stay legible at every context size; red/black must be
  distinguishable at a glance (scoring depends on suit color).
- All motion uses `ease.snap`; only `duration.snap` and `duration.track`
  exist. Reduced motion: cross-fade + `accent.focus` highlight on origin and
  destination.

## Revisions

- r1: initial, from the CAM-13 specimen board.
- r2 (CAM-18, G3): the `peeking` hold duration is `duration.peek`
  (tokens.md), no longer "game-configured" — round-1 user decision: a
  fixed client duration, the same for every peek.
- r3 (CAM-21 design-gate fix, recorded at review): rank and pip sizes
  gain a 12px floor — `max(card-proportional, 12px)`, tokens.md type
  scale. Below a 40px card the proportional size dropped under the
  scale's smallest legible step (measured 9.6px/8.32px at the compact
  32px `card-md`); the floor applies at both breakpoints, so `card-sm`
  consumers (the score-sheet minis) pick it up at regular too — a
  deliberate, narrow legibility exception to CAM-21's "regular
  untouched" scope, logged in that task's Decision Log.
