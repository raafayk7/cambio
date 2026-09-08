name: held-card
status: draft
version: 3
extends: none

The spot where a drawn or taken card sits while its holder decides. Class:
**Game object**.

## Anatomy

- One `playing-card` (size `md`) plus a small label beneath it, in `ui` 500
  `ink.muted` — player language, never engine names ("You drew" /
  "Nadia is holding", never "HoldingCard resolved"). r2's second `hint`
  line is retired (r3) — see Revisions.
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
  action row) — this component only presents the held card.

## Revisions

- r1: initial (CAM-18 T2, batch-approved "held-card presentation spot").
- r2 (CAM-30, root plan D5): an optional `hint` line joined `label` — the
  power-resolution hint (F3), gone the instant the phase left
  `ResolvingPower`/`ResolvingQueenSwap`.
- r3 (CAM-30 follow-up, user-directed): r2's `hint` line is retired — live
  play showed `ink.muted` text sitting on the table felt (green/paving,
  behind the held card) reads as near-invisible, not merely quiet. The
  power hint moved to the game screen's chrome band instead (cream
  `surface.page`, alongside every other transient instruction —
  turn-indicator.md's territory, not this component's) and now renders in
  `ink.primary`/semibold for legibility. `HeldCardProps` drops `hint`.
