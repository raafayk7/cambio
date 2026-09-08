# CAM-30 — Teach the rules: how-to-play guide + in-game power hints (frontend)

- **Root plan:** [root/CAM-30.md](../root/CAM-30.md) — the functional
  contract lives there; this document is implementation detail for one side.

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

This task is frontend-only; this child plan owns the whole functional
contract (F1–F5) and all five root milestones M1–M5. Governing skills:
`frontend-architecture` (the client is a projection renderer; logic in
custom hooks; `apps/web` imports only `@cambio/contracts` and `@cambio/ui`;
`packages/ui` imports nothing app-specific — no contracts, no game
vocabulary), `design-system` (canon lives in `design-system/` on this
release branch; the creation gate governs every canonical change; the
system outranks all tooling), `hidden-information` (the guide and hints
must never surface a value the viewer's payload doesn't carry — verified
below that no payload change is needed), `cambio-rules` (the guide's prose
is authored from that skill + the cited ADRs, **never from memory or other
Cambio/Cabo variants**).

Two rules this document itself obeys:

1. The **Contract coverage table stays test-nameless at plan time** — rows
   hold clause → planned approach; `/implement` fills file, test name, and
   assertion phrase as each test actually lands — invented test titles
   become review findings.
2. **Code sketches (signatures, DDL, exports) are advisory** — the
   coverage table and module layout are the artifacts reconciled against
   as-built code.

Cite tests by file + test name, never line number; line-number citations
below are for `src/` anchors only (verified 2026-09-08 on `release-v0`;
re-verify before editing — anchors rot).

State of everything this side touched, **as of plan time
(pre-implementation)** — anchors below are corrected post-implementation
to their nearest current equivalent (CAM-4/CAM-7 line-rot lesson); see
Progress and the root plan's Outcomes for what actually shipped:

- **Marks** — `packages/ui/src/lib/marks.tsx` held exactly
  `MarkX`/`MarkCheck`/`MarkSettings`: tiny inline SVGs in the material
  language (2px `currentColor` strokes on a 16×16 viewBox, `aria-hidden`,
  shared `base` props object). No `?` mark existed. **Now implemented**:
  `MarkHelp`.
- **AppShell** — `packages/ui/src/components/app-shell.tsx`. The settings
  icon-button (`SettingsButton`, now :63-70) renders **only when
  `onSettings` is supplied** (CAM-17 gate finding: an inert-looking
  control is worse than its absence) — and no production screen supplied
  it, so no icon-button rendered anywhere. Two chrome states share the
  header slot: default chrome's header row (now :124-136, wordmark + dot
  - help + settings) and the game state's floating icon pair (now
    :109-121, inside the absolute controls column). **Now implemented**:
    both gained the help button (F1.1), `HelpButton` at :78-85.
- **Modal** — `packages/ui/src/components/modal.tsx`: native `<dialog>`,
  props `open, onClose, title, titleFace ("ui" | "display"), variant ("default" | "confirm"), footer, children, className`.
  Esc/scrim/✕ all dismiss (non-confirm); body is `min-h-0 overflow-y-auto`
  with pinned header/footer — long content is proven by the gallery's
  "House rules" overflow demo
  (`apps/web/src/components/gallery/generic.tsx:328-344`, unchanged by
  this task). Width is fixed `max-w-md` (28rem, spec-carried) — root
  Decision Log D6 keeps it; no Modal code change happened.
- **Containers** — all three own their `AppShell` and passed no
  `onSettings`: `apps/web/src/containers/lobby/lobby-screen.tsx:155`
  (`scene="courtyard"`), `room/room-screen.tsx:286` (`scene="paving"`),
  `game/game-screen.tsx:1120` (`scene="paving" state="game"`) — all three
  now also pass `onHelp`. The game screen already hosted one
  player-opened modal (the Call Cambio confirm, `game-screen.tsx:999-1024`
  post-implementation, state `confirmCambioOpen` at :379) — the precedent
  for trivial open/close `useState` living in the container/component
  that renders the modal, reused for `helpOpen`.
