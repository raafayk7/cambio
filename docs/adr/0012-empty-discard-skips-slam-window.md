# 0012 — An empty discard pile skips the slam window; taking from it is illegal

- **Status:** accepted
- **Date:** 2026-08-31
- **Task:** CAM-1

## Context

[ADR-0009](0009-zero-card-slammer-draws-then-gives.md) lets a zero-card
player take the top discard as a keep. When the pile holds exactly one card
(right after the deal, or right after a §1.7 reshuffle retains only the top
card), that keep leaves the discard pile **empty** — a state the handoff
never contemplates. Two rules then dangle: §1.5 opens a slam window against
"the current top discard" (there is none), and §1.3(b) offers taking the top
discard (there is nothing to take). Surfaced while implementing the engine;
put to the user with alternatives.

## Decision

1. **No slam window opens** when a turn resolves with the discard pile
   empty: the turn advances directly to the next seat. With nothing to
   match a rank against, no slam could ever be legal.

   *Rejected — a vacuous full-length window:* keeps the game's rhythm
   uniform but is pure delay, and requires the window phase to represent
   "no rank".

2. **Taking from an empty discard pile is an illegal move**, rejected with
   a typed error, until some later action repopulates the pile.

## Consequences

- The engine emits `TurnAdvanced` without a `SlamWindowOpened`/`Closed`
  pair in this case — consumers must not assume every turn has a window.
- The CAM-2 simulation harness can count how often this state occurs.
- Revisit if playtesting shows the skipped beat feels wrong at the table.
