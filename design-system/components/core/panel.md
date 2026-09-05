name: panel
status: draft
version: 2
extends: none

The generic content card (named `panel` so `playing-card` keeps the word
"card"). Class: **Static**.

## Anatomy

- `surface.raised` ground, `2px` `ink.primary` border, `radius.md`,
  `elevation.raised`, padding `space.4`+.
- Optional framed header: title in `ui` 600 or `display` for poster-weight
  panels.
- The suit-chrome treatment (cream frame, thin rules, corner suit marks) is
  a panel dress reserved for ceremonial surfaces (lobby hero, settings),
  not every box.

## States

- `default` only — Static class, explicitly no others.

## Variants

- `plain` — no border, ground only, for grouping without a box.
- `chrome` — the suit-chrome frame; use sparingly (one per screen).
- `wash` (r2) — the translucent paper wash: `surface.raised` at 90%,
  border and shadow solid. For panels sitting ON an illustrated scene
  ground only — the painting stays faintly visible through the paper.
  Never `backdrop-blur`; glass is not in this vocabulary. 90% is the
  legibility floor (helper `ink.muted` keeps AA contrast over the
  scene's darkest values); headings that would otherwise sit on the
  artwork move inside the wash.

## Rules

- Panels never nest more than two deep; the print aesthetic dies in
  box-in-box-in-box.
- Emphasis comes from the border and type, not shadows (elevation is fixed
  per component, not a knob).

## Revisions

- r1: initial (CAM-13).
- r2 (CAM-17, user-directed art revision): `wash` variant added so lobby
  content can float over the courtyard painting with the hero table
  visible through it.