- **Turn status** — `game-screen.tsx`: `turnStatus` (now :104-124)
  collapsed `AwaitingDraw`/`HoldingCard`/`ResolvingPower`/
  `ResolvingQueenSwap` into `your-turn`/`other-turn` **before** copy was
  chosen, so the phase tag never reached `turnStatusCopy` (now :137-160)
  — the F4.1 change point. **Now implemented**: `TurnStatus` carries an
  additional `resolvingPower` flag through to the `other-turn` copy arm.
  `TurnIndicator` (`apps/web/src/components/game/turn-indicator.tsx:16-20`,
  unchanged) has the closed 4-value `state` union that F4.2 pins
  unchanged.
- **Held card** — rendered in the table center at `game-screen.tsx:788-800`
  post-implementation, with a single `label` string from `heldCardLabel`
  (now :178-180). `HeldCard` (`apps/web/src/components/game/held-card.tsx:19-35`)
  rendered card + one muted label line; canon is
  `design-system/components/core/held-card.md` (r1 then, r2 now). **Now
  implemented**: an optional second `hint` line (root D5), step 13 below.
- **Affordances** — `apps/web/src/containers/game/affordances.ts`
  (untouched by this task): `targetingForRank` (:79-99) already maps 7/8
  → `peek-own`, 9/T → `peek-other`, J → `swap-two`, Q → `queen-peek`; the
  holder affordance shapes (:112-134) carry `targeting` for
  `ResolvingPower` and a `swap-two`-only `targeting` (deliberately **no
  `card`**) for `ResolvingQueenSwap`. F3's hint derives from `targeting`
  alone (root D7); confirmed no affordances change was needed.
