# 0010 — J/Q swaps must name occupied slots; an obligatory power with no valid target fizzles

- **Status:** proposed (accepted at the release-v0 → development merge, upon human approval)
- **Date:** 2026-08-31
- **Task:** CAM-1

## Context

HANDOFF §9.3 left open whether a Jack/Queen blind swap may target a player
with zero cards. The provisional `TargetSelection` in
`packages/domain/src/Phase.ts` is explicitly blocked on this. A second gap
follows directly: §1.3(c) makes playing a drawn power **obligatory**, yet a
power can lack any valid target — 7/8 (look at one of your own cards) drawn
by a zero-card player; 9/10 (look at an opponent's card) when every opponent
has zero cards; J/Q when fewer than two occupied slots exist in the game.
Both were put to the user with alternatives during planning.

## Decision

1. **Swap targets must be occupied slots.** A J/Q swap names two occupied
   slots (any two player-held cards, including two of the same player's, per
   §1.4). Naming an empty slot — including any slot of a zero-card player —
   is an illegal move, rejected with a typed validation error.

   _Rejected — one-way give into an empty hand:_ invents a new card-movement
   mechanic never playtested.
   _Rejected — no-op allowed:_ makes an information-bearing action silently
   do nothing; illegal-and-retry is clearer for both UI and bot.

2. **No valid target ⇒ the power fizzles.** The obligation of §1.3(c) is
   read as "play it if playable": when a drawn power has no valid target at
   the moment of resolution, the power resolves as a no-op, the card goes to
   the discard pile, an explicit event records the fizzle, and the turn
   proceeds normally (slam window opens as usual).

   _Rejected — best-effort partial resolution (e.g. Queen looks but cannot
   swap):_ more faithful to "obligated" in letter but adds per-power partial
   states for a case that is already rare. The Queen is all-or-nothing at
   the whole-power level: she needs at least one occupied slot to look at
   and at least two to swap, so with fewer than two occupied slots in the
   game the whole Queen fizzles — she does not look and then skip the swap.

## Consequences

- `TargetSelection` is replaced by a validated pair-of-occupied-slots shape;
  the engine's single legality function owns the occupancy check.
- The engine needs a "does any valid target exist" predicate per power kind,
  evaluated when the power card is drawn; tests must cover each fizzle case.
- Revisit if playtesting shows the fizzle rule is exploitable (deliberately
  emptying hands to blank incoming powers).
