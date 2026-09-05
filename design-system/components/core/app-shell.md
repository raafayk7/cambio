name: app-shell
status: draft
version: 2
extends: none

The screen frame. Class: **Layout**.

## Anatomy

- Header: slim bar on `surface.page` — wordmark in `display` face (small),
  right side: settings icon-button, connection dot. No nav tabs; this app
  is lobby → room → game, a corridor, not a site.
- Content: the screen, on the scene ground its class requires (CAM-13
  scene map: lobby full-scene, game table+paving, forms plain cream with
  chrome).
- The game screen may collapse the header to a floating icon-button pair —
  play is full-bleed.

## States

- `default` / `game` (collapsed header) / `reconnecting` (alert bar under
  the header).

## Variants

None.

## Rules

- The shell owns the scene backgrounds; screens declare which scene depth
  they are, never paint their own.
- Safe-area aware on compact (notches, home bars); the own-hand dock
  reserves the bottom.

## Revisions

- r1: initial (CAM-13).
- r2 (CAM-17): the courtyard scene ground is realized (creation-gate
  round, then a user-directed art revision: the ground is the
  moodboard's own painted courtyard — a hi-res regeneration of
  lums-illustrated image9, shipped as `scene-courtyard.webp` in the ui
  package; content floats over it on `panel` wash variants so the hero
  table stays visible);
  the shell root is the positioned ancestor for the game state's
  floating controls; safe-area padding covers the bottom inset so the
  own-hand dock clears home bars; the settings icon-button renders only
  when a handler is supplied — an interactive-looking control that does
  nothing is worse than its absence (design-gate finding), so the canon
  header's settings affordance appears with the settings surface, not
  before it.
