name: divider
status: draft
version: 1
extends: none

Section separation. Class: **Static**.

## Anatomy

- Horizontal rule: `2px` solid `ink.primary` for section breaks, `1px` at
  25% for row separation (the `--rule` value).
- Ornamental variant: centered suit marks (♠ ♥ ♦ ♣) flanked by rules — the
  border-chrome language at line scale.

## States

- `default` only.

## Variants

- `plain` / `ornament` (suit marks; ceremonial surfaces only, matches
  `panel` chrome).

## Rules

- Prefer whitespace first; a divider is for when the spacing scale alone
  can't separate (dense lists, tables).

## Revisions

- r1: initial (CAM-13).
