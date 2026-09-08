name: field-scaffold
status: draft
version: 1
extends: none

The canonical wrapper for every input: label + helper + error. One
component so form anatomy is never re-litigated. Class: **Input** (wrapper).

## Anatomy

- Label above the field: `ui` 600, `ink.primary`; required marker is the
  word "required" in `ink.muted`, not an asterisk.
- Helper below: `ui` 400 small, `ink.muted`.
- Error replaces helper: `accent.alarm-deep` text + the field's error
  border. Message per voice.md: what went wrong, then how to fix.
- Vertical rhythm: `space.1` label→field, `space.1` field→helper.

## States

- `default` / `error` (mutually exclusive with helper) / `disabled`
  (label + helper at 45%) / `read-only` (label + value text only).

## Variants

None.

## Rules

- Every input in the product renders inside a scaffold — no bare fields.
- Error messages never blame ("Room code not found. Check the code and try
  again.") and never apologize.

## Revisions

- r1: initial (CAM-13).
