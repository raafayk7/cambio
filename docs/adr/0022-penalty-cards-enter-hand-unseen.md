# 0022 — Penalty cards enter the slammer's hand unseen by everyone

- **Status:** accepted
- **Date:** 2026-09-01
- **Task:** CAM-6

## Context

An incorrect slam draws a penalty card from the deck into the slammer's
lowest free slot (§1.5). HANDOFF §1 does not say whether the slammer gets to
look at the card they drew as a penalty. The question became load-bearing in
CAM-6: classifying the `PenaltyDrawn` event
(`packages/domain/src/GameEvent.ts:125-129`, which carries the card's
identity as full truth) for realtime delivery requires knowing whether its
value goes to the slammer's private channel or to no one. Rule gaps are
never filled from other Cambio/Cabo variants; this was put to the user.

## Decision

**The penalty card is placed face-down and unseen — by everyone, including
the slammer.** It behaves exactly like a dealt card: the slammer knows a
card occupies the slot, not what it is. On the wire, `PenaltyDrawn` is
projected with the card identity **stripped for all players**; only the slot
placement is public. This matches the treatment ADR-0009 already gives the
zero-card slammer's give ("draws the deck top and gives it unseen") and the
event's own doc stance of "true in the log, unseen at the table".

_Rejected — slammer briefly sees the penalty card:_ would soften the penalty
(a failed slam would still buy information) and has no basis in the
playtested rules.

## Consequences

- `PenaltyDrawn` is a **public, value-stripped** event on the room channel:
  everyone learns a penalty landed in a given slot, nobody learns the card.
- The adversarial view tests assert the penalty card's slug appears in **no
  player's** payload, the slammer's included.
- A slammed-into hand grows with genuinely unknown cards, which is part of
  the deterrent — the memory game gets harder for the reckless.
