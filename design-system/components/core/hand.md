name: hand
status: draft
version: 2
extends: none

A player's slot grid. Class: **Game object**.

## Anatomy

- Grid of card slots, rows of 2: four cards render 2×2; penalty growth adds
  a new row (2×3 at six); slams shrink it.
- Slot: playing-card footprint; an **empty slot renders as a dashed
  `ink.inverse`-at-55% outline** at `radius.card` — vacancies are public
  information and stay visible in place.
- Slot indices are stable: a slam removes the card, not the slot position;
  cards never re-flow to fill gaps.
- Own hand sits nearest the viewer, larger; opponents' hands render at their
  seats, smaller, same anatomy.

## States

- `populated` — face-down cards in stable slots.
- `empty` — zero cards: all-dashed grid. Zero cards is not a win and the
  player still acts; the empty hand must not read as "out of the game".
- `growing` — a penalty or give card arrives `in-flight` into the lowest
  free slot.
- `shrinking` — a slammed card `leaving-play`; its slot outline remains.
- `awaiting-give` — an opponent slot vacated by a correct slam, waiting for
  the slammer's card: dashed outline + `accent.focus` ring.
- `inert` — not interactable (not your turn, no slam window): no hover
  affordance on cards.

## Variants

- `own` (near, large, interactive) / `opponent` (seated, small, slam-only
  interactions).

## States (r2 addition)

- `targeting` — a power (7/8/9/10/J/Q) or the swap-held action is choosing a
  slot: the slot(s) already picked render `selected` (same visual language
  as keyboard focus, `playing-card.md` state 4); clicking a slot again
  toggles the pick off rather than completing an invalid target.

## Rules

- The hand receives only entitled card views: opponents' hands are always
  backs; own hand shows values only during an active peek/draw entitlement.
- Slot movements (swaps) are public and must animate as visible slot-to-slot
  flights — knowledge follows cards, and players track identity through
  movement. Never teleport a card.
- Card count is public and may be displayed; values never.
- No "cards you know" affordance on any slot, own or opponent (memory
  fidelity).
- Every slot exposes a flight anchor (`slot:<playerId>:<slotIndex>`),
  occupied or not — a vacancy is a valid flight destination (a give lands
  in one) and, via `emptySlotsClickable`, a clickable target for a
  consumer that needs one — never just a dead outline.

## Revisions

- r1: initial, from the CAM-13 specimen board.
- r2 (CAM-18, T2/T3): `selectedSlots` and `emptySlotsClickable` land as
  props; every slot, occupied or not, now carries its flight anchor.
  _(Amended at review F4, 2026-09-06, to match what ships:
  `selectedSlots` renders the selected treatment for in-progress
  MULTI-pick targeting — the J/Q two-pick — and for the transient
  public which-slot-was-peeked beat (review F3); single-click actions
  (7/8/9/10 peeks, swap-held) send immediately and never populate a
  selection. `emptySlotsClickable` widens clickability to vacancies for
  a consumer that needs an empty-slot target — the shipped give flow
  resolves on the slammer's own OCCUPIED slots, so today only the
  gallery exercises it; it stays as the affordance the prop was built
  for.)_ Amended same day (gate fix cycle): the
  dashed vacancy outline renders only for indices that are genuinely
  empty in game state — the grid's even-rounding filler cell beyond
  every real signal is an invisible spacer, never a painted vacancy
  (one mark, one meaning).
