name: loading
status: draft
version: 1
extends: none

Waiting, two shapes: spinner and skeleton. Class: **Async/data** (support).

## Anatomy

- Spinner: a card back rotating flat (rotateY wobble) at a calm 1.2s loop —
  the game's own object, not a generic ring. Caption optional, flavor
  register ("shuffling…").
- Skeleton: `tan-paving` at 40% blocks in the shape of the loading content,
  `radius.sm`, subtle opacity pulse (no shimmer sweep).

## States

- `spinner` — indeterminate short waits (join, action round-trips).
- `skeleton` — first-load of screens/lists (the page/screen floor's
  first-load state).

## Variants

None.

## Rules

- Skeletons match the real layout they precede — never generic bars.
- Anything under 300ms shows nothing (no flash); reduced-motion swaps the
  spinner's rotation for a fade pulse.

## Revisions

- r1: initial (CAM-13).
