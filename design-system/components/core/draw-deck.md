name: draw-deck
status: draft
version: 3
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
- `slam-window` — the slam window is open: the stack carries the
  `accent.alarm` frame + soft pulse (the same idiom `discard-pile.md`'s
  `slam-target` echoes from `playing-card.md`'s `slamEligible`), so the
  deck stops being the one silent participant while a window is open.
  Independent of the populated/low/empty split above (a window can be
  open over an empty deck) and composable with a choreography state — see
  Rules.

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
  and the client mirrors it in its affordance mapping (`deckCount > 0
|| discard.length > 1` — a T1-specified rule, distinct from H1's two
  helpers);
  omitting `onClick` entirely renders the deck as a static, non-interactive
  stack rather than a disabled button.
- `slam-window` (r3) is presentation only, same as the click affordance:
  the deck stays a static stack, never a disabled button, and never grows
  an `onClick` or copy of its own — legality of drawing is still decided
  exactly as above, unaffected by whether the window is open. When a
  choreography state (`reshuffling`/`draw`) is also active, the
  choreography wins on the rendered state (mirrors `discard-pile.md`'s
  `receiving`-over-`slam-target` precedence) — the pulse is a phase
  overlay, not a state that can starve a flight already in progress.
- The stock exposes `data-flight-anchor="deck"` for the flight layer.

## Revisions

- r1: initial, from the CAM-13 specimen board.
- r2 (CAM-18, T1/T2): `onClick` (accessible-button wrap, Hand's internal
  slot-button precedent) and the `reshuffling`/`draw` choreography states —
  the CAM-15 carve-out this task repays.
- r3 (CAM-26, 2026-09-07): `slam-window` state — the deck was the only
  table object that gave no signal while a slam window was open (root
  plan); this closes that gap with the existing alarm-frame idiom, no new
  tokens. Crossing the creation gate was explicitly authorized by the user
  (root plan Decision Log, 2026-09-07) rather than proposed unprompted.
