---
name: effect-domain-modeling
description: How Cambio models its domain with Effect — branded primitives, Schema literal unions, TaggedStruct ADTs, typed errors, and the purity rules for packages/domain. Use this for ANY work in packages/domain, and whenever you define a new id type, value object, discriminated union, error type, or validation anywhere in the backend — even outside the domain package, because these idioms apply repo-wide.
---

# Effect domain modeling

The backend is Effect end to end: `effect` is the **only** dependency
`packages/domain` is allowed. No Zod, ever (ESLint bans the import; see
ADR-0001). These are the idioms this repo has standardized on — match them
rather than inventing parallel ones.

## Purity rules for `packages/domain`

The domain performs **no I/O**. Concretely:

- No `Date.now()`, `new Date()` — time is passed in as a `Timestamp` parameter.
- No `Math.random()`, no `crypto` — shuffling takes a seed or an injected RNG
  function; id minting happens behind the `IdGeneratorPort` in application.
- No database, network, logging, or environment access.
- Errors are values (`Either` / typed error channel), never thrown across the
  package boundary.

Why so strict: the rules engine must be a pure state machine
`(state, command) => Either<GameError, [GameState, GameEvent[]]>` so that
thousands of randomized games can be property-tested in-memory (HANDOFF §12),
and so a bot can later be a pure function over a redacted view. Every impurity
you sneak in destroys both properties.

## Branded primitives

Every id and semantic primitive is a branded Schema so ids can't be mixed up
at compile time:

```ts
export const GameId = Schema.UUID.pipe(Schema.brand("GameId"))
export type GameId = typeof GameId.Type
```

Closed sets are **literal unions**, not strings — see `Card.ts`, where
`CardSlug` is a branded literal union of all 52 slugs. Prefer deriving values
(`rank(slug)`, `score(slug)`) over storing them; if a value can be computed
from another, computing it is the source of truth (§4.1: score is never
stored).

## ADTs: TaggedStruct vs TaggedEnum

- **`Schema.TaggedStruct` + `Schema.Union`** — for any ADT that is persisted
  or crosses the wire (it needs encode/decode). This is the default in this
  repo; `Phase.ts` is the reference: one `TaggedStruct` per case, a
  `Schema.Union` of them, exported `decodeX`/`encodeX` helpers.
- **`Data.TaggedEnum`** — only for ephemeral in-memory values that never
  leave the process and don't need a schema. If in doubt, use TaggedStruct;
  game state ends up in `games.phase` (jsonb) and must round-trip.

Pattern-match with `Match.value` / `Match.tag` (or a `switch` on `_tag` with
an exhaustiveness check) — never with `if`-chains that the compiler can't
prove exhaustive. When you add a union case, the compiler should point at
every site that must handle it. The standard exhaustiveness check is a
`default` arm returning `value satisfies never`:

```ts
switch (phase._tag) {
  // ...one case per member...
  default:
    return phase satisfies never
}
```

An `if`-chain that "handles all the cases today" is still wrong — the CAM-1
review caught exactly that silently breaking the card-partition invariant.

## Typed errors

Domain errors are tagged classes so they carry data and pattern-match:

```ts
export class IllegalMove extends Data.TaggedError("IllegalMove")<{
  readonly playerId: UserId
  readonly reason: string
}> {}
```

Return them in `Either.left` (pure code) or the error channel of `Effect`
(application code). One error type per _reason a caller could react
differently_; don't create one error class per call site.

A field-less error omits the generic entirely —
`class NoCardToDraw extends Data.TaggedError("NoCardToDraw") {}` — never
`<{}>`, which fails `@typescript-eslint/no-empty-object-type`.

## Single source of legality

There must be exactly **one** function that answers "is this move legal right
now" — legality is a function of `(phase, playerId, gameState)` (§4.2). Route
guards, UI enablement, and the engine all derive from it. If you find
yourself re-checking a rule outside the engine, you're duplicating the source
of truth.

## Conventions in this package

- Docstrings cite the handoff section they implement (`(§4.1)`, `(§1.2)`) —
  keep doing this; it makes rule provenance auditable.
- Files export schema + type under the same name
  (`export const CardSlug = …; export type CardSlug = typeof CardSlug.Type`).
- Anything provisional is marked `PROVISIONAL` with the open question it
  waits on (see `TargetSelection` in `Phase.ts`) — do not build on
  provisional shapes without resolving the question.

## Testing

vitest + `@effect/vitest` (`it.effect` for effectful tests, plain `it` for
pure functions). Domain work is **test-first**, and invariants (HANDOFF §4.5:
all 52 cards accounted for, no negative hand counts, contiguous seats,
phase/status consistency) are asserted as properties over randomized complete
games, not just example-based tests. A seed parameter is what makes those
tests deterministic — another reason purity is non-negotiable.
