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
    pins still pass at 2, 3, and 4 players. _Amended (review F6, per the
    Decision-Logged 2026-09-06 user call to fix all design-gate findings
    in-task): the gate fix pass additionally changed three compact values
    beyond hand internals — the opponents-row inter-seat gap
    (`gap-x-5`), the deck-badge inset, and `--size-table-art-compact`
    (128 → 158px, fold-fit re-verified at 2/3/4 players). The
    still-binding core of this clause is that CAM-21's docked
    COMPOSITION and its test pins survive, which they do._
11. Five-player support is removed coherently from the frontend: no
    5-seat rendering path, gallery, or copy remains; the table-surface
    canon's 5-player scroll fallback is retired in the same canon revision.
12. Canon and rules docs are revised, not contradicted: `table-surface.md`
    and `hand.md` get superseding revisions (bench doctrine, row-major
    anatomy, 2–4 seats); HANDOFF §1.1 carries an amendment blockquote
    pointing at ADR-0036; the `cambio-rules` skill's setup line is amended
    the same way. _Amended (review F5): this clause originally routed the
    skill amendment "on `main` per ADR-0028" — a misreading of the ADR,
    whose guard rail names that exact file as release-side-diverged and
    must-not-edit-on-main. The edit was made on `main` anyway (9dc922d)
    and the merge-down resolved cleanly (release-v0's copy verified
    correct), so the outcome stands; the correct procedure for this file
    is a release-side edit — see the Decision Log._

### Acceptance criteria

- [x] All 12 contract clauses hold, with coverage rows filled in the child
      plans as tests land. Backend owns clauses 1–4 and the rules-doc half
      of 12 ([backend/CAM-20.md](../backend/CAM-20.md) Contract coverage,
      all rows filled with real test names and assertions); frontend owns
      clauses 5–12 ([frontend/CAM-20.md](../frontend/CAM-20.md) Contract
      coverage, all rows filled, including clause 7's re-verified
      rendered numbers post-creation-gate and — per the review fix
      cycle's fresh measurement, which replaced the stale claim the
      review's F3 caught here — post-fix-cycle: 12-card left-bench hand
      re-measured live 2026-09-07 with the arc offsets on the anchors,
      0.0px anchor/visual delta, 20.1px cluster clearance, 6-row arc
      table rendered-verified).
