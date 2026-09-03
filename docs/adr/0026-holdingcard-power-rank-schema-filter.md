# 0026 — HoldingCard rejects power-rank cards via Schema.filter, not a runtime guard

- **Status:** proposed
- **Date:** 2026-09-03
- **Task:** CAM-10

## Context

HANDOFF §1.3 requires every power-rank card (7, 8, 9, 10, J, Q) to always be
resolved through the `ResolvingPower` phase — a power card must never sit in
`HoldingCard`. Today that rule holds only because the code paths that
construct `HoldingCard` happen to be careful: `Engine.ts`'s `takeDiscard` and
`drawFromDeck`, and `Fold.ts`'s `CardDrawn` handling, all route power ranks to
`ResolvingPower` and only ever build `HoldingCard` from a card already proven
non-power. `Phase.ts`'s `HoldingCard` `TaggedStruct` itself carries no such
constraint — `card: CardSlug` accepts any of the 52 slugs.

CAM-1's plan flagged this as a latent hole and deferred it: "`HoldingCard`
accepts a power card at the schema level... a decoded/persisted state
violating it would be a hole (carry to persistence-task validation)"
(`docs/plans/root/CAM-1.md`, Advisory section). At that point no code
actually decoded a persisted `games.phase` value, so the hole was
unreachable. CAM-3 shipped persistence (PR #3): `GameRepository.load`
(`apps/api/src/infra/game-repository.ts:285`) now runs
`Schema.decodeUnknown(GameState)` against a row assembled from `games.phase`
jsonb, so a hand-edited or corrupted database row can now decode into a
`GameState` whose phase is an illegal `HoldingCard`. CAM-10 closes that hole.

## Decision

`HoldingCard` (`packages/domain/src/Phase.ts`) gets a `Schema.filter`
refinement that rejects any value whose `card`'s rank is a power rank. An
illegal decoded state now fails at the schema-decode boundary as an ordinary
`ParseError`. This requires no new error type: `GameRepository.load` already
wraps every decode failure via `Effect.mapError(storage("games.load.decode"))`
(`apps/api/src/infra/game-repository.ts:285-287`), so the new constraint is
enforced automatically at that boundary — and at any future call site that
decodes a `Phase` or `GameState`, without that call site having to remember
to check.

**Alternative considered — an explicit runtime guard** (e.g. a check added to
`Fold.ts` or to the repository's load path that raises a typed domain error
when a decoded `HoldingCard` illegally holds a power card). Rejected: this
codebase already draws a line between structural validity (what `Schema`
owns) and per-command legality (what `Legality.ts`'s single
`checkCommand`/`drawable`-style functions own, evaluated against
`(phase, playerId, gameState)`) — see `GameState.ts`'s `SlotRef` docstring,
which explicitly reserves "is this a valid move right now" checks for the
legality layer and keeps schemas structural-only for _occupancy_-style facts.
"Is this the right shape for this tagged case" is exactly the kind of static,
context-free fact `Schema` is for, not `Legality.ts`. A guard would also need
a call site at every place a `Phase`/`GameState` gets decoded, duplicating
what a schema-level filter enforces for free.

## Consequences

`HoldingCard.card`'s TypeScript `Type` remains `CardSlug` — `Schema.filter`
here narrows what decode _accepts_, not what the type declares, so in-memory
object-literal construction (e.g. `Fold.ts`'s phase assignments) is not
type-checked against the new constraint; it is only enforced when a value
actually passes through `Schema.decodeUnknown`/`Schema.decode`. Concretely:
this closes the `games.phase` jsonb corruption path (the one CAM-1 and this
task both name), but a _separate_ hole — a corrupted `game_events` payload
that gives a `DiscardTaken` event a power-rank `card`, folded in-memory via
`Fold.ts`'s plain object-literal phase construction — is **not** closed by
this ADR, since `foldEvents`'s output is never itself re-validated through
`Schema.decodeUnknown(GameState)`. That gap is documented, not fixed here;
revisit if event-log integrity becomes a real concern (it would need its own
decision, likely event-payload-level validation rather than a `Phase`
refinement).
