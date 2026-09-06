name: hand
status: draft
version: 4
extends: none

A player's slot grid. Class: **Game object**.

## Anatomy

- Grid of card slots, **row-major, rows of up to 6** (r3, ADR-0036): a
  4-card deal is one straight line along the bench; the layout is
  designed for two rows (6×2, 12 cards); a third row is tolerated with
  compression; beyond 18 cards the layout is accepted breakage for this
  release (no client code caps or truncates hand data — a future rule for
  UI-exceeding growth is deliberately not invented here, stop-and-ask per
  HANDOFF directive 1). Slot count floors at 4 (one row) and only pads up
  to a full 6-wide multiple once the real signal outgrows a single row —
  a 4-card hand never pads to 6.
- Slot: playing-card footprint; an **empty slot renders as a dashed
  `ink.inverse`-at-55% outline** at `radius.card` — vacancies are public
  information and stay visible in place.
- Slot indices are stable: a slam removes the card, not the slot position;
  cards never re-flow to fill gaps.
- Own hand sits nearest the viewer, larger; opponents' hands render at their
  seats, smaller, same anatomy.

## States

- `populated` — face-down cards in stable slots.
- `empty` — zero cards: all-dashed grid. Zero cards is not a win and the
  player still acts; the empty hand must not read as "out of the game".
- `growing` — a penalty or give card arrives `in-flight` into the lowest
  free slot.
- `shrinking` — a slammed card `leaving-play`; its slot outline remains.
- `awaiting-give` — an opponent slot vacated by a correct slam, waiting for
  the slammer's card: dashed outline + `accent.focus` ring.
- `inert` — not interactable (not your turn, no slam window): no hover
  affordance on cards.

## Variants

- `own` (near, large, interactive) / `opponent` (seated, small, slam-only
  interactions).

## States (r2 addition)

- `targeting` — a power (7/8/9/10/J/Q) or the swap-held action is choosing a
  slot: the slot(s) already picked render `selected` (same visual language
  as keyboard focus, `playing-card.md` state 4); clicking a slot again
  toggles the pick off rather than completing an invalid target.

## Variants (r3 addition)

- `rotate` (`left` | `right`, side-bench opponents only, ADR-0036 §5): the
  hand reads rotated along its bench — column-major flow (slot indices run
  down the bench instead of across it), the card visual inside each slot
  takes the rotate class, and the slot's flight anchor stays upright and
  untransformed. Never applies to the viewer's own hand (always the bottom
  bench) or to top/bottom benches. The anchor keeps `card-frame`'s upright
  (5/7) footprint — it's the grid track's real estate, sized the same as
  an upright slot of that variant — while the rotated card visual uses the
  canonical sibling utility `card-frame-rotated` (7/5, gate-approved
  2026-09-06 — `tokens.md` §Shape) at the same `--card-width`: rotated 90°,
  its painted footprint lands width×height-reversed from the anchor's
  box, comfortably inside it (the anchor centers the now-smaller visual).

## Rules

- The hand receives only entitled card views: opponents' hands are always
  backs; own hand shows values only during an active peek/draw entitlement.
- Slot movements (swaps) are public and must animate as visible slot-to-slot
  flights — knowledge follows cards, and players track identity through
  movement. Never teleport a card.
- Card count is public and may be displayed; values never.
- No "cards you know" affordance on any slot, own or opponent (memory
  fidelity).
- Every slot exposes a flight anchor (`slot:<playerId>:<slotIndex>`),
  occupied or not — a vacancy is a valid flight destination (a give lands
  in one) and, via `emptySlotsClickable`, a clickable target for a
  consumer that needs one — never just a dead outline.
- No `transform` (scale or rotate) may sit on a slot's flight anchor or any
  of its ancestors (ADR-0035, extended to rotation by ADR-0036 §5) — the
  FLIP flight layer measures post-transform pixels and a transformed
  ancestor corrupts every flight through it. `rotate` applies the rotate
  class to the card visual INSIDE the anchor, never above it. One
  accepted consequence: a flight's clone renders upright mid-flight and
  lands on a rotated resting card at a side bench — a one-beat landing
  artifact under ADR-0034's capture-then-cancel stance. Do not "fix" it
  with a transform on the anchor chain.

