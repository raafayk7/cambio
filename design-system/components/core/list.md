name: list
status: draft
version: 1
extends: none

Vertical collection (rooms in the lobby, players in a room). Class:
**Async/data**.

## Anatomy

- Rows on `surface.raised`, separated by the 1px 25% rule; row padding
  `space.3`; primary text `ui` 500, meta in `ink.muted`.
- Interactive rows take the Interactive floor (hover ground shift, focus
  ring on the row).

## States

- `populated`.
- `loading` — 3 skeleton rows (see `loading`).
- `empty` — renders the `empty-state` component; lobby uses the flavor
  register ("no tables open — start one?").
- `error` — inline `alert` with retry.
- `partial` — loaded rows + a trailing skeleton row while more arrive.

## Variants

- `interactive` (rows navigate/act) / `static`.

## Rules

- First-use empty and no-results empty get different copy (voice.md) even
  though both render the empty-state component.

## Revisions

- r1: initial (CAM-13).