- **Wire truth (no backend change)** — non-holder views carry only the
  phase `_tag` + `playerId` for both power phases; `card` is optional and
  projected to the holder only (`packages/contracts/src/GameView.ts:50-58`,
  phase on the view at :116; pinned by
  `packages/application/test/ViewFor.test.ts` "ResolvingPower: value for
  the holder only" and by `apps/web/test/affordances.test.ts` "non-holder:
  nothing (no card field — pinned by ViewFor.test.ts)").
- **Test harness** — `apps/web/test/support/harness.tsx`: `renderApp`
  (lobby/room routes), `renderGameApp` (real GameScreen), `stubApi`,
  `viewResponse(overrides)` (accepts any phase literal), fixtures
  `ME`/`FRIEND`/`GAME_ID`/`GRANTS`. `apps/web/test/game-screen.test.tsx`
  carries the driving patterns: helpers `postedCommands`/`slotButton`/
  `channelsReady` and the `twoPlayerView`/`slamWindowView` fixtures, the
  modal-driving precedent (test "Call Cambio opens the confirm modal and
  sends CallCambio only after the explicit confirm"), region containment
  via `data-region` queries (helper functions in the "compact docked
  composition (CAM-21)" describe), the hidden-info structural sweeps
  (describe "hidden information (C5, structural sweep)"), and a
  `resolvingPowerView(card)` fixture inside describe "powers + peeks
  (T3/T4)". **jsdom quirks:** dialogs are queried with
  `getByRole("dialog", { hidden: true })`; the turn indicator is queried
  with `document.querySelector('[role="status"][data-state]')` because
  AppShell's connection dot is also `role="status"`. **New quirk from this
  task (M3):** the game screen now always mounts two `Modal`s (the Call
  Cambio confirm plus the how-to-play guide), so `getByRole("dialog", ...)`
  needs `name:` disambiguation there (e.g. `{ hidden: true, name: "How to
play" }`) — lobby/room screens mount only the guide and stay unambiguous.
  Two module-scope prop mismatches also surfaced: refetched fixtures in
  M3/M4 tests must set `version` strictly above the bootstrap default (3,
  ADR-0033's version guard) or the applied-view assertions silently never
  update.
- **Design-system files touched** — `design-system/design-system.md`
  (creation-gate procedure + the empty extensions index, now populated),
  `components/core/modal.md` (the slam rule amended, r1 → r2),
  `components/core/app-shell.md` (r4 → r5), `components/core/held-card.md`
  (r1 → r2), `components/extensions/` (directory existed, empty — now
  holds `how-to-play-guide.md`),
  `references/voice.md` (register map, terminology table, memory-faithful
  copy rule, numbers/card-name rules). The user's creation-gate approvals
  are already recorded in the root Decision Log (D2 mark+slot, D3 modal
  rule, D5 hint placement, D6 width, D9 format) — M1 writes them into
  canon; no new gate round is needed unless implementation hits something
  the root plan didn't decide.

## Plan of work

### M1 — Canon before code (design-system docs only)

**Step 1 — `design-system/components/core/modal.md`: slam-rule amendment
(F5.3, root D3).** Revise the Rules bullet "a modal must never be used
during the slam window" to scope it to **game-action** modals: no modal
that performs or confirms a game action may be required, opened by the
system, or block input during the slam window; an **opt-in reference
overlay** (the how-to-play guide) stays available in every phase, and
missing a slam while reading is the player's own cost. Keep the original
intent explicit ("the game does not pause for anyone's modal — timers keep
draining behind the scrim" stands verbatim). Add a Revisions entry (r2,
CAM-30) explaining that the r1 rule predates any player-openable modal.

**Step 2 — `design-system/components/core/app-shell.md`: help-slot
revision (F5.1, F5.2, root D2).** Revise Anatomy to document the help
icon-button beside settings in the header's right group **and** in the
game state's floating icon pair; document the `MarkHelp` "?" mark here
(the marks have no doc file of their own — `marks.tsx` is their code home,
and app-shell.md r2 is where the settings mark's render-only-with-handler
rule was canonized, so this doc is the marks' canon home for this task —
the "and/or" in root F5.1 resolves to app-shell.md alone). Carry the same
rule as settings: the control renders only when a handler is supplied, and
its accessible label is "How to play". Add a Revisions entry (r5, CAM-30).

**Step 3 — new extension doc + index line (F5.4).** Create
`design-system/components/extensions/how-to-play-guide.md` in the
component-file format from `design-system.md`'s creation gate (net-new
file: full section set, `status: draft`, `version: 1`, `extends: modal` —
the guide is a content pattern hosted entirely in the canon Modal, not a
new overlay primitive). Content: Anatomy (Modal at canon width, sentence-
case title "How to play" in the default `ui` face — reference material,
not a shout moment; body = typeset sections + `table` component for the
scoring, powers, and slam-outcome tables per root D9); States (the Overlay
class MVS: open / closing / overflow — overflow is the normal state, the
body scrolls); Rules (copy is authored from the `cambio-rules` skill +
ADRs 0009–0012/0036/0039/0040 and re-verified against them on every edit,
never from priors; memory-faithful — the guide never offers or implies a
tracking aid (F2.3); available in every phase including the slam window
per modal.md r2; voice.md terminology is binding). Then add the one-line
entry to the **Extensions index** in `design-system/design-system.md`
(currently "(empty — nothing born yet)").

_Checkpoint:_ docs only; the format-markdown hook keeps prettier green.
Commit before code so M2/M3 build against canon.

### M2 — Primitives (`packages/ui`, test-first)

**Step 4 — tests first in `packages/ui/test/app-shell.test.tsx`.** Extend
the existing describes (same `render` + `getByLabelText`/`queryByLabelText`
patterns): the help button renders in default chrome when `onHelp` is
supplied and fires the callback on click; it renders inside the game
state's floating controls column too; it does **not** render when `onHelp`
is absent (the never-inert rule, mirroring "the settings control renders
only when a handler exists"); it is queryable by accessible name "How to
play". Run and watch them fail.

**Step 5 — `MarkHelp` in `packages/ui/src/lib/marks.tsx`.** A drawn "?" in
the mark language: spread the shared `base` (16×16 viewBox, 2px
`currentColor` stroke, `aria-hidden`), hook curve + dot as paths —
advisory sketch; match `MarkSettings`'s style of filled-dot accents if the
stroke-only glyph reads poorly at 16px. No Unicode glyph (design-gate D8
finding, CAM-15: glyphs render at font metrics and don't merge with the
drawn artwork).

**Step 6 — `onHelp` on `AppShell`
(`packages/ui/src/components/app-shell.tsx`).** Add `onHelp?: () => void`
to `AppShellProps`; add a `HelpButton` mirroring `SettingsButton` exactly
(render-only-with-handler, `Button variant="icon"`, `MarkHelp` at
`size-4`), placed in **both** chrome states' control groups (default
header :103-109 and game floating pair :90-94).

**Accessible-label decision (owed to the parent task): hardcode
`aria-label="How to play"` in `packages/ui`, no label prop.** Justification:
the `packages/ui` ban is on _app knowledge_ — contracts types, routes,
game vocabulary (frontend-architecture skill). "How to play" contains no
Cambio vocabulary (nothing from voice.md's canonical-terms table, no rank,
no rule) and presupposes only "an app with something to play", the same
genericity class as the hardcoded "Settings" label one function above; the
component stays renderable in any app. Hardcoding keeps the canon label
(app-shell.md r5, root F1.1) single-sourced instead of copied into three
containers, and mirrors the `SettingsButton` precedent byte-for-byte.
Rejected: a `helpLabel` prop — three duplicated call-site copies of a
spec-fixed string, drift risk, and an open invitation to off-canon labels.

_Checkpoint:_ `pnpm turbo test --filter @cambio/ui` green; repo compiles.

### M3 — The guide (`apps/web`)

**Step 7 — rules copy module:
`apps/web/src/components/help/how-to-play-copy.ts`.** A new `help/`
sibling to `components/game/` and `components/identity/`. Module-scope
exported constants (scaling the `DENIAL_COPY` keyed-record precedent,
`room-screen.tsx:34-54`): structured section data — heading + paragraphs
per section, plus row arrays for the three tables (scoring, powers, slam
outcomes). Sections per F2.1: setup, scoring, taking a turn, power cards,
slamming, rare situations (zero cards, fizzles, empty discard, reshuffle),
how the game ends. **The copy is authored with the `cambio-rules` skill
and ADRs 0009–0012, 0036, 0039, 0040 open — transcribed from those files,
never from memory** (published variants differ deliberately; a prior-
knowledge guess here is the exact failure mode the anti-prior guard
exists for). Every load-bearing fact in root F2.2 must appear: 2–4
players; 4 face-down cards; **no opening peek**; discard starts empty;
the scoring table with suit-split kings and the true minus sign (`−1`,
`−2` — voice.md); the three-way turn choice with immediate game end on a
call, the must-swap discard take, and the **obligation** to play a drawn
power; the four powers by targeting; slam matching **by rank, not score**,
the four outcome cases, and the public momentary reveal; the rare
situations (ADR-0009 draw-then-give, ADR-0010 fizzle, ADR-0012 no window
on empty discard, ADR-0040 eager reshuffle keeping the top card); lowest
total wins, zero cards loses to negatives, ties are possible. Voice
(F2.4): sentence case throughout, canonical terminology only, card names
spelled out in running copy, no over-promise adjectives. One module so
`/review`'s line-by-line fidelity diff reads a single file.

**Step 8 — guide component:
`apps/web/src/components/help/how-to-play-guide.tsx`.** Presentational
(components layer: all data via props/constants, no fetching, no stores):
renders `Modal` with `open`/`onClose` passed through, title "How to play"
(default `ui` face — decision recorded in the step-3 extension doc), body
mapping the copy module's sections to design-system typography and the
`ui` `Table` component for the three tables (table.md: header row rules,
numeric columns right-aligned in `numeral` type — the scoring column). No
footer (the ✕/Esc/scrim escapes suffice; a "Close" button would add a
primary with nothing to say). Canon width stands (D6) — if the rendered
check in M5 shows the tables genuinely failing at 28rem, STOP and reopen
the creation gate; do not improvise a size variant.

**Step 9 — wiring the three containers.** In `lobby-screen.tsx`,
`room-screen.tsx`, and `game-screen.tsx`: one
`const [helpOpen, setHelpOpen] = React.useState(false)` per container,
`onHelp={() => setHelpOpen(true)}` on the existing `AppShell` element, and
`<HowToPlayGuide open={helpOpen} onClose={() => setHelpOpen(false)} />`
rendered unconditionally beside the shell's children — **never gated or
force-closed by game state** (F1.3): no phase check may touch `helpOpen`.
Placement justification (logic-in-hooks discipline): this is a single
boolean of pure UI state with no derivation and no side effects — the
`confirmCambioOpen` precedent (`game-screen.tsx:379` post-implementation,
was :334) already keeps such state as a bare `useState` where the modal
renders; a custom hook would be ceremony without logic to hold. It lives
in the **container** (not the route) because containers own state for
their surface. On the game screen the state lives in `GameScreen` (the
shell owner, now at :1120), not `GameTable`. Modal.md's one-modal rule
needs no code: the native
`<dialog>` makes the page inert while open, so the guide and the Cambio
confirm cannot stack by construction.

**Step 10 — gallery entry.** Add a section to
`apps/web/src/components/gallery/game.tsx` (the guide carries game
vocabulary, so it sits with the game sections): a `StateCard` with an open
button driving the real `HowToPlayGuide`, following the modal StateCard
pattern in `generic.tsx:328-344`.

**Step 11 — M3 tests.** In `apps/web/test/lobby-screen.test.tsx`,
`room-screen.test.tsx`, and `game-screen.test.tsx` (existing suites,
existing harness): entry-point presence — the "How to play" button
renders on each of the three screens' production render (F1.2, which also
pins F1.1's label end-to-end); open/close — clicking it opens the guide
dialog (`getByRole("dialog", { hidden: true })`) and ✕ closes it (modal
internals are already pinned by `packages/ui/test/modal.test.tsx`; the
container test only proves the wiring); copy spot-pins inside the open
dialog (F2.2) — at minimum the king scores (suit-split, true minus), the
no-opening-peek statement, the obligatory-power statement, and the
rank-not-score slam wording; a memory-faithful sweep (F2.3) — the guide's
rendered text never offers tracking (assert the pinned phrasing that
remembering is the game, and that opening the guide adds no requests
beyond the existing set — the harness `calls` recorder); slam-window
availability (F1.3) — bootstrap with `slamWindowView`, open the guide,
assert the dialog is open while the slam timer still renders; and
guide-survives-phase-change (F1.3) — open the guide, drive a phase change
through the fake realtime + reassigned view handler (the suite's standard
broadcast-then-refetch pattern), assert the dialog is still open.

_Checkpoint:_ `pnpm turbo test --filter web --filter @cambio/ui` green.

### M4 — Power hints + indicator copy (`apps/web`)

**Step 12 — widen the turn-status derivation (F4.1, F4.2).** In
`game-screen.tsx`: let the phase tag survive to the copy function —
advisory shape: add an optional flag (e.g. `resolvingPower: true`) to the
`TurnStatus` interface, set by `turnStatus` for the `ResolvingPower` and
`ResolvingQueenSwap` cases, and branch on it in `turnStatusCopy`'s
`other-turn` arm: `` `${activePlayerName} is playing a power card` ``
(exact string — root F4.1). `your-turn` copy stays "Your turn" (the holder
gets the held-card hint instead); the `state` union and `TurnIndicator`
are untouched (F4.2 — no `turn-indicator.md` revision). The copy never
names the rank or power (F4.3) — structurally guaranteed, since the
non-holder payload carries no card field to name it from.

**Step 13 — holder hint under the held card (F3, root D5/D7).** Derive
the hint in `game-screen.tsx` from the **affordances**, never the raw
phase: when `affordances.phase === "ResolvingPower" && affordances.holder`,
map `affordances.targeting.kind` to the F3.1 spec strings — `peek-own` →
"Peek at one of your own cards"; `peek-other` → "Peek at one of another
player's cards"; `swap-two` → "Blind-swap any two held cards";
`queen-peek` → "Peek at any card, then blind-swap any two held cards" —
and when `affordances.phase === "ResolvingQueenSwap" && affordances.holder`,
"Now blind-swap any two held cards" (F3.2). These strings are **spec**
(root plan F3), keyed as a module-scope record (the copy-constant
precedent). Keying off `targeting` (D7) keeps the hint uniform across both
power phases and independent of any `card` field — the queen-swap
affordance deliberately carries none. Render it as a second line in the
`HeldCard` label region: add an optional `hint?: string` prop to
`apps/web/src/components/game/held-card.tsx` (rendered as a second muted
line under `label`, only when present), passed from the held-card render
site (:788-800 post-implementation, was :739-750) only when the
derivation produced one — absent in
`HoldingCard`, absent for non-holders, gone the instant the phase leaves
(F3.3: it derives from the current view's affordances and persists
nowhere). **Canon bookkeeping:** this is a change to a canonical
component — add an r2 Revisions entry to
`design-system/components/core/held-card.md` in the same commit (the
user's approval is root Decision Log D5; the doc entry records it, it is
not a new gate round). Note for `/review`: this held-card.md touch is one
doc beyond root F5's enumerated list — flagged in Surprises below.

**Step 14 — M4 tests in `apps/web/test/game-screen.test.tsx`** (reusing
the `resolvingPowerView(card)` fixture and, for queen-swap, a
`viewResponse` with a `ResolvingQueenSwap` phase literal): holder hint per
targeting kind — a 7-or-8 view shows the peek-own string, 9-or-T the
peek-other string, J the swap-two string, Q the queen-peek string (exact
strings); `ResolvingQueenSwap` shows the swap-step hint; the hint
disappears with the phase (drive the view from `ResolvingPower` back to
`AwaitingDraw` via the reassign-handler + broadcast pattern; assert the
hint text is gone — F3.3); the non-holder renders no hint and sees the
"⟨Name⟩ is playing a power card" indicator copy instead (bootstrap the
same phases with `playerId: FRIEND.id`; query the indicator via
`document.querySelector('[role="status"][data-state]')` and assert
`data-state="other-turn"` — F4.1/F4.2 together); the non-active copy for
`ResolvingQueenSwap` reads the same power-card line; and the active
player's indicator still reads "Your turn" during their own power phases.
A component-level render test for the new `hint` prop can extend
`apps/web/test/held-card.test.tsx`. **The existing hidden-information
structural sweeps stay byte-untouched** (describe "hidden information
(C5, structural sweep)") — they must pass unchanged; if a new surface
needs sweeping, add new tests, never edit the pins (F3.4).

_Checkpoint:_ `pnpm turbo test --filter web` green, sweeps unchanged.

### M5 — Close-out

**Step 15.** Full gate, bare (never piped). Dev-server walkthrough:
`pnpm dev`, **freshness-check the Vite server first** (fetch a
changed module through `/@fs/` and grep for a new symbol, per AGENTS.md;
restart if stale); walk lobby → room → game, open the guide from each
screen, seed a game and draw a power card in two browsers to observe the
hint + the other viewer's indicator copy, open the guide during a slam
window. Advisory `ai-tells`/`gate` pass on the guide and hint surfaces
(design system outranks their findings — surface conflicts, never
auto-fix). Reconcile this plan's coverage table against as-built tests;
grep this doc and the root plan for `:<digits>` anchors into files the
diff touched; fill root-plan Progress/Outcomes; hand the copy-fidelity
line-by-line diff to `/review` (root acceptance criteria).

## Concrete steps & validation

Run per-package suites **through turbo** (bare package scripts run against
stale dist); bare `vitest run <file>` only to iterate on one suite after a
build. Never pipe the gate.

- After M1: `git status` shows only the three design-system docs +
  `design-system.md`; prettier is green via the markdown hook.
- After M2: `pnpm turbo test --filter @cambio/ui` — the app-shell suite
  passes with the new help-button tests; the modal suite is untouched.
- After M3: `pnpm turbo test --filter web --filter @cambio/ui` — lobby,
  room, and game suites pass with the new entry-point/guide tests.
- After M4: `pnpm turbo test --filter web` — game-screen suite passes; the
  two hidden-information sweep tests pass **unchanged**;
  `apps/web/test/affordances.test.ts` passes untouched.
- Close-out gate: `pnpm turbo build typecheck lint test` (bare; check the
  exit code directly).
- Manual: the M5 walkthrough above, including the two-browser power draw
  and the slam-window guide check.

## Contract coverage

_(maintained by `/implement`, verified by `/review`: one row per root-plan
contract clause this side owns — the test that pins it, or why none can.
Each row must also say **what is asserted**, in one phrase. **At plan
time, fill only the Clause column plus a planned-approach note**; test
file, name, and assertion phrase are written by `/implement` when the test
actually lands. A plan-time row that invents a test title and assertion is
an overclaim waiting to become a review finding.)_

| Clause | Test (file + name)                                                                                                                                                                                                                                                                                                                                                                                                | What is asserted                                                                                                                                                                       |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1.1   | packages/ui/test/app-shell.test.tsx — "renders the help button in default chrome when onHelp is supplied, and fires it on click", "renders the help button inside the game state's floating controls column", "does not render the help control when no handler is supplied (never an inert affordance)"                                                                                                          | help icon-button renders in both chrome states only with a handler, accessible label "How to play", fires the callback on click                                                        |
| F1.2   | apps/web/test/lobby-screen.test.tsx "opens the guide from the lobby's help icon-button and closes it", apps/web/test/room-screen.test.tsx "opens the guide from the room's help icon-button and closes it", apps/web/test/game-screen.test.tsx "opens the guide from the game screen's help icon-button and closes it"                                                                                            | the "How to play" button renders on the production render of each of the three screens                                                                                                 |
| F1.3   | apps/web/test/game-screen.test.tsx — "stays open during the slam window and never blocks the timer (F1.3, modal.md r2)", "survives a phase-change refetch instead of being force-closed (F1.3)"                                                                                                                                                                                                                   | guide opens and stays open during a SlamWindow phase alongside the live timer, and survives a refetched phase change instead of being force-closed                                     |
| F2.1   | apps/web/test/game-screen.test.tsx — "opens the guide from the game screen's help icon-button and closes it"                                                                                                                                                                                                                                                                                                      | Modal dialog opens titled "How to play"; all seven F2.1 section headings (Setup, Scoring, Taking a turn, Power cards, Slamming, Rare situations, How the game ends) render inside it   |
| F2.2   | apps/web/test/game-screen.test.tsx — "the guide's rules copy matches canon on the load-bearing spot-pins (F2.2)"; full-breadth fidelity verified by /review's line-by-line diff against cambio-rules + the cited ADRs                                                                                                                                                                                             | no-opening-peek statement, suit-split king scores with the true minus sign, the obligatory-power statement, and rank-not-score slam wording all render verbatim inside the open dialog |
| F2.3   | apps/web/test/game-screen.test.tsx — "never offers or implies a card-tracking aid, and opening it makes no new requests (F2.3)"                                                                                                                                                                                                                                                                                   | the rendered guide states remembering is the game; opening it adds no HTTP requests beyond the harness's recorded bootstrap set                                                        |
| F2.4   | voice compliance verified by /review's copy pass; the F2.2 spot-pins mechanically hold exact canonical phrasing and the true minus sign                                                                                                                                                                                                                                                                           | terminology and minus-sign correctness mechanically pinned by F2.2; full sentence-case/register compliance is a /review line-by-line finding                                           |
| F3.1   | apps/web/test/game-screen.test.tsx — "holder sees the %s hint under the held card (F3.1)" (parameterized: 7H, 8H, 9H, TH, JH, QH); apps/web/test/held-card.test.tsx — "renders the hint as a second line beneath the label when supplied"                                                                                                                                                                         | each targeting kind renders its exact F3.1 spec string under the held card, scoped to the held-card spot; the component renders an arbitrary hint as a second muted line               |
| F3.2   | apps/web/test/game-screen.test.tsx — "ResolvingQueenSwap holder sees the swap-step hint (F3.2)"                                                                                                                                                                                                                                                                                                                   | a ResolvingQueenSwap holder sees "Now blind-swap any two held cards", derived from a fixture carrying no card field                                                                    |
| F3.3   | apps/web/test/game-screen.test.tsx — "the hint disappears once the phase leaves ResolvingPower (F3.3)"                                                                                                                                                                                                                                                                                                            | the held-card spot itself disappears once a broadcast + refetch move the phase to AwaitingDraw — the hint has no host left to persist in                                               |
| F3.4   | apps/web/test/game-screen.test.tsx — "non-holder renders no hint and the indicator reads the power-card copy (F4.1, F4.3)"; pre-existing and untouched: apps/web/test/affordances.test.ts "non-holder: nothing (no card field — pinned by ViewFor.test.ts)" and packages/application/test/ViewFor.test.ts; the "hidden information (C5, structural sweep)" describe in game-screen.test.tsx passes byte-unchanged | the held-card region carries no F3 hint string for a non-holder; every existing hidden-info structural pin still holds                                                                 |
| F4.1   | apps/web/test/game-screen.test.tsx — "non-holder renders no hint and the indicator reads the power-card copy (F4.1, F4.3)", "the non-active copy for ResolvingQueenSwap reads the same power-card line (F4.1)"; the parameterized F3.1 holder tests additionally assert the holder still sees "Your turn"                                                                                                         | non-active viewers see "<Name> is playing a power card" for both ResolvingPower and ResolvingQueenSwap; the active holder still sees "Your turn"                                       |
| F4.2   | same F4.1 tests assert data-state="other-turn" on the indicator via document.querySelector('[role="status"][data-state]'); TurnIndicatorProps's 4-value union is unchanged, held by typecheck + this review                                                                                                                                                                                                       | no new indicator state value exists; the power-card copy rides the existing other-turn state                                                                                           |
| F4.3   | asserted structurally alongside F4.1 — apps/web/test/game-screen.test.tsx "non-holder renders no hint and the indicator reads the power-card copy (F4.1, F4.3)" scopes a negative assertion for any F3 hint string, and the fixture's non-holder phase carries no card field to name a rank from                                                                                                                  | the non-active copy names no rank and no power — structurally guaranteed by the missing card field, not by string-matching                                                             |
| F5.1   | verified by review, no test — `MarkHelp` canonized in app-shell.md r5 (M1 step 2); doc-vs-code check in `/review`                                                                                                                                                                                                                                                                                                 | doc review                                                                                                                                                                             |
| F5.2   | verified by review, no test — app-shell.md r5 help-slot revision (M1 step 2)                                                                                                                                                                                                                                                                                                                                      | doc review                                                                                                                                                                             |
| F5.3   | verified by review, no test — modal.md r2 slam-rule amendment (M1 step 1); its behavioral consequence is pinned by the F1.3 tests                                                                                                                                                                                                                                                                                 | doc review                                                                                                                                                                             |
| F5.4   | verified by review, no test — extension doc + extensions-index line (M1 step 3)                                                                                                                                                                                                                                                                                                                                   | doc review                                                                                                                                                                             |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [x] 2026-09-08 11:05 — frontend child plan written (all cited anchors
      verified against `release-v0`); implementation not started.
- [x] 2026-09-08 — M1–M5 implemented in full (see root plan Progress for
      the milestone-by-milestone log and commit hashes); full gate green;
      contract-coverage table filled with as-built test names; `:<digits>`
      anchors in this doc and the root plan corrected post-implementation.

## Surprises & notes for the root plan

- **held-card.md r2 is a fourth canon-doc touch** beyond root F5's
  enumerated three: the F3 hint is a second line inside `HeldCard`
  (root D5, user-approved), which means an optional `hint` prop on a
  canonical game object — the Revisions entry ships with the M4 code
  (doc-ships-with-code), and `/review` should treat it as covered by D5's
  approval, not as an unapproved canon change. held-card.md r1's Rules
  also say "nothing here implies an affordance" — the hint is instruction
  copy about the current obligation, not an affordance control (targeting
  stays on the hands), and the r2 entry should say so explicitly.
- The marks have no doc file of their own; this plan resolves root F5.1's
  "and/or" to **app-shell.md alone** as the `MarkHelp` canon home
  (matching where the settings mark's rules already live).
- `game-screen.tsx:165-167` post-implementation (was :150-152 pre-task —
  this task's M4 additions shifted it) carries the unverified comment root
  plan Surprises already flagged (`ResolvingQueenSwap.card` "always absent
  by server construction" vs `ViewFor.ts:57` projecting it to the holder).
  Step 13 deliberately never reads that field (D7) — did not "fix" the
  comment in this task's diff.
- The guide modal and the Cambio confirm cannot stack (native `<dialog>`
  inertness), so modal.md's one-modal rule needs no coordination code —
  worth a line in the r2 amendment only if `/implement` finds otherwise.
