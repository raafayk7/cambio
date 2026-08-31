# 0014 — Shuffle events record the resulting PrngState; the fold transcribes, never recomputes

- **Status:** proposed
- **Date:** 2026-08-31
- **Task:** CAM-3

## Context

`game_events` is the source of truth: after a restart, a room rebuilds its
in-memory `GameState` by folding events from seq 0 (HANDOFF §6), and the
state tables are a materialized fold over the log (§4.3). CAM-3 writes that
fold. CAM-1's event payloads already record concrete outcomes rather than
operations — `GameStarted` carries the dealt `hands`/`deck`/`firstDiscard`,
`DeckReshuffled` carries the resulting deck order — precisely so that
replaying the log never depends on the shuffle algorithm producing the same
bytes forever (`packages/domain/src/GameEvent.ts:17-19`).

Two gaps kept the log from being fully self-contained:

1. **`GameState.prng` appears in no payload.** `GameStarted` records the
   audit-only `seed`, not the post-deal `PrngState`. A fold could recompute
   it by re-running `Prng.shuffle` at the deal and at each reshuffle — but
   that reintroduces exactly the byte-stability coupling the concrete-outcome
   payloads exist to avoid: change the shuffle implementation and every
   reconstructed game silently diverges from its live counterpart at the next
   reshuffle.
2. **Mid-turn phases are announced by no event.** Nothing says "the phase is
   now `HoldingCard`/`ResolvingPower`/`ResolvingQueenSwap`"; a fold must
   infer the phase from the last phase-bearing event plus rank derivation.

## Decision

We extend `GameStarted` and `DeckReshuffled` with a `prng: PrngState` field
recording the PRNG state **after** their shuffle, and we write the fold
(`packages/domain`) as **pure transcription plus bounded phase inference**:

- Cards, deck, discard, config, and prng are read directly from payloads and
  hand movements are derived from the fold's own accumulated state (for the
  two events that deliberately omit card identities, `CardsBlindSwapped` and
  `CardGivenFromHand`).
- Phase is inferred from the event stream (e.g. `CardDrawn` of a power rank ⇒
  `ResolvingPower`; `SlamWindowOpened` ⇒ `SlamWindow`; `TurnAdvanced` ⇒
  `AwaitingDraw`). This is the only re-derivation the fold performs.
- The fold never calls `Prng.shuffle` and never replays commands through
  `applyCommand`.

The change is made now because it is nearly free: no event has ever been
persisted, so there is no migration or compatibility cost.

Rejected alternatives:

1. **Zero domain change** (fold recomputes shuffles) — rejected for the
   byte-stability coupling above; the failure mode is silent divergence.
2. **Full transcription** (make phase explicit in payloads or add
   phase-transition events) — rejected as a large engine diff duplicating
   information the randomized round-trip suite can prove is inferable.

## Consequences

- The event log alone reconstructs the complete `GameState`, including its
  randomness — deterministic recovery on a host that restarts often.
- `PrngState` in a payload is as secret as the deck order it determines;
  event payloads remain full-truth and strictly server-side
  (`hidden-information` skill). Nothing changes about what clients may see.
- Phase inference is engine-adjacent logic that could diverge from the
  engine. The guard is CAM-3's round-trip property: thousands of seeded
  games via the CAM-2 harness, folded from seq 0, must deep-equal the live
  final state — phase included.
- Standing rule this commits us to: **any future event that consumes
  randomness must record the resulting `PrngState`**, and any event that
  rearranges cards must record resulting positions, not the operation.
