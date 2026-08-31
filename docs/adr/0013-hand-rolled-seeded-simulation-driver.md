# 0013 — Hand-rolled seeded simulation driver, not a property-testing library

- **Status:** proposed
- **Date:** 2026-08-31
- **Task:** CAM-2

## Context

CAM-2 builds the randomized-game harness HANDOFF §12 step 2 calls for:
thousands of seeded complete games played through the pure engine, with the
§4.5 invariants asserted after every transition. Generating a random *legal*
command requires the current `GameState` — the candidate set (which tags,
which slot arguments, which `SlotRef` targets) is a function of the evolving
state, and the simulated clock must deliberately sit inside or jump past
`SlamWindow.closesAt`. The generator is therefore inherently stateful.

Two ways to build that:

1. **fast-check** (the standard TS property-testing library): generic value
   generators plus built-in shrinking. It requires no new install — `effect`
   depends on it directly and re-exports it as `effect/FastCheck`, and
   `@effect/vitest` builds `it.prop` on it — so the case against it is
   purely about shape: state-dependent command generation requires its
   model-based-testing mode (`fc.commands`), where each command carries
   `check(model)`/`run(real)` hooks — heavier machinery that duplicates
   what `legalCommandKinds` (`packages/domain/src/Legality.ts`) already
   answers, and whose shrinking of command sequences interacts poorly with
   legality that depends on position in the sequence.
2. **Hand-rolled driver**: a loop seeded by a numeric seed that, at each
   step, enumerates legal candidates from `legalCommandKinds` + state
   helpers, picks one with a deterministic PRNG, applies it, and asserts
   invariants. Reproduction is the seed; "shrinking" is replaying the seed
   and reporting the failing step index plus the accumulated command trace.

## Decision

We hand-roll the simulation driver in `packages/domain/test`. No
property-testing library is added.

The driver's randomness comes from a **second, independently seeded
`Utils.PCGRandom` instance from `effect`** — the same primitive the engine's
`Prng.ts` wraps. This deliberately does *not* reverse CAM-1's rejection of a
hand-rolled PRNG (root plan CAM-1 decision log): we hand-roll the *driver*,
not the random-number generator. The driver's PRNG stream is separate from
`GameState.prng`, so command-choice randomness never perturbs the game's own
shuffle stream and a game seed alone reproduces the same deal under any
policy.

Rejected: fast-check — its model-based mode is the wrong shape for a
generator that must consult live state anyway, and its sequence shrinking
gives little over seed-replay-with-step-index for this engine, for a job
~100 lines of driver code cover. (Amended 2026-08-31, review finding: the
originally recorded "new dependency" rationale was factually wrong —
fast-check ships inside `effect` as `effect/FastCheck` — so the decision
rests on the shape argument alone.)

## Consequences

- Failure reproduction is by construction: every failure message carries the
  game seed, driver seed, and step index; replaying the seeds is exact
  because engine and driver are both pure and deterministic.
- We own minimal shrinking (replay + report the command trace up to the
  failing step) instead of getting generic shrinking free. If we later need
  smarter minimization, adding fast-check *on top of* the driver remains
  possible — that would supersede this ADR. It would even be free of new
  installs (`effect/FastCheck`).
- No new package.json entry; `packages/domain`'s `effect`-only import rule
  holds even in tests.
- The driver's command-selection policy (weights, Cambio-termination
  pressure) is ours to tune; there is no library default to lean on.
