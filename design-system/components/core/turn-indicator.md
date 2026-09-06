name: turn-indicator
status: draft
version: 1
extends: none

Whose turn, what phase. Class: **Game object**.

## Anatomy

- Banner: `surface.raised`, `2px` `ink.primary` border, `elevation.raised`,
  leading `accent.focus` dot, phase copy in `ui` 600 sentence case.
- Docks to a fixed screen position — **top, at every breakpoint** (r2
  supersedes r1's "above own hand on compact": compact docks it to the
  screen's pinned top band alongside the slam timer, not near the hand) —
  it never floats over cards.

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
- r2 (CAM-21, 2026-09-06, user call): docks TOP at compact too, in the
  screen's pinned chrome band alongside the slam timer and inline
  messages — supersedes r1's "above own hand on compact." The playtest
  finding this task fixes was exactly the opposite of r1's placement:
  scrolled down to act on your own hand, the indicator (and the slam
  timer with it) went off-screen.