## Revisions

- r1: initial, from the CAM-13 specimen board.
- r2 (CAM-18, T2/T3): `selectedSlots` and `emptySlotsClickable` land as
  props; every slot, occupied or not, now carries its flight anchor.
  _(Amended at review F4, 2026-09-06, to match what ships:
  `selectedSlots` renders the selected treatment for in-progress
  MULTI-pick targeting — the J/Q two-pick — and for the transient
  public which-slot-was-peeked beat (review F3); single-click actions
  (7/8/9/10 peeks, swap-held) send immediately and never populate a
  selection. `emptySlotsClickable` widens clickability to vacancies for
  a consumer that needs an empty-slot target — the shipped give flow
  resolves on the slammer's own OCCUPIED slots, so today only the
  gallery exercises it; it stays as the affordance the prop was built
  for.)_ Amended same day (gate fix cycle): the
  dashed vacancy outline renders only for indices that are genuinely
  empty in game state — the grid's even-rounding filler cell beyond
  every real signal is an invisible spacer, never a painted vacancy
  (one mark, one meaning).
- r3 (CAM-20, ADR-0036): the grid becomes **row-major, rows of up to 6**
  — superseding r1's "rows of 2" anatomy (bench-anchored layout, root plan
  clause 6). Filler-cell semantics carry over unchanged, just against the
  new 6-wide rounding instead of the old even-rounding. `rotate` lands as
  a variant for side-bench opponents (decision 5): column-major flow,
  upright anchors, rotate on the card visual only. _Amended: the anchor's
  swapped footprint was a pending creation-gate utility — until approved,
  rotated anchors kept `card-frame`'s upright (5/7) dimensions as a
  placeholder (see Variants above)._ _Amended again (creation-gate
  resolution, 2026-09-06): the user picked minting a new canonical
  utility, `card-frame-rotated` (7/5), over the two alternatives offered
  (a shared `--card-aspect` variable on `card-frame` itself, or tuning
  bench spacing without a new footprint token). The anchor now stays on
  plain `card-frame` (the grid track's real footprint) and the rotated
  visual takes `card-frame-rotated` at the same `--card-width`, centered
  in the anchor — verified on the rendered path at the 12-card case with
  comfortable clearance in both directions, no overlap._
- r4 (CAM-20, design-gate fix cycle, 2026-09-06): two more fixes from the
  docked composition's design-gate pass. (1) **The intra-hand gap
  tightens to 4px at compact** (`gap-1`, was `gap-2`/8px at both
  breakpoints; regular is unchanged) — at compact it matched the
  opponent row's own inter-seat gap (table-surface.tsx), so two adjacent
  4-card hands read as one continuous 8-card strip with no seam marking
  which cards belonged to which player; paired with table-surface.md
  r6's inter-seat gap widening. (2) **Side-bench (`rotate`) cards now
  follow the bench's painted arc**: the painted bench is a shallow
  crescent, not a straight edge, so a straight column of rotated cards
  put the middle cards over the shadow gap between the crescent and the
  round tabletop disc instead of on the bench itself. A per-row `margin-
left` on the card VISUAL only (never the anchor — same rule as the
  rotate class itself) nudges each row outward by a measured amount,
  largest at the bench's vertical middle and tapering to nothing at the
  tapered ends; only the column nearest the bench (the first
  `shortSide` slots) is affected — a 13+ card hand's later columns sit
  over the disc, unaffected, per the existing tolerated-compression
  band. Measured directly for a 4-row bench; 5/6-row values are the same
  fitted curve extrapolated, not independently re-verified on the
  rendered path (see `hand.tsx`'s `SIDE_BENCH_MARGIN_CLASS` comment and
  `docs/plans/frontend/CAM-20.md`).
