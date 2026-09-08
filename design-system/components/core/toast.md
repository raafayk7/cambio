name: toast
status: draft
version: 1
extends: none

Transient notice (copy result, connection events, setting saved). Class:
**Overlay**.

## Anatomy

- Compact `panel` at `elevation.float`, docked bottom-center (compact) or
  bottom-left (regular); `ui` 500; leading state mark (✓ in `accent.action`,
  ! in `accent.alarm-deep`).
- Snaps in from the dock edge at `duration.snap`.

## States

- `open` — auto-dismisses (4s default); hover/focus pauses the clock.
- `closing` — snaps out.
- `overflow` — max 3 stacked; oldest collapses first.

## Variants

- `info` / `success` / `alarm`.

## Rules

- Toasts describe completed events in plain past tense ("Link copied");
  never questions, never actions requiring response — that's a modal.
- Game-state events (turns, slams) never arrive as toasts — they belong to
  the turn-indicator and the table. Toasts are app plumbing only.

## Revisions

- r1: initial (CAM-13).
