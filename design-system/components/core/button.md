name: button
status: draft
version: 2
extends: none

Class: **Interactive**.

## Anatomy

- `ui` 600, sentence case (voice.md), `2px` `ink.primary` border,
  `radius.sm`, padding `space.2` × `space.5`, `elevation.raised`.
- Minimum control height `44px` (the touch floor, r2) — spec-carried
  value, not a spacing token; padding stays `space.2` × `space.5` and the
  floor absorbs the difference. The `icon` variant keeps its own square
  size and is exempt.
- Primary: `accent.action` ground, `ink.inverse` text.
- Secondary: `surface.raised` ground, `ink.primary` text.
- Ghost: transparent ground, no shadow, `ink.primary` text.
- Icon: square, icon-only, requires an accessible label.
- Danger: `accent.alarm` ground (large label sizes) or `accent.alarm-deep`
  (small) — the contrast rule in tokens.md decides.

## States

- `default` — as above.
- `hover` — ground darkens one step (mix 8% `ink`); cursor pointer.
- `focus` — `accent.focus` ring, 3px, offset 2px. Never remove.
- `active` — pressed: translates by the shadow offset, shadow collapses to
  none (the papery press — the button physically sits down).
- `disabled` — 45% opacity, no shadow, no pointer events; keep the label
  readable.

## Variants

- `primary` / `secondary` / `ghost` / `icon` / `danger`.

## Rules

- One primary per surface (voice.md); the primary says what happens.
- The active "sit-down" press is the component's signature — never replace
  it with opacity flashes.
- `Slam` is a danger button with `display`-face label — the one button
  allowed poster type.

## Revisions

- r1: initial (CAM-13).
- r2: 44px minimum control height added (CAM-17, user-approved). The r1
  box measured ~43px (15px text × 1.5 line + 2 × `space.2` + 2 × 2px
  border), one pixel under the design-gate's touch recommendation; a
  min-height closes it exactly, where the next padding step (`space.3`)
  would overshoot to ~50px. Icon variant deliberately exempt — separate
  canon.
