# 0021 — viewFor projects structure only; private card values are delivered once, at event time, and never re-sent

- **Status:** proposed (accepted at the release-v0 → development merge, upon human approval)
- **Date:** 2026-09-01
- **Task:** CAM-6

## Context

HANDOFF §5 mandates a single server-side `viewFor(playerId, gameState)`
projection through which every client-bound payload passes. Designing it in
CAM-6 exposed a gap: `GameState`
(`packages/domain/src/GameState.ts:54-61`) carries no record of who has
peeked at what. Peeks exist only as `CardPeeked` events and as rows in
`card_peeks` — written by the repository adapter
(`apps/api/src/infra/game-repository.ts:227-229`) but never read back, and
`GameRepository` exposes no peek query. So a snapshot projection cannot, from
`GameState` alone, decide "this player saw that card three turns ago" — the
signature as specified cannot compute knowledge entitlement, and something
had to give.

## Decision

`viewFor(playerId, gameState)` keeps its signature and projects **structural
truth only**:

- slot occupancy for every hand — including the viewer's own — with **no
  card values**;
- the discard pile (public by definition) and the **deck count only** (the
  deck order is the shuffled future);
- the phase, with the held card's value included **only** when the viewer is
  the holder, or when `HoldingCard.source === "discard"` (the card came off
  the public pile);
- **never** `prng` — the PRNG state predicts every future shuffle and is as
  radioactive as the deck itself;
- at `Ended`, all hands and scores (the endgame reveal is a rule, §1.8).

Private card values reach a player **exactly once, at the moment of the
entitling event**, on their per-player channel: `CardDrawn` to the drawer,
`CardPeeked` to the viewer. They are never re-sent — not in later events,
not in the snapshot a reconnecting client fetches. Remembering is the game
(§5.1): a refresh costs you what looking away from the table costs you in
person. The server's peek records (`card_peeks`) remain write-only
bookkeeping for the future bot and for audit, exactly as HANDOFF §5.1
frames them — "not to assist the human".

_Rejected — read `card_peeks` back into the view:_ widens `GameRepository`,
couples the projection to persistence, and weakens memory fidelity by making
a refresh restore knowledge the player was supposed to hold in their head.

_Rejected — knowledge field in `GameState`:_ a domain change rippling
through engine, fold, and persistence, to serve a UI affordance the design
explicitly rejects.

## Consequences

- `viewFor` stays a pure function of `(playerId, gameState)` — trivially
  unit-testable, adversarially testable across simulated games.
- Event payloads become the only carrier of private values, so the
  event-projection layer (which event goes to which channel, with which
  fields) is security-critical and gets the adversarial test treatment.
- A client that misses a private event (disconnected at the wrong moment)
  has simply lost that knowledge, like a player who blinked. No replay
  endpoint exists or should be added for private payloads.
- If a future feature genuinely needs re-delivery (e.g. bot belief state),
  it reads `card_peeks` server-side; the wire contract does not change.
