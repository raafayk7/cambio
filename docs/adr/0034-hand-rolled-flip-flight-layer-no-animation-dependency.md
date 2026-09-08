# 0034 — Card flights via a hand-rolled FLIP layer, no animation dependency

- **Status:** accepted
- **Date:** 2026-09-05
- **Task:** CAM-18

## Context

The design system requires card movement to be real: slot movements are
public information and "must animate as visible slot-to-slot flights …
never teleport a card" (hand.md), the reshuffle is a designed public
moment (draw-deck.md), and tracking a moving card **is** the memory
mechanic. CAM-15 shipped static flight _styling_ (`in-flight`,
`leaving-play`) with no movement, deliberately deferring the mechanism:
"CSS-only motion for CAM-15 … revisit trigger: the slot-to-slot
choreography (FLIP/library decision happens there, as an ADR if a
dependency is added)" (docs/plans/root/CAM-15.md). That trigger is
CAM-18.

True slot-to-slot movement requires measuring real element positions at
flight time — deck, discard, and every hand slot live in different
layout containers (and two coordinate systems today), so no static CSS
can express the path. The repo currently has zero animation
dependencies and zero FLIP/measurement code.

## Decision

We build a small first-party flight layer using the FLIP technique: an
overlay card is positioned via `getBoundingClientRect` measurements of
the origin and destination elements (located by stable data attributes),
then animated with a CSS transform transition on the existing motion
tokens (`duration.track`, `ease.snap`). Under `prefers-reduced-motion`
the same origin/destination pair gets the canon cross-fade +
`accent.focus` highlight treatment instead of movement. The geometry
helpers are pure modules, unit-tested like `seat-arc.ts`; the rendered
result is the design gate's job (ADR-0030 accepts that jsdom cannot see
layout).

Alternatives rejected:

- **A motion library (`motion`/framer).** Real power — springs,
  interruption, layout animation for free — but it drags in a
  dependency and its own easing/duration vocabulary against the token
  law's two-duration palette, for what Cambio needs: point-to-point
  flights on one duration. Revisit if choreography needs (interruptible
  gestures, physics) ever outgrow point-to-point.
- **No true flights** — shipping the reduced-motion highlight treatment
  for everyone. Cheapest, but it contradicts hand.md's never-teleport
  rule; that would be a canon amendment nobody asked for.

## Consequences

- No new dependency; flights speak the token vocabulary by
  construction, and the reduced-motion path is designed in from the
  start rather than bolted on.
- We own the edge cases a library would have handled: interruption
  (a new snapshot landing mid-flight), unmounted destinations, and
  scroll/resize during flight. The flight layer must define its
  behavior for each (ADR-0033 already requires animations to reference
  event payloads, not live state).
- Flight correctness is verifiable in unit tests only at the pure-math
  level; visual verification rides the design gate's rendered path and
  the live-game acceptance walkthrough.
- If a future task adopts a motion library, it supersedes this ADR
  rather than quietly adding the dependency.
