# 0036 — Four-player cap; bench-anchored table layout

- **Status:** proposed
- **Date:** 2026-09-06
- **Task:** CAM-20

## Context

The desktop game screen arranges seats radially around the painted table
(`ringPositions` in `apps/web/src/components/game/table-geometry.ts`), with
each player's hand growing as a 2-column grid beside the seat. First live
playtests at 3 players (CAM-20 issue comment, 2026-09-06) showed the radial
arrangement is not merely crowded but unplayable on desktop: opponent
seat+hand groups overlap each other and the deck/discard center, and one
opponent's seat pill renders behind another's cards. Tuning the ring
constants cannot fix this — hands grow (false-slam penalties are unbounded)
along the same radii the table occupies, so every player or card added
shrinks the table's presence. The table — the game's central visual
character — was being crushed by geometry that treats it as residual space.

The design canon to date deliberately pointed the other way:
`design-system/components/core/table-surface.md` declares the four painted
benches "scenery, never a constraint" and rules that "the backend is never
capped by the visual metaphor" (HANDOFF §1.1: 2–5 players). CAM-21 raised
and explicitly deferred two directions to this task: capping the game at 4
players and a table redesign (enlarged table, straight-row bench placement).

## Decision

We invert the doctrine, deliberately: **the visual metaphor becomes
load-bearing, and the game rule bends to it.**

1. **Games are capped at 2–4 players, enforced in the domain.**
   `Deal.ts`'s player-count gate and `Lobby.ts`'s `MAX_LOBBY_MEMBERS` become
   the 2–4 rule; HANDOFF §1.1's "2–5 players" is amended by this ADR. No
   contracts, API, or database changes are required (verified: no
   player-count bound exists in `packages/contracts`, `apps/api` only passes
   domain errors through, and the schema has no upper-bound constraint).
2. **Seats anchor to the four painted benches**, replacing radial
   placement on the regular (desktop) composition: the viewer always takes
   the bottom bench; opponents take top (2P), left+right (3P), or
   left+top+right (4P) in seat-arc order. The compact docked composition
   (CAM-21) is unchanged.
3. **Hands lay in straight lines along the bench**: the hand grid becomes
   row-major, up to 6 cards per row, at both breakpoints. The layout is
   designed for two rows (12 cards) per player; a third row is tolerated
   with compression; beyond 18 cards the UI is **accepted as broken** for
   this release. A future rule (game end or player elimination on
   UI-exceeding hand growth) is deliberately **not** invented here — rule
   gaps remain stop-and-ask (HANDOFF directive 1).
4. **The table enlarges to fill the fold** on desktop — real CSS sizing
   under ADR-0035's rules (no `transform: scale` above the flight root),
   with the tabletop disc keeping its measured-from-alpha 54%-of-art pin.
5. **ADR-0035's transform prohibition extends to rotation.** Side-bench
   groups read as rotated along their bench, but the FLIP flight layer
   measures `getBoundingClientRect` (post-transform pixels) and writes
   untransformed pixels, and rotated rects report axis-aligned bounding
   boxes — so **no rotate transform may sit on an ancestor of a flight
   anchor** for the same reason no scale may. Rotation is applied to card
   visuals inside/below the slot anchor elements, with upright anchor boxes
   sized to the rotated footprint.

   > **Amended (as-built, creation-gate resolution + review fix cycle):**
   > two refinements to the sentence above. (1) The anchor box stays plain
   > upright `card-frame` (the grid track's real estate); only the card
   > _visual_ takes the gate-minted `card-frame-rotated` footprint —
   > recorded in `hand.md` r3, reconciled here per the review's F11.
   > (2) The prohibition covers **transforms**, not layout offsets: the
   > side-bench arc registration is a `position: relative` offset **on the
   > anchor itself**, which moves anchor and card together (FLIP reads
   > `getBoundingClientRect`, which reflects layout position) — the
   > review's F2 found that offsetting the _visual_ instead displaced the
   > painted card up to ~57px from the anchor flights land on; verified
   > fixed on the rendered path (anchor/visual delta 0.0px at 12 cards).

Alternatives considered:

- **Keep radial, tune constants** (the original CAM-20 charter) — rejected:
  playtest evidence shows overlap, not crowding; no constant setting stops
  hands and table competing for the same radii at 3+.
- **UI-only lobby cap (engine keeps 5)** — rejected: leaves a
  supported-but-unrenderable state every layer above the domain must
  pretend doesn't exist; the domain's `Deal.ts` gate is the documented
  single source of the player-count rule, so the rule change belongs there.
- **Scrollable/paginated seat regions at 5 players** (table-surface.md r4's
  sanctioned fallback) — rejected as the _default_ answer: it saves the
  layout by hiding players, which is worse for a memory game than capping
  the count; the r4 fallback becomes moot under the cap.

## Consequences

- Easier: seat placement becomes a small assignment map instead of polar
  math; the table regains visual primacy; every player count 2–4 shares one
  designed layout instead of five eyeballed arrangements.
- Harder: the design canon (table-surface.md, hand.md) must be revised in
  the same task — the "benches are scenery" and "rows of 2" doctrines are
  superseded; the cambio-rules skill and HANDOFF §1.1 must note the 2–4
  amendment.
- Committed to: the bench metaphor as layout law on regular; upright flight
  anchors (no transform of any kind above them, extending ADR-0035);
  overflow past 18 cards as an accepted broken edge until a future release
  decides the rule.
- **Accepted consequence (review F1, user call 2026-09-07):** the cap
  gates creation and joins only — a game persisted under the old 2–5 rule
  stays engine-valid and `viewFor` projects all five seats, but the
  client's `benchAssignment` throws for 5 seats and there is no error
  boundary, so opening such a game crashes the screen. Accepted pre-launch
  (no live 5-player games matter yet); revisit with a layout-only
  degradation if a real 5-player row ever needs rendering.
- Revisit if: a future layout genuinely seats 5+ (lifting the cap is a
  domain-constant change plus this ADR's supersession), or the flight layer
  moves to transform-aware coordinate math (dissolving consequence 5 along
  with ADR-0035).
