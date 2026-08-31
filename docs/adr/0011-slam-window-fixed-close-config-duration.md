# 0011 — Slam window closes at a fixed time from game config; impossible penalty/give draws are skipped

- **Status:** proposed (accepted at the release-v0 → development merge, upon human approval)
- **Date:** 2026-08-31
- **Task:** CAM-1

## Context

HANDOFF §9.4 requires the slam window duration to be configuration, not a
literal, with the actual number left to playtesting. Building the slam
mechanics in CAM-1 forced two adjacent rulings the handoff does not state:
whether slams inside an open window extend it, and what happens when a
penalty draw (incorrect slam, §1.5) or a draw-then-give
([0009](0009-zero-card-slammer-draws-then-gives.md)) finds the deck empty
*and* the automatic reshuffle of the discard pile (§1.7, top card retained)
yields nothing — possible only when nearly every card is in players' hands.
Both were put to the user with alternatives during planning.

## Decision

1. **Fixed close time.** `closesAt` is computed once, when the window opens,
   as `now + slamWindowMs`; slam attempts inside the window do not move it.
   Matches the §4.2 phase sketch `{ closesAt, rank }` and keeps §6's
   "timers are not the authority" reasoning simple: any command is judged
   against one immutable timestamp.

   *Rejected — reset on every slam / on correct slams only:* extends games
   unpredictably and makes the close time a function of contested history
   rather than a stored fact.

2. **Duration lives in game config.** The engine carries a `GameConfig`
   (initially just the slam window duration) inside `GameState`, supplied
   when the game is created. No literal anywhere in the domain. The default
   value is an application-layer concern and is expected to change with
   playtesting.

3. **Impossible draws are skipped.** When a penalty draw or a
   draw-then-give finds no card available even after the automatic
   reshuffle, the slam's primary outcome stands (card stays put / card
   removed) and the draw is skipped, recorded as an explicit event so the
   log shows it happened.

   *Rejected — reject the slam as illegal while no drawable card exists:*
   couples a player's right to slam to a global card-distribution fact they
   cannot easily see.

## Consequences

- `SlamWindow` phase keeps an absolute `closesAt`; late commands compute
  "already closed" from the passed-in clock, per §6.
- Changing the window duration is a config change, invisible to the domain.
- The skipped-draw event gives the CAM-2 simulation harness a hook to count
  how often this near-impossible case actually occurs.
