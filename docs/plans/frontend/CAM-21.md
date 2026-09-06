# CAM-21 — Compact game screen must fit the fold — dock chrome and own hand (frontend)

- **Root plan:** [root/CAM-21.md](../root/CAM-21.md) — the functional
  contract lives there; this document is implementation detail for the
  only side this task touches.

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

All line refs were current at HEAD `8f865e1` on `release-v0` (plan time).
**Stale as of close-out** — the M2/M3 restructure (Progress) rewired
`game-screen.tsx` and `table-surface.tsx` extensively; these numbers
describe the pre-task shape this section is explaining, not where things
live now. The as-built shape is in Progress and the Plan of work's
per-milestone notes below.

- **Screen composition** — `apps/web/src/containers/game/game-screen.tsx`.
  `GameTable` returns one flex column (`:576`,
  `flex w-full flex-col items-center gap-4 regular:relative` — "the
  stage"): TurnIndicator `:577`, SlamTimer `:580` (mounted only while a
  slam window is open), "Ready a give" row `:596`, give-pick prompt
  `:613`, beat message `:626`, Call Cambio `:629` (regular-only absolute
  dock at `:635`; compact keeps it in flow — the CAM-18 decision this
  task reverses), Keep/Discard `:641`, command error `:655`, fizzle
  `:660`, then the table root div (`:663`, `ref={setTableRoot}`,
  `relative w-full` — "the middle div") wrapping TableSurface `:664`,
  FlightLayer `:710`, and the game-over ScoreSheet overlay `:720`
  (`absolute inset-0 z-30`). The screen wrapper at `:855–860` is
  `flex w-full flex-1 flex-col justify-center gap-4 p-4` inside
  `AppShell state="game"`.
- **TableSurface** — `apps/web/src/components/game/table-surface.tsx`.
  Root `:106–113`: compact = flex column, regular = positioned
  aspect-square canvas (`regular:relative … regular:max-w-2xl`).
  Opponents wrapper `:115` (`flex flex-wrap justify-center gap-2` with
  `regular:contents`), art container `:121` (`relative w-3/4` at
  compact; the asset `table-top.webp` is square 1254×1254, so compact
  art height ≈ 0.75 × surface width), disc-sized center overlay and
  scrim `:124–140`, own seat rendered last `:143`, game-over full-region
  rest `:151–154`. **Latent bug** (root-plan Surprises): the rest is
  `absolute inset-0 z-20` but the root is only `regular:relative`, so at
  compact it resolves against the game screen's middle div instead of
  the surface. Seat wrappers `:80–104` carry inline `left`/`top`
  percents (inert at compact) and `regular:`-prefixed translates; the
  viewer's seat under `seatAnchor="edge"` keeps the centered translate
  (`EDGE_ANCHOR_CLASS` `:57–62`). Geometry derives from
  `apps/web/src/components/game/table-geometry.ts` — the viewer's ring
  point is `(50%, 91.5%)` of the surface box (`SEAT_RING_RADIUS_PCT`).
- **Room screen** — `apps/web/src/containers/room/room-screen.tsx:147–161`
  uses TableSurface with `seatAnchor` center, state `seating`, bare
  Seats. Contract clause 9: must not regress.
- **Flight layer** — `apps/web/src/components/game/flight/flight-layer.tsx`.
  Flights measure `getBoundingClientRect` deltas against the `root`
  element (`:195–217`); anchors outside root silently settle
  `cancelled` (`:198–200`). The layer's own wrapper is
  `absolute inset-0` (`:294`) — it must remain a child of the (positioned)
  root element. `transform: scale` above the root corrupts coordinates
  at s² — ADR-0035 prohibits it.
- **Hand** — `apps/web/src/components/game/hand.tsx`: `cardSize` is
  `lg` for own / `md` for opponents (`:93`), grid
  `grid w-fit grid-cols-2 gap-2` (`:96`). Card widths are custom-property
  tokens: `packages/ui/src/styles.css:229–237` (`card-lg` 96px,
  `card-md` 64px, `card-sm` 32px, all via `--card-width`); the 5/7
  aspect lives in `card-frame` (`:224`).
- **AppShell** — `packages/ui/src/components/app-shell.tsx`: root `:86`
  is `relative flex min-h-dvh flex-col safe-area-shell` (the repo's only
  viewport unit); `<main>` `:117` is `flex min-h-0 flex-1 flex-col` with
  no overflow rule; game chrome is an absolute `z-40` column `:90`. The
  `safe-area-shell` utility (`styles.css:385–390`) pads all four `env()`
  insets on the shell root — in-shell docks inherit the bottom inset;
  `position: fixed` would not.
