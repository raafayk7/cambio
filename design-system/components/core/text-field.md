name: text-field
status: draft
version: 1
extends: none

Single-line text input (player name, room code). Class: **Input**.

## Anatomy

- `surface.raised` ground (lighter than page — the field reads as paper to
  write on), `2px` `ink.primary` border, `radius.sm`, `ui` 400 at body
  size, padding `space.2` × `space.3`.
- Caret and selection in `accent.action`.
- Always wrapped by `field-scaffold` (label/helper/error live there).

## States

- `default` / `hover` (border darkens) / `focus` (`accent.focus` ring) /
  `active` / `disabled` (45% opacity).
- `empty` — placeholder in `ink.muted`, real example text ("e.g. KHOKA"),
  never instructions.
- `filled` — user text in `ink.primary`.
- `error` — border swaps to `accent.alarm-deep`; message via scaffold.
- `read-only` — no border, ground only, selectable text.

## Variants

- `code` — room-code entry: `numeral`/monospaced spacing, uppercase,
  center-aligned, larger.

## Rules

- Placeholders are examples, not labels (the label is the scaffold's job).
- Error styling never relies on color alone — the scaffold's message
  carries the meaning.

## Revisions

- r1: initial (CAM-13).
