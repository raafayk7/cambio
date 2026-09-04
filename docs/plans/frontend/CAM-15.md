# CAM-15 — UI core: Minimum Viable Components + game-object extensions (frontend)

- **Root plan:** [root/CAM-15.md](../root/CAM-15.md) — the functional
  contract lives there; this document is implementation detail for the
  frontend (the only side this task touches).

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

**Layer skills in force:** `frontend-architecture` (projection renderer;
the `apps/web` vs `packages/ui` split; logic in hooks; lint-enforced import
rows), `design-system` (router `design-system/design-system.md`; every
visual value maps to a token; the creation gate; component files are law at
their current revision), `hidden-information` (entitlement is structural;
memory fidelity; a missing field is a `viewFor`/contracts change, never a
client workaround). Audit tooling — `gate`, `ai-tells`, `impeccable`, the
animation skills — is advisory and outranked by the design system.

**Specs implemented from, not paraphrased:** ADR-0027 (the token mapping —
`docs/adr/0027-tailwind-v4-theme-css-variable-tokens.md` §Decision is the
spec M1 executes), ADR-0030 (testing-library + jsdom under vitest),
ADR-0031 (@fontsource self-hosted fonts as `packages/ui` deps).

**Current state (verified during planning):**

- `packages/ui` ships raw TS source: `exports` maps `.` →
  `./src/index.ts` and `./styles.css` → `./src/styles.css`; no build step,
  scripts are `typecheck` + `lint` only. Deps: `@radix-ui/react-slot`,
  `class-variance-authority`, `clsx`, `tailwind-merge`; peer
  react/react-dom ^19. `tsconfig.json` includes `src/**` only — tests need
  `test/**` added. One component exists (`src/components/button.tsx`,
  stock shadcn — rewritten per `design-system/components/core/button.md`);
  `src/lib/utils.ts` has `cn()`.
- `packages/ui/src/styles.css` is stock shadcn: one `@theme` block of 19
  oklch `--color-*` tokens + `--radius`, plus an `@layer base` referencing
  them. ADR-0027's structure (namespace wipe, 13 primitives as plain
  custom properties, 12 semantic roles via `@theme inline`, `@utility`
  non-scalars) is entirely unbuilt — M1 writes it. Line 1
  (`@import "tailwindcss"`) and the `@source "./"` directive stay
  (workspace packages are symlinked under node_modules, which Tailwind's
  auto-detection skips).
- `apps/web` is TanStack Start: file-based routes in `src/routes/`
  (`createFileRoute`; `src/routeTree.gen.ts` is generated), root document
  `src/routes/__root.tsx` (stylesheet wired in the head `links` array via
  `../styles.css?url`), `src/router.tsx` creates a fresh QueryClient per
  request — a hidden-information safeguard, **do not change**.
  `vite.config.ts` plugin order `tailwindcss()` → `tanstackStart()` →
  `viteReact()` is load-bearing. `apps/web/src/styles.css` imports
  `@cambio/ui/styles.css` then declares `@source "./"`. One page,
  `src/routes/index.tsx` (scaffold smoke test), uses
  `text-muted-foreground` — dead the moment the shadcn tokens are wiped;
  M1 sweeps it. `import.meta.env` is typed (`vite/client`); `DEV`/`PROD`
  available.
- Lint: `packages/config/eslint.base.js` MAY_IMPORT — `ui: []` (nothing,
  not even contracts), `web: ["@cambio/contracts", "@cambio/ui"]`.
  External npm deps are not restricted for ui/web. Zod banned;
  `consistent-type-imports` enforced (inline type imports). Prettier: no
  semicolons, double quotes, printWidth 100; enforced by the root
  `//#format:check` turbo task that `lint` depends on. `.tsx`/`.css` are
  **not** auto-formatted by hooks — run `pnpm format` before the gate.
