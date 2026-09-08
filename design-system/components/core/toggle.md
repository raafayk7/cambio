name: toggle
status: draft
version: 1
extends: none

Boolean setting (sound on/off, reduced-motion override). Class: **Input**.

## Anatomy

- Track: `2px` border pill; knob: solid `ink.primary` disc that slides at
  `duration.snap` `ease.snap`.
- Off: `surface.raised` track. On: `accent.action` track, knob to the
  right.

## States

- Interactive floor (`default/hover/focus/active/disabled`) +
- `empty`/`filled` map to off/on; `error` (rare: setting failed to save —
  track flashes `accent.alarm-deep`); `read-only` — state shown, knob
  locked.

## Variants

None.

## Rules

- Label states the thing controlled, not the current value ("Sound", never
  "On").
- Flips optimistically; reverts with a toast if the save fails.

## Revisions

- r1: initial (CAM-13).
