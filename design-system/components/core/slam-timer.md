name: slam-timer
status: draft
version: 1
extends: none

The slam window made visible. Class: **Game object**.

## Anatomy

- "SLAM!" in `display` face, `ink.inverse` with the offset ink shadow
  (large text — passes contrast on `accent.alarm` grounds).
- Drain bar: `surface.raised` track, `1.5px` border, `accent.alarm` fill
  scaling from full to zero, linear.
- Appears table-center, above the discard-pile it refers to.

## States

- `hidden` — no window open (the default almost always).
- `open` — bar draining linearly from `closesAt`; slam-eligible cards pulse
  in sync.
- `resolving` — a slam is being adjudicated: bar pauses visually, the
  slammed card's public reveal plays for `duration.reveal` (tokens.md
  r3); the drain math itself never pauses — it recomputes from the fixed
  `closesAt` when the reveal clears.
- `closed` — snaps away at `duration.snap`; play proceeds.

## Variants

None.

## Rules

- The bar drains toward a **fixed close** — `closesAt` is set when the
  window opens and never resets on slam attempts (ADR-0011). The bar must
  tell that truth: no refills, no extensions.
- Duration comes from game config (`slamWindowMs`), never a design constant;
  the component renders whatever window it is given.
- Multiple slams can occur in one window; each resolution replays without
  restarting the drain.
- The timer is public and identical for all players (room channel); it
  carries no player-specific hints about which cards match.
- No slam window exists when the discard pile is empty (ADR-0012) — the
  component stays `hidden`; it never renders against an empty pile.

## Revisions

- r1: initial, from the CAM-13 specimen board.

- r2 (CAM-18 review F6, 2026-09-06): the `resolving` reveal beat is
  paced by the new `duration.reveal` token (1200ms, tokens.md r3) —
  the duration this spec described but never carried.
