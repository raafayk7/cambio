# CAM-21 — Compact game screen must fit the fold — dock chrome and own hand

- **Linear:** [CAM-21](https://linear.app/raafayk7/issue/CAM-21/compact-game-screen-must-fit-the-fold-dock-chrome-and-own-hand)
- **Scope:** frontend
- **Child plans:** [frontend](../frontend/CAM-21.md)
- **ADRs:** 0035 (compact fit via token CSS sizing; no transform scale
  above the flight root)

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

On a phone (compact, <720px), the game screen currently renders as a
document ~1.6–1.8× taller than the viewport: while you look at your own
hand, the turn indicator, slam timer, and action buttons are scrolled
off-screen, so the 5s slam window drains invisibly (top playtest finding,
2026-09-06). After this task, the whole default game state fits one
viewport height at compact: turn indicator + slam timer + inline
messages pinned at the top, your own hand + every action affordance
docked at the bottom (thumb-reachable, safe-area aware), and the table
with opponents fitted between. Observe it working by loading
`/game/<id>` in a 360×640 viewport: no page scroll in the default state,
chrome visible while touching your cards.

## Context & orientation

> Line numbers below are pre-task (`HEAD 8f865e1`) — the M2/M3
> restructure (Progress) rewired `game-screen.tsx` and
> `table-surface.tsx` extensively, so these citations describe what
> existed BEFORE this task, not current line positions. The as-built
> shape is described in Progress and the frontend plan's Progress;
> reconcile against the file, not these numbers.

- **Screen composition** lives in
  `apps/web/src/containers/game/game-screen.tsx`. `GameTable`'s render is
  one flex column (`:576`): TurnIndicator → SlamTimer → slam prompts →
  Call Cambio → Keep/Discard → error/fizzle messages → the table root
  (`:663`, wrapping `TableSurface` + `FlightLayer` + the game-over
  ScoreSheet overlay). Only two `regular:`-prefixed sites exist: the
  positioned-ancestor root (`:576`) and the Call Cambio dock (`:635`,
  whose comment records CAM-18's "compact keeps it in flow" decision —
  reversed by this task, see Decision Log).
- **TableSurface already has a compact branch**
  (`apps/web/src/components/game/table-surface.tsx:106–157`): below
  `regular` it is a flex column — opponents in a wrapping row on top,
  the painted art block (`w-3/4`, height ≈ 0.75× surface width), the
  viewer's seat last. The canon composition is half-built: opponents
  along the top ✅, own seat last ✅ — but "docks to the screen bottom"
  is false; it docks to the bottom of an overflowing document. The room
  screen (`room-screen.tsx:147–161`) shares this compact column and is
  out of scope — it must not regress.
- **Flight layer** (ADR-0034,
  `apps/web/src/components/game/flight/flight-layer.tsx:195–217`)
  measures flights as rect deltas against the `tableRoot` element
  (`game-screen.tsx:663`). Anchors outside that root make flights
  silently cancel (`:198–200`); `transform: scale` on an ancestor of it
  corrupts coordinates at s² — hence ADR-0035.
- **AppShell** (`packages/ui/src/components/app-shell.tsx:86,117`) is
  `min-h-dvh` (the repo's only viewport unit) with no overflow
  discipline in `<main>`; safe-area insets are padding on the shell root
  (`packages/ui/src/styles.css:385–390`), so an in-shell bottom dock
  inherits the bottom inset for free.
- **Card footprints are tokens**: `card-lg` 96px / `card-md` 64px /
  `card-sm` 32px, all reading a `--card-width` custom property
  (`packages/ui/src/styles.css:224–237`). The compact fit extends this
  token layer (gate-approved, interview 2026-09-06).
- **Canon to revise** (as-built revisions, same commit discipline as
  CAM-18's r3s): `table-surface.md` (compact state becomes the docked
  composition), `app-shell.md` (dock reserves the bottom — realized),
  `turn-indicator.md` (r1 said "above own hand on compact"; user call:
  top), `slam-timer.md` (r1 said "table-center"; as-built and user call:
  top band with the indicator).
- Governing skills: `frontend-architecture`, `design-system`,
  `hidden-information` (no payload changes are made — pure layout),
  ADR-0027 (tokens), ADR-0030 (jsdom tests assert structure, not
  geometry), ADR-0034 (flights), ADR-0035 (this task).

## Functional contract

All clauses apply at compact (<720px) only; regular (≥720px) rendering
must be unchanged (clause 10). "Chrome" = turn indicator, slam timer,
inline command-error/fizzle/beat messages. "Dock" = the viewer's own
hand plus every action affordance: Call Cambio, Keep/Discard, and the
slam give prompts ("Ready a give" / give-pick prompt).

1. **Fold fit.** At 360×640 (and any larger compact viewport), the
   default in-game state at 2–5 players produces no page-level vertical
   scroll: top chrome, table region, and dock are all within one
   viewport height. (Verified rendered, per ADR-0030's routing of
   geometry claims to the design-gate rendered path.)
2. **Top chrome pinned.** The turn indicator renders in a pinned top
   band; when a slam window is open, the slam timer renders there with
   it; command errors, fizzle, and beat messages render there too. None
   of these can leave the viewport while the game screen is mounted.
3. **Bottom dock pinned.** The viewer's own hand and all action
   affordances render in a bottom dock that cannot leave the viewport.
   The dock clears the home-bar safe area (bottom `env()` inset).
4. **Middle region fits or scrolls alone.** The opponents + table art +
   center cluster occupies the space between chrome and dock. At the
   360×640 floor and above it fits without scrolling (via the compact
   card scale and art-height cap); below the floor, overflow scrolls
   _inside_ the middle region only — chrome and dock stay pinned.
5. **Flights keep working.** Card flights to and from the viewer's
   docked hand slots still run: every slot anchor (own and opponent)
   remains inside the element passed as `FlightLayer`'s `root`. Penalty
   cards arriving in the viewer's hand are visible events because the
   hand is always on-screen (this closes the CAM-21 half of the
   slam-legibility finding; the existing arrival animation — pinned by
   `game-screen.test.tsx`'s flight-anchor suites — is unchanged).
6. **No transform scaling.** No `transform: scale` exists on any
   ancestor of the flight root (ADR-0035); fit comes from token-driven
   CSS sizes.
7. **Game-over intact.** The ended state still renders the ScoreSheet
   overlay above the dimmed table (as pinned by
   `game-screen.test.tsx:1648`'s seat→`data-state="game-over"` walk),
   and the whole game-over composition respects clauses 1–3.
8. **Hidden information untouched.** No contracts/payload change of any
   kind; the task moves and sizes already-entitled renderings only.
9. **Room screen unaffected.** The room screen's seating-state
   TableSurface rendering (compact and regular) is visually unchanged.
10. **Regular untouched.** At ≥720px the game screen's composition,
    classes, and geometry are unchanged (CAM-20 owns regular tuning).
11. **Token discipline.** Every new visual value (dock heights, compact
    card scale, art cap, spacing) maps to a token or scale step —
    no arbitrary values (the bare spacing multiplier is disabled,
    `packages/ui/src/styles.css:99`, so this is partly mechanical).

### Acceptance criteria

- [x] Rendered verification at 360×640 via the design-gate render path
      (`--width 360 --height 640`) at 2, 3, 4, and 5 players: no page
      scroll in default state; chrome and dock visible simultaneously
      (clauses 1–4). **Amended at M5 (user decision, mid-implementation,
      see Decision Log):** 2–4 players fit the full default state
      (table + chrome + dock) with no scrolling at all; 5 players keeps
      chrome and dock pinned/visible per clause 3, but reaching the
      table's deck/discard needs one scroll gesture inside the middle
      region — the fallback clause 4 already sanctioned for
      below-360×640 viewports, now also covering the one player count
      four full-width opponent groups can't fit on a single 360px line.
- [x] Rendered verification that regular (1280×900) output is unchanged
      (clause 10) and the room screen is unchanged (clause 9).
- [x] jsdom suites green, including structural assertions the child plan
      adds for the dock/chrome regions (ADR-0030 scope: structure, not
      pixels).
- [x] Design-gate run on the new compact composition (advisory verdict,
      surfaced not auto-resolved). Verdict: flagged, 0 blocking —
      12 default-tier calls (4 accidental, cheap/local fixes; 8
      controlled or advisory-only). See the Surprises entry and the
      full report shared with the user 2026-09-06.
- [x] Canon revision notes landed in `table-surface.md`, `app-shell.md`,
      `turn-indicator.md`, `slam-timer.md`.
- [ ] The quality gate passes: `pnpm turbo build typecheck lint test`
      (run bare, never piped).

## Plan of work

No contracts freeze is needed — this task never touches `contracts`
(clause 8); it is a single frontend lane.

- **M1 — Tokens and canon prep.** Extend the token layer with the
  gate-approved compact card scale (and any dock/art-cap values that
  need scale steps) in `packages/ui/src/styles.css`, mirroring
  `tokens.md`. Smallest possible surface: the card `@utility` blocks
  already read `--card-width`.
- **M2 — Screen restructure.** Rebuild `GameTable`'s compact
  composition in `game-screen.tsx`: dvh-bounded stage at the screen
  wrapper (not AppShell — lobby/room must not inherit it), pinned top
  chrome band, bottom dock (hand + all actions), middle region between.
  Constraint, not mechanism: every flight anchor stays inside the
  element passed as `FlightLayer`'s `root` (clause 5) — the child plan
  satisfies this by keeping the own-hand row inside the existing flight
  root (below its scroll wrapper), so no root hoist is needed; hoisting
  is the recorded fallback. Regular rendering preserved via the
  existing `regular:` idiom.
- **M3 — TableSurface compact adjustments.** The middle region's
  internals: opponents' arc/wrap, art-height cap, center cluster; fix
  the latent compact-scrim bug (`table-surface.tsx:151` positions
  against the wrong ancestor at compact) as part of the restructure.
  Room screen visually unchanged.
- **M4 — Tests.** Structural jsdom assertions for dock/chrome presence
  and flight-anchor containment; keep `game-screen.test.tsx:1648` (or
  adapt it knowingly).
- **M5 — Rendered pass + canon.** Fresh dev servers (per the AGENTS.md
  stale-transform rule), rendered runs at 360×640 × 2–5 players and
  1280×900 regression, design-gate run, canon revision notes, plan
  updates.

## Validation

- Rendered: the design-gate render script against a live authenticated
  game (`.agents/scripts/design-gate/render.js --url
http://localhost:3100/game/<id> --cookie ... --width 360 --height
640`), repeated per player count; screenshots archived with the gate
  run. Regular and room-screen regression shots at 1280×900.
- jsdom: new structural tests per the child plan's coverage table;
  existing `game-screen.test.tsx` (1705 lines) stays green — it asserts
  behavior via roles/anchors, not layout, so survivors are expected
  except the two flagged sites (child plan carries them).
- The full gate: `pnpm turbo build typecheck lint test`.

## Progress

_(updated continuously; append new entries at the BOTTOM — newest last;
timestamp each entry)_

- [x] 2026-09-06 — M1–M4 implemented (tokens, screen restructure,
      TableSurface adjustments, tests) — see the frontend child plan's
      Progress for the file-level detail. Full gate green throughout.
- [x] 2026-09-06 — M5 rendered pass complete: 2–4 players fit the
      360×640 floor exactly by default; 5 players uses the sanctioned
      middle-scroll fallback (amended acceptance criterion above).
      Regular and room screen confirmed unchanged, rendered and jsdom.
      Canon revisions landed. See the Decision Log for the mid-task
      redirect this required.

## Decision log

- 2026-09-06 — Compact verified at 2–5 players in this task; CAM-20
  stays a purely regular-width tuning pass — user call, interview r1.
- 2026-09-06 — The dock itself is the fix for invisible penalty
  arrivals; no new arrival affordance — user call, interview r1.
- 2026-09-06 — Fit floor 360×640; below it only the middle region
  scrolls — user call, interview r1.
- 2026-09-06 — Regular (≥720px) strictly untouched — user call,
  interview r1.
- 2026-09-06 — Turn indicator pins TOP at compact, revising
  turn-indicator.md r1's "above own hand on compact" — user call,
  interview r2.
- 2026-09-06 — Slam timer pins in the top band with the indicator,
  revising slam-timer.md's "table-center" anatomy line to match
  as-built + this call — user call, interview r2.
- 2026-09-06 — Dock carries hand + ALL action affordances, explicitly
  reversing CAM-18's logged "compact keeps Call Cambio in flow"
  decision (justified by the playtest finding) — user call, interview
  r2.
- 2026-09-06 — Fit mechanism is a gate-approved compact card-scale
  token extension + art-height cap; the user's selection of this option
  is the creation-gate approval — user call, interview r2; promoted to
  ADR-0035 for the no-transform constraint.
- 2026-09-06 — dvh/overflow boundary lives at the game-screen wrapper,
  not AppShell, so lobby/room keep the document-flow shell — planning
  call from explorer finding (g).
- 2026-09-06 (M5, mid-implementation) — The initially-planned fold
  mechanism (art cap 160px, card-lg 64px, card-md 32px) did not close
  the fold budget at ANY player count when actually rendered — user was
  consulted with the measured numbers and screenshots. Two directions
  were raised and set aside: capping the game at 4 players (a real rule
  change with no full backend enforcement possible from the frontend
  alone — see the exchange for the concrete tradeoffs) and a table
  redesign (enlarged table, straight-row bench placement) — both
  deferred to CAM-20, which already owns table geometry / regular-width
  tuning; re-litigating CAM-20's scope belongs to that task's own
  `/plan` pass, not a mid-CAM-21 detour. **User decision: ship a
  same-scope compact fix now.** The actual root cause (opponent
  seat+hand orientation leaking the regular-mode radial side into
  compact's flat wrap, `game-screen.tsx`'s `SeatWithHand`) was found and
  fixed — forcing every opponent to the narrow column form at compact
  closes the budget for 2–4 players; 5 players falls back to the
  already-sanctioned middle-region scroll (clause 4). Full numbers and
  screenshots are in the frontend plan's Surprises.
- 2026-09-06 (M5) — Design-gate run (decompose → map → judge) against
  the 3-player compact composition at 360×640: verdict **flagged, 0
  blocking**. No constraint violation (contrast, touch-target floor,
  slop convergence all clear) and no templated-design signal (a full
  18-marker negative sweep, one uncontested medium marker). Four
  **accidental** default-tier calls, all local to the compact layout
  and cheap to fix: the deck/discard center group overhangs the
  painted tabletop disc by ~5.5px (disc-fraction vs content-width
  mismatch at the new 128px art cap); the pinned top/bottom bands sit
  at zero vertical padding, clipping the Call Cambio button's elevation
  shadow; a 53.5px un-tokened void sits between the table and the own
  hand (likely flex residue, not a decision); the discard's rank/pip
  render at 9.6px/8.32px, under the type scale's 12px floor. Eight
  further calls were **controlled** (the flat 15px type tier, the
  four-benches-for-three-seats scenery, seat-pill uniformity, the
  count-badge overlap, the connection dot) or advisory-only (the
  already-known 32px touch-target tension, one avatar's 3.67:1
  aria-hidden initial). None fixed as part of this task — surfaced to
  the user per ADR-0029 (advisory until Carbonteq's labeling lands);
  left for `/review` or a follow-up to triage.
- 2026-09-06 (M5) — the game-over full-region rest needed its own copy
  on the extracted own seat (not a share of TableSurface's), since
  `viewerSeat="external"` moved that seat outside TableSurface's square
  root at every breakpoint, not just compact — see frontend plan
  Surprises for the fix and the positioning bug the first attempt at it
  introduced (caught and corrected before landing).

## Surprises & discoveries

- Planning: TableSurface already implements half the canon compact
  composition as document flow (`table-surface.tsx:106–157`) — the task
  is viewport-bounding it, not inventing it.
- Planning: latent compact bug — the game-over full-region rest
  (`table-surface.tsx:151–154`) is `absolute` while its root is only
  `regular:relative`, so at compact it positions against the screen's
  table root instead; must be fixed by the restructure (contract
  clause 7).

## Outcomes & retrospective

_(filled at the end, typically by `/review`)_