- **Tokens/breakpoints** — `styles.css:151–153`:
  `--breakpoint-regular: 720px`; compact is the unprefixed base (no
  `compact:` variant exists). The bare spacing multiplier is disabled
  (`:99`) — arbitrary numeric utilities do not resolve; the scale is
  4/8/12/16/24/32/48/64 (`:100–108`). No z-index tokens; the de-facto
  ladder: seats z-10, game-over rest / Call Cambio z-20, score sheet
  z-30, shell chrome z-40, toast z-50 (`packages/ui/src/components/toast.tsx`
  is `fixed bottom-4 left-1/2 z-50` — bottom-center at all widths).
- **Tests** — `apps/web/test/game-screen.test.tsx` (1705 lines) queries
  by role/text/data-\* only. One fragile assertion: the game-over walk
  (`querySelector("[data-seat-index]")` → `closest("[data-state]")`
  expecting `game-over`) selects the DOM-first seat wrapper, today an
  opponent. `matchMedia` is stubbed per-suite for FlightLayer
  reduced-motion only — prefer CSS-only breakpoints, add no new
  matchMedia JS. `hand.test.tsx` asserts anchors/vacancies, nothing
  about card size. ADR-0030: jsdom asserts structure/behavior, never
  geometry — geometry claims route to the design-gate rendered path.
- **Governing skills/ADRs:** `frontend-architecture` (projection
  renderer; containers own composition), `design-system` (tokens only;
  creation gate — the compact card-scale extension and its sibling
  values are user-approved through the gate, interview 2026-09-06),
  `hidden-information` (no payload change of any kind — pure layout),
  ADR-0027 (two-layer tokens), ADR-0030 (test routing), ADR-0034
  (flights), ADR-0035 (binding for this task).

### The chosen compact architecture (decisions, not code)

The design questions the root plan delegates here, answered:

1. **Viewport bound at the screen wrapper, not AppShell.** The wrapper
   div (`game-screen.tsx:856`) gains a compact-only dvh bound
   (`max-h-dvh` family) plus a `min-h-0` flex chain down through stage →
   middle div → scroll wrapper, and drops its compact _vertical_ padding
   (`p-4` → horizontal-only at compact; every pixel counts, see the
   budget). It must **not** reintroduce `env()` — the shell root already
   pads all four safe-area insets, and doubling them is a bug. Known
   residual: `max-h-dvh` ignores the shell's inset padding, so on
   notched devices the bound is generous by the inset amount; at the
   360×640 floor (inset-less hardware and the render harness) it is
   exact. If the M5 rendered pass shows inset-device overflow, the
   escalation is one semantic utility in `styles.css` computing
   `100dvh` minus the two vertical insets (documented as the pair of
   `safe-area-shell`) — not scattered `env()` arithmetic. Lobby and
   room screens do not use this wrapper and inherit nothing.
