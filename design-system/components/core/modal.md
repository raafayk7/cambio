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
  the scrim. No **game-action** modal (one that performs or confirms a
  game action — Call Cambio's confirm is the canonical example) may be
  required, opened by the system, or block input during the slam window.
- An **opt-in reference overlay** (the how-to-play guide) is the one
  exception: the player chose to open it, it performs no action, and it
  stays available in every phase including the slam window. Missing a slam
  while reading is the player's own cost, not the modal's — the original
  intent (the game never waits on anyone's modal) still holds, since
  nothing about the window pauses or resets while the overlay is open.
- One modal at a time; no stacking.

## Revisions

- r1: initial (CAM-13).
- r2 (CAM-30): the slam-window rule is scoped to **game-action** modals —
  it predates any player-openable reference modal. The how-to-play guide
  is the first opt-in reference overlay and stays open through the slam
  window by design (root plan Decision Log D3).
