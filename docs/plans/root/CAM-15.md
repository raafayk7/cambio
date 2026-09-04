# CAM-15 — UI core: Minimum Viable Components + game-object extensions

- **Linear:** [CAM-15](https://linear.app/raafayk7/issue/CAM-15/ui-core-minimum-viable-components-game-object-extensions)
- **Scope:** frontend
- **Child plans:** [frontend](../frontend/CAM-15.md)
- **ADRs:** 0030 (testing-library + jsdom for component tests), 0031
  (@fontsource self-hosted fonts). ADR-0027 (Tailwind v4 @theme tokens,
  from CAM-14) is the spec this task executes.

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

After this task, every component the game's screens need exists and renders
in Cambio's actual visual identity: the full design-system core — 17
generic components in `packages/ui` and 9 game objects in `apps/web` —
styled entirely from the token vocabulary, with the real typefaces loaded,
every component covering its class's Minimum Viable States. Observe it at
`/dev/components` (dev builds only): a gallery mounting all 26 components
in every required state, which is also the input the design-gate's rendered
path screenshots. CAM-16 then composes screens from these parts without
inventing anything visual.

## Context & orientation

- **The design system is law.** `design-system/` (release branches only)
  carries 26 component spec files under `components/core/`, tokens in
  `references/tokens.md`, voice in `references/voice.md`, patterns in
  `patterns/`. The router `design-system/design-system.md` defines the MVS
  floor per class and the creation gate (nothing canonical invented or
  modified without explicit user approval). The Extensions index is empty;
  tabs/pagination/tooltip/textarea/radio/dropdown-menu are deliberately
  excluded from this task (Decision Log).
- **The token mapping does not exist yet.** `packages/ui/src/styles.css`
  is still the stock shadcn scaffold (its own comment says "replace
  wholesale"); ADR-0027 §Decision is the spec for the replacement and
  explicitly assigns the mapping to CAM-15. Zero overlap exists today
  between tokens.md and the CSS. The fonts (Alfa Slab One, Archivo) are
  loaded nowhere in the repo.
- **Current frontend state:** `packages/ui` ships raw TS source (no build,
  no tests) with one stock shadcn Button; `apps/web` is TanStack Start
  (file-based routes in `src/routes/`, root document in
  `src/routes/__root.tsx`) with one smoke-test page. No frontend test
  infrastructure exists anywhere. Lint enforces the import law:
  `packages/ui` may import **no** workspace package (not even
  `contracts`); `apps/web` may import only `contracts` and `ui`
  (`packages/config/eslint.base.js`, MAY_IMPORT).
- **What the UI renders:** `packages/contracts` `PlayerGameView`
  (GameView.ts) — hands are occupancy-only slot indices, card values appear
  only in phase variants when the viewer is entitled (absent otherwise,
  not null), `discard[0]` is the top, seat order is array index. Private
  values arrive once via `PlayerGameEvent` and are never re-sent.
- **Governing skills:** `frontend-architecture`, `design-system`,
  `hidden-information`; audit tooling `gate`, `ai-tells`, `impeccable`,
  and the animation skills — all outranked by the design system.
- **Machine prerequisite:** the design-gate rendered path is not installed
  on this machine (`.agents/scripts/design-gate/` has no node_modules).
  One-time setup: `npm install --omit=dev` there, then
  `npx playwright install chromium` (network, ~150 MB).

## Functional contract

Clause IDs are referenced by the frontend child plan's coverage table.

### F1 — Token layer (the executable design system)

- **F1.1** `packages/ui/src/styles.css` implements ADR-0027 exactly: the
  stock shadcn `@theme` set is removed wholesale; unused default
  namespaces are wiped so off-system utilities (e.g. `bg-stone-50`) emit
  nothing; the 13 color primitives from tokens.md exist as plain CSS custom
  properties; exactly the 12 semantic roles are promoted to utilities via
  `@theme inline`, each aliasing its primitive.
- **F1.2** Every scalar token group in tokens.md is expressed: type faces
  and scale (12/14/15/17/22/28/44/64, line-heights 1.5 body / 1.1
  display), spacing (4 8 12 16 24 32 48 64), radius (`sm` 3px, `md` 6px),
  border widths (1.5px interactive / 2px frames), elevation
  (flat/raised/float — zero-blur offset shadows), motion (`ease.snap`,
  `duration.snap` 140ms, `duration.track` 340ms), breakpoints
  (compact <720 / regular ≥720 / wide ≥1200).
- **F1.3** Non-scalar tokens (`radius.card` = 6% of card width; the
  elevation shadows; motion values where utilities don't fit) exist as
  `@utility` or component-level CSS built on the variables — never as
  hardcoded values at use sites.
- **F1.4** Fonts load per ADR-0031: `@fontsource/alfa-slab-one` (400) and
  `@fontsource/archivo` (400/500/600/700) imported in `styles.css`; the
  `display`/`ui`/`numeral` roles use the tokens.md stacks; `numeral`
  applies `font-variant-numeric: tabular-nums`. A rendered page serves
  both real faces with no external font origin.
- **F1.5** No component or route references a removed shadcn utility, and
  no source file under `packages/ui/src/` or `apps/web/src/` contains an
  arbitrary-value styling utility (`bg-[...]`, `p-[13px]`-style) or a
  hardcoded visual value that tokens.md covers (repo-greppable; the
  ai-tells/impeccable checks corroborate).
- **F1.6** A project tokens file for the design-gate hardcheck (spacing
  scale from tokens.md) lands at `packages/ui/hardcheck-tokens.json` —
  beside `styles.css`, its executable sibling, and outside `.agents/` so
  ADR-0028's harness-to-main routing is not implicated — and the
  hardcheck runs with `--tokens` against gallery renders, making token
  self-consistency a measured check rather than an inference.

### F2 — Generic core (17 components in `packages/ui`)

- **F2.1** All 17 exist as exported components: panel, badge, divider,
  button, link, text-field, select, toggle, field-scaffold, modal, toast,
  list, table, loading, empty-state, alert, app-shell — each implementing
  its `design-system/components/core/<name>.md` spec (anatomy, states,
  variants, rules) at its current revision.
- **F2.2** Each component covers its class's MVS floor
  (design-system.md): Interactive → default/hover/focus/active/disabled;
  Input → + empty/filled/error/read-only; Overlay →
  open/closing-dismiss/overflow; Async/data →
  populated/loading/empty/error/partial; Static → default only.
- **F2.3** `packages/ui` keeps zero app knowledge: no workspace imports
  (lint), no game vocabulary in the 17 (naming, props, copy). The
  MAY_IMPORT row for `ui` gains a regression test in
  `packages/config/test/eslint.base.test.ts` (today only the `web` rows
  are pinned).
- **F2.4** Interactive components are keyboard-accessible: focus visible
  via the `accent.focus` ring token, overlays dismiss on Escape, form
  fields associate labels via field-scaffold (asserted by component
  tests, corroborated by the gate's WCAG hard checks on the gallery).

### F3 — Game objects (9 components in `apps/web`)

- **F3.1** All 9 exist under `apps/web/src/components/game/`:
  playing-card, hand, draw-deck, discard-pile, table-surface, seat,
  slam-timer, turn-indicator, score-sheet — presentational, prop-driven
  (no fetching, no stores), typed against `contracts` wire types where the
  shape exists (`CardSlug`, `SlotIndex`, `ViewPhase`).
- **F3.2** playing-card covers the 7-state floor — face-down, face-up,
  peeking, selected, slam-eligible, in-flight, leaving-play — each a
  designed state, none an animation accident.
- **F3.3** **Entitlement is structural:** playing-card renders a face only
  when handed a `CardSlug`; there is no "face-down but value present"
  prop shape. This mirrors the wire, where unentitled payloads carry no
  card field at all — pinned by
  `packages/application/test/ViewFor.test.ts` ("hands are occupancy-only
  for everyone — the viewer's own included"; "HoldingCard from deck:
  value for the holder only") and the adversarial sweep in
  `AdversarialProjection.test.ts`. (Probe-verified against
  `packages/contracts/src/GameView.ts` — optional-absent, never null.)
- **F3.4** **Memory fidelity:** peeking is a transient client state — when
  it ends the card renders as a back, indistinguishable from siblings; no
  component persists, marks, or hints at previously-seen values.
- **F3.5** seat displays only public state (name, card count, connection,
  turn status; states default/active-turn/acting/disconnected/left; `own`
  variant unprivileged). score-sheet appears only from `reveal` data
  (scores exist only at reveal); totals use `numeral` with true minus
  signs per voice.md.
- **F3.6** slam-eligible presents on card backs (pulsing `accent.alarm`
  edge): eligibility public, value hidden. slam-timer renders the window
  from `closesAt`-style props without inventing game rules (duration is
  config-fed, per tokens.md `duration.peek` discipline).
- **F3.7** hand renders occupancy-only slot grids: holes stay holes
  (stable indices, no reflow on removal), matching `ViewFor.test.ts`
  ("holes stay holes: occupied indices are reported as-is, ascending").
- **F3.8** All card/object motion uses `ease.snap` with only
  `duration.snap`/`duration.track`; under `prefers-reduced-motion`,
  movement collapses to cross-fades plus `accent.focus` highlights on
  origin and destination.

### F4 — Seating (the 5th-player resolution)

- **F4.1** table-surface renders 2–5 seats positioned radially from seat
  order (array index), rotated so the viewer's seat is bottom-center;
  the four benches are scenery and never constrain count (seat-arc
  redistribution — user-confirmed reading of table-surface.md). Seat
  geometry for n=2…5 is computed, logic-carrying, and test-first.
- **F4.2** Below the `compact` breakpoint the radial arrangement
  compresses: own hand docks to screen bottom, opponents arc along the
  top, per table-surface.md.

### F5 — Component gallery (the verification vehicle)

- **F5.1** A dev-only route `/dev/components` mounts all 26 components in
  **every** MVS state their class requires (including motion states,
  demonstrable via controls or looping demos, and reduced-motion
  behavior).
- **F5.2** The route is excluded from production behavior: in production
  builds it renders nothing/404 (DEV-gated); no new environment variable
  is introduced.
- **F5.3** The gallery is the design-gate input: the rendered path runs
  against its URL and produces screenshots + hard-check facts for the
  component set.

### F6 — Tests and audits

- **F6.1** Logic-carrying component states are test-first (HANDOFF §12)
  under ADR-0030 (testing-library + jsdom): at minimum — seat-arc
  geometry (F4.1), playing-card state/entitlement rendering (F3.2/F3.3),
  hand hole-preservation (F3.7), field-scaffold label association and
  error wiring (F2.4), overlay dismiss behavior (F2.4), slam-timer
  countdown rendering (F3.6). `packages/ui` and `apps/web` gain `test`
  scripts wired into turbo.
- **F6.2** Every component passes through the `gate` skill (verdicts
  advisory — recorded, conflicts with the design system surfaced, never
  auto-"fixed"); an `ai-tells` audit runs on the produced UI before
  `/review`, findings recorded in this plan.

### Acceptance criteria

- [ ] `pnpm turbo build typecheck lint test` passes (run bare — never
      piped).
- [ ] All 26 components exist in their decided homes and export cleanly;
      the gallery renders all of them in dev.
- [ ] tokens.md ↔ styles.css convergence audit: every tokens.md value
      present, no extra visual vocabulary in the CSS (divergence is a
      defect per ADR-0027).
- [ ] Grep sweeps clean: no stale shadcn utilities, no arbitrary-value
      utilities, no hardcoded token-covered values in `ui`/`web` source.
- [ ] Design-gate rendered run over the gallery completed; WCAG hard-check
      results recorded (contrast rules from tokens.md §Contrast hold, incl.
      small-text-on-alarm using `accent.alarm-deep`).
- [ ] ai-tells audit run and scored; findings addressed or explicitly
      logged as deliberate identity.
- [ ] Any adjustment to provisional tokens.md values (type scale, spacing,
      radius.card, breakpoints) went through the creation gate with user
      approval and landed as a tokens.md revision — or none were needed.
- [ ] ADR-0030 and ADR-0031 remain accurate to what was built.

## Plan of work

**M0 — Ground truth and machinery.** One-time design-gate setup
(`npm install --omit=dev` + `npx playwright install chromium` in
`.agents/scripts/design-gate/`). Add dependencies: fontsource packages
(ui), jsdom + testing-library set (ui and web devDeps), vitest configs and
`test` scripts for both packages, `test/**` added to ui's tsconfig
include. Add the ui-boundary regression test (F2.3). Repo stays green.

**M1 — The token layer freezes first** (the frontend analog of "contracts
freeze before parallel work"): rewrite `packages/ui/src/styles.css` per
ADR-0027 §Decision (wipe, primitives, `@theme inline` roles, `@utility`
non-scalars, font imports), write the hardcheck tokens file (F1.6), sweep
and fix the two stale-utility casualties (the placeholder Button, the
smoke-test route classes). Everything after M1 consumes tokens only.

**M2 — Gallery scaffold + generic core.** Stand up `/dev/components`
early (F5) so every component lands visible; then the 17 in dependency
order: primitives (panel, badge, divider, button, link) → form family
(field-scaffold, text-field, select, toggle) → overlays (modal, toast) →
data (list, table, loading, empty-state, alert) → app-shell. Each
component: read its design-system file's Revisions, implement current
version, cover MVS, tests where logic lives, gallery entries in all
states.

**M3 — Game objects** in `apps/web/src/components/game/`, roughly
playing-card → hand → draw-deck/discard-pile → seat → table-surface
(seat-arc geometry, test-first) → slam-timer → turn-indicator →
score-sheet. Motion per F3.8, CSS-only.

**M4 — Audit pass and token feedback.** Design-gate rendered runs over
the gallery; ai-tells audit; impeccable observations triaged (design
system outranks — conflicts surfaced to the user, never auto-fixed). Any
provisional-token adjustments discovered by rendering go to the user
through the creation gate and land as tokens.md revisions mirrored in
styles.css.

**M5 — Close-out.** Coverage table completed by `/implement` as tests
land; full gate; plan docs current; Linear updated.

Milestone order rationale: tokens are the shared contract every component
consumes (M1 before M2/M3); the gallery is the observation instrument so
it precedes the components it observes; generic components precede game
objects because game objects compose ui primitives and reuse their
patterns; audits run when there is a complete surface to audit.

## Validation

- **Unit/component tests** (ADR-0030): run via
  `pnpm turbo test --filter @cambio/ui --filter @cambio/web`. Prove the
  logic-carrying clauses: F2.4, F3.2, F3.3, F3.4, F3.7, F4.1, F6.1. The
  coverage table in the frontend child plan maps clause → test as each
  lands.
- **Rendered validation:** `pnpm dev`, open `/dev/components`; design-gate
  `render.js --url http://localhost:3000/dev/components` (+ per-section
  URLs if the gallery is split), then `hardcheck.js --facts … --tokens …`.
  Expected: WCAG contrast passes per tokens.md's verified ratios; spacing
  conforms to the 4-based scale.
- **Static sweeps:** grep for removed shadcn utilities, `\[#`/arbitrary
  values in `ui`/`web` src, `font-family` outside styles.css.
- **Boundary:** `pnpm turbo lint` (includes the new ui-row regression
  test via `packages/config` tests and format:check).
- **Full gate:** `pnpm turbo build typecheck lint test` — bare, exit code
  checked directly.

## Progress

_(updated continuously; append new entries at the BOTTOM — newest last;
timestamp each entry)_

- [ ] 2026-09-04 — plan written; awaiting sign-off

## Decision log

- 2026-09-04 — **Scope is the canonical 26** (17 generic + 9 game
  objects), not the issue's "~21" paraphrase — the Design MD's component
  list is law; the deliberately-excluded six (tabs, pagination, tooltip,
  textarea, radio, dropdown-menu) stay unbuilt until a screen needs them
  through the creation gate; checkbox appears in no canonical list and is
  likewise not built. (User call, interview round 1.)
- 2026-09-04 — **5-player seating = seat-arc redistribution**: seats
  space radially by seat order regardless of the four scenery benches —
  this is table-surface.md's existing rule, confirmed by the user; no
  design-system amendment needed. (User call, round 1.)
- 2026-09-04 — **Verification vehicle = dev-only gallery route**, not
  Storybook (new dependency surface) and not tests-only (no rendered
  gate input). (User call, round 1.)
- 2026-09-04 — **Game objects live in `apps/web/src/components/game/`**,
  generic 17 in `packages/ui`: the frontend-architecture skill bars game
  vocabulary from `ui`, and `web` placement lets props type directly
  against `contracts` (`ui` may import nothing, so keeping them there
  would force duplicated unions). Below the ADR bar — fully determined
  by the existing skill rule. (User call, round 2.)
- 2026-09-04 — **CSS-only motion for CAM-15**: transitions/keyframes on
  the two duration tokens; no animation library. Revisit trigger:
  CAM-16's slot-to-slot choreography (FLIP/library decision happens
  there, as an ADR if a dependency is added). (User call, round 2.)
- 2026-09-04 — **Gallery gating via `import.meta.env.DEV`** — no new
  `VITE_*` variable (turbo strict-env plumbing not worth it for a dev
  surface); route renders nothing in prod builds.
- 2026-09-04 — **Close the ui-boundary test gap**: MAY_IMPORT's `ui: []`
  row gets a regression test alongside the existing web-row pins — cheap,
  and this task is the first real consumer of that row.
- 2026-09-04 — **loading's card-back spinner stays in `packages/ui`**:
  the striped mark is generic visual decoration drawn purely from tokens
  (no contracts types, no game props) — the game-vocabulary bar targets
  props/APIs, not motifs. loading implements `loading.md` verbatim.
  (User call, round 3.)
- 2026-09-04 — **`rounded-full` blessed as the pill idiom** for badge
  count and seat pills: "fully rounded" is a shape idiom (9999px), not a
  scale value; no `radius.full` token minted. (User call, round 3.)
- 2026-09-04 — **Spec-carried values are canon, theme-fixed surfaces
  recorded**: opacity levels, toast dwell, thrown angles implement as
  component CSS citing their spec file — no tokens.md promotion; the
  primitive-bound surfaces (card back, link hover, scrim, skeleton, rim)
  are deliberately theme-fixed, to be revisited by the dark-theme task.
  (User call, round 3.)
- 2026-09-04 — **Courtyard illustration deferred**: CAM-15 ships the
  token-expressible scene grounds (plain cream; checkered paving); the
  lobby's illustrated courtyard is an open gap scheduled with CAM-16's
  screens. (User call, round 3.)
- 2026-09-04 — **Hardcheck tokens file lives at
  `packages/ui/hardcheck-tokens.json`**, not under `.agents/` — it
  derives from tokens.md (release-branch content), so placing it in
  harness territory would collide with ADR-0028's land-on-main rule.
  (Planner call resolving the child plan's flag.)

## Surprises & discoveries

- 2026-09-04 (planning) — The issue brief implies the ADR-0027 token
  mapping exists ("styled entirely from tokens.md" atop CAM-14); it does
  not — `packages/ui/src/styles.css` is still stock shadcn, and ADR-0027
  itself assigns the mapping to CAM-15. M1 exists because of this.
- 2026-09-04 (planning) — Replacing the shadcn `@theme` set breaks
  existing class references **silently** (Tailwind v4 emits nothing for
  unknown utilities — no build error): the placeholder Button and the
  smoke-page classes must be swept in M1, and future sweeps are grep-based,
  not compiler-based.

## Outcomes & retrospective

_(filled at the end, typically by `/review`)_
