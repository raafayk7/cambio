name: modal
status: draft
version: 1
extends: none

Blocking dialog (confirm Cambio call, leave game, settings). Class:
**Overlay**.

## Anatomy

- `panel` anatomy at `elevation.float`, max-width 28rem, centered; title in
  `ui` 700 or `display` for ceremonial moments.
- Scrim: `green-deep` at 55% over the screen (the table darkens, the paper
  floats).
- Footer: buttons right-aligned; exactly one primary.
- Enters at `duration.snap` `ease.snap` (scale .96→1); no fade-in drift.

## States

- `open` — focus trapped inside; page behind is inert.
- `closing` — reverse snap; every modal has an escape: ✕, Esc, and scrim
  click all close unless the action is destructive-confirm (then only
  explicit buttons).
- `overflow` — body scrolls inside the panel; header/footer pinned.

## Variants

- `confirm` — destructive framing: consequence in the title ("Call Cambio —
  ends the game"), danger button, cancel secondary.

## Rules

- The game does not pause for anyone's modal — timers keep draining behind
  the scrim; a modal must never be used during the slam window.
- One modal at a time; no stacking.

## Revisions

- r1: initial (CAM-13).
