# 0030 — React component tests run on @testing-library/react + jsdom

- **Status:** proposed
- **Date:** 2026-09-04
- **Task:** CAM-15

## Context

CAM-15 builds the repo's first real React components (the 26-component
design-system core), and HANDOFF §12 discipline requires logic-carrying
component states to be test-first. No frontend test infrastructure exists:
`packages/ui` and `apps/web` have no test scripts, no vitest configs, and
no DOM environment or component-testing library is installed anywhere in
the workspace (verified against the lockfile). The backend testing pattern
(ADR-0003: vitest + @effect/vitest, plain Node environment) does not cover
rendering React trees. Whatever CAM-15 picks becomes the pattern every
future frontend test follows.

## Decision

We test React components with **@testing-library/react running on jsdom**,
under the existing vitest runner:

- `vitest.config.ts` in `packages/ui` and `apps/web` sets
  `environment: "jsdom"`; test files live in `test/**` and follow the
  backend's `*.test.ts(x)` naming.
- `@testing-library/react` renders and queries; `@testing-library/jest-dom`
  provides DOM matchers; `@testing-library/user-event` drives interaction
  (hover, focus, keyboard) — the MVS interactive states are exercised the
  way a user reaches them, per testing-library's guiding principle.
- Component tests assert **behavior and structure** (states render, ARIA
  roles present, callbacks fire), not pixel styling — visual quality is the
  design-gate's job, not vitest's.

**Alternatives rejected:**

- **happy-dom** — faster, but less spec-complete around focus management
  and form semantics, exactly the areas the MVS interactive/input states
  test; speed is not the bottleneck at this suite's size.
- **Vitest browser mode (real Chromium)** — highest fidelity but a second
  Playwright-managed browser stack alongside the design-gate's, slower in
  CI, and overkill for prop-driven presentational components with no
  routing or network in scope.

## Consequences

Frontend tests run inside the existing `pnpm turbo test` gate with no new
runner or browser dependency. jsdom's known limits (no real layout, no
computed geometry) are accepted: anything requiring true rendering —
contrast, spacing, radial seat geometry — belongs to the design-gate's
rendered path, keeping a clean division of labor. We commit to
testing-library idioms (query by role/label, no implementation-detail
selectors). Revisit if a component's correctness ever hinges on real
layout math that jsdom cannot express — that is the signal to add a
browser-mode lane, not to weaken assertions.
