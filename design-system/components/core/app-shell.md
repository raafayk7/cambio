name: app-shell
status: draft
version: 1
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
