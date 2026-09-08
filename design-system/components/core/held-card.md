name: held-card
status: draft
version: 2
extends: none

The spot where a drawn or taken card sits while its holder decides. Class:
**Game object**.

## Anatomy

- One `playing-card` (size `md`) plus a small label beneath it, in `ui` 500
  `ink.muted` — player language, never engine names ("You drew" /
  "Nadia is holding", never "HoldingCard resolved").
- r2 (CAM-30): an optional second `ink.muted` line beneath the label,
  present only for the holder during `ResolvingPower`/`ResolvingQueenSwap`
  — instruction copy naming the current power obligation ("Peek at one of
  your own cards"), never a value. This is NOT an affordance (see Rules):
  targeting still happens on the hands.
- Sits near the table center, beside the deck and discard pile, or above the
  holder's own hand when that reads more naturally at a given breakpoint —
  the exact placement is tuned against the rendered table (ADR-0030); this
  spec only fixes that there is exactly one held-card spot on the table at a
  time (the game is turn-based — only one player can be holding).
- Exposes `data-flight-anchor="held"`: draws, discard takes, and the
  eventual swap/discard/keep resolutions all flight to or from this one
  point (`draw-deck.md`, `discard-pile.md`, `hand.md`).

## States

- `entitled` — the viewer may see the value (they are the holder, or the
  card came off the public discard pile): the card renders `face-up`.
- `unentitled` — everyone else while the source was the deck: the card
  renders `face-down`. This is STRUCTURAL, exactly like `playing-card.md` —
  there is no "held but hidden" flag; the value simply isn't in the payload
  for anyone but the holder (hidden-information skill).

## Rules

- Entitlement mirrors `PlayerGameView.phase.card` exactly: present for the
  holder always, and for everyone when `source === "discard"` — never
  computed or cached client-side.
- The label never restates a value once shown — a peek or a resolved power
  discarding here does not get a "you saw a 7" caption (memory-faithful,
  voice.md).
- Nothing here implies an affordance; swap/discard/keep/targeting buttons
  and slot selection are the caller's job (`hand.md` `selectedSlots`, the
  action row) — this component only presents the held card. The r2 hint
  line is instruction copy about the current obligation, not an
  affordance control — this rule still stands for it explicitly.

## Revisions

- r1: initial (CAM-18 T2, batch-approved "held-card presentation spot").
- r2 (CAM-30, root plan D5): an optional `hint` line joins `label` —
  the power-resolution hint (F3), gone the instant the phase leaves
  `ResolvingPower`/`ResolvingQueenSwap` (it derives from the current
  view's affordances and persists nowhere).
