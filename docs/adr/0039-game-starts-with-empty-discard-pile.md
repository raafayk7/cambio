# 0039 — The game starts with an empty discard pile; no initial face-up card

- **Status:** accepted
- **Date:** 2026-09-08
- **Task:** CAM-31

## Context

HANDOFF §1.1 says "One card is turned face up to start the discard pile."
The engine implements it: `dealGame` selects `firstDiscard` after the hands
(`packages/domain/src/Deal.ts:37`), seeds `discard: [firstDiscard]`, and the
`GameStarted` event carries the card (`packages/domain/src/GameEvent.ts`,
wire copy in `packages/contracts/src/GameEvents.ts`). Table play showed the
opening face-up card does no work: it is rarely takeable profitably, and it
hands the first player a slam anchor before anyone has acted. The user
decided to remove it (CAM-31). Rules changes supersede the handoff only via
ADR, so this records the ruling.

## Decision

**The deal leaves the discard pile empty.** All 52 cards minus the four
dealt to each player form the face-down draw deck (`52 − 4n` cards). The
`firstDiscard` field is removed outright from the domain `GameStarted`
event and its wire counterpart — a breaking contracts change; existing dev
databases are wiped rather than migrated (pre-release, no deployed
clients, nothing depends on old rows).

Consequences accepted as part of the ruling:

- The first player's options are **draw or call Cambio only** — there is no
  discard to take. Taking from the empty pile is illegal per
  [ADR-0012](0012-empty-discard-skips-slam-window.md), whose empty-discard
  machinery (no slam window while the pile is empty, `EmptyDiscard` error,
  legality gates keyed off `discard.length`) already covers the state.
- No slam is possible until the first discard lands.
- An empty discard pile now occurs in **every** game (previously only via
  the zero-card keep of ADR-0009/0012), so client empty-state rendering is
  a first-run experience, not an edge case.

_Rejected — keep `firstDiscard` as an optional field:_ preserves decoding
of old persisted events at the cost of a vestigial field on every future
game; there is no deployed data worth the carry.

_Rejected — keep the rule:_ the change was playtested and decided at the
table; the handoff's own standing rule is that rules come from play, not
from priors.

## Consequences

- HANDOFF §1.1 and the `cambio-rules` skill get amendment blockquotes
  pointing here (same pattern as the ADR-0036 player-cap amendment).
- `dealGame`, `GameStarted`, the fold's `initialState`, the event
  projection, and the leak-sweep allowlists (which whitelisted the public
  `firstDiscard`) all shed the field; the deck grows by one card.
- Revisit if playtesting shows the draw-or-call-only first turn feels flat.