- `packages/config/test/eslint.base.test.ts` drives ESLint
  programmatically against fixture strings (see its `lintErrors` helper
  and the existing pin "blocks apps/web importing the
  @cambio/domain/testing subpath") — the pattern for the new ui-row
  regression test (F2.3). Today only web rows are pinned.
- Contracts the game objects type against (`web` may import; `ui` may
  not): `GamePrimitives.ts` — `Rank`, `CardSlug` (e.g. `"AS"`),
  `SlotIndex` (stable, holes never shift), `SlotRef`, `PowerKind`;
  `GameView.ts` — `PlayerGameView` (players in seat order, `deckCount`,
  `discard` with `discard[0]` = top, `phase` tagged union, optional
  `reveal`), `ViewPlayer.hand: ReadonlyArray<SlotIndex>` (occupancy only),
  `ViewPhase` variants incl. `SlamWindow { turnPlayerId, closesAt, rank }`
  and `HoldingCard { card?: CardSlug }`. Card values are optional-absent
  when unentitled (`exactOptionalPropertyTypes` is on repo-wide) — never
  null, never a redacted placeholder.
- No frontend test infra exists. Backend pattern:
  `packages/application/vitest.config.ts` (minimal `defineConfig`,
  `include: ["test/**/*.test.ts"]`); turbo `test` task dependsOn
  `^build`; canonical invocation `pnpm turbo test --filter <pkg>`; never
  pipe the gate (PreToolUse hook blocks it).
- Design-gate rendered path: `.agents/scripts/design-gate/render.js`
  takes `--url`/`--file`/`--html` + `--out`, emits `<out>.png` +
  `<out>.facts.json`; `hardcheck.js --facts <f> [--tokens <json>]` — a
  tokens file with a `"spacing"` array upgrades spacing-grid inference to
  a hard check. Machine setup not done yet (M0). The auto-gate PostToolUse
  hook fires on every `.tsx` write (skipping test/spec/stories/config
  files) — expect ~26 advisory nudges during implementation; the intended
  workflow is one gate run against the gallery URL per milestone, not per
  file.
- Fonts: nothing loaded anywhere (no `@font-face`, no fontsource) —
  everything currently falls back to system faces.

**Design-system inputs read for this plan:** the router
(`design-system/design-system.md` — MVS floors, creation gate, the
canonical 26), `references/tokens.md`, `references/voice.md`, all 26 files
under `design-system/components/core/`, `patterns/forms.md`,
`patterns/screen-states.md`, `patterns/scenes.md`. Per-component notes
below cite the spec file and class floor rather than restating anatomy —
the spec file is the source at implementation time (read its Revisions,
build the current version).

## Plan of work

Code sketches in this section (prop shapes, CSS structure, export lists)
are **advisory** — they orient the implementer and are expected to drift;
the Contract coverage table and the module-layout table below are the
artifacts reconciled against as-built code at close-out. Prefer
constraints, test intents, and patterns-to-follow over predicted code.

### Module layout (reconciled at close-out)

| Path                                              | Change  | What / governed by                                                                                                                                                |
| ------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ui/package.json`                        | edit    | fontsource deps (ADR-0031); vitest + testing-library devDeps, `test` script (ADR-0030)                                                                            |
| `packages/ui/tsconfig.json`                       | edit    | add `test/**` to include                                                                                                                                          |
| `packages/ui/vitest.config.ts`                    | new     | jsdom env; pattern: `packages/application/vitest.config.ts`                                                                                                       |
| `packages/ui/test/setup.ts`                       | new     | jest-dom matcher registration (referenced from vitest config `setupFiles`)                                                                                        |
| `packages/ui/src/styles.css`                      | rewrite | ADR-0027 executable token mirror of tokens.md; fontsource imports                                                                                                 |
| `packages/ui/src/index.ts`                        | edit    | export all 17 generic components                                                                                                                                  |
| `packages/ui/src/components/button.tsx`           | rewrite | `button.md` (M1 — first casualty of the token wipe)                                                                                                               |
| `packages/ui/src/components/panel.tsx`            | new     | `panel.md`                                                                                                                                                        |
| `packages/ui/src/components/badge.tsx`            | new     | `badge.md`                                                                                                                                                        |
| `packages/ui/src/components/divider.tsx`          | new     | `divider.md`                                                                                                                                                      |
| `packages/ui/src/components/link.tsx`             | new     | `link.md`                                                                                                                                                         |
| `packages/ui/src/components/field-scaffold.tsx`   | new     | `field-scaffold.md` + `patterns/forms.md`                                                                                                                         |
| `packages/ui/src/components/text-field.tsx`       | new     | `text-field.md`                                                                                                                                                   |
| `packages/ui/src/components/select.tsx`           | new     | `select.md`                                                                                                                                                       |
| `packages/ui/src/components/toggle.tsx`           | new     | `toggle.md`                                                                                                                                                       |
| `packages/ui/src/components/modal.tsx`            | new     | `modal.md`                                                                                                                                                        |
| `packages/ui/src/components/toast.tsx`            | new     | `toast.md`                                                                                                                                                        |
| `packages/ui/src/components/loading.tsx`          | new     | `loading.md`                                                                                                                                                      |
| `packages/ui/src/components/empty-state.tsx`      | new     | `empty-state.md`                                                                                                                                                  |
| `packages/ui/src/components/alert.tsx`            | new     | `alert.md`                                                                                                                                                        |
| `packages/ui/src/components/list.tsx`             | new     | `list.md` (composes loading/empty-state/alert)                                                                                                                    |
| `packages/ui/src/components/table.tsx`            | new     | `table.md`                                                                                                                                                        |
| `packages/ui/src/components/app-shell.tsx`        | new     | `app-shell.md` + `patterns/scenes.md`                                                                                                                             |
| `packages/ui/test/` (suites)                      | new     | field-scaffold + modal suites planned (F2.4/F6.1); further suites as logic warrants                                                                               |
| `apps/web/package.json`                           | edit    | vitest + testing-library devDeps, `test` script                                                                                                                   |
| `apps/web/tsconfig.json`                          | edit    | add `test/**` to include (same gap as ui — found in planning)                                                                                                     |
| `apps/web/vitest.config.ts`                       | new     | jsdom env; same pattern                                                                                                                                           |
| `apps/web/test/setup.ts`                          | new     | jest-dom matcher registration                                                                                                                                     |
| `apps/web/src/routes/index.tsx`                   | edit    | M1 sweep: replace stale shadcn utilities with token utilities                                                                                                     |
| `apps/web/src/routes/dev/components.tsx`          | new     | the gallery route (F5); DEV-gated via beforeLoad notFound                                                                                                         |
| `apps/web/src/components/gallery/helpers.tsx`     | new     | gallery scaffold (Section, StateCard) — added at build; sections split out of the route file for size                                                             |
| `apps/web/src/components/gallery/generic.tsx`     | new     | the 17 generic-core gallery sections                                                                                                                              |
| `apps/web/src/components/gallery/game.tsx`        | new     | the 9 game-object gallery sections (contracts-shaped fixtures)                                                                                                    |
| `packages/ui/src/lib/marks.tsx`                   | new     | drawn control marks (MarkX/MarkCheck/MarkSettings) replacing Unicode glyphs — gate D8 fix (M4); suits stay glyphs                                                 |
| `.claude/launch.json`                             | new     | dev-server preview config (added at M1 for the rendered checks)                                                                                                   |
| `apps/web/src/routeTree.gen.ts`                   | regen   | generated by TanStack on dev/build — never hand-edited                                                                                                            |
| `apps/web/src/components/game/playing-card.tsx`   | new     | `playing-card.md`                                                                                                                                                 |
| `apps/web/src/components/game/hand.tsx`           | new     | `hand.md`                                                                                                                                                         |
| `apps/web/src/components/game/draw-deck.tsx`      | new     | `draw-deck.md`                                                                                                                                                    |
| `apps/web/src/components/game/discard-pile.tsx`   | new     | `discard-pile.md`                                                                                                                                                 |
| `apps/web/src/components/game/seat-arc.ts`        | new     | pure seat-geometry function (F4.1, test-first)                                                                                                                    |
| `apps/web/src/components/game/table-surface.tsx`  | new     | `table-surface.md`                                                                                                                                                |
| `apps/web/src/components/game/seat.tsx`           | new     | `seat.md`                                                                                                                                                         |
| `apps/web/src/components/game/slam-timer.tsx`     | new     | `slam-timer.md`                                                                                                                                                   |
| `apps/web/src/components/game/turn-indicator.tsx` | new     | `turn-indicator.md`                                                                                                                                               |
| `apps/web/src/components/game/score-sheet.tsx`    | new     | `score-sheet.md`                                                                                                                                                  |
| `apps/web/test/` (suites)                         | new     | seat-arc, playing-card, hand, slam-timer suites planned (F6.1); more as logic warrants                                                                            |
| `packages/config/test/eslint.base.test.ts`        | edit    | pin the `ui: []` MAY_IMPORT row (F2.3)                                                                                                                            |
| `packages/ui/hardcheck-tokens.json`               | new     | spacing scale from tokens.md for `hardcheck.js --tokens` (F1.6; beside styles.css, its executable sibling — kept out of `.agents/` so ADR-0028 is not implicated) |

### M0 — Ground truth and machinery

1. **Design-gate machine setup** (one-time, not a repo change): from
   `.agents/scripts/design-gate/`, run `npm install --omit=dev` then
   `npx playwright install chromium`. Verify with the existing
   `hardcheck.test.js` if in doubt.
2. **`packages/ui` test infra.** `package.json`: add devDeps `vitest`,
   `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`,
   `@testing-library/user-event`; add script `"test": "vitest run"`; add
   deps `@fontsource/alfa-slab-one` and `@fontsource/archivo` (ADR-0031 —
   installed now, imported in M1). `vitest.config.ts`: follow
   `packages/application/vitest.config.ts`, with
   `environment: "jsdom"`, include `test/**/*.test.ts` and
   `test/**/*.test.tsx`, and `setupFiles` pointing at `test/setup.ts`
   (which registers the jest-dom matchers per ADR-0030).
   `tsconfig.json`: extend include with `test/**/*.ts`, `test/**/*.tsx`.
   Land one trivial smoke test (render a plain element, assert with a
   jest-dom matcher) so the suite is non-empty and the jsdom wiring is
   proven — avoids needing `passWithNoTests`.
3. **`apps/web` test infra.** Same treatment: devDeps, `test` script,
   `vitest.config.ts`, `test/setup.ts`, tsconfig include extension
   (planning found `apps/web/tsconfig.json` include is also `src/**` +
   `vite.config.ts` only). Same smoke test.
4. **ui-boundary regression test (F2.3).** In
   `packages/config/test/eslint.base.test.ts`, add ui-row cases using the
   existing `lintErrors` fixture helper (pattern: the web-row pins such
   as "blocks apps/web importing the @cambio/domain/testing subpath"):
   the `ui` layer must reject `@cambio/contracts` (and any workspace
   package/subpath) and must allow an external npm import (ui/web
   external deps are unrestricted by design). Test titles are chosen by
   `/implement` when they land.
5. Turbo already has a global `test` task (dependsOn `^build`); adding
   the package scripts is all the wiring needed. Checkpoint below.

### M1 — The token layer freezes first

Everything after M1 consumes tokens only. Implement **from ADR-0027
§Decision** (and tokens.md for values) — not from any skill paraphrase.

1. **Rewrite `packages/ui/src/styles.css`.** Keep `@import "tailwindcss"`
   and `@source "./"`; add the fontsource imports at the top alongside
   (ADR-0031): `@fontsource/alfa-slab-one` 400 and `@fontsource/archivo`
   400/500/600/700 (CSS `@import` rules must precede other statements).
   Then, per the ADR:
   - **Wipe** the default namespaces the design system doesn't use
     (`--color-*: initial;` style) — at minimum color, font, shadow,
     radius, breakpoint — so off-system utilities like `bg-stone-50`
     cease to exist. Spacing: tokens.md's scale (4 8 12 16 24 32 48 64,
     base 4px) sits on Tailwind's default 4px multiplier; whether to keep
     the multiplier or enumerate the eight steps is an implementation
     call to record in Progress — the hardcheck spacing file (step 3) is
     the enforcement either way.
   - **13 primitives** from tokens.md §Color as plain CSS custom
     properties (not `@theme` — primitives get no utilities; the
     role-only indirection is what lets the dark theme land as a
     re-mapping).
   - **Exactly the 12 semantic roles** promoted to utilities via
     `@theme inline`, each aliasing its primitive (dots become dashes:
     `surface.page` → `--color-surface-page` → `bg-surface-page`).
   - **Scalar groups** (F1.2): font tokens for `display`/`ui` with the
     tokens.md fallback stacks; the type scale
     12/14/15/17/22/28/44/64 with line-heights 1.5 body / 1.1 display;
     radius `sm` 3px / `md` 6px; breakpoints regular 720px / wide 1200px
     (compact is the base range — mobile-first); border widths and
     motion values (`ease.snap`, 140ms, 340ms) as variables.
   - **Non-scalars** (F1.3) as `@utility` or component-level CSS built on
     the variables: `radius.card` (6% of card width), the zero-blur
     elevation shadows (`elevation.raised`, `elevation.float`), the
     `numeral` treatment (`ui` face + `font-variant-numeric: tabular-nums`).
     Never hardcoded at use sites.
   - Replace the stock `@layer base` so base text/background come from
     `ink.primary`/`surface.page`.
2. **Sweep the two casualties — same commit, because Tailwind v4 emits
   nothing for unknown utilities (no build error): a stale class fails
   silently, so the guard is grep + eyes, not the compiler.**
   - Rewrite `packages/ui/src/components/button.tsx` per `button.md`
     (Interactive floor; variants primary/secondary/ghost/icon/danger;
     the active "sit-down" press — translate by the shadow offset,
     shadow collapses — is the signature and must not become an opacity
     flash; focus ring `accent.focus` 3px offset 2px, never removed;
     danger picks `accent.alarm` vs `accent.alarm-deep` by tokens.md's
     contrast rule). Keep the existing cva + `cn()` pattern. This pulls
     button's M2 slot forward so the stock component is never
     half-migrated.
   - Fix `apps/web/src/routes/index.tsx`: replace `text-muted-foreground`
     (and any other stock-shadcn utility) with token utilities; adjust to
     the rewritten Button's API if it changed.
3. **Hardcheck tokens file (F1.6).** Write
   `packages/ui/hardcheck-tokens.json` with a `"spacing"` array
   `[4, 8, 12, 16, 24, 32, 48, 64]` (the shape `hardcheck.js` reads for
   token conformance).
4. Checkpoint: dev server renders the smoke page in the new identity
   (cream page, real faces once fonts load); grep sweeps clean (commands
   below); repo green.

### M2 — Gallery scaffold + the 17 generic components

1. **Gallery route first** (F5), so every component lands visible:
   `apps/web/src/routes/dev/components.tsx` with
   `createFileRoute("/dev/components")`. Gate on `import.meta.env.DEV`
   (decided: no new `VITE_*` var) — in production builds the route
   renders nothing/404 (e.g. throw the router's not-found in `beforeLoad`
   or render null when `!import.meta.env.DEV`; exact mechanism is the
   implementer's, the observable contract is F5.2). The gallery is a
   `web` file: it may import `ui`, the game components, and `contracts`
   for realistic fixture data (`CardSlug` values like `"AS"`,
   `ViewPhase` shapes). Structure: one labeled section per component,
   one labeled mount per required MVS state; interactive/motion states
   get small local controls or looping demos (F5.1); keep the page one
   URL (the gate screenshots it) — if it grows unwieldy, split via a
   `?section=` search param and record the per-section URLs here.
2. **Primitives**: `panel.tsx` (`panel.md`, Static — variants
   plain/chrome; chrome is ceremonial, one per screen), `badge.tsx`
   (`badge.md`, Static — `count` variant is a `numeral` pill; never
   hidden-state hints), `divider.tsx` (`divider.md`, Static —
   plain/ornament), `link.tsx` (`link.md`, Interactive floor —
   underline always on; disabled is `aria-disabled`, `ink.muted`, no
   underline). Button already done in M1. Gallery entries per state as
   each lands.
3. **Form family** (with `patterns/forms.md` open):
   `field-scaffold.tsx` first (`field-scaffold.md` — the canonical
   wrapper; label association via real `htmlFor`/`id` wiring, error
   replaces helper and wires `aria-describedby`/`aria-invalid`;
   required marker is the word "required", not an asterisk).
   **Test-first** (F2.4/F6.1): label association and error wiring are
   logic — write the suite in `packages/ui/test/` before the component.
   Then `text-field.tsx` (`text-field.md`, Input floor + `code` variant;
   placeholders are examples, never instructions), `select.tsx`
   (`select.md`, Input floor + `open`; native select semantics on
   compact widths — never a custom scroll trap on phones; the custom
   options panel with the ♦ selected-pip is regular+ presentation),
   `toggle.tsx` (`toggle.md`, Input floor mapped to off/on; knob slides
   at `duration.snap` `ease.snap`; the optimistic-flip/revert rule is
   container behavior, out of scope for the presentational component).
4. **Overlays**: `modal.tsx` (`modal.md`, Overlay floor
   open/closing/overflow — focus trapped, page inert, Esc/✕/scrim all
   close except destructive-confirm; scrim `green-deep` at 55%; enters
   scale .96→1 at `duration.snap`; suggested pattern: the native
   `<dialog>` element, which carries Esc + focus semantics without a new
   dependency — record the call either way). **Test-first** for dismiss
   behavior (Escape, scrim, destructive-confirm lockout) in
   `packages/ui/test/`. Then `toast.tsx` (`toast.md` — dock positions
   per breakpoint, auto-dismiss with hover/focus pausing the clock, max
   3 stacked; the timing logic is a test candidate).
5. **Data family — support components before consumers** (deliberate
   refinement of the root plan's listed order: `list.md` and `table.md`
   render `loading`/`empty-state`/`alert` in their MVS states):
   `loading.tsx` (`loading.md` — spinner is a rotating card back,
   implemented verbatim in ui per the resolved Surprise below: the
   striped mark is token-drawn decoration, not game vocabulary;
   skeleton is `tan-paving` at 40%, opacity pulse, no
   shimmer; nothing renders under 300ms; reduced-motion swaps rotation
   for a fade pulse), `empty-state.tsx` (`empty-state.md` — `first-use`
   and `no-results` are distinct by contract, never merged; copy
   register per surface, voice.md), `alert.tsx` (`alert.md` — variants
   info/alarm/success/reconnecting; persists while true). Then
   `list.tsx` (`list.md`, Async/data floor
   populated/loading/empty/error/partial) and `table.tsx` (`table.md`,
   same floor; numeric columns right-aligned `numeral` with true minus;
   wide tables scroll in their own container, never the page).
6. **`app-shell.tsx`** (`app-shell.md` + `patterns/scenes.md` — the
   shell owns scene grounds; screens declare a depth, never paint their
   own; states default/game/reconnecting; safe-area aware on compact).
   CAM-15 implements the token-expressible grounds (plain cream; the
   checkered paving is CSS on `surface.warm` primitives); the illustrated
   courtyard has no asset — flagged in Surprises, not silently resolved.
7. Export all 17 from `packages/ui/src/index.ts`. Each component lands
   with its gallery entries in the same step, so the checkpoint is
   visual as well as green.

### M3 — Game objects in `apps/web/src/components/game/`

All presentational and prop-driven (no fetching, no stores), typed
against `contracts` where the wire shape exists. Motion is CSS-only
(decided): transitions/keyframes on `ease.snap` +
`duration.snap`/`duration.track` only; `prefers-reduced-motion` collapses
movement to cross-fades + `accent.focus` highlights on origin and
destination (F3.8) — build the reduced-motion branch alongside each
animation, not as a later pass.

1. **`playing-card.tsx`** (`playing-card.md` — the 7-state floor,
   F3.2/F3.3/F3.4). **Test-first.** Entitlement is structural: the prop
   shape must make "face-down but value present" unrepresentable —
   advisory sketch: a discriminated prop union where only
   face-up/peeking variants carry `card: CardSlug` and the face-down
   variant has no card field at all (mirrors the wire's optional-absent
   discipline). Test intents: renders a back when no slug is handed;
   each of the seven states is reachable and designed; after a peek ends
   the DOM is indistinguishable from a never-peeked sibling (memory
   fidelity, F3.4). Suit color: hearts/diamonds `accent.suit-red`,
   spades/clubs `ink.primary` — derivable from the `CardSlug` suit
   character. `slam-eligible` presents on the back (pulsing
   `accent.alarm` edge) — eligibility public, value hidden (F3.6).
   Mini variant for score-sheet/discard under-cards.
2. **`hand.tsx`** (`hand.md` — F3.7). **Test-first.** Occupancy comes as
   `ReadonlyArray<SlotIndex>`; holes render as dashed outlines in place;
   indices are stable — no reflow on removal. States populated/empty/
   growing/shrinking/awaiting-give/inert; variants own/opponent. Test
   intent: holes stay holes — a grid given non-contiguous indices renders
   vacancies at exactly those positions.
3. **`draw-deck.tsx`** (`draw-deck.md` — count badge composes ui's badge
   `count` variant; `low` at count ≤ 5 shifts to `accent.alarm-deep`;
   reshuffle/draw are designed `duration.track` moments, demonstrated in
   the gallery) and **`discard-pile.tsx`** (`discard-pile.md` — top card
   face-up dominant, under-edges at thrown angles; `empty` reads as
   "nothing to act on"; `slam-target` gives the top card the
   `accent.alarm` frame the eligible backs echo).
4. **`seat.tsx`** (`seat.md` — F3.5). Props carry public state only:
   name, card count, connection, turn status; `own` variant is
   positionally distinct but visually unprivileged. Avatar
   palette-cycling draws from primitives and must not collide adjacent
   seats — if extracted as a pure helper, it is unit-testable.
5. **`seat-arc.ts` + `table-surface.tsx`** (`table-surface.md` —
   F4.1/F4.2). **Geometry test-first**: a pure function from
   (seat count 2–5, viewer's seat index) to radial positions, rotated so
   the viewer is bottom-center, ordered by seat index — jsdom cannot
   measure layout (ADR-0030), so the logic lives in a pure module and
   the tests pin the numbers; rendering just applies them. Benches are
   scenery (always four, never a constraint). Compact (<720px): own hand
   docks to screen bottom, opponents arc along the top — breakpoint CSS,
   verified rendered (jsdom can't). `game-over` dims the table under the
   score-sheet.
6. **`slam-timer.tsx`** (`slam-timer.md` — F3.6). **Test-first** for
   countdown rendering: renders the drain from `closesAt`-style props
   (the wire shape exists in `ViewPhase.SlamWindow`); the bar drains
   linearly toward a fixed close — no refills, no resets on slam
   attempts (ADR-0011); duration is config-fed, never a design constant.
   States hidden/open/resolving/closed; never renders against an empty
   pile (stays hidden — the component obeys its props; the rule lives
   server-side).
7. **`turn-indicator.tsx`** (`turn-indicator.md` — states your-turn/
   other-turn/slam-window/game-over; copy in voice.md's canonical
   terminology, public events only, never card values) and
   **`score-sheet.tsx`** (`score-sheet.md` — renders only from `reveal`
   data (F3.5); rows compose mini playing-cards face-up; totals in
   `numeral`, true minus sign (−) per voice.md; winner rows plural on
   ties; zero never styled as automatically winning).
8. Gallery sections for all nine, every per-object floor state mounted,
   motion states as looping demos or control-driven (F5.1).

### M4 — Audit pass and token feedback

1. Design-gate rendered run against the gallery (commands below);
   hardcheck with `--tokens`; record results here and in the root plan's
   acceptance checklist (WCAG contrast per tokens.md §Contrast, incl.
   small-text-on-alarm using `accent.alarm-deep`; spacing conformance).
2. Run the `gate` skill over the gallery (verdicts advisory — recorded,
   never auto-"fixed"), then an `ai-tells` audit; triage impeccable
   observations. Conflicts between any tool and the design system are
   surfaced to the user; the design system outranks.
3. Any provisional-token adjustment discovered by rendering (type scale,
   spacing, `radius.card`, breakpoints are explicitly provisional in
   tokens.md) goes through the creation gate — STOP, name the gap, wait
   for the user — and lands as a tokens.md revision mirrored in
   styles.css. Divergence between the two files is a defect (ADR-0027).
4. Reduced-motion behavior verified rendered (emulate
   `prefers-reduced-motion` in the browser/gate run).

### M5 — Close-out

Coverage table completed (by `/implement`, as tests landed); `pnpm format`
then the full bare gate; module-layout table reconciled against the
as-built tree; plan docs current; ADR-0030/0031 checked for accuracy
against what was built; Linear updated.

## Concrete steps & validation

- **M0 setup (one-time, machine):**
  `cd .agents/scripts/design-gate && npm install --omit=dev && npx playwright install chromium`
- **M0 checkpoint:** `pnpm install`, then
  `pnpm turbo test --filter @cambio/config --filter @cambio/ui --filter @cambio/web`
  — config suite grows the ui-row pins; ui/web suites run their smoke
  tests on jsdom. `pnpm turbo build typecheck lint test` stays green.
- **M1 checkpoint:** `pnpm dev`, eyeball `http://localhost:3000` (new
  identity, both faces render, no network font origin in devtools).
  Sweeps (expected: no matches):
  - stale shadcn utilities:
    `grep -rnE "(text|bg|border|ring)-(background|foreground|card|popover|primary|secondary|muted|accent|destructive|input|ring)" packages/ui/src apps/web/src`
  - arbitrary-value utilities: `grep -rnE "\-\[" packages/ui/src apps/web/src`
  - raw hex/font leaks outside styles.css:
    `grep -rn "#[0-9a-fA-F]\{3,8\}" --include="*.tsx" packages/ui/src apps/web/src`
    and `grep -rn "font-family" --include="*.tsx" packages/ui/src apps/web/src`
- **Per-milestone rendered check (M2/M3/M4):** with `pnpm dev` running:
  - `node .agents/scripts/design-gate/render.js --url http://localhost:${WEB_PORT:-3000}/dev/components --out /tmp/claude-1000/-home-raafayk7-Documents-cambio/76df1ae7-5bc1-42f2-837f-3776379aa5bb/scratchpad/gallery`
  - `node .agents/scripts/design-gate/hardcheck.js --facts <that>.facts.json --tokens packages/ui/hardcheck-tokens.json`
  - one gate run per milestone against the gallery URL — do not chase the
    auto-gate hook's per-file nudges.
- **Component tests as they land:**
  `pnpm turbo test --filter @cambio/ui` and
  `pnpm turbo test --filter @cambio/web` (turbo builds workspace deps
  first; the bare package script runs against stale dist — CAM-8
  lesson). Iterating on one suite after a build: `npx vitest run <file>`
  inside the package.
- **F5.2 prod check:** `pnpm --filter @cambio/web build` then serve the
  build (`vite preview` via the package) and confirm `/dev/components`
  renders nothing/404.
- **Boundary:** `pnpm turbo lint` (includes `//#format:check`) and
  `pnpm turbo test --filter @cambio/config` for the ui-row pins.
- **Before the gate:** `pnpm format` (tsx/css are not hook-formatted).
- **Final gate:** `pnpm turbo build typecheck lint test` — run bare,
  never piped; check the exit code directly.

## Contract coverage

_(maintained by `/implement`, verified by `/review`: one row per root-plan
contract clause this side owns — the test that pins it, or why none can.
Each row must also say **what is asserted**, in one phrase. **At plan
time, fill only the Clause column plus a planned-approach note**; test
file, name, and assertion phrase are written by `/implement` when the
test actually lands. A plan-time row that invents a test title and
assertion is an overclaim waiting to become a review finding.)_

| Clause | Test (file + name)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | What is asserted                                                                                                                                                                                                                                                                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1.1   | non-vitest (see M1/M4 Progress)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | styles.css implements ADR-0027 structurally: namespace wipes incl. the bare `--spacing` (M4 fix), 13 primitives on `:root`, exactly 12 roles via `@theme inline`; verified line-by-line against the ADR + tokens.md at M1, re-audited at M4                                                        |
| F1.2   | non-vitest (M1 audit + M4 hardcheck)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | every tokens.md scalar group present (type faces/scale/leading, ordinal spacing, radius, borders, elevation, motion, breakpoints); hardcheck spacing conformance PASS with only the judged mx-auto residue                                                                                         |
| F1.3   | non-vitest (M1 audit + grep sweeps)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | non-scalars are `@utility` rules on the variables (radius-card, card-frame, elevations via `--shadow-*`, durations, borders); no hardcoded values at use sites — sweeps clean                                                                                                                      |
| F1.4   | non-vitest (rendered, M1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | both faces render from bundled @fontsource woff2 (build output lists them; smoke-page render shows the slab face); `font-numeral` applies tabular-nums; no external font origin                                                                                                                    |
| F1.5   | non-vitest (grep sweeps, M1 + M4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | stale-shadcn, arbitrary-value (`-[`), raw-hex, and font-family sweeps all empty over `packages/ui/src` + `apps/web/src`; the numeric-utility sweep added at M4 (post `--spacing` wipe) is also clean                                                                                               |
| F1.6   | non-vitest (M4 Progress)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `hardcheck.js --tokens packages/ui/hardcheck-tokens.json` run against gallery facts; final result PASS (0 constraint fails), outputs recorded                                                                                                                                                      |
| F2.1   | non-vitest (gallery + barrel)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | all 17 exported from `packages/ui/src/index.ts` and mounted in the gallery; each implements its spec file at r1                                                                                                                                                                                    |
| F2.2   | non-vitest (gallery review) + the F2.4/F6.1 suites                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | every class-floor state mounted and labelled (incl. no-op and live-only states); logic-carrying states pinned by vitest                                                                                                                                                                            |
| F2.3   | `packages/config/test/eslint.base.test.ts` — "blocks packages/ui importing @cambio/contracts" · "blocks packages/ui importing a workspace export subpath" · "allows an external npm import in packages/ui (ui/web externals are unrestricted)"                                                                                                                                                                                                                                                                                                                                                                                                           | the MAY_IMPORT `ui: []` row rejects workspace imports (bare + subpath) while external npm imports stay legal                                                                                                                                                                                       |
| F2.4   | `packages/ui/test/field-scaffold.test.tsx` — "associates the label with the wrapped field (real htmlFor/id wiring)" · "wires helper text to the field via aria-describedby" · "error replaces helper and sets aria-invalid + aria-describedby on the field" · 'required renders the word "required", never an asterisk' · "keeps a caller-supplied field id instead of generating one"; `packages/ui/test/modal.test.tsx` — "closes on Escape" · "closes on scrim click (click outside the panel content)" · "closes on the ✕ button" · "destructive-confirm ignores Escape and scrim; ✕ still closes" · "clicking inside the panel body does not close" | label/id association, describedby/invalid wiring, error-replaces-helper, the required word; and the full modal dismiss contract incl. the destructive lockout                                                                                                                                      |
| F3.1   | non-vitest (typecheck + review)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | all 9 files under `apps/web/src/components/game/`; props typed from contracts (`CardSlug`, `SlotIndex`, `Timestamp`, `Reveal`, `Uuid`); presentational (no fetching/stores)                                                                                                                        |
| F3.2   | `apps/web/test/playing-card.test.tsx` — "all seven floor states are reachable and marked"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | each of the 7 floor states reachable via props and marked via data attributes                                                                                                                                                                                                                      |
| F3.3   | type-level (discriminated `FaceProps` union — `face: "down"` carries no card field; typecheck enforces) + `apps/web/test/playing-card.test.tsx` — "face-down renders a back: no rank, no suit, no value anywhere in the DOM"                                                                                                                                                                                                                                                                                                                                                                                                                             | face-down-with-value is unrepresentable; a face-down render contains no value text                                                                                                                                                                                                                 |
| F3.4   | `apps/web/test/playing-card.test.tsx` — "memory fidelity: after a peek ends the DOM equals a never-peeked back"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | post-peek innerHTML strictly equals a never-peeked render                                                                                                                                                                                                                                          |
| F3.5   | `apps/web/test/score-sheet.test.tsx` — "orders rows by total ascending — card count is irrelevant" · "marks only the winners — zero can lose to negatives" · "ties are representable: plural winner rows" · "negative totals render with a true minus sign (−), never a hyphen"; seat public-state-only by props shape (review)                                                                                                                                                                                                                                                                                                                          | total-order, winner marking incl. plural ties, zero-not-winning, true minus; seat props carry only name/count/connection/turn                                                                                                                                                                      |
| F3.6   | `apps/web/test/slam-timer.test.tsx` — "renders nothing when no window is open" · "drains linearly from the config-fed window toward closesAt" · "never resets on slam attempts: resolving pauses the display, resuming lands on the true remaining" · "shows closed (empty bar), never negative, once closesAt passes"                                                                                                                                                                                                                                                                                                                                   | hidden default, linear config-fed drain, fixed close (ADR-0011 semantics), floor at zero; slam-eligible-on-backs verified rendered                                                                                                                                                                 |
| F3.7   | `apps/web/test/hand.test.tsx` — "renders vacancies at exactly the missing indices, in index order" · "keeps the 2×2 footprint minimum: a single card still shows four slots" · "removal keeps the slot: dropping index 1 leaves its outline in place" · "zero cards renders the all-dashed grid, not an absence" · "renders faces only for slots given a card value"                                                                                                                                                                                                                                                                                     | holes at exact indices, stable order, 2×2 floor, no reflow on removal, empty ≠ absent, faces only with values                                                                                                                                                                                      |
| F3.8   | non-vitest (grep + emulated render, M4 + fix cycle)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | motion classes reference only `ease.snap`/`duration-snap`/`duration-track` (+ the two spec-carried animations); reduced motion: spinner swaps to pulse-soft AND the card flip cross-fades via face opacity (R2 fix, verified by emulated render); outer state transitions jump under motion-reduce |
| F4.1   | `apps/web/test/seat-arc.test.ts` — "returns one position per seat, ordered by seat index, for 2–5 players" · "puts the viewer bottom-center regardless of their seat index" · "spaces seats evenly: heads-up puts the opponent top-center" · "four players sit at the compass points, rotated for the viewer" · "five players spread at 72° steps with no collisions"                                                                                                                                                                                                                                                                                    | radial geometry from seat order, viewer rotation, even spacing, 5-player case                                                                                                                                                                                                                      |
| F4.2   | non-vitest (emulated 390px render, M4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | compact table-surface compresses: opponents arc along the top, own seat docks bottom                                                                                                                                                                                                               |
| F5.1   | non-vitest (gallery review, M2–M4 + fix cycle) + `apps/web/test/hand.test.tsx` — "growing: the in-flight slot renders a face-down card in flight, value-free (R1)" · "shrinking: the leaving slot renders the publicly revealed card departing (R1)"                                                                                                                                                                                                                                                                                                                                                                                                     | 26 components × every class-floor state per the AMENDED F5.1 (four choreography states carved out to CAM-16 — see the clause amendment); hand growing/shrinking/inert added in the fix cycle, the flight states pinned by the two new hand tests                                                   |
| F5.2   | non-vitest (M4 prod check)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `vite preview` of the prod build: `/` → 200, `/dev/components` → 404; no new `VITE_*` var in the diff                                                                                                                                                                                              |
| F5.3   | non-vitest (M2–M4 Progress)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | render.js + hardcheck.js runs against the gallery URL recorded with outputs at every milestone                                                                                                                                                                                                     |
| F6.1   | the suites named in F2.4/F3.2/F3.3/F3.4/F3.6/F3.7/F4.1 rows (+ toast timing: `packages/ui/test/toast.test.tsx` — "auto-dismisses after the 4s default dwell" · "hover pauses the clock; leaving resumes it" · "stacks at most 3 — the oldest collapses first, immediately")                                                                                                                                                                                                                                                                                                                                                                              | all logic-carrying states landed test-first; 38 frontend tests green (14 ui + 24 web)                                                                                                                                                                                                              |
| F6.2   | non-vitest (M4 Progress)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | gate ran decompose→map→judge (⚠️ flagged/4; fixes applied or surfaced as spec conflicts per precedence); ai-tells scored 4/30 with fixes applied; conflicts recorded in the root Decision Log, never auto-"fixed"                                                                                  |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [ ] 2026-09-04 — frontend child plan written; awaiting sign-off
- [x] 2026-09-04 14:00 — M0 complete: design-gate machine setup done
      (npm install + Chromium); fontsource + vitest/jsdom/testing-library
      deps added; vitest configs + `test/setup.ts` + smoke tests in ui and
      web (both green on jsdom); tsconfig `test/**` includes added; ui-row
      boundary pins added to `packages/config/test/eslint.base.test.ts`
      (16 config tests green). Commit c480fac. Note: impeccable's edit
      hook fired on the smoke-test writes — the CAM-14 watch item is
      answered, the hook works on real in-repo UI writes.
- [x] 2026-09-04 14:20 — M1 complete: styles.css rewritten per ADR-0027
      (wipe + 13 primitives on :root + 12 roles via @theme inline +
      @utility non-scalars + fontsource imports); spacing named ordinally
      (see root Decision Log); shared `ground-*`/`press-raised` utilities;
      Button rewritten per button.md; smoke page swept (incl. two stale
      utilities the plan didn't list: `tracking-tight`, `p-10`/`gap-6` —
      wiped/re-meaning'd by the new scale); `packages/ui/hardcheck-tokens.json`
      written; `.claude/launch.json` added for the dev-server preview. All
      four grep sweeps clean; build/typecheck/lint green; rendered check
      via design-gate renderer confirms cream page + both faces serving
      locally (dev server on WEB_PORT=3100 from root .env).
- [x] 2026-09-04 14:55 — M2 complete: gallery route
      `apps/web/src/routes/dev/components.tsx` (DEV-gated via beforeLoad
      notFound) + section files under `apps/web/src/components/gallery/`
      (helpers.tsx, generic.tsx — module-layout table amended at
      close-out); all 17 generic components implemented in
      `packages/ui/src/components/` per their spec files. Test-first
      suites landed and green: field-scaffold (5 tests — label
      association, helper/error wiring, required word, caller id), modal
      (5 tests — Esc/scrim/✕/confirm-lockout/inside-click), toast (3
      tests — 4s dwell, hover pause, overflow collapse); 14 ui tests + 1
      web smoke green. Deps added: @radix-ui/react-select (Decision Log).
      styles.css grew spec-cited utilities: ground-* hover-darken family,
      press-raised, card-back-mark, scene-paving, safe-area-shell,
      --tracking-wide, card-wobble/pulse-soft animations. Bug caught by
      rendered check: a bare `flex` on <dialog> overrode the UA's
      closed-dialog display:none — fixed with `hidden open:flex`.
- [x] 2026-09-04 15:40 — M3 complete: all 9 game objects in
      `apps/web/src/components/game/` (playing-card, hand, seat-arc.ts +
      table-surface, seat, draw-deck, discard-pile, slam-timer,
      turn-indicator, score-sheet), typed against contracts (CardSlug,
      SlotIndex, Timestamp, Reveal, Uuid). Test-first suites green:
      seat-arc (5 — radial geometry, viewer rotation, 72° spacing),
      playing-card (5 — structural entitlement, 7-state floor, memory
      fidelity via DOM equality), hand (5 — holes stay holes, stable
      indices, 2×2 floor, faces only with values), slam-timer (4 — linear
      drain, fixed close, resolving pause, floor at 0), plus score-sheet
      (4 — total-order, winners incl. ties, true minus). 24 web tests
      total. Gallery game sections added; card states mount on a
      surface-table ground (backs/vacancies are designed for green).
      styles.css grew card-frame/card-lg/md/sm, card-rank/card-pip,
      text-shadow-poster utilities. Full gate for config/ui/web green;
      full-page render inspected (2 slices) — spec-true.
- [x] 2026-09-04 16:30 — M4 complete (audits):
      **Hardcheck** (with `--tokens packages/ui/hardcheck-tokens.json`):
      final run **PASS** — 0 constraint fails; 1 judged default signal
      (192px = mx-auto centering residue, unauthored); advisories are the
      24–44px band (43px shared control box — see the surfaced spec
      conflict in the root Decision Log; 36px icon buttons; 28px toggle).
      Earlier runs caught real defects, fixed: ghost Retry on alarm
      ground 2.66:1 → ink-inverse text; alert/modal ✕ targets 13px →
      29px via `p-2 -m-2`; and the wipe hole — the bare `--spacing`
      multiplier survived `--spacing-*: initial`, so off-scale numeric
      utilities still resolved (w-24/w-64/min-w-32 were live); fixed with
      an explicit `--spacing: initial` + demo widths moved to the
      container scale (w-3xs/2xs/xs) + score-sheet/slam-timer edits.
      **Gate skill** (decompose → map → judge): ⚠️ flagged on 4 —
      C2 link hit area (fixed: py-1/-my-1), D8 glyph icons (fixed:
      marks.tsx SVGs; suits kept as identity), D3 empty-state blank
      (fixed: py-8 → py-5), D10 43px box (surfaced as spec conflict, not
      fixed — design system outranks). Judge explicitly declined the C3
      slop escalation: 3 of 5 markers trace to the written design system.
      D7 personality: satisfied ("could only belong to this product").
      **ai-tells**: 4/30 ("invisible — your hand is on the wheel").
      Fixes applied: StateCard label de-eyebrowed to sentence case;
      fixture copy de-dashed ("Your turn. Draw or take the discard",
      "no tables open. start one?"); `Call Cambio — ends the game` kept
      (voice.md-prescribed). aspect-video demo frames kept (screen-ratio
      demo framing; logged, not churned).
      **F5.2**: prod build serves / at 200, /dev/components 404 ✓.
      **F4.2**: compact (390px) render — opponents arc top, own seat
      docks bottom ✓. **Reduced motion**: emulated — spinner
      animation-name swaps card-wobble → pulse-soft ✓. All 38 tests +
      lint + format green after fixes.
- [x] 2026-09-04 17:20 — Review fix cycle: NUL byte in toast.tsx replaced
      (file diff-able again; all sweeps re-run clean); `--ease-*` wiped;
      playing-card selected ring + reduced-motion cross-fade (probe-
      verified); HandProps gained `inFlightSlot`/`leaving` with 2 new
      tests + growing/shrinking/inert gallery mounts; FieldScaffold
      `readOnlyValue` + 1 new test; SlamTimer zero-duration guard;
      score-sheet fixture made rule-consistent; gallery peek timer
      cleanup + demoWindow rename; `.agents` lockfile reverted;
      launch.json routing logged; doc claims amended by sweep (429→443,
      radius-full wording). ui 15 / web 26 green.

## Surprises & notes for the root plan

_(found while reading the 26 specs and the repo during planning — recorded,
not silently resolved)_

- **`loading.md` embeds game identity in a generic component.** The
  spinner is specified as "a card back rotating flat" — but `loading`
  lives in `packages/ui`, and F2.3 bars game vocabulary from the 17.
  Planned reconciliation: `loading` exposes a generic visual slot (the
  spinner mark is a passed-in node) and the card-back mark is supplied by
  `apps/web`; the gallery mounts the composed form. **Resolved
  (2026-09-04, user):** the card-back mark IS generic decoration — drawn
  purely from tokens, no contracts types, no game props; `loading`
  implements its spec verbatim in ui. The game-vocabulary bar targets
  props/APIs, not motifs.
- **Several specs bind primitives directly, not roles.** Link hover
  darkens to `green-deep`; the card back is `brick-bright` stripes with a
  `mustard` frame; the modal scrim is `green-deep` at 55%; skeletons are
  `tan-paving` at 40%; table-surface's rim is `green-deep`. ADR-0027
  promotes only the 12 roles to utilities and tokens.md's dark-theme
  rationale says components reference roles. These will land as
  component-level `var(--primitive)` references (legal under ADR-0027's
  "component-level CSS built on the variables"). **Resolved (2026-09-04,
  user):** these surfaces are deliberately theme-fixed (the card back is
  the identity); recorded in the root Decision Log, revisited by the
  dark-theme task.
- **"radius full" is not in tokens.md.** `badge.md` (count variant) and
  `seat.md` specify fully-rounded pills; tokens.md's shape scale is only
  `sm`/`md`/`card`. **Resolved (2026-09-04, user):** `rounded-full` is
  blessed as the pill idiom — a shape idiom (9999px), not a scale value;
  no tokens.md entry is minted. _(Wording amended in the review fix
  cycle, R5b: keeping the utility alive after the radius wipe requires
  `--radius-full` in styles.css's `@theme` — a wipe-survival mechanism,
  not a tokens.md value.)_
- **Spec-carried values that tokens.md doesn't list.** Opacity/mix
  levels (55% scrim and disconnected, 45% disabled, 40% skeleton, 25%
  hairline rule, 8% hover ink-mix), the toast 4s dwell, discard-pile's
  ±4–9° thrown angles. The component files are canon, so these are not
  inventions — but they are visual vocabulary living outside tokens.md.
  Planned treatment: implement as spec'd, keep them in component CSS
  named after the spec. **Resolved (2026-09-04, user):** confirmed —
  spec-carried values are canon and stay in component CSS citing their
  spec file; no tokens.md promotion in CAM-15.
- **Scene grounds outrun the asset inventory.** `app-shell.md` +
  `patterns/scenes.md` make the shell own scene backgrounds, including
  the full illustrated courtyard for the lobby. No illustration assets
  exist in the repo, and drawing them is neither token vocabulary nor in
  CAM-15's component scope. Plan: app-shell takes a declared scene-depth
  with the token-expressible grounds implemented (plain cream; checkered
  paving from `surface.warm` primitives); the courtyard illustration is
  an open gap for the user to schedule (likely CAM-16 territory).
  **Resolved (2026-09-04, user):** confirmed — the illustration is
  deferred, scheduled with CAM-16's screens.
- **F1.6's file initially planned into harness territory.** A
  design-gate tokens file under `.agents/` would collide with ADR-0028
  (harness lands on `main`) while being release-branch contract work.
  **Resolved (2026-09-04, planner):** the file moves to
  `packages/ui/hardcheck-tokens.json` — beside `styles.css`, whose
  values it mirrors; `hardcheck.js --tokens` takes any path. No ADR-0028
  implication remains.
- **Two class-taxonomy wrinkles, treated as file-governed:**
  `app-shell.md` declares class "Layout", which is not a row in
  design-system.md's MVS table — its own States section
  (default/game/reconnecting) is taken as its floor. Similarly
  `loading`/`empty-state`/`alert` are "Async/data (support)" and carry
  their own state lists rather than the five-state data floor (which
  `list`/`table` do carry). The component file is the authority per the
  router; noted so the reviewer doesn't read the MVS table stricter than
  the specs.
- **Data-family build order refined.** `list.md`/`table.md` render
  `loading`/`empty-state`/`alert` in their own MVS states, so those three
  land first within M2's data batch (the root plan's listing order was
  explicitly "roughly").
- **`apps/web/tsconfig.json` has the same test-include gap as ui** (root
  plan M0 mentions only ui's tsconfig); both get `test/**` added in M0.
