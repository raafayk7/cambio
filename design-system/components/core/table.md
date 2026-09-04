name: table
status: draft
version: 1
extends: none

Columnar data (scores, room details). Class: **Async/data**. (The play
surface is `table-surface`; this is the data table.)

## Anatomy

- Header row: `ui` 600 small caps-feel (uppercase, letter-spaced), bottom
  rule 2px; body rows separated by the 1px 25% rule.
- Numeric columns right-aligned in `numeral` type (tabular, true minus);
  text columns left-aligned.
- Wide tables scroll horizontally inside their own container — the page
  never scrolls sideways.

## States

- `populated` / `loading` (skeleton rows) / `empty` (empty-state) /
  `error` (alert row) / `partial` (loaded + skeleton tail).

## Variants

None.

## Rules

- Numbers never center-align; scores never render without their sign
  rules (voice.md).

## Revisions

- r1: initial (CAM-13).
