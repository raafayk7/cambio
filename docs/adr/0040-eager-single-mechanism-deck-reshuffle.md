# 0040 — Deck reshuffle is eager and single-mechanism: it fires when the deck empties or when a discard makes it reshufflable

- **Status:** proposed (accepted at the release-v0 → development merge, upon human approval)
- **Date:** 2026-09-08
- **Task:** CAM-31

## Context

HANDOFF §1.7: "When the draw deck empties, reshuffle the discard pile
(retaining the current top card as the new top discard) to form a new draw
deck." The reshuffle has always been automatic and server-side, but the
engine implemented it **lazily**: `reshuffleIfEmpty` ran inside `drawOne`
(`packages/domain/src/Engine.ts`), so the deck sat visually empty until the
next draw — in practice until someone tapped the empty deck, which the
affordance layer deliberately kept tappable. That reads as a bug at the
table ("the deck is empty, why is the game continuing?"), and the handoff's
own wording describes the eager timing better than the lazy one.

Timing is not cosmetic: it changes **which cards get reshuffled**. Lazy
sweeps up everything discarded between the deck emptying and the next draw;
eager reshuffles at the moment of exhaustion and leaves later discards on
the pile for the following reshuffle.

## Decision

**Reshuffle fires the moment the state allows it, from exactly one
mechanism.** The trigger is: a transition leaves the deck empty while the
discard pile is reshufflable (≥ 2 cards — the top is always retained). Two
kinds of site satisfy it:

1. **A draw takes the last deck card** — normal turn draw, failed-slam
   penalty draw, or the zero-card slammer's draw-then-give. The
   `DeckReshuffled` event is emitted immediately after the draw event in
   the same batch.
2. **A discard lands while the deck is empty** (the re-arm case: the deck
   emptied earlier with nothing to reshuffle, and the pile has just become
   reshufflable). The reshuffle fires from the discard-landing site,
   before any slam window opens — the window's rank is the retained top,
   which the reshuffle does not change.

**The lazy path is removed** (`drawOne` no longer reshuffles). This
establishes the resting invariant **deck empty ⟹ discard ≤ 1**: a draw
that finds the deck empty can only mean nothing is reshufflable, so it
resolves as `NoCardToDraw` (normal draw legality) or a skipped draw per
[ADR-0011](0011-slam-window-fixed-close-config-duration.md) clause 3 —
whose _outcome_ ("the slam's primary result stands, the draw is recorded
as skipped") is unchanged; only the mechanism-reading ("even after the
automatic reshuffle" — there is no reshuffle attempt at draw time any
more) is amended by this ADR.

Unchanged: the retained-top rule, and ADR-0014's standing rule — every
`DeckReshuffled` records the resulting deck order and `PrngState`, at the
point in the batch where it fires.

_Rejected — eager at draw sites only, lazy fallback for the re-arm case:_
smallest diff, but keeps two mechanisms alive, keeps the empty-deck-tappable
affordance hack, and leaves the deck resting visibly empty in exactly the
state players found confusing.

_Rejected — eager trigger plus defensive lazy retained in `drawOne`:_
belt-and-braces for states the engine can no longer produce; tests would
keep pinning unreachable behavior, and the redundancy invites drift.

## Consequences

- The `drawable` predicate's disjunction (`deck > 0 || discard > 1`) is
  equivalent to `deck > 0` for all reachable resting states; the client
  affordance mirror simplifies to `deckCount > 0`, and the "tap the empty
  deck to reshuffle" affordance disappears.
- `DeckReshuffled` now arrives mid-turn-resolution in the same broadcast
  batch as the event that caused it; the client choreographs it as a
  consequence (sequenced after the causing flight), not as a tap response.
- Event-order changes pin down: draw-then-reshuffle at draw sites
  (previously reshuffle-then-draw), discard-then-reshuffle-then-window at
  landing sites.
- The simulation harness gains the resting invariant (deck empty ⟹
  discard ≤ 1) as a per-step violation check.
- Revisit if a future variant wants deliberate deck-exhaustion pressure
  (playing with the deck visibly running dry).
