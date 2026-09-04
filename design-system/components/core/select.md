name: select
status: draft
version: 1
extends: none

Choose one from a short list (game config: slam window, player cap display).
Class: **Input**.

## Anatomy

- Same field body as `text-field` + trailing chevron (`ink.primary`).
- Options panel: `panel` anatomy, `elevation.float`, options in `ui` 400,
  selected option marked with a leading suit pip (♦) in `accent.action`.

## States

- Interactive floor (`default/hover/focus/active/disabled`) +
- `empty` (no selection: placeholder) / `filled` / `error` / `read-only`.
- `open` — options panel visible; field border holds focus ring.

## Variants

None.

## Rules

- ≤ 7 options or rethink the control (this product's selects are tiny
  config lists).
- Native select semantics on compact widths — never a custom scroll trap on
  phones.

## Revisions

- r1: initial (CAM-13).
