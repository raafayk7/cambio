# 0035 — Compact fit via token-driven CSS sizing; no transform scale above the flight root

- **Status:** proposed
- **Date:** 2026-09-06
- **Task:** CAM-21

## Context

The compact (<720px) game screen must fit its whole default state in one
viewport height (CAM-21): pinned top chrome, a bottom own-hand dock, and
the table region scaled to the space between. Something therefore has to
make the middle region smaller, and the obvious quick tool is a CSS
`transform: scale()` wrapper around it.

But card movement on this screen is rendered by the hand-rolled FLIP
flight layer (ADR-0034), which measures every flight as
`getBoundingClientRect()` deltas between slot anchors and a root element
(`tableRoot` in `game-screen.tsx`), then writes the origin box back as
untransformed CSS pixels inside that subtree. `getBoundingClientRect`
returns post-transform screen pixels, so with a scale factor `s` on any
ancestor of the flight root, the written coordinates render at `s²` —
every flight lands offset by exactly the scale factor. The bug is silent,
proportional, and invisible from reading either the scale wrapper or the
flight layer alone.

## Decision

We fit the compact game screen with **real CSS sizes driven by tokens**:
a gate-approved compact card scale (the card footprint custom properties
that `card-lg`/`card-md` already read), a height-capped table-art block,
and layout (flex/absolute pinning) for the docked regions. Flight
anchors then measure at their true rendered size and the FLIP math needs
no knowledge of the layout.

**`transform: scale()` is prohibited on any ancestor of the element
serving as the flight-measurement root.** If a uniform visual shrink is
ever genuinely required, the scale wrapper must sit _inside_ the flight
root (below the element handed to `FlightLayer`'s `root` prop), where
root rect and anchor rects share one coordinate space.

Alternatives considered:

- **`transform: scale()` wrapper above the flight root** — rejected: the
  `s²` coordinate corruption above; also fuzzy text/borders at fractional
  scales and a magic scale constant outside the token system.
- **Injecting a compensating `measure` into `FlightLayer`** (the prop
  exists for jsdom) — rejected: couples the flight layer to layout
  knowledge and breaks the moment a second transform appears.
- **Letting the middle region scroll** — rejected as the default-state
  answer: it violates CAM-21's fit-the-fold direction (it survives only
  as the below-floor overflow behavior beneath the 360×640 minimum).

## Consequences

- Easier: flights, highlight boxes, and any future rect-measuring overlay
  keep working across breakpoints with zero special cases; sizes stay in
  the token system where the design gate can audit them.
- Harder: fitting the fold takes real responsive sizing work (compact
  token values, art-height caps) instead of one scale knob; future
  layout work near the game screen must check this ADR before reaching
  for `transform: scale`.
- Committed to: the flight root remaining transform-free up its ancestor
  chain; compact sizing expressed through the design-system token layer.
- Owned edge (recorded at CAM-21 review): the docked composition puts
  flight anchors inside a compact `overflow-y-auto` region (the 5-player
  fallback's scroll). A scroll during an in-flight card desyncs the
  frozen FLIP coordinates from the moved anchors — the same
  capture-then-cancel stance ADR-0034 takes for scroll/resize applies:
  flights measure at start and never retarget; a mid-flight scroll may
  land a card visually off its slot for that one beat, and the next
  refetch-driven render corrects it. Not a violation of this ADR; noted
  so nobody "fixes" it with a transform.
- Revisit if: the flight layer ever moves to a coordinate model measured
  in a transform-aware space (e.g. `visualViewport`/manual matrix math),
  which would dissolve the constraint.
