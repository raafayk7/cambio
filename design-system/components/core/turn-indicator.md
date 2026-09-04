name: turn-indicator
status: draft
version: 1
extends: none

Whose turn, what phase. Class: **Game object**.

## Anatomy

- Banner: `surface.raised`, `2px` `ink.primary` border, `elevation.raised`,
  leading `accent.focus` dot, phase copy in `ui` 600 sentence case.
- Docks to a fixed screen position (top on regular, above own hand on
  compact) — it never floats over cards.

## States

- `your-turn` — "Your turn" + available actions context; dot in
  `accent.focus`.
- `other-turn` — "Nadia's turn"; calm, `ink.muted` text.
- `slam-window` — "Slam window open" — dot swaps to `accent.alarm`; pairs
  with the slam-timer, never replaces it.
- `game-over` — "Nadia called Cambio" — the call is announced here before
  the score-sheet reveals.

## Variants

None.

## Rules

- Copy uses player language and canonical terminology (voice.md): events,
  never engine internals, and never card values ("Nadia peeked at slot 2",
  not what was seen).
- One indicator per screen; seats echo it with the active-turn ring but the
  banner is the single textual source of phase truth.
- Announcements describe **public** events only — the banner is on the room
  channel's information diet.

## Revisions

- r1: initial, from the CAM-13 specimen board.