2. **Three compact regions on the existing stage; the flight root does
   NOT move.** The stage (`:576`) becomes a bounded flex column of:
   - **Top band** — a new wrapper (structural hook, e.g.
     `data-region="chrome"`) holding TurnIndicator, SlamTimer, and the
     beat/error/fizzle messages. Compact: `shrink-0`, pinned by the
     bounded stage. Regular: `display: contents`
     (`regular:contents`) so its children resume being stage flex items,
     with `regular:order-*` utilities on the reordered children
     restoring today's exact stage sequence (order utilities are not
     spacing-scale-bound; a `contents` element is never a positioned
     ancestor, so nothing else shifts).
   - **Middle div** — the existing `:663` div keeps `ref={setTableRoot}`
     and stays the flight root and the ScoreSheet overlay's positioning
     box. At compact it becomes `flex-1 min-h-0` flex column containing:
     (a) a **scroll wrapper** (`min-h-0 overflow-y-auto` at compact,
     `regular:contents`) around TableSurface — the only element that
     ever scrolls (clause 4); (b) the **extracted own seat** (the
     dock's hand half — see 3); (c) FlightLayer and the ScoreSheet
     overlay, unchanged. Because the own hand stays _inside_ the
     existing root element, every flight anchor remains inside
     `FlightLayer`'s `root` with zero flight-layer churn (clause 5),
     and ADR-0035 is satisfied by construction — no transform enters
     the chain.
   - **Dock actions** — a new wrapper (e.g. `data-region="dock-actions"`)
     after the middle div holding "Ready a give", the give-pick prompt,
     Call Cambio, and Keep/Discard. Compact: `shrink-0` pinned bottom
     band (visually one dock with the hand row directly above it).
     Regular: `regular:contents` + `regular:order-*` restoration; the
     Call Cambio div keeps `regular:absolute regular:right-5 regular:bottom-5`
     and its positioned ancestor stays the stage (contents wrappers
     don't position), so its regular placement is untouched.
3. **Own seat extracted from TableSurface; regular placement reproduced
   from the same geometry source.** TableSurface gains a way to skip
   rendering `seats[viewerSeatIndex]` while still deriving all geometry
   from the full `seats.length` (advisory sketch: a
   `viewerSeat: "internal" | "external"` prop, default `"internal"` —
   the room screen takes the default and is untouched, clause 9). The
   game screen renders the viewer's seat wrapper itself, inside the
   middle div after the scroll wrapper: at compact a `shrink-0` centered
   row (the dock's hand); at regular
   `regular:absolute regular:z-10` with the **same** seatArc inline
   ring-point style and centered translate it has today. This is
   pixel-faithful at regular because the middle div's height equals the
   surface's (the surface is its only in-flow content) and both are
   horizontally centered — `(50%, 91.5%)` of the middle div is the same
   point as of the surface. The alternative — TableSurface growing a
   docked-own-hand slot plus an actions slot — was weighed and
   rejected: it would push HUD content (action buttons) into a
   component whose spec says "ground, not HUD" (table-surface.md), it
   would thread the bounded-stage/scroll machinery through a component
   the room screen shares, and it cannot host the regular Call Cambio
   dock without becoming a positioned pass-through. Extraction keeps
   TableSurface presentational and the composition in the container,
   per `frontend-architecture` layering. Duplicate-render approaches
   (one node per breakpoint, CSS-hidden) are ruled out hard: duplicate
   flight-anchor ids would make `findAnchor` measure the hidden clone,
   and duplicate buttons break every `getByRole` in the 1705-line
   suite.
4. **Latent-bug fix folded in:** TableSurface's root becomes
   unconditionally `relative` so the game-over full-region rest
   (`table-surface.tsx:151–154`) scopes to the surface at compact too.
   At regular the rest (z-20) still paints above the extracted own seat
   (z-10) — both now resolve in the middle div's stacking context, same
   visual result as today. Room screen: `seating` state never renders
   the rest; an unconditionally relative root has no compact absolute
   children there, so nothing changes (clause 9).
5. **Compact card scale = mobile-first values in the existing card
   utilities.** The `@utility` blocks (`styles.css:229–237`) get compact
   base values with the current values behind the `regular` breakpoint:
   compact `card-lg` = 64px (`--spacing-8`), compact `card-md` = 32px
   (`--spacing-6`), `card-sm` unchanged. `card-md` at 32px is _forced_
   by width, not taste: at 5 players, four opponent 2-col grids at 48px
   cards are 4×104px + gaps > 360px (two wrap rows, ~330px tall); at
   32px they are 4×72px + gaps = 312px — one row. No component changes:
   Hand, DrawDeck, DiscardPile, HeldCard resolve the same classes to
   the new widths; no matchMedia. Regular values are untouched
   (clause 10). Mirror the values into
   `design-system/references/tokens.md` as a revision (the interview's
   gate approval covers this family). **Surfaced tension, not
   auto-resolved:** 32px-wide tappable cards (opponent slam targets,
   deck/discard) fail the 44px touch-target hard check on width
   (height is ~45px). The gate's verdict is advisory; the candidate
   mitigation is hit-area padding on the tap target without growing the
   visual footprint — decide when the M5 gate run puts numbers on it.
6. **Art cap via max-width, token-backed.** The art container
   (`table-surface.tsx:121`) gains a compact max-width token (new
   primitive, e.g. `--size-table-art-compact`, starting value 160px,
   entered in `styles.css` and mirrored in tokens.md — same gate
   approval family). The asset is square, so a width cap _is_ the
   height cap, and the disc-sized center overlay is %-sized and
   follows: at 160px the disc is ~86px and the compact deck+discard
   pair (2×32px + 16px gap = 80px) fits inside it. Value tuned at M5.
7. **Z-index: no new steps.** Band, hand row, and dock are in-flow
   inside a bounded stage; overflow is clipped inside the scroll
   wrapper, so nothing climbs the ladder. Two known collisions to check
   at M5, both surfaced rather than resolved here: the shell's floating
   game chrome (absolute top, z-40) may graze the pinned band's right
   edge at 360px; and the toast stack (`fixed bottom-4 z-50`,
   bottom-center) will overlay the dock at compact — toast placement is
   canon and out of this task's scope, but the overlap gets a rendered
   look and a note for the root plan if it's bad.

### Fold budget at 360×640, 5 players (estimates — verified at M5, not promises)

| Region                                                                                                             |  Est. px |
| ------------------------------------------------------------------------------------------------------------------ | -------: |
| Top band (indicator ~40)                                                                                           |      ~40 |
| Opponents row (4 × 2-col `card-md`=32 grids fit one wrap row: 312 ≤ 360; nameplate ~24 + two 45px card rows + gap) |     ~122 |
| Table art (capped)                                                                                                 |     ~160 |
| Own hand row (two 90px `card-lg`=64 rows + gap + nameplate ~24)                                                    |     ~212 |
| Dock actions row (one button row)                                                                                  |      ~40 |
| Inter-region gaps (4–5 steps at 8px compact)                                                                       |      ~48 |
| **Total**                                                                                                          | **~622** |

~622 of 640 with compact vertical wrapper padding removed — plausible
but tight. The explorer measured today's overflow at ~834px for the
table column alone, so the scale + cap does the heavy lifting. Tuning
knobs if the rendered pass overflows, in order: art cap down (160 →
128), compact gaps 8 → 4 where canon allows, compact `card-lg` 64 → 48
(own row drops ~46px; keeps the own > opponent hierarchy). A
penalty-swollen own hand (3+ rows) grows the dock and compresses the
middle region into its scroll — chrome and dock stay pinned, which is
the intended degradation (clause 4's mechanism, not a violation of
clause 1's default-state claim).

## Plan of work

Milestones mirror the root plan's M1–M5. Each step leaves the repo
compiling and the web/ui suites green. Code sketches are advisory; the
coverage table and this section's constraints are what get reconciled
at close-out.

### M1 — Tokens (packages/ui)

Edit `packages/ui/src/styles.css`: compact-base values inside the
`card-lg`/`card-md` utility blocks with `regular` restoring 96/64
(decision 5), and the new art-cap primitive (decision 6). Update
`design-system/references/tokens.md` with a revision note recording the
compact card scale and the art cap (gate-approved, interview
2026-09-06). No component edits. Existing `packages/ui` suites must
stay green (they assert structure, not widths).

### M2 — Screen restructure (apps/web, game-screen.tsx)

1. Wrapper (`:856`): compact dvh bound + `min-h-0` chain + compact
   vertical-padding trim (decision 1). Regular classes untouched.
2. Stage (`:576`): unconditional `relative` (today `regular:relative` —
   needed so the compact column and the regular Call Cambio dock share
   one positioned ancestor); compact bounded column.
3. Introduce the top-band and dock-actions wrappers with their
   `data-region` hooks and `regular:contents` + `regular:order-*`
   restoration (decision 2). Move the slam prompts, Call Cambio, and
   Keep/Discard into the dock-actions wrapper; messages into the band.
   Delete the `:629–635` comment's "compact keeps it in flow" claim —
   the root-plan Decision Log records the reversal.
4. Middle div (`:663`): compact `flex-1 min-h-0` column; add the scroll
   wrapper around TableSurface; render the extracted own seat wrapper
   after it (decision 3), reusing the existing seatWrapper markup
   (`data-seat-index`, inline ring-point style, translate classes) so
   flights and tests see the same shape. FlightLayer and ScoreSheet
   stay where they are.

### M3 — TableSurface adjustments (apps/web, table-surface.tsx)

1. The viewer-seat opt-out prop (decision 3), default preserving
   today's behavior — room screen call site untouched.
2. Root unconditionally `relative` (decision 4).
3. Art container max-width cap via the M1 token (decision 6).
4. Verify the game-over rest and disc scrim against the new scoping at
   both breakpoints.

### M4 — Tests (apps/web/test, ui test if touched)

Structural jsdom only (ADR-0030); the same DOM serves both breakpoints,
so no matchMedia and no breakpoint stubbing — containment invariants
are breakpoint-independent. Planned intents (titles land at
`/implement`):

- The chrome band region contains the turn indicator, and the slam
  timer when a window is open, and the beat/error/fizzle messages when
  present.
- The viewer's hand anchors render outside the scroll region and inside
  the flight root; the dock-actions region contains Call Cambio,
  Keep/Discard, and the slam prompts in the phases that render them.
- Every flight anchor (own slots, opponent slots, deck, discard) is a
  descendant of the element handed to `FlightLayer`'s `root`.
- TableSurface in the game screen no longer contains the viewer's seat
  wrapper; the default (room) path still renders all seats internally.
- The existing game-over walk (first `[data-seat-index]` →
  `closest("[data-state]")`) survives unchanged — the DOM-first seat
  wrapper is still an opponent inside TableSurface at 2–5 players. If
  any restructure breaks it, adapt it knowingly and log the adaptation
  here and in the root plan.
- Optional cheap ADR-0035 pin: no ancestor of the flight root carries a
  scale-transform class.

### M5 — Rendered pass + canon

Fresh servers, freshness check, rendered runs (commands below), the
design-gate run on the compact composition (advisory; surface
conflicts — expected: the 32px touch-target finding from decision 5),
then canon revision notes on the release branch:

- `design-system/components/core/table-surface.md` → r4: compact state
  is the docked composition (viewer's seat renders in the screen's dock
  outside the surface; opponents + capped art remain; root
  unconditionally positioned; game-over rest scoping).
- `design-system/components/core/app-shell.md` → r4: "the own-hand dock
  reserves the bottom" is realized; note the dock lives in the screen,
  inheriting the shell's bottom inset padding.
- `design-system/components/core/turn-indicator.md` → r2: docks top on
  compact too (supersedes r1's "above own hand on compact") — user
  call, interview r2.
- `design-system/components/core/slam-timer.md` → r3: appears in the
  top band with the indicator, not table-center (matches as-built +
  user call).
- `design-system/references/tokens.md` → revision from M1 (if not
  already landed there).

Finally update root-plan Progress/Surprises and this document.

## Concrete steps & validation

Per-milestone commands (never pipe the gate — run bare, check exit
codes; `set -o pipefail` first if output must ever be filtered):

- M1: `pnpm turbo test --filter @cambio/ui`
- M2–M4: `pnpm turbo test --filter @cambio/web` (turbo builds workspace
  deps first — the bare package script runs against stale dist). While
  iterating on one suite after a build: `npx vitest run test/game-screen.test.tsx`
  from `apps/web`.
- Success signal at M4: all existing `game-screen.test.tsx`,
  `hand.test.tsx`, `table-surface`-adjacent and room-screen suites green
  plus the new structural tests; zero geometry assertions added.

M5 rendered pass:

1. Start servers: `docker compose -f docker/docker-compose.yml up -d`,
   then `pnpm dev` (api :3001, web :3000 — or `WEB_PORT=3100` to match
   the commands below).
2. **Freshness check (mandatory, AGENTS.md):** fetch a just-changed
   module through Vite and grep for a new symbol, e.g.
   `curl -s http://localhost:3100/@fs/$PWD/apps/web/src/containers/game/game-screen.tsx | grep dock`
   — restart the dev server if the grep comes back empty.
3. Rendered runs from `.agents/scripts/design-gate/` (one-time setup if
   missing: `npm install --omit=dev` then `npx playwright install chromium`),
   against a live authenticated game per player count:
   - `node render.js --url http://localhost:3100/game/<id> --cookie "cambio_session=<v>" --width 360 --height 640`
     at 2, 3, 4, and 5 players — assert no page-level vertical scroll
     (document height ≤ viewport in the dump) and chrome + dock both
     visible in the screenshot (clauses 1–4).
   - Same at a game-over state (clause 7) and during an open slam
     window (clause 2).
   - Below-floor spot check, e.g. `--width 360 --height 560`: middle
     region scrolls alone, chrome and dock pinned.
   - Regular regression: `--width 1280 --height 900` on the game screen
     (compare against a pre-change capture of the same state —
     clause 10) and on the room screen (clause 9, also at 360×640).
4. Design-gate run (`/gate`) on the compact game screen; verdict
   advisory — surface findings, decide with the user where they hit
   deliberate choices (the touch-target tension is expected).
5. Final gate, bare: `pnpm turbo build typecheck lint test`.

## Contract coverage

_(plan-time: Clause + planned approach only. Test file, test name, and
assertion phrase are filled in by `/implement` as each test actually
lands — an invented test title here would be an overclaim.)_

| Clause                          | Planned approach (plan-time)                                                                                                                                                                                                                              | Test (file + name)                                                                                                                                                                                                                                                                                                                                                   | What is asserted                                                                                                                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Fold fit                     | Rendered-path only (ADR-0030 routes geometry): render.js at 360×640 for 2/3/4/5 players, no page-level scroll; screenshots archived with the gate run. No jsdom test can pin this.                                                                        | Rendered: design-gate render.js at 360×640 for 2/3/4/5 players (final_2p/3p/4p/5p captures)                                                                                                                                                                                                                                                                          | document height == viewport (720×1280 physical px at deviceScaleFactor 2) for 2–4 players; 5 players uses the sanctioned middle-scroll fallback (clause 4) with chrome/dock still pinned                     |
| 2. Top chrome pinned            | jsdom structural: chrome-band region contains the indicator, the slam timer (window open), and beat/error/fizzle messages. "Cannot leave the viewport" itself is verified on the rendered pass (default, slam-window, and below-floor shots).             | game-screen.test.tsx > compact docked composition (CAM-21) > "keeps the turn indicator and an open slam timer inside the pinned chrome band" and "keeps a command-error and a public-fizzle message inside the chrome band once they render"                                                                                                                         | data-region=chrome contains the indicator always, the slam timer while a window is open, and beat/error/fizzle messages when present                                                                         |
| 3. Bottom dock pinned           | jsdom structural: own-hand anchors outside the scroll region; dock-actions region contains Call Cambio / Keep/Discard / slam prompts in their phases. Pinning + home-bar clearance verified rendered (safe-area padding is pre-existing shell behavior).  | game-screen.test.tsx > compact docked composition (CAM-21) > "keeps the give-pick prompt inside the bottom dock, never the chrome band", "renders Call Cambio inside the bottom dock, not the chrome band", "renders Keep/Discard inside the bottom dock in the holding phase"                                                                                       | data-region=dock-actions contains the slam give-pick prompt, Call Cambio, and Keep/Discard in their respective phases, never the chrome band; own-hand anchors sit outside the scroll region (clause 5 test) |
| 4. Middle fits or scrolls alone | jsdom structural: the scroll wrapper contains TableSurface and contains neither the own-hand row nor the actions region. Fit at the floor and scroll-alone below it are rendered checks (360×640 and 360×560 runs).                                       | game-screen.test.tsx > compact docked composition (CAM-21) > "keeps the viewer's own hand anchors outside the scroll region but inside the flight root"; rendered fit at 360×640 (clause 1 evidence) and scroll-fallback verified at 5 players (scrollTop drive, final_5p_scrolled capture: chrome top=0, dock bottom=640 unmoved)                                   | the scroll wrapper (data-region=table-scroll) contains TableSurface only, never the own-hand row or the dock; at 5 players scrolling it reveals the deck/discard while chrome and dock stay pinned           |
| 5. Flights keep working         | jsdom: every flight anchor (own slots, opponent slots, deck, discard) is a descendant of the element passed as FlightLayer's root; existing flight/arrival suites in game-screen.test.tsx stay green unmodified.                                          | game-screen.test.tsx > compact docked composition (CAM-21) > "keeps the viewer's own hand anchors outside the scroll region but inside the flight root"; existing flight-layer.test.tsx and game-screen.test.tsx flight/arrival suites unmodified and green                                                                                                          | every flight anchor (own slots, opponent slots, deck, discard) is a descendant of data-region=table-root, the element passed as FlightLayer's root                                                           |
| 6. No transform scaling         | By construction (no scale utilities introduced) + review grep of the flight root's ancestor chain; optionally a cheap structural pin that no ancestor of the root carries a scale-transform class. ADR-0035 is the authority.                             | game-screen.test.tsx > compact docked composition (CAM-21) > "carries no scale-transform class on any ancestor of the flight root (ADR-0035)"                                                                                                                                                                                                                        | no ancestor of data-region=table-root carries a class matching /scale-/                                                                                                                                      |
| 7. Game-over intact             | Existing game-over seat→data-state walk in game-screen.test.tsx stays green (adapt only knowingly, logged); the latent rest-scoping fix verified by the compact game-over rendered shot (ScoreSheet above dimmed table, clauses 1–3 respected).           | game-screen.test.tsx > the reveal (E2) > "dims the table under the game-over state while the score sheet is showing" (existing, green unmodified); rendered compact (final_gameover_compact) and regular (final_gameover_regular) game-over captures                                                                                                                 | the score sheet overlays a dimmed table at both breakpoints; compact still produces no page-level scroll (720×1280 exact) with the fix to TableSurface's now-unconditional relative root                     |
| 8. Hidden information untouched | No test: verified by diff scope at review — zero edits under packages/contracts, apps/api, or any payload/projection code; the task moves and sizes already-entitled renderings only.                                                                     | No test — verified by diff scope                                                                                                                                                                                                                                                                                                                                     | zero edits under packages/contracts, apps/api, or any payload/projection code; the diff touches only apps/web and packages/ui (styles.css tokens)                                                            |
| 9. Room screen unaffected       | Existing room-screen suites green; jsdom pin that TableSurface's default path still renders all seats internally; rendered room-screen shots at 360×640 and 1280×900 compared against pre-change captures.                                                | room-screen.test.tsx > member bootstrap (R1, R3) > "renders every member by name in join order from the GET alone — no join call" (existing, green unmodified — asserts BOTH members have a data-seat-index ancestor, pinning TableSurface's default viewerSeat="internal" path); rendered room-screen captures at 360×640 and 1280×900 (final_room_compact/regular) | TableSurface's default path still renders every seat (including the viewer's) internally; the room screen's compact/regular composition is visually unchanged                                                |
| 10. Regular untouched           | Rendered 1280×900 game-screen regression compared against a pre-change capture of the same state; full existing jsdom suite green. DOM/class restructure is shared across breakpoints — the standard is unchanged rendered output, which this run proves. | Rendered 1280×900 game-screen (5 players) before and after the SeatWithHand compact-orientation fix — pixel-identical (final_regular_5p vs final_gameover_regular's non-overlay portion); full existing jsdom suite green (67/67 in game-screen.test.tsx, 212/212 in apps/web overall)                                                                               | every regular-breakpoint class is unprefixed-identical or explicitly regular:-restored; no jsdom regression across the whole web suite                                                                       |
| 11. Token discipline            | All new values land in the styles.css token layer mirrored in tokens.md (M1); design-gate hard checks + review grep for arbitrary-value utilities and constant inline styles (both forms, per the CAM-17 lesson).                                         | Review grep: only token-referencing utilities introduced (gap-2/gap-4 from the enumerated spacing scale, max-w-(--size-table-art-compact), the card-lg/card-md @utility blocks); packages/ui/src/styles.css mirrors design-system/references/tokens.md (Shape section)                                                                                               | no arbitrary-value utility or hardcoded inline style was added; every new visual value is a token or an enumerated scale step                                                                                |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [x] 2026-09-06 — M1 (tokens): compact card-lg/card-md scale and
      `--size-table-art-compact` landed in `packages/ui/src/styles.css`,
      tuned during M5 (see Surprises). `pnpm turbo test --filter
@cambio/ui` green.
- [x] 2026-09-06 — M2 (screen restructure): `game-screen.tsx` — dvh-bound
      wrapper, unconditionally-relative bounded stage, pinned chrome
      band (`data-region="chrome"`) and dock-actions
      (`data-region="dock-actions"`) with `regular:contents` +
      `regular:order-*` restoration, `data-region="table-root"` /
      `"table-scroll"` middle region, extracted own seat.
- [x] 2026-09-06 — M3 (TableSurface): `viewerSeat` prop
      (`"internal"`/`"external"`), unconditionally-relative root, compact
      art max-width cap.
- [x] 2026-09-06 — M4 (tests): 8 new structural tests in
      `game-screen.test.tsx`'s "compact docked composition (CAM-21)"
      describe block; all pre-existing suites green unmodified
      (`game-screen.test.tsx` 59→67 tests, `room-screen.test.tsx`
      untouched and green). `pnpm turbo build typecheck lint test` green
      throughout.
- [x] 2026-09-06 — M5 (rendered pass): design-gate `render.js` at
      360×640 for 2/3/4/5 players plus game-over and regular (1280×900)
      regression, via a scripted lobby/game setup against the live api
      (docker postgres + realtime already running). Found the fold
      budget didn't close for any player count at the initially-planned
      values — see Surprises for the tuning cascade and the
      `SeatWithHand` orientation fix that resulted from a mid-task user
      interview. Found and fixed the game-over rest seam on the
      extracted own seat (Surprises). Final state: 2–4 players fit the
      360×640 floor exactly (no page scroll, full table visible); 5
      players uses the sanctioned middle-scroll fallback; regular and
      room screen unaffected (rendered + jsdom).
- [x] 2026-09-06 — Canon revisions landed: `table-surface.md` r4,
      `app-shell.md` r4, `turn-indicator.md` r2, `slam-timer.md` r3,
      `tokens.md` (Shape section).

## Surprises & notes for the root plan

- Planning: the root plan's M2 says "hoist the flight root so it
  contains the dock" — this plan found the hoist unnecessary: the
  extracted own seat lands _inside_ the existing root element (the
  middle div at `game-screen.tsx:663`), so every anchor stays inside
  `FlightLayer`'s root with zero flight-layer churn and the ScoreSheet
  overlay's positioning box unchanged. Clause 5 is satisfied by
  containment, not by moving the ref. If `/implement` discovers a
  reason the hand cannot live in the middle div, hoisting to the stage
  is the fallback and this note flips.
- Planning: compact `card-md` = 32px is forced by 5-player width
  arithmetic, and 32px-wide tap targets (opponent slam slots,
  deck/discard) fail the 44px touch-target hard check on width — a
  genuine fold-fit vs touch-target tension to surface at the M5 gate
  run, not auto-resolve. **Still open at close-out** — the M5 rendered
  pass confirmed the finding but the tension itself wasn't resolved
  (out of this task's remaining time); flagged for `/review` or a
  follow-up.
- Planning: the toast stack (`fixed bottom-4 z-50`, bottom-center) will
  overlay the compact dock; toast placement is canon and out of scope —
  M5 takes a rendered look and reports. **Not re-checked** — no toast
  fired during the M5 rendered pass (no clipboard/error actions were
  exercised); still open, flag for `/review`.
- M5 (2026-09-06): the initial fold-budget numbers (art 160px, card-lg
  64px, card-md 32px, gap-4 throughout) did NOT close for ANY player
  count — even 2 players overflowed the scroll region by ~40px, worse
  for 3–5. After applying every M1-authorized tuning knob (art
  160→128px, card-lg 64→48px, the two compact-only `gap-4`→`gap-2`
  instances — see `table-surface.tsx` and `game-screen.tsx`'s
  `table-root`), 2p fit exactly but 3p was still short 10px, 4p 52px,
  5p 95px — token tuning alone could not close the gap for 3+ players.
  Root cause, found by measuring actual rendered opponent-group
  dimensions: `SeatWithHand`'s flex direction was reused unprefixed from
  `inwardSide` (the REGULAR-mode radial side), so a "left"/"right"
  opponent rendered as a wide horizontal row (name beside hand, ~175px)
  at compact too, even though compact never renders the arc at all. At
  360px only ~2 such wide groups fit per line before wrapping, and each
  wrapped row costs 100–140px the budget didn't have. **User decision
  (interview, mid-implementation):** rather than cap player count or
  redesign the table (both raised and set aside — capping is a real
  rule change with no full backend enforcement, the table redesign
  belongs to CAM-20's charter and was deferred there), force every
  OPPONENT to the narrow "column" form at compact regardless of their
  regular-mode side (`REGULAR_SIDE_FLEX_CLASS`, `game-screen.tsx`), via
  a `regular:` prefix so regular is provably untouched and only the
  viewer's own seat (already narrow-form) is exempted via a new `own`
  prop on `SeatWithHand`. Re-measured: 2p/3p/4p now fit with margin
  (~53px spare); 5p is unchanged (four ~95px-wide groups still need two
  wrapped rows regardless of orientation) and keeps the sanctioned
  middle-scroll fallback (clause 4) — chrome and dock stay pinned,
  confirmed by driving `scrollTop` and reading the chrome/dock rects
  before and after.
- M5: reusing `viewerSeat="external"` unconditionally (not compact-only)
  meant the viewer's own seat sits OUTSIDE TableSurface's square root at
  regular too, so TableSurface's own game-over rest (`inset-0` of ITS
  root) only overlapped whatever fraction of the extracted seat's box
  fell inside that square — measured as a hard seam cutting straight
  through the own hand's cards at regular (confirmed via
  `elementFromPoint`/rect comparison against Bob's uniformly-dimmed
  seat). Fixed with a matching rest INSIDE the extracted seat's own
  wrapper (same z-20/`green-deep`/35% treatment), scoped to its own
  bounds — not folded into table-surface.md's r3 rest since it's a
  different element entirely now. First attempt at the fix put
  `position:relative` on the OUTER wrapper (the one carrying the inline
  `left`/`top` ring-point percentages) to give the rest a positioning
  context — this resurrected those percentages as a relative offset at
  COMPACT too (previously inert under `position:static`), shoving the
  whole hand off-screen. Fixed for real by nesting an inner `relative`
  div for the rest instead, leaving the outer wrapper's position
  untouched at compact. Both breakpoints re-verified rendered
  (`v2_gameover_compact.png` / `v2_gameover_regular.png`) after the
  correction.
