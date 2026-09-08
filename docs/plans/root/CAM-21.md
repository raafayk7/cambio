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
      **Second amendment (review fix cycle, 2026-09-06):** the "2–4
      players fit" half is NAME-WIDTH-SENSITIVE and was over-claimed: a
      4-player table whose seat pills carry ~6-character names wraps
      the opponent row and engages the same sanctioned middle-scroll
      (probed at 110px overflow, identical PRE- and POST-fix-cycle — a
      pre-existing over-claim, not a fix regression; 2–3 players fit
      outright with these names). The name-independent guarantees,
      probed at every count: zero page-level scroll, chrome and dock
      pinned, overflow confined to the middle region's own scroll.
- [x] Rendered verification that regular (1280×900) output is unchanged
      (clause 10) and the room screen is unchanged (clause 9).
- [x] jsdom suites green, including structural assertions the child plan
      adds for the dock/chrome regions (ADR-0030 scope: structure, not
      pixels).
- [x] Design-gate run on the new compact composition (advisory verdict,
      surfaced not auto-resolved). Verdict: flagged, 0 blocking —
      12 default-tier calls (4 accidental, cheap/local fixes; 8
      controlled or advisory-only). See the Surprises entry and the
      full report shared with the user 2026-09-06. **The 4 accidental
      findings were fixed** on user request (same day) — see the
      follow-up Decision Log entry.
- [x] Canon revision notes landed in `table-surface.md`, `app-shell.md`,
      `turn-indicator.md`, `slam-timer.md`.
- [x] The quality gate passes: `pnpm turbo build typecheck lint test`
      (run bare, never piped; exit 0 verified at review and again at
      the fix cycle, with forced fresh web/ui/api runs).

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

