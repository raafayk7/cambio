name: link
status: draft
version: 1
extends: none

Inline navigation. Class: **Interactive**.

## Anatomy

- `ui` 500, `accent.action` text, underline always on (2px offset) — links
  are underlined, buttons are boxed; no third thing.

## States

- `default` — underlined green.
- `hover` — text darkens to `green-deep`.
- `focus` — `accent.focus` ring.
- `active` — pressed: `green-deep`.
- `disabled` — `ink.muted`, no underline, aria-disabled.

## Variants

None.

## Rules

- Links navigate; buttons act. An in-game action is never a link.

## Revisions

- r1: initial (CAM-13).
