# CAM-20 — Four-player cap and the bench-anchored table

- **Linear:** [CAM-20](https://linear.app/raafayk7/issue/CAM-20/game-table-3-5-player-seathand-geometry-rendered-tuning-pass)
- **Scope:** fullstack (frontend-dominant; backend is the domain cap only)
- **Child plans:** [backend](../backend/CAM-20.md) · [frontend](../frontend/CAM-20.md)
- **ADRs:** [0036](../../adr/0036-four-player-cap-bench-anchored-table-layout.md)

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

After this task, the desktop game screen is playable at every supported
player count: games are capped at 2–4 players (domain-enforced), each
player's cards lie in straight rows along one of the four painted benches
(viewer bottom, opponents on top/left/right), and the table art enlarges to
fill the fold instead of being crushed by radial seat geometry. Observe it
by starting 2-, 3-, and 4-player games and watching hands grow through
false-slam penalties without seats overlapping each other or the
deck/discard center — the exact failure the 2026-09-06 playtest hit at 3
players.

**Redefinition note:** CAM-20 was filed as a "3–5 player radial geometry
tuning pass". Playtest evidence (issue comment, 2026-09-06: overlapping
opponent groups at 3 players on desktop, screen unplayable) plus CAM-21's
deferred directions (enlarged table, straight-row bench placement, 4-player
cap — root/CAM-21.md Decision Log) redefined it during `/plan` into this
layout redesign. The radial tuning-pass charter is dead; ADR-0036 records
the doctrine inversion (visual metaphor becomes load-bearing; the rule
bends to it).

