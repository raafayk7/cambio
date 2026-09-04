name: alert
status: draft
version: 1
extends: none

Inline persistent notice (page-level errors, reconnecting banner). Class:
**Async/data** (support).

## Anatomy

- Full-width bar or in-panel block: `2px` border, `radius.sm`, leading
  mark, `ui` 500 copy, optional action button (ghost).
- Info: `surface.warm` ground / alarm: `accent.alarm-deep` ground with
  `ink.inverse` / success: `accent.action` ground with `ink.inverse`.

## States

- `visible` / `dismissed` (only user-dismissible when the condition is
  informational — an active error alert stays until resolved).

## Variants

- `info` / `alarm` / `success` / `reconnecting` — the required page-state
  banner: `surface.warm`, spinner mark, "Reconnecting…" copy; play is
  visibly live behind it (the game does not pause).

## Rules

- Alerts persist while true; toasts announce moments. Pick by duration of
  truth, not by severity.

## Revisions

- r1: initial (CAM-13).