- [x] The design-gate rendered path is re-run at 2, 3, and 4 players on
      both breakpoints (advisory verdicts recorded in this doc's Progress).
      **Scope reduced by explicit user request** to 2 runs — 4 players
      only, both breakpoints (the densest/most bench-loaded case per
      breakpoint) — rather than the full 2/3/4 × regular/compact sweep;
      the frontend child plan's M6 already covered 2/3/4 × both
      breakpoints during implementation (see
      [frontend/CAM-20.md](../frontend/CAM-20.md) M6 Progress). See the
      "Design-gate rendered pass (verification-only follow-up)" Progress
      entry below for both full reports: both verdicts flagged (advisory
      per ADR-0029, does not block), zero constraint-tier failures, no
      real bugs found.
- [x] The quality gate passes: `pnpm turbo build typecheck lint test`
      (run bare, never piped). Confirmed green repeatedly through the
      task (25/25 tasks, exit 0) — most recently after the design-gate
      fix pass, verified independently by the orchestrator outside any
      subagent's own report.
- [x] Dev-server verification obeys the freshness discipline in AGENTS.md
      (curl a changed module before trusting any rendered check). Followed
      at every rendered pass (M6, the creation-gate follow-up, the
      mid-viewport bug investigation, the design-gate run, and the fix
      pass) — see each lane's Surprises for the specific freshness checks
      run.

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
- [x] 2026-09-06 — `/implement` pass: backend and frontend lanes run in
      parallel (contracts frozen, zero shared-file overlap). **Backend
      (M1, clauses 1–4 + rules-doc half of 12):** the 2–5 pins moved to
      2–4 test-first across `Deal.ts`, `Lobby.ts`
      (`MAX_LOBBY_MEMBERS`), the sim harness (`testing/invariants.ts`,
      `testing/driver.ts`'s `playerCountFor`), and the room-screen copy
      (`use-room.ts`, `room-screen.tsx`); `docs/HANDOFF.md` §1.1 amended
      on the task branch. Full backend-touched suite green throughout;
      details and coverage rows in
      [backend/CAM-20.md](../backend/CAM-20.md). **Frontend (M2–M6,
      clauses 5–12):** `hand.tsx` reworked to row-major rows (M2);
      `table-geometry.ts`'s polar engine replaced by a `Bench` +
      `benchAssignment` model, `table-surface.tsx` anchored via exported
      class maps, the CAM-21 dock-duplication dissolved, 5-player support
      retired (M3); side-bench rotation added with the transform kept
      strictly below flight anchors (M4); the regular table sized
      fluidly up to `max-w-4xl` (M5); rendered verification at 2/3/4
      players × both breakpoints plus canon revisions (`table-surface.md`
      v5, `hand.md` v3) closed out M6. One real bug was caught and fixed
      during M6 itself: the M4 rotation classes were unprefixed and leaked
      into compact, breaking the fold at 3–4 players — fixed by scoping
      the rotated presentation to `regular:` only. Full web suite green
      throughout M2–M6 (227/227 at close); details and coverage rows in
      [frontend/CAM-20.md](../frontend/CAM-20.md). **Creation-gate
      follow-up:** M4 hit the pre-flagged STOP (the rotated side-bench
      card footprint) and correctly did not invent a value — the user was
      asked via `AskUserQuestion` and chose minting a new canonical
      utility, `card-frame-rotated` (`aspect-ratio: 7/5`, mirroring
      `card-frame`'s `5/7`), over a shared-variable or spacing-only
      alternative. Added to `packages/ui/src/styles.css` and
      `design-system/references/tokens.md`; wiring it required keeping
      the flight anchor on plain upright `card-frame` (the grid's real
      track space) while only the card visual inside took the rotated
      utility — an anchor/visual split discovered by rendered measurement
      after a first attempt (matching the plan's literal sketch) fixed
      one clearance axis while silently breaking the other. Rendered
      clearance for a 12-card rotated hand improved from ~2px to ~50px
      (upright: ~86px), closing the asymmetry that originally flagged the
      gap. **Mid-viewport bug investigation:** the user reported the
      table rendering far smaller than the fold allows at two DevTools
      viewport sizes outside this task's reference viewports (723×770,
      421×770). Investigation found two unrelated causes: 723×770 (just
      inside the `regular` breakpoint, `--breakpoint-regular: 720px`)
      could not be reproduced against fresh code after a thorough sweep —
      almost certainly a stale dev server on the reporter's side, since
      pre-M5 code lacked the height bound and would produce exactly that
      symptom; 421×770 (compact) reproduced a real ~200px dead-space gap,
      but was confirmed byte-identical to `release-v0` via `git diff` —
      a pre-existing CAM-21-era "accepted flex residue" mechanism
      (their own code comment) that scales linearly with viewport height
      beyond CAM-21's one validated height (640px), not something this
      task's diff touched or worsened. Filed separately as
      [CAM-27](https://linear.app/raafayk7/issue/CAM-27/compact-game-screen-flex-residue-leaves-growing-dead-space-above-the)
      rather than fixed under this task's scope, following the same
      precedent as CAM-26. Full gate green (25/25) confirmed before and
      after this investigation; no source files touched.
- [x] 2026-09-06 — Design-gate rendered pass (verification-only follow-up;
      the frontend child plan's M6 already ran the gate at 2/3/4 players
      × both breakpoints during implementation — this is a separate,
      later pass closing this root doc's acceptance box). **Scope
      explicitly narrowed by user request to 2 runs**, not the full
      6-combination sweep: 4 players at regular (1280×900) and 4 players
      at compact (360×640) — the densest/most bench-loaded case at each
      breakpoint, since all four benches are occupied only at 4P. Setup
      followed the established recipe from
      [frontend/CAM-20.md](../frontend/CAM-20.md)'s M6/follow-up Progress
      entries: `docker compose -f docker/docker-compose.yml up -d`
      confirmed already healthy; found and killed a stray orphaned
      `apps/api` dev process (pid 855963, no listening port, a crashed
      leftover from an earlier session) before starting a fresh
      `pnpm dev` (api :3001, web :3100 per this repo's `.env`
      `WEB_PORT=3100` — a real per-checkout value, not the
      AGENTS.md-documented default :3000); freshness verified per
      AGENTS.md before trusting anything rendered (curled
      `table-surface.tsx` through Vite and grepped for `bench`, got
      `benchAssignment`/`BENCH_POSITION_CLASS`/`BENCH_ANCHOR_CLASS` hits,
      confirming the served module was current). A live 4-player game was
      created directly via the API (`POST /users` ×4 with separate cookie
      jars, then `POST /lobbies`, `POST /lobbies/:id/join` ×3,
      `POST /lobbies/:id/start`), landing in `AwaitingDraw` (Zara's turn)
      with a fresh 4-card deal at every seat — accepted per the task's
      own time-constrained allowance rather than growing hands via false
      slams, since the frontend M6 pass already stress-tested 12–16-card
      hands at every bench. Both renders were captured via
      `.agents/scripts/design-gate/render.js --cookie` (Zara's session)
      against the live game at each viewport, then the full
      decompose-map-judge pipeline run as three separate subagent calls
      per breakpoint (six calls total), JSON passed verbatim between
      stages per the `gate` skill's orchestration contract. Both verdicts
      came back flagged, but advisory per ADR-0029 — neither blocks
      shipping — and **both had zero constraint-tier (C1/C2) failures**;
      every flag is an accidental default-tier polish item or a
      controlled break tied to documented Cambio/CAM-21 canon. Slop
      convergence (C3) did not trigger at either breakpoint (2
      medium-weight markers each, against a threshold of 3, or 2
      high-weight). Regular breakpoint (1280×900, 4 players) — flagged on
      3 points: hard checks measured 0 contrast fails (sole advisory is
      an invisible 1×1px sr-only `h1`) and all 3 sampled touch targets
      clear 44px. The 3 accidental findings: (1) Zara's own-seat group
      extends 3px past the 900px viewport bottom inside an
      `overflow-hidden` wrapper, clipping the seat pill's border and its
      signature 3px/3px hard offset shadow (fix: raise the group 4px, one
      step on the existing 4px scale, and assert the bottom edge
      directly); (2) the Call Cambio button sits alone at
      (1104,816), 260–415px from the own hand/pill it acts on rather than
      docked beside them (fix: right-align it to the own hand's edge,
      same vertical band); (3) on the rotated side-bench hands the middle
      two of four cards land over the dark shadow gap between bench and
      tabletop instead of on the painted bench itself, a straight card
      column registered against a curved arc — invisible to hard-checks
      since it's misregistration against raster art, not a CSS grid (fix:
      offset the middle cards outward by the arc's sagitta). Everything
      else initially read as irregular was called controlled: hands
      overlapping the table art (applied identically at all 4 seats,
      stripe direction encodes bench orientation); the flat 15px chrome
      with no visible heading (hierarchy relocated to the card layer — a
      1.5x viewer-card size step, not an absent hierarchy); the
      once-only display face on the discard rank (documented Cambio
      identity — poster face reserved for card ranks); two radius
      vocabularies, rectangular plates vs. round tokens (a legible
      physical metaphor applied without exception, worth documenting
      explicitly); three chrome elements in three separate corners except
      for the Call Cambio placement above; the 235px of empty paving on
      each side of the table (expected at low visual density, nothing
      decorative fills it); and the unlabelled connection dot (a
      near-universal convention). Personality (D7) was actively
      considered and not flagged — convergence wasn't met and a
      repo-wide sweep found zero hits across the entire default-AI-stack
      vocabulary; the Judge's own words were that "this surface could not
      belong to another product." Compact breakpoint (360×640, 4
      players) — flagged on 7 points: hard checks again measured 0
      contrast fails; Call Cambio clears 44px and the DrawDeck/DiscardPile
      measure 32×44.8, inside the 24–44px advisory band (not a constraint
      fail, C2's hard floor is 24px); fold-fit was confirmed by
      measurement (`document.scrollHeight` 640 equals `clientHeight` 640,
      no page-level scroll on either axis). The 7 accidental findings
      collapse into three root causes per the Judge's own read: first,
      Sam's and Priya's opponent hands sit exactly the same 8px apart as
      the gap used inside each hand, so all 8 face-down cards read as one
      continuous strip with no visual seam — in a hidden-information
      memory game, card-to-owner attribution is load-bearing, not
      cosmetic (fix: tighten the intra-hand gap to 4px and spend the
      recovered width on a ≥24px inter-seat gap, and/or give each hand a
      common-region ground). Second, the "35" deck-count badge escapes
      the deck card it labels, extending 4px onto the discard's left edge
      and 8px below both cards with no offset-shadow treatment separating
      the layers — readable as belonging to the wrong pile, and a D8
      execution miss on the same element (fix: inset the badge fully
      inside the deck card, or move it below as a labelled line). Third,
      the compact table-art size cap (`--size-table-art-compact`) is too
      small for its own contents: the deck+discard pair spans 68px of a
      69.1px disc (~0.5px clearance per side), the same two cards are the
      smallest touch targets on screen at 32px with only a 4px gutter
      between them (a mis-tap between draw and take-discard is not
      undoable), and 78.7px of empty paving sits unclaimed between the
      table art and the own hand as leftover flex slack rather than
      authored padding — one size lever (raising the art cap) addresses
      all three symptoms together. The seventh, independent finding: the
      top-right connection dot is the one place on this screen that falls
      back to color alone for status, inconsistent with how redundantly
      the rest of the screen encodes turn state (text plus dot plus ring
      plus position plus size) — it needs an accessible name, not a
      position change. The controlled-break calls here were the flat
      15px type band and missing visible title (both judged as the right
      trade against the stated no-page-scroll fold budget, though the
      Judge flagged the type-band excuse as fragile if wider breakpoints
      show the same flatness); the CAM-21-era 2+1 opponent wrap and its
      stacking above the table art (width-forced, documented, applied
      consistently, though a designer may prefer a different compact
      expression); the mixed Alfa Slab One/Archivo card face at 12px
      (documented rule applied uniformly, though "at 12px the slab's
      character is lost"); the redundant card-count on the viewer's own
      pill (uniform component application outweighs the one-seat
      redundancy); and the connection dot's position off the shared
      x=180 centerline (a recognized corner-pinned-status convention —
      the real problem is the missing label, counted above). No real
      (non-advisory) bugs were found at either breakpoint: every flagged
      item is either a controlled break tied to documented Cambio/CAM-21
      canon or an accidental default-tier polish item (spacing,
      proximity, a badge overlap, a missing a11y label), none is a
      constraint-tier failure, none is structurally broken, and per
      ADR-0029 none blocks shipping. The one cross-breakpoint pattern
      worth a human's eye: the deck-count-badge overlap (compact) and the
      side-bench card registration gap (regular) are both small-scale
      rendering details invisible to hard-checks because they're measured
      against raster art or a flush size cap rather than a CSS grid,
      consistent with this task's own ADR-0030 rationale for routing
      geometry claims to the rendered path. No source files were touched
      (verification-only, per instruction); the dev server was stopped
      after the pass.
- [x] 2026-09-06 — Design-gate fix pass: the user chose to fix all 7
      accidental findings now rather than defer them. **Regular:** the
      own-seat wrapper's translate was nudged an extra 4px so the group's
      bottom edge (including the seat pill's border/shadow) sits at
      899.38px, inside the 900px viewport (was 903.38px); Call Cambio
      moved from a fixed stage corner to `left-[calc(50%+324px)]`,
      derived from the hand's column-width ceiling, cutting the gap from
      260.5px to 120px; the rotated side-bench hands gained a per-row
      margin (`SIDE_BENCH_MARGIN_CLASS`) fit to the bench's measured
      crescent shape, applied to the card visual only (never the flight
      anchor) — two real bugs surfaced only on the rendered path while
      building this (a flex-centered margin moves content by half its
      value, so every table entry had to be doubled; the right bench's
      positive margin collapsed the visual to 0×0 via default
      `flex-shrink`, fixed with `regular:shrink-0`). **Compact:** the
      intra-hand card gap dropped to 4px and the inter-seat gap rose to
      24px, giving opponent hands a visible seam; the deck-count badge
      now insets flush to the deck's own corner instead of bleeding onto
      the discard; `--size-table-art-compact` rose from 128px to 158px (a
      re-measured value, not a revert to an old constant), re-verified
      against CAM-21's fold-fit invariant at 2, 3, and 4 players; the
      connection-dot color-alone finding turned out to already be fixed
      (byte-identical to `release-v0`, with an existing accessible-name
      assertion) — logged as a likely stale-render artifact in the
      Judge's source, not a real gap. New structural jsdom coverage added
      for the own-seat overshoot, the CTA's docked position, and the
      inter-/intra-hand gap difference. Canon revised again: `hand.md` →
      v4, `table-surface.md` → v6, `tokens.md` updated, each with
      changelog entries — not silent edits. Full gate green throughout
      (25/25, confirmed independently by the orchestrator after the pass,
      not just accepted from the subagent's own report); web suite
      230/230 (227 + 3 new), UI suite 25/25.
- [x] 2026-09-07 — `/review` fix cycle executed (all findings F1–F12
      resolved or dispositioned; see each finding's RESOLUTION line in
      Outcomes & retrospective). Highlights: F2 fixed structurally (arc
      offsets moved onto the flight anchors; live rendered probe measured
      0.0px anchor/visual delta on a 12-card left-bench hand, replacing
      the ~57px displacement) — which simultaneously closed F3's missing
      post-fix measurement and rendered-verified the previously
      extrapolated 6-row arc table; F1 accepted and recorded in ADR-0036;
      F9 resolved by the "art-registration constants" tokens.md family +
      derivation pins. Environment hygiene: SLAM_WINDOW_MS temporarily
      1500 for the growth script and restored to 10000; dev servers
      stopped after the probe; throwaway driver/probe scripts lived in
      the session scratchpad only.
- [x] 2026-09-07 — fix-cycle re-review: sweeps verified (F3/F4/F5/F10
      phrasings re-grepped; every remaining hit is a historical Progress
      record, a superseded-marked amendment, or the finding's own quoted
      text), mutants reasoned for each hardened test (recorded in the
      RESOLUTION lines), suites re-run fresh: domain 195/195 (194 + the
      playerCountFor pin), web 233/233 (230 + arc-on-anchor ×2 + the
      inset lockstep guard), full bare gate exit 0 — one intermediate
      failure was the gate's own prettier check catching an unformatted
      hand-applied test edit (the PostToolUse format hook covers
      Edit/Write, not Bash-applied edits — noted for future cycles),
      fixed with `prettier --write` and re-run green.
- [x] 2026-09-07 — `/review` pass: four reviewers (contract +
      architecture × both lanes), independent gate + forced zero-cache
      test run (680/680 green). Verdict **fix-then-ship**; findings
      F1–F12 recorded in Outcomes & retrospective. All 12 contract
      clauses satisfied; the blockers are doc-integrity items plus two
      behavior questions (F1 five-seat render throw, F2 flight-anchor
      displacement) awaiting user calls.

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
- 2026-09-06 — **Rotated side-bench card footprint: new canonical
  `card-frame-rotated` utility** (`aspect-ratio: 7/5`), over a shared
  `--card-aspect` variable on `card-frame` or a spacing-only fix — user
  call via `AskUserQuestion` at the M4 creation-gate STOP. Decision Log
  tier, not an ADR; recorded in `hand.md`'s Revisions and `tokens.md`.
- 2026-09-06 — **Design-gate acceptance criterion: run 2 configurations,
  not the full 2/3/4 × regular/compact sweep** — 4 players at each
  breakpoint (the densest, most bench-loaded case), since gate verdicts
  are advisory-only (ADR-0029) and the frontend M6 pass already covered
  the full sweep during implementation. User call.
- 2026-09-06 — **Fix all 7 accidental design-gate findings now, in this
  task** — rather than deferring to a follow-up issue (the CAM-26/CAM-27
  precedent), given the findings were small and precisely located by the
  gate, and one (compact opponent-hand spacing) had real gameplay
  consequence in a hidden-information memory game. User call.
- 2026-09-07 — **Review F1: accept the 5-seat render crash pre-launch** —
  a game persisted under the old 2–5 rule would crash the screen
  (`benchAssignment` throws, no error boundary); accepted and recorded in
  ADR-0036's consequences rather than building a degradation nobody
  needs before launch. User call.
- 2026-09-07 — **Review F2: fix the flight-anchor displacement
  structurally, not by documenting it** — the arc offset moved from the
  card visual to the slot anchor (`position: relative` + offset — layout,
  not a transform, so ADR-0035/0036's ban doesn't apply; anchor and card
  move together). Rendered-verified: 0.0px anchor/visual delta at 12
  cards. My recommendation, user call.
- 2026-09-07 — **Review F9: name-and-pin, don't mint** — the
  raster-measured values (arc offsets, bench insets, CTA offset, dock
  nudge) are documented as "art-registration constants" in tokens.md
  with derivation pins in tests, rather than forced into `@theme` tokens
  they don't belong in. My recommendation, user call.
- 2026-09-07 — **ADR-0028 routing deviation recorded (review F5)** — the
  `cambio-rules` skill amendment was committed on `main` (9dc922d)
  although the ADR's guard rail names that file as release-side-diverged
  (must not edit on `main`). Outcome verified fine (merge-down clean,
  release-v0 copy correct); the plan docs that taught the misreading are
  corrected. **Standing rule for future tasks: diff a harness file
  against the release branch BEFORE routing its edit — release-side
  wins for diverged files.**

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

_(filled by `/review`, 2026-09-07)_

**Verdict: fix-then-ship.** All 12 contract clauses verdict **satisfied**
(rendered-only halves of 7 and 9 verified via the documented rendered
evidence, per ADR-0030). Zero hidden-information exposure (zero contracts
and zero api changes in the diff, confirmed twice). Import boundaries,
domain purity, typed errors, ADR-0027/0030/0034/0035 conformance all
clean. Independent verification: full gate exit 0, then a **forced
zero-cache test run** — 680 tests green across 10 packages (domain 194,
application 86, api 118 against live Postgres, web 230, ui 25,
contracts 11, config 16). The findings below block shipping only because
this repo does not ship false doc claims; none is a contract violation.

### Findings (rank-ordered; fix cycle loads from here)

- **F1 (behavior, user call needed).** `benchAssignment` **throws during
  render** for any seat count ≥ 5 (`table-geometry.ts:84–91`, called from
  `table-surface.tsx:115` and `game-screen.tsx:339`; no error boundary in
  `apps/web`). The domain cap gates creation/joins only — a game
  persisted under release-v0's 2–5 rule stays engine-valid and `viewFor`
  projects all five seats, so opening it now takes down the screen: a
  projection renderer refusing data the server considers valid
  (frontend-architecture rule). The throw was planned ("degrade
  honestly") and is test-pinned, so this is a decision, not a bug:
  either (a) record the accepted consequence explicitly in ADR-0036
  (+ optionally verify no live 5-player rows exist), or (b) add a
  layout-only degradation (5th seat falls back to the compact flat row
  or `bottom`). RESOLUTION (2026-09-07): **RESOLVED — accepted** (user call, pre-launch): consequence recorded in ADR-0036 ("Accepted consequence" bullet); no degradation built; the throw and its pin stand.
- **F2 (behavior consequence undocumented).** The side-bench arc fix
  (`SIDE_BENCH_MARGIN_CLASS`, `hand.tsx:170–224`) moves the painted card
  visual up to **~57px off its own flight anchor** (doubled margin,
  halved by the flex-centered anchor). The flight layer measures and
  highlights the **anchor** (`flight-layer.tsx:196–205`, `:245`), so a
  penalty/give card flying into a middle slot of a left/right bench
  lands ~57px from where the resting card draws. Canon (`hand.md` r4)
  documents only the **orientation** artifact (upright clone → rotated
  card), not this displacement; ADR-0036 §5's "anchors stay where the
  card is" rationale is silently weakened. Fix: document the
  displacement as an accepted artifact in `hand.md` + an ADR-0036
  amendment note, or bound/redesign the offset mechanism. RESOLUTION (2026-09-07): **RESOLVED — fixed structurally** (the stronger branch): arc offsets moved to the slot anchors as `position: relative` offsets (`SIDE_BENCH_ARC_CLASS`, true fitted values); rendered probe measured 0.0px anchor/visual delta on all 12 slots of a live left-bench 12-card hand. Canon: hand.md r5; ADR-0036 §5 amended; jsdom pins added for both benches.
- **F3 (false claim + missing re-measure).** The acceptance box above
  claims clause 7's rendered numbers were re-verified
  "post-creation-gate **and post-fix-pass**"; the coverage row's latest
  12-card measurement is **pre-fix-pass** (creation-gate follow-up), and
  the fix pass changed exactly that geometry (arc margins) then
  re-measured only a 4-card hand. Compounding: a 12-card rotated hand
  uses the **6-row margin table, which is extrapolated from a two-point
  fit and never rendered-verified** (disclosed in `hand.tsx:150–154` and
  `hand.md` r4). Fix: re-measure the 12-card side-bench case rendered
  (validating the extrapolation), update the coverage row, then the
  claim becomes true; or amend the claim. Sweep both phrasings
  ("post-fix-pass", "re-verified") across root + frontend plans.
  RESOLUTION (2026-09-07): **RESOLVED — test strengthened + claim now true**: the fix-cycle rendered probe re-measured the 12-card left-bench case post-arc-fix (0.0px delta, 20.1px cluster clearance, crescent sweep verified), which also rendered-verifies the 6-row table (5-row stays formula-generated, disclosed in tokens.md); the acceptance box and frontend coverage row 7 now carry the fresh numbers. Sweep run ("post-fix-pass"/"re-verified" across both plans): remaining hits are historical Progress records or this finding's own text.
- **F4 (false enforcement claim, two instances + sweep).** The
  `BENCH_INSET_PCT` "drift guard" is a tautology:
  `table-geometry.test.ts:20` asserts the constant equals its own
  definition, so changing the art proportions leaves the suite green
  while the hardcoded `8.5%`/`91.5%` literals in
  `table-surface.tsx:81–84` go stale. Both the source docstring
  (`table-surface.tsx:76–79`) and the frontend plan (`frontend/CAM-20.md`
  "pins `BENCH_INSET_PCT` (41.5)…") advertise a protection that does not
  exist. Fix: make the guard real — assert the class strings contain
  `${50 - BENCH_INSET_PCT}%` and `${50 + BENCH_INSET_PCT}%` — and sweep
  every statement of the claim. RESOLUTION (2026-09-07): **RESOLVED — test strengthened**: `table-geometry.test.ts` now asserts the `BENCH_POSITION_CLASS` literals contain `50 ∓ BENCH_INSET_PCT` verbatim (mutant: changing `SEAT_RING_GAP_PCT` or the art fraction now fails the suite); both claim instances amended (table-surface.tsx docstring, frontend plan M3 surprise). Sweep confirmed no further instances.
- **F5 (process deviation + stale claims).** The `cambio-rules` skill
  amendment was committed on `main` (9dc922d) although **ADR-0028's
  guard rail names that exact file as release-side-diverged and
  must-not-edit-on-main**. Outcome verified fine — the merge-down
  resolved cleanly and release-v0's copy carries both the amendment and
  the release-side content, so the PR target is correct — but the
  mis-routing originated in this plan's own docs (clause 12's "lands on
  `main` per ADR-0028", backend step 6) and must be corrected so no
  future task inherits it. Also stale: backend coverage row 12 still
  says the amendment is "not yet done" (it is, on `main` +
  `development` + `release-v0`; absent from this branch only by
  branch-point ordering). Fix: amend clause 12 + backend step 6 with an
  inline correction note, update the coverage row, log the deviation in
  the Decision Log. RESOLUTION (2026-09-07): **RESOLVED — claims amended everywhere** (clause 12, backend Context + step 6, backend coverage row 12) + deviation and standing rule recorded in the Decision Log. The `main` commit stands (merge-down verified clean; no history rewrite).
- **F6 (contract text contradicted).** Clause 10 says compact is
  "unchanged except for the hand's internal row-major layout", but the
  (user-authorized, Decision-Logged) fix pass changed compact beyond
  hand internals: opponents-row gaps (`table-surface.tsx:198`), the
  deck badge inset (`draw-deck.tsx:96`), and
  `--size-table-art-compact` 128→158px. Same "revised, not
  contradicted" discipline the clause imposes on canon: add an inline
  amendment note at clause 10. RESOLUTION (2026-09-07): **RESOLVED — claim amended** (inline amendment at clause 10 citing the Decision-Logged user call; core of the clause — CAM-21 composition + pins survive — reaffirmed).
- **F7 (coverage-table staleness, frontend).** Row 12 names
  table-surface.md **v5** / hand.md **v3** (actual: v6 / v4); the three
  fix-pass tests (`game-screen.test.tsx:2068`, `:2090`, `:2114`) have no
  rows; row 10 omits the fix-pass compact changes. RESOLUTION (2026-09-07): **RESOLVED — rows updated**: row 12 cites v6/v5 with the revision chain; row 7 carries the post-fix-cycle measurement; the fix-pass and fix-cycle pins are recorded in the frontend Progress entry (clause-keyed table; the extra pins ride their clauses' rows).
- **F8 (coverage gaps, backend).** (a) Clause 4's START_HELPER
  ("2–4 players", `use-room.ts:47`) is asserted by no test — the clause
  names three copy surfaces, two are pinned. (b) The new 5-player
  invariant probe asserts only `not.toStrictEqual([])` — any violation
  passes; asserting the message contains "outside 2–4" pins the actual
  bound. (c) Nothing pins that `playerCountFor` reaches 4 (a narrowing
  to 2–3 keeps every suite green). Fix: strengthen all three
  (prefer strengthening tests over weakening claims). RESOLUTION (2026-09-07): **RESOLVED — all three tests strengthened**: (a) the BadPlayerCount room test also asserts the "2–4 players" start helper; (b) both invariant probes assert the message contains "outside 2–4" (mutant: an unrelated violation no longer passes the pin); (c) a new pin fixes `playerCountFor`'s image over 0–6 at exactly {2,3,4} (mutant: `2+(i%2)` now fails). No claim weakened.
- **F9 (token discipline, user call on depth).** 15 new off-scale pixel
  literals ship as arbitrary-value utilities backed by no token and
  named in no design-system file: the `SIDE_BENCH_MARGIN_CLASS` table
  (46–130px, `hand.tsx:185–221`), the Call Cambio
  `left-[calc(50%+324px)]` (`game-screen.tsx:913`), the dock's −4px
  nudge, and the `8.5%`/`91.5%` bench insets. Contrast: the same diff
  minted `card-frame-rotated` and the 158px art cap correctly (styles.css
  - tokens.md + gate interview). The 324px is additionally a
    hand-evaluated derivation of three live constants (`ROW_WIDTH`,
    card-lg width, gap) with nothing pinning the arithmetic. Fix options:
    document the value families in tokens.md/canon (measured-against-art
    values arguably can't be @theme tokens, but canon must name them), and
    pin 324's derivation in a test. RESOLUTION (2026-09-07): **RESOLVED — name-and-pin** (user call): tokens.md gains the "art-registration constants" family (arc offsets, bench insets, CTA offset, dock nudge, each with derivation/provenance); the 324px is pinned as a computation from the exported `ROW_WIDTH` in `game-screen.test.tsx` (mutant: changing ROW_WIDTH fails the pin); the bench insets are pinned by F4's lockstep guard. No @theme tokens minted — raster-registration values are named canon, not spacing-scale members.
- **F10 (stale prose/comment sweep).** (a) `packages/ui/src/styles.css:274`
  "five opponent hands" (file touched by this diff); (b) HANDOFF §4.1
  "acceptable at a 5-player maximum" and the out-of-scope "more than 5
  players" (self-flagged in backend Surprises, left by scope);
  (c) `game-screen.tsx:696–701` justifies gap-1 against the superseded
  128px art cap; (d) "table-surface.md v5" citations in
  `table-geometry.ts:2` and `table-geometry.test.ts:11`; (e) gallery
  label "populated (own, 2×2)" now renders one row of four
  (`gallery/game.tsx:138`); (f) `table-surface.tsx:66–71` claims the
  dock "reuses the exact same bottom entry instead of hand-copying a
  translate" — true for position, false for the (deliberately) diverged
  translate; (g) frontend plan's "CAM-21 restorations were **pinned**
  THERE" — they were documented invariants, no such test existed
  (verified against release-v0); (h) the vacuous `24 > 4`
  literal assertion (`game-screen.test.tsx:2147–2149`) overstated in the
  plan as "the two underlying constants". RESOLUTION (2026-09-07): **RESOLVED — swept**: (a) styles.css comment now says "up to three opponent hands (2–4 cap)"; (b) HANDOFF §4.1 + out-of-scope amended with ADR-0036 notes; (c) deck-gap comment re-derived against the 158px cap; (d) v6 citations fixed in table-geometry.ts/.test.ts; (e) gallery label now "one row of 4"; (f) table-surface reuse comment states the deliberate translate divergence; (g) frontend plan wording corrected to "documented invariants"; (h) the vacuous 24>4 assertion removed, comment explains why the class assertions are the pin.
- **F11 (ADR drift).** ADR-0036 §5 says "upright anchor boxes **sized to
  the rotated footprint**"; as-built (post creation-gate) the anchor
  keeps upright `card-frame` and only the visual takes
  `card-frame-rotated`. Recorded in `hand.md` r3 but the ADR was never
  amended. Fix: amendment note in ADR-0036. RESOLUTION (2026-09-07): **RESOLVED — ADR amended**: ADR-0036 §5 carries an as-built amendment blockquote (anchor stays upright `card-frame`, visual takes `card-frame-rotated`; offsets-are-not-transforms clarification from F2's fix).
- **F12 (advisory, no fix required to ship).** (a) `max-w-4xl` rides
  Tailwind's undocumented-in-tokens.md container namespace (precedent:
  `max-w-2xl`); (b) no jsdom pin that **opponent** seat wrappers carry
  `BENCH_POSITION_CLASS` (only the own-seat wrapper is pinned);
  (c) no gallery showcase for the `rotate` hand variant (logged scope
  note); (d) `.agents/scripts/fill-coverage-row.mjs` corrupts 3-column
  coverage tables (backend Surprises) — filed as CAM-28.
  RESOLUTION (2026-09-07): advisory — (b) CLOSED anyway (opponent-wrapper
  bench-class pin added in the fix cycle); (a) and (c) accepted as-is
  (max-w-2xl precedent; gallery rotate showcase stays a logged scope
  note); (d) owned by CAM-28.

### What was run

- `pnpm turbo build typecheck lint test` — exit 0 (25/25; 18 cached).
- `pnpm turbo test --force` — exit 0, **zero cache**, 680/680 tests.
- Four read-only reviewers (contract + architecture × backend/frontend);
  every load-bearing finding re-verified by the adjudicator against
  source before being recorded here (three reviewer claims were
  corrected during adjudication: the skill amendment IS on the merge
  target; `BENCH_ANCHOR_CLASS` HAS a production consumer at
  `table-surface.tsx:139`; the dock translate divergence is deliberate
  and pinned).
- No timing/concurrency claims arose (layout + constants only), so no
  timing probe was required this cycle.
