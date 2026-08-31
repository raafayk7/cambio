# 0009 — Zero-card players: a correct opponent slam is resolved draw-then-give; taking the discard becomes a keep

- **Status:** proposed (accepted at the release-v0 → development merge, upon human approval)
- **Date:** 2026-08-31
- **Task:** CAM-1

## Context

HANDOFF §9.2 deliberately left open what happens when a player with zero
cards correctly slams an opponent's card. The normal rule (§1.5) is that the
slammer gives one of their own cards — blind, slammer's choice of slot — into
the vacated slot, but a zero-card slammer has nothing to give. Relatedly,
§1.6 says a zero-card player "still takes turns: they draw and may keep or
discard," but never says whether they may take the top discard, which §1.3(b)
defines as a swap into an occupied slot. The rules engine (CAM-1) cannot be
built without answers. Both were put to the user with alternatives during
planning.

## Decision

1. **Draw-then-give.** A zero-card player who correctly slams an opponent's
   card draws the top card of the face-down deck (after auto-reshuffle if the
   deck is empty, per §1.7) and gives it — unseen by anyone — into the
   vacated slot. The slam therefore still carries a cost and the vacated slot
   is still refilled, exactly as in the normal case. If no card exists to
   draw even after reshuffle, the give is skipped (see
   [0011](0011-slam-window-fixed-close-config-duration.md)).

   _Rejected — skip the transfer:_ pure upside for the slammer and leaves the
   opponent a card down with no compensation, distorting the slam economy.
   _Rejected — disallow the slam:_ takes a whole mechanic away from zero-card
   players for no table-tested reason.

2. **Taking the discard at zero cards is a keep.** A zero-card active player
   may take the top (non-power) discard; it is placed into their lowest free
   slot index and no displaced card goes to the pile (there is none). This
   mirrors §1.6's "keep" semantics for drawn cards.

   _Rejected — draw-or-Cambio only:_ would make the take action's legality
   depend on hand size in a way players at the table did not observe.

## Consequences

- The engine's slam resolution has a single "obtain the give card" step:
  from hand slot (normal) or from deck top (zero-card case), then the same
  placement logic. Tests must cover both paths.
- A zero-card player's legal turn actions are the same three as anyone
  else's: Cambio, take (non-power) discard, draw.
- Revisit if playtesting shows draw-then-give makes zero-card slamming too
  cheap or too punishing.
