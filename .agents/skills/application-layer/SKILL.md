---
name: application-layer
description: How to write use cases, ports, and wire contracts in the Cambio backend — packages/application and packages/contracts. Use this whenever you add or modify a use case, declare a port, decide what belongs in contracts vs application vs domain, wire the per-room command queue, or handle errors crossing from domain toward the HTTP/realtime edge.
---

# Application layer

`packages/application` holds **use cases** (the verbs of the system: create
game, join, draw, slam, call cambio) and **infrastructure ports**. It may
import `domain`, `contracts`, and `effect` — nothing else. If a use case
needs a capability the layer doesn't have, the answer is always a new port,
never a direct import of infrastructure.

## Use case shape

A use case is an Effect program that orchestrates: load state via repository
ports → call pure domain functions to decide → persist results → publish
events. The _decision_ lives in the domain; the use case only sequences.

```ts
export const drawCard = (input: DrawCardInput) =>
  Effect.gen(function* () {
    const games = yield* GameRepository // port from domain
    const clock = yield* ClockPort // port from application
    const state = yield* games.load(input.gameId)
    const now = yield* clock.now
    // pure domain decision — the Either yields straight into Effect.gen
    const [next, events] = yield* applyCommand(state, command, now)
    yield* games.save(next, events) // persist state + append events
    yield* publishEvents(events) // realtime, via publisher port
  })
```

(The engine's real entry points are the free functions
`applyCommand(state, command, now)` and `dealGame(players, seed, config,
now)`, both returning `Either` — there is no `engine` namespace object.)

Requirements the shape must satisfy:

- **Typed errors end to end.** The error channel carries domain errors
  (`IllegalMove`, `GameNotFound`, …) plus port errors. No `throw` crosses
  this layer; presentation maps the typed channel to HTTP/realtime responses.
- **Time comes from `ClockPort`, ids from `IdGeneratorPort`.** Never
  `Date.now()` here either — application code is tested with stubbed layers.
- **Optimistic concurrency:** `games.version` guards double-submits and
  stale clients; a version-conflict error is a normal typed outcome, not an
  exception.

## Ports

Declared as `Context.Tag` classes, namespaced by package — follow
`packages/application/src/ports/Clock.ts` exactly (tag string
`"@cambio/application/XxxPort"`, interface of `Effect`-returning members,
doc comment stating why the port exists and that implementations live in
`apps/api/src/infra`).

Remember the split (it is the most common mistake in this codebase's
architecture): **repository ports live in `domain`** — persistence of
aggregates is domain vocabulary. `application/src/ports/` holds _technical_
capabilities only: clock, id generation, realtime publisher, logger.

## Contracts

`packages/contracts` is the wire language shared by `apps/api` and
`apps/web`: command schemas, event schemas, response schemas — Effect Schema,
with `decodeX`/`encodeX` helpers exported alongside (see `Health.ts`).

The gate for adding a field to contracts: **may every client who receives
this legally see it?** Contracts exist so the frontend never touches the
domain (which contains all hidden cards). If a client needs a redacted view
of domain state, the redacted shape is designed _in contracts_ and produced
by the server's `viewFor` projection — see the `hidden-information` skill
before adding any game-state-carrying schema.

Contracts vs application: contracts are _shapes only_ — no logic, no ports,
no use cases. If a schema needs behavior, the behavior goes in application
(or domain) and operates on the contract type.

## The per-room command queue (§6)

All commands for a room are serialized through a single Effect `Queue`
consumed by one fiber per room — an actor. This is what makes slam races
deterministic: first-in-queue wins, ordering is server-authoritative.
Consequences for use case authors:

- Use cases must be written to run **one at a time per room**; do not add
  internal locking or transactions that assume interleaving.
- **Timers are not authoritative.** The slam window's `closesAt` is an
  absolute timestamp in `phase`; any command arriving later computes "window
  closed" from `ClockPort`. A live fiber may push the close event early as an
  optimization, but correctness never depends on it — the Render free tier
  spins down and fires no timers while asleep.
- Rooms must be **reconstructible**: never keep authoritative state that
  exists only in memory. As built (ADR-0014/0020), the actor rebuilds by
  loading the persisted state row — itself a materialized fold of
  `game_events` — and folding from seq 0 is the recovery mechanism behind
  that row, not something the actor calls per restart.

## Testing

Use cases are tested with `@effect/vitest` by providing stub layers for
every port (`Layer.succeed(ClockPort, { now: Effect.succeed(t) })`, in-memory
repositories). If a use case is hard to test this way, it is doing too much —
push decisions down into the domain.
