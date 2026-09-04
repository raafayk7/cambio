name: badge
status: draft
version: 1
extends: none

Small status label. Class: **Static**.

## Anatomy

- `ui` 600 at 11–12px, uppercase, letter-spaced; `1.5px` `ink.primary`
  border; `radius.sm`; padding `space.1` × `space.2`.
- Ground by meaning: `accent.focus` (attention), `surface.warm` (neutral
  info), `accent.alarm-deep` with `ink.inverse` (alarm), `accent.action`
  with `ink.inverse` (positive).

## States

- `default` only.

## Variants

- `count` — numeric pill (deck count, card count): `radius` full, `numeral`
  type, `surface.raised` ground.

## Rules

- Badges state facts, never actions — anything clickable is a button.
- Never carry hidden-state hints (no "3 known cards" badges — memory
  fidelity).

## Revisions

- r1: initial (CAM-13).