**Out of scope:** the slam-window liveness bug found while investigating a
playtest report during this `/plan` pass (stale `SlamWindow` leaves the
draw deck inert with no recovery) is filed separately with full findings —
see
[CAM-26](https://linear.app/raafayk7/issue/CAM-26/slam-window-can-strand-the-game-no-expiry-recovery-draw-deck-goes). `SLAM_WINDOW_MS` /
`duration.peek` feel-tuning also stays out (pending playtest input, per the
original brief). No new rule is invented for hands that outgrow the UI
(>18 cards): accepted broken edge this release, future rule is
stop-and-ask (HANDOFF directive 1).

## Context & orientation

- **Governing docs:** ADR-0036 (this task; amends HANDOFF §1.1's 2–5 and
  extends ADR-0035's transform ban to rotation), ADR-0035 (no
  `transform: scale` above the FLIP flight root), ADR-0034 (flight layer,
  capture-then-cancel), ADR-0033 (view refetch model), HANDOFF §1
  (rules), design-system canon `components/core/table-surface.md` (v4) and
  `components/core/hand.md` (v2) — both get superseding revisions here.
- **Domain (backend side):** the player-count rule lives in
  `packages/domain/src/Deal.ts` (documented single source; gate at
  `Deal.ts:22`) and `packages/domain/src/Lobby.ts:40`
  (`MAX_LOBBY_MEMBERS = 5`). The sim/fuzz harness derives rosters in
  `packages/domain/src/testing/driver.ts:105` (`2 + (i % 4)` → 2–5) and
  checks bounds in `packages/domain/src/testing/invariants.ts:56–58`.
  **No player-count bound exists in `packages/contracts`, `apps/api` (error
  pass-through only), or the database schema (`seat_index` has a lower
  bound only)** — verified during planning; the cap is a domain + copy
  change with no wire or storage impact. Contracts are therefore already
  frozen; both lanes can run in parallel from day one.
- **Frontend:** seat placement is the count-agnostic polar engine in
  `apps/web/src/components/game/table-geometry.ts` (`ringPositions`,
  viewer at 90°; `inwardSide` reduces ring points to a side;
  `handArc`/`HAND_RING_RADIUS_PCT` are dead exports with no production
  consumer). `table-surface.tsx` places seats absolutely at ring
  percentages with `EDGE_ANCHOR_CLASS`; the art is `w-3/4` of a regular
  `max-w-2xl` square (art 504px, disc 54% ≈ 272px), compact art capped at
  `--size-table-art-compact` (128px). `hand.tsx` renders both variants as
  a 2-column grid (rows of 2, min 2×2, stable slot indices, dashed
  vacancies, invisible even-count pad cells). `game-screen.tsx` composes
  seats via `SeatWithHand` + `REGULAR_SIDE_FLEX_CLASS`, and (CAM-21) docks
  the viewer's own seat by hand-copying the anchor translate and
  reproducing the ring point — a deferred cleanup this task absorbs.
- **Card flights:** the FLIP layer measures `getBoundingClientRect`
  deltas against upright anchors. ADR-0036 consequence: **no rotate
  transform on any ancestor of a flight anchor** (same corruption class as
  ADR-0035's scale ban); side-bench rotation is applied to card visuals
  inside/below the slot anchors.

## Functional contract

Player-cap clauses (existing 2–5 behavior is pinned today by
`packages/domain/test/Deal.test.ts` "rejects player counts outside 2–5" /
its 2–5 acceptance loop and `packages/domain/test/Lobby.test.ts` "a fifth
member fills the lobby; a sixth is LobbyFull" — probe-verified via those
tests during planning; this task moves the pins, it does not discover the
behavior):

1. Game creation (`deal`) rejects player counts outside **2–4** with
   `BadPlayerCount`; counts 2, 3, and 4 are accepted. 5 is rejected.
2. A **fourth** lobby member fills the lobby; a fifth join attempt is
   refused with `LobbyFull`. No API, contracts, or migration change
   accompanies the cap.
3. The sim/fuzz/roundtrip harnesses generate rosters spanning exactly 2–4,
   and full simulated games at each count complete with all invariants
   holding (invariant bound updated to "outside 2–4").
4. Room-screen copy states the 2–4 rule wherever player count is spoken:
   the start helper, the `BadPlayerCount` error copy, and the lobby-full
   denial copy ("four players", not "five").

Layout clauses (regular = desktop composition; compact = CAM-21's docked
composition):

5. On regular, seats anchor to benches: the viewer's seat is always the
   bottom bench; opponents occupy top (2P), left + right (3P), and
   left + top + right (4P), assigned in seat-arc order (next player after
   the viewer takes the leftmost of the occupied benches, sweeping
   left → top → right). No radial/polar placement remains in the rendered
   output.
6. `Hand` renders **row-major rows of up to 6 slots** in both variants and
   at both breakpoints. Slot indices remain stable: a slam hole renders as
   a vacancy in place (no reflow), and penalty growth appends at the
   lowest free slot exactly as today.
7. A 12-card hand (6×2) at any seat renders without overlapping the
   tabletop disc's deck/discard cluster, any other seat's group, or pinned
   chrome at the regular reference viewport; hands of 13–18 still render
   (compression permitted); **no client code caps or truncates hand data**
   (>18 may break layout — accepted, per ADR-0036).
8. Left/right-bench groups read as rotated along their bench, and **no
   `transform` (scale or rotate) exists on any ancestor of a flight
   anchor element** — pinned by a test in the spirit of CAM-21's `/scale-/`
   assertion, extended to rotation.
9. On regular, the table square grows to claim the vertical space between
   chrome up to a `max-w-4xl` cap (from today's `max-w-2xl`), via real CSS
   sizing only (ADR-0035); the center overlay stays pinned at 54% of the
   art width.
10. The compact docked composition is unchanged except for the hand's
    internal row-major layout: CAM-21's fold-fit and pinned-chrome test
    pins still pass at 2, 3, and 4 players.
11. Five-player support is removed coherently from the frontend: no
    5-seat rendering path, gallery, or copy remains; the table-surface
    canon's 5-player scroll fallback is retired in the same canon revision.
12. Canon and rules docs are revised, not contradicted: `table-surface.md`
    and `hand.md` get superseding revisions (bench doctrine, row-major
    anatomy, 2–4 seats); HANDOFF §1.1 carries an amendment blockquote
    pointing at ADR-0036; the `cambio-rules` skill's setup line is amended
    the same way (harness file — lands on `main` per ADR-0028 and
    merges down as part of this task's definition of done).

### Acceptance criteria

- [ ] All 12 contract clauses hold, with coverage rows filled in the child
      plans as tests land.
- [ ] The design-gate rendered path is re-run at 2, 3, and 4 players on
      both breakpoints (advisory verdicts recorded in this doc's Progress).
- [ ] The quality gate passes: `pnpm turbo build typecheck lint test`
      (run bare, never piped).
- [ ] Dev-server verification obeys the freshness discipline in AGENTS.md
      (curl a changed module before trusting any rendered check).

## Plan of work

Contracts are already frozen (no wire change), so the backend and frontend
lanes are independent from the start; the backend milestone can land in
parallel with any frontend milestone.

- **M1 — the cap (backend lane + copy).** Move the 2–5 pins to 2–4:
  `Deal.ts`, `Lobby.ts`, `testing/invariants.ts`, `testing/driver.ts`
  (roster generator must span 2–4, e.g. `2 + (i % 3)`), and their tests;
  then the room-screen copy strings and their test assertions. Domain work
  is test-first. Clauses 1–4.
- **M2 — row-major hands (frontend lane).** Rework `hand.tsx` from
  `grid-cols-2` to row-major 6-wide rows, preserving stable slots,
  vacancies, and pad-cell semantics; revise `hand.md` canon; update hand
  tests. Clause 6. Ordered before M3 because bench anchoring is sized
  around row-shaped hand footprints.
- **M3 — bench geometry (frontend lane).** Replace `ringPositions`
  consumption with a bench-assignment model in `table-geometry.ts`
  (2P/3P/4P maps per clause 5), rework `table-surface.tsx` anchoring,
  dissolve the CAM-21 own-dock duplication (exported anchor map or a
  `ViewerSeatDock` extraction), delete the dead `handArc` exports, retire
  the 5-player test, revise `table-surface.md` canon. Clauses 5, 11.
- **M4 — side-bench rotation (frontend lane).** The rotated-along-bench
  reading for left/right groups with the transform kept **below** flight
  anchors; add the no-transform-above-anchors pin. Clause 8. Depends on M3.
- **M5 — the big table (frontend lane).** Fluid fill-the-fold sizing of
  the regular table square up to `max-w-4xl`; verify 12-card hands at
  every seat and the compact pins. Clauses 7, 9, 10. Depends on M3
  (bench footprints define the space the table can claim).
- **M6 — verification & canon close-out.** Rendered design-gate passes at
  2/3/4 on both breakpoints (fresh dev server, freshness check first);
  gallery updates; HANDOFF §1.1 amendment blockquote; `cambio-rules` skill
  amendment on `main` + merge-down. Clause 12 and the acceptance boxes.

## Validation

- Domain: updated `Deal.test.ts` / `Lobby.test.ts` bounds, sim
  `Invariants.test.ts` roster assertion, and full-game
  `EndToEnd.test.ts` runs at counts 2–4 — proves the cap and that nothing
  downstream of it stalls.
- Frontend units: `table-geometry.test.ts` replaced by bench-map tests
  (assignment per count, viewer-bottom invariant);
  hand tests for 6-wide row-major with stable slots/vacancies;
  `game-screen.test.tsx` keeps CAM-21's fold-fit pins green and gains the
  no-transform-above-flight-anchors pin.
- Rendered: design-gate rendered path at 2/3/4 × {regular, compact};
  manual growth check by driving false slams until a seat holds 12+ cards.
- The full gate: `pnpm turbo build typecheck lint test`, bare.

## Progress

_(updated continuously; append new entries at the BOTTOM — newest last;
timestamp each entry)_

- [x] 2026-09-06 — `/plan` pass: redefinition agreed, ADR-0036 written,
      explorer maps of geometry + cap touchpoints captured, child plans
      drafted.

## Decision log

- 2026-09-06 — **Redefine CAM-20 from tuning pass to bench redesign** —
  playtest showed overlap (not crowding) at 3P; user call.
- 2026-09-06 — **Cap lives in the domain, not the UI** — one source of
  truth (`Deal.ts` is the documented single source); UI-only cap would
  leave a supported-but-unrenderable state. User call; ADR-0036.
- 2026-09-06 — **Bench rows apply to both breakpoints as a hand-internal
  change only** — compact keeps CAM-21's docked composition; only
  `hand.tsx`'s internal grid changes there. User call.
- 2026-09-06 — **Row budget: designed for 6×2, third row tolerated,
  > 18 accepted breakage; no elimination/end rule invented** — user call;
  > recorded in ADR-0036.
- 2026-09-06 — **Side benches read rotated; rotation below flight
  anchors** — user chose the rotated reading; the below-anchor constraint
  is forced by ADR-0035's measurement argument extended to rotate.
- 2026-09-06 — **3P benches are left + right** (not top + a side) —
  symmetric, both opponents equally near the viewer, and it keeps the top
  clear so the enlarged table reads; sweep order left → top → right keeps
  seat-arc order legible. Planner call (Decision Log tier, not ADR).
- 2026-09-06 — **Fluid fill-the-fold table with `max-w-4xl` cap** over a
  fixed step — user call.
- 2026-09-06 — **Slam-window liveness bug filed separately** — engine
  verified faithful to §1.5; the observed "couldn't draw" maps to a
  client/application liveness hole documented in the bug issue. User call.

## Surprises & discoveries

- The planning investigation of the playtest bug report cleared the engine
  (false slam moves no cards between hands) and found the real defect
  elsewhere: a stale `SlamWindow` has **no recovery path** (no bootstrap
  timer, `VersionConflict` orphans the timer, view route bypasses the lazy
  close, client has no expiry handler or polling) leaving the draw deck
  rendered with no `onClick`. Filed separately; see Out of scope.
- `SLAM_WINDOW_MS` actually defaults to **10000**, not the 5s the original
  issue text claimed — relevant to future feel-tuning, untouched here.

## Outcomes & retrospective

_(filled at the end, typically by `/review`)_
