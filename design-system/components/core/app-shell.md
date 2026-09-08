name: app-shell
status: draft
version: 6
extends: none

The screen frame. Class: **Layout**.

## Anatomy

- Header: slim bar on `surface.page` — wordmark in `display` face (small),
  a small decorative suit cluster (♠ ♥ ♣ ♦, `text-sm`, `aria-hidden`)
  immediately beside it, right side: connection dot, help icon-button,
  settings icon-button (in that order). No nav tabs; this app is lobby →
  room → game, a corridor, not a site.
- The suit cluster's color split matches `divider.md`'s `ornament`
  variant: hearts/diamonds in `accent.suit-red`, spades/clubs in
  `ink.primary` (tokens.md's "suit red is quarantined" rule) — but the
  **order is deliberately its own** (♠ ♥ ♣ ♦, not the divider's ♠ ♥ ♦ ♣),
  a wordmark-specific choice, not a divider correction. Decorative only,
  never a status signal — no `role`, `aria-hidden`. Default chrome only;
  the collapsed `game` chrome has no wordmark to sit beside.
- Content: the screen, on the scene ground its class requires (CAM-13
  scene map: lobby full-scene, game table+paving, forms plain cream with
  chrome).
- The game screen may collapse the header to a floating icon-button pair —
  play is full-bleed. The help icon-button renders in this floating pair
  too, alongside settings.
- The help icon-button uses `MarkHelp` (a drawn "?" in the mark language —
  `packages/ui/src/lib/marks.tsx`, which is the marks' code home; this doc
  is their canon home, matching where the settings mark's rules already
  live). Accessible label "How to play". Same render-only-with-handler
  rule as settings (below).
- Connection dot: shape-redundant, never color-only (r3) — a filled disc
  when connected, a hollow ring when reconnecting, both ~12px (the ordinal
  scale's `size-3`). In the collapsed `game` chrome this dot is the only
  always-visible connection signal.

## States

- Chrome: `default` / `game` (collapsed header) — this is the only axis
  `state` controls (r3).
- Connection (orthogonal, r3): `connected` / `reconnecting`, driven by the
  `connection` prop on **either** chrome. `default` chrome renders the
  alert bar under the header (unchanged since r1); `game` chrome renders
  the same Alert `reconnecting` variant floating directly below the
  icon-button pair, inside the shell root's positioned floating-controls
  column — never a second, competing piece of visual vocabulary. Play
  stays visibly live behind both treatments.

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
- r3 (CAM-18 S1/S2, 2026-09-05): the mutually exclusive `state` union
  (`default` | `game` | `reconnecting`) is split into two orthogonal
  axes — `state` keeps the chrome (`default` | `game`) and reconnecting
  now derives from the existing `connection` prop on either chrome, so
  the collapsed `game` chrome can show the reconnecting treatment
  instead of being unable to represent it. `game` chrome's reconnecting
  signal is the existing Alert `reconnecting` variant, floated below the
  icon-button pair inside the same positioned column — no new visual
  vocabulary. The connection dot gains shape redundancy: filled disc
  (connected) vs. hollow ring (reconnecting), sized from the ordinal
  scale (`size-3`, ~12px) — closes the color-only exposure the CAM-17
  judge flagged.
- r4 (CAM-21, 2026-09-06): "the own-hand dock reserves the bottom" is
  realized — the dock itself lives in the game screen
  (`game-screen.tsx`'s `data-region="dock-actions"` plus the docked own
  hand above it), not in this component; the shell's role stays exactly
  what r2 already gave it, safe-area padding on the shell root, which the
  screen's dock inherits for free by sitting inside `<main>`. The
  compact viewport bound itself (`max-h-dvh` + the flex-shrink chain)
  also lives on the game screen's own wrapper, not here — lobby and room
  screens use this shell unchanged and inherit nothing from it.
- r5 (CAM-30): a help icon-button (new `MarkHelp` mark) joins settings in
  both chrome states' control groups — default header's right group and
  the game state's floating icon pair. Same rule as settings: renders
  only when `onHelp` is supplied (an inert-looking control is worse than
  its absence, CAM-17 gate finding), accessible label "How to play". All
  three screens (lobby, room, game) supply it, opening the how-to-play
  guide (`components/extensions/how-to-play-guide.md`).
- r6 (CAM-30 follow-up, user-directed): a decorative ♠ ♥ ♣ ♦ suit cluster
  renders beside the wordmark in default chrome, reusing `divider.md`'s
  ornament color split. Default chrome only — the collapsed `game` chrome
  never carried a wordmark to begin with, so nothing changes there.