- Rendered: the design-gate render script
  (`.agents/scripts/design-gate/render.js`) against a live authenticated
  game — pass the game URL, session cookie, and `--width 360 --height 640`
  — repeated per player count; screenshots archived with the gate run.
  Regular and room-screen regression shots at 1280×900.
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
      _(Correction, review F6: the 4p fit does not generalize — it is
      name-width-sensitive; see the criterion's second amendment.)_
      Regular and room screen confirmed unchanged, rendered and jsdom.
      _(Correction, review F1: the room-screen half of this entry was
      false as written — the rendered room captures were taken but the
      128px art cap and gap-2 had leaked into the room screen at
      compact; the review probed the room art at 128px. Fixed in the
      fix cycle by scoping both values to `viewerSeat="external"`.)_
      Canon revisions landed. See the Decision Log for the mid-task
      redirect this required.
- [x] 2026-09-06 — Design-gate's 4 accidental default-tier findings
      fixed (user request, post-gate): the discard rank/pip type floor,
      the deck/discard center gap (disc overhang), the pinned-band
      vertical padding (CTA shadow clip), and the un-tokened void
      (partially reclaimed, remainder documented as intentional). Full
      gate green; 2–4p fit re-verified byte-for-byte (scrollContentH ==
      scrollClientH); regular re-rendered and confirmed unchanged in
      layout. See Decision Log for the specific values and trade-offs.
      _(Correction, review F6: the 4p half of that re-verification does
      not generalize — it is name-width-sensitive; see the amended
      acceptance criterion.)_
- [x] 2026-09-06 (review fix cycle) — F1–F4 fixed, F5 cheap items done
      (see the retrospective's RESOLVED markers for each branch taken):
      art cap + root gap scoped to `viewerSeat="external"` (room screen
      restored, probed 234px art); own-seat rest gated compact-only
      (regular game-over probed `display:none`, single-dim); five
      strengthened/new jsdom assertions (68 tests); canon amendments +
      version bumps across five design-system files; ADR-0035 owned-edge
      note + widened guard; class restorations at regular. Full gate
      green (one CPU-contention flake in `@cambio/config` on the forced
      all-parallel run, green in isolation and on re-run). Rendered
      re-probe at 2/3/4/5 players + room + game-over both breakpoints;
      F6 (4p name-sensitivity) found, isolated pre/post-fix by stash,
      resolved by claim amendment.

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
- 2026-09-06 — User requested the 4 accidental design-gate findings be
  fixed before `/review`. Fixed all 4, each chosen to spend zero of the
  fold budget the M5 tuning cascade had already spent down to exactly
  zero slack for 2–4 players: (1) `card-rank`/`card-pip` floored at
  `--text-xs` (12px) via `max()` — a pure legibility fix, applies at
  both breakpoints since `card-sm` is 32px everywhere (a deliberate,
  narrow exception to "regular untouched," which governs layout, not
  incidental type-floor bugs). (2) The deck/discard center gap dropped
  compact-only from `gap-4` (16px) to `gap-1` (4px), closing the ~5.5px
  overhang onto the bench art at the 128px art cap — a horizontal-only
  change, zero cost to the vertical fold budget. (3) The screen
  wrapper's compact padding raised `py-0`→`py-2` (16px), fixing the
  Call-Cambio shadow clip — paid for by reclaiming 16px of the ~53.5px
  slack the scroll region's `flex-1` was leaving unclaimed at 2–4
  players (verified: `scrollContentH` still equals `scrollClientH`
  exactly post-fix, i.e. still zero overflow). (4) The remaining ~37.5px
  of that slack was left as-is and documented in a code comment as
  intentional grouping space (shared table vs. the viewer's own zone) —
  a full flex restructure to eliminate it was judged not worth the risk
  this late against the fold budget. Did NOT touch the 8 controlled/
  advisory-only findings (flat type tier, four-benches scenery, seat-
  pill ring ambiguity, badge overlap, connection dot, the pre-existing
  32px touch-target tension, one avatar's aria-hidden contrast) — those
  read as legitimate design choices or were already-known, separately-
  tracked tensions, not bugs to fix reflexively.

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

_(review pass, 2026-09-06 — verdict: **fix-then-ship**)_

### What passed (independently verified, not from the plan's claims)

- Full gate green (exit 0); forced fresh runs: `@cambio/web` 212/212
  (67 in `game-screen.test.tsx` incl. the 8 new structural tests),
  `@cambio/ui`, `@cambio/api` 118/118 against live Postgres.
- Live rendered probes against a fresh 3p and 5p game (playwright,
  live api): 3p compact 360×640 — page overflow **0**, chrome pinned
  (8–51px), dock pinned (588–632px), all 14 anchors inside the flight
  root, no transformed ancestor. 5p compact — page overflow 0,
  middle-region-only scroll (110px), chrome/dock rects byte-identical
  before/after driving `scrollTop`. Clauses 1–6 hold live.
- Baseline comparison via a `release-v0` worktree served on the same
  origin: pre-change compact overflow was 490px (3p) / 727px (5p) —
  the premise was real; post-change 0. Regular 5p at 1280×900:
  `scrollHeight` 918px on BOTH branches — the 18px page overflow there
  is pre-existing, not a clause-10 regression.
- Hidden information (clause 8): diff scope clean — zero edits under
  `packages/contracts`, `apps/api`, realtime, or projections; no new
  state, no storage, no `useEffect` added.
- Token discipline (clause 11): all new values are scale steps or named
  tokens; no arbitrary-value utilities; the one new inline `style` is
  the sanctioned dynamic `seatArc` percentages.

### Findings (fix cycle works from this list)

**F1 — BLOCKING, clause 9 violated: the room screen visibly changed at
compact.** Two unprefixed changes on TableSurface's shared root reach
the room screen: `max-w-(--size-table-art-compact)` (128px art cap,
`table-surface.tsx`) and root `gap-4`→`gap-2`. Live probe: the room's
seating-state table art renders **128px** wide at 360×640 (pre-change
`w-3/4` ≈ 246px — roughly halved). The "room screen unchanged" claim is
false in every instance; the sweep found: root plan :52–54, :122–123
(clause 9 itself), :145, :187, :218; frontend plan :154, :183, :375,
coverage row 9 (:397), :435; and `table-surface.md` r4 now documents
the cap component-wide — canon and contract clause 9 are in direct
conflict. **Fix requires a user call:** either scope both changes to
the game screen (variant/className), or deliberately amend clause 9 +
every claim instance + canon. **RESOLVED (fix cycle, 2026-09-06;
scoped-to-game-screen branch, user call):** the art cap and root gap
now key off `viewerSeat === "external"` (the docked composition's own
discriminator — one prop, no two-props-must-agree surface) in
`table-surface.tsx`; the default path is byte-for-byte pre-CAM-21.
Probed live post-fix: room art 234px at 360×640 (= `w-3/4` of the
312px padded surface; was 128px). Canon re-aligned (table-surface.md
Anatomy + r4 amendment, tokens.md Shape note); the two false Progress
claims carry inline corrections; the game screen's own fold metrics
re-probed unchanged.

**F2 — clause 10 + 7 violated at regular game-over: the viewer's own
hand is double-dimmed (analysis-confirmed; render to prove).** At
regular the extracted seat (`regular:z-10`, a stacking context trapping
its inner z-20 rest) is painted over by TableSurface's full-region
z-20 rest wherever the seat overlaps the square: combined dim ≈ 0.578
vs pre-change 0.35; the below-square overhang is now dimmed 0.35 vs
pre-change 0. The frontend plan's claim that `v2_gameover_regular.png`
verified this state is contradicted by stacking analysis — the M5 "hard
seam" fix changed the seam's opacities, not removed it. Fix: gate the
extracted-seat rest to compact (or reproduce the exact pre-change
composition: single 35% inside the square, 0 outside), then a rendered
regular game-over check. **RESOLVED (fix cycle, 2026-09-06; gated to
compact):** the extracted-seat rest gained `regular:hidden` (+ a
`data-region="own-seat-rest"` hook) and the misleading comment was
rewritten to state the stacking analysis. Verified against a live
Ended game: at 1280×900 the rest computes `display:none` (surface rest
alone — the pre-change composition, screenshot checked: single square
dim, undimmed overhang, which is the PRE-EXISTING boundary, not this
task's); at 360×640 it renders, page overflow 0. New jsdom pin:
"renders the own-seat game-over rest inside the extracted seat
wrapper, compact-only (review F2)".

**F3 — coverage-table rows overclaim what the tests assert
(doc-claims-X-falsely; close by sweep, not spot-fix).** Verified
against test bodies: row 2 claims the beat message is asserted in the
band — no test asserts it; row 3 claims Call Cambio / Keep/**Discard**
/ the slam prompts — the Discard button is never asserted, the
Keep/Discard test omits the "never the chrome band" half, and the
"Ready a give" prompt is asserted nowhere; row 4 claims the scroll
wrapper "never contains … the dock" — unasserted (only the own-hand
row is); row 7's "dimmed table at both breakpoints" — the cited test
asserts a `data-state` attribute only, and the NEW dim element
(`game-screen.tsx` extracted-seat rest) has no test; row 10's "every
regular-breakpoint class is unprefixed-identical or explicitly
regular:-restored" is false — `flex-1` and `min-h-0` are live
unprefixed flex-item properties on `table-root` at regular (inert in
practice by auto-height analysis, but the stated standard is class
restoration), and the code comment "flex-\* … become inert once display
leaves flex" (`game-screen.tsx` table-root region) is wrong for
exactly those two. Prefer strengthening tests over weakening rows;
amend row 10's claim + the comment. **RESOLVED (fix cycle,
2026-09-06; tests strengthened, one claim amended):** DrawSkipped-beat,
Discard + negative-half, "Ready a give", and dock-outside-scroll
assertions all added (game-screen.test.tsx, 68 tests now); the new
own-seat-rest pin covers row 7's gap. Row 10 took the
strengthen-the-code branch where possible — `regular:flex-initial` /
`regular:min-h-auto` restorations landed on the wrapper, stage, and
table-root — plus a claim amendment for the one legitimate residue
(`regular:contents`-dissolved wrappers have no box for item properties
to act on); the wrong flex-inertness comment is rewritten. Coverage
rows 2/3/4/7/10 updated to match what is actually asserted.

**F4 — canon divergence (ADR-0027: "divergence is a defect").**
(a) `tokens.md:95` and `playing-card.md:16` still say rank/pip "scales
with the card, not the page" — false since the `max(…, --text-xs)`
floor (which also bites `card-sm` at REGULAR: score-sheet minis' pip
8.32→12px, understated in the Decision Log). (b) `version:` frontmatter
not bumped: `app-shell.md` v3≠r4 and `turn-indicator.md` v1≠r2 (both
regressed by this diff), `table-surface.md` v2≠r4, `slam-timer.md`
v1≠r3 (pre-existing staleness). (c) `table-surface.md` r4 omits the
root `gap-4`→`gap-2` change entirely. (d) `table-surface.tsx` header
comment still cites r2. **RESOLVED (fix cycle, 2026-09-06; canon
amended):** (a) tokens.md's type-scale line now records the 12px floor
and its regular `card-sm` bite; playing-card.md gained r3 (and its
Anatomy line the floor) — claim amended rather than behavior reverted,
per the logged user decision behind the floor. (b) version fields
bumped: playing-card 3, table-surface 4, app-shell 4, turn-indicator
2, slam-timer 3. (c) the gap change is documented in the r4 amendment,
scoped per F1. (d) the header comment now cites r4.

**F5 — advisory (not blocking; triage in fix cycle or follow-ups).**
(1) ADR-0035 guard test regex `/(^|\s)scale-/` misses variant-prefixed
(`regular:scale-*`), negative (`-scale-x-*`), and inline-style
transforms — widen. (2) The 5p fallback puts anchors inside an
`overflow-y-auto` region: a scroll during an in-flight card desyncs
FLIP coordinates; not covered by ADR-0035 — add a sentence there or
file a follow-up. (3) `overflow-hidden` on the dvh wrapper clips (not
scrolls) if chrome+dock ever exceed the viewport (message pile-up or
penalty-swollen hand) — unproven risk, worth a rendered look. (4) The
container hand-copies `EDGE_ANCHOR_CLASS.top` and the rest treatment
(unexported from table-surface), and the extracted seat's regular
placement rests on an unnamed containing-block coincidence
(`table-root` w-full vs surface max-w-2xl, centered, x=50%) — export
the anchor map or extract a ViewerSeatDock component when next
touched. (5) ai-tells: the ~37.5px void's code comment narrates flex
residue as a deliberate "common-region split" — user-accepted at fix
time, but the comment should say "accepted residue" rather than
retrofit intent. (6) Dead classes: `regular:order-none` (no-op),
wrapper `justify-center` (inert). (7) Prettier-stable but broken
inline-code-span line flow at frontend plan :407–408 (and pre-existing
root :197–199). (8) `--size-table-art-compact: 128px` is an off-scale
bare primitive consumed from TSX — fine, but deserves its one-line
rationale in styles.css. (9) Standing tensions carried, still open:
32px tap targets vs the 44px floor; toast stack overlaying the compact
dock (never exercised).
**F5 disposition (fix cycle, 2026-09-06):** DONE — (1) guard widened
(`/(^|\s|:)-?scale-/` + `transform-[` + inline `style.transform`
checks); (2) owned-edge sentence added to ADR-0035's Consequences;
(5) comment rewritten as "accepted flex residue"; (6)
`regular:order-none` removed; `justify-center` KEPT — the "dead class"
call was wrong, it still centers the non-game states (skeleton,
no-access), noted inline; (7) both spans rephrased onto one line; (8)
rationale comment added. DEFERRED as follow-ups — (3)
chrome+dock-overflow clip risk, (4) geometry duplication /
containing-block coincidence, (9) both standing tensions.

**F6 (new, found during fix-cycle verification) — the "2–4 players
fit" claim was name-width-sensitive and over-claimed at 4p.** The
review's 4-player probe game (6-character seat names) wraps the
opponent row: 110px middle-region scroll, IDENTICAL pre- and
post-fix-cycle (isolated by stashing the fix and re-probing), so a
pre-existing over-claim, not a regression — the implement session's
4p measurement presumably used narrower content. RESOLVED by claim
amendment (the geometry promise cannot be test-hardened against
content width): acceptance criterion second amendment, coverage row 1,
frontend Surprises note, table-surface.md r4 amendment. The
name-independent guarantees — zero page scroll, pinned chrome/dock,
middle-only overflow — were probed at 2/3/4/5 players and all hold.

### What was run

`pnpm turbo build typecheck lint test` (exit 0); forced
`--filter @cambio/web --filter @cambio/ui --force` and
`--filter @cambio/api --force` (all fresh-green, live Postgres);
playwright probes (fold/pinning/anchors/transform-chain at 3p+5p
compact, 5p regular, room screen) against live dev servers
(freshness-checked per AGENTS.md) plus a `release-v0` worktree
baseline on the same CORS origin. Screenshots and probe JSON in the
review session's scratchpad.
