---
name: frontend-architecture
description: How the Cambio client is built — the projection-renderer rule, pages/containers/components layering with logic in custom hooks, the apps/web vs packages/ui split, and what is lint-enforced versus convention. Use this for ANY work in apps/web or packages/ui — new routes, components, hooks, state, data fetching, or styling wiring — even for small changes, because the client renders hidden-information projections and one wrong import or "helpful" workaround can leak another player's cards.
---

# Frontend architecture

The client is a **projection renderer, not a second clean architecture**.
The server's `viewFor` projection decides what each player may see;
`apps/web` renders exactly that payload and nothing else. Business rules
never migrate into containers or hooks — if the client seems to need a
rule, the rule belongs in the domain and its visible consequence in the
`viewFor` output.

## The prime rule, restated from `hidden-information`

- **A missing field is never a client problem to solve.** If the UI needs
  data it doesn't receive, that is a change to `viewFor` and its
  `contracts` schema — made only if the player is entitled to see it.
  Never reconstruct, infer, or cache your way around the projection.
- **Memory fidelity is a UI rule.** A peeked card is shown briefly, then
  never again — remembering it is the game. No persistent markers,
  tooltips, or "cards you know" panels. Don't "improve UX" by weakening
  this.
- **No shared caches across users.** On the server, one QueryClient per
  request (`apps/web/src/router.tsx` documents why): payloads are
  per-player; a shared cache hands one player another player's view.

## The import boundary (law)

`apps/web` may import `contracts` and `ui` — **never** `domain` or
`application`. `packages/ui` imports nothing app-specific, not even
`contracts`. Both rows are lint-enforced by the `MAY_IMPORT` policy in
`packages/config/eslint.base.js` (probe-verified: an illegal
`import "@cambio/domain"` in `apps/web` fails eslint with the boundaries
rationale). The type gap fix is always "add the shape to `contracts`",
per the `architecture` skill.

## `apps/web` vs `packages/ui`

- **`packages/ui`** — presentation with zero app knowledge: primitives
  and shared components that could render in any app (styling comes from
  the token system it hosts in `src/styles.css`). If a component needs a
  contracts type, a route, or game vocabulary, it does not belong here.
- **`apps/web`** — everything that knows it's Cambio: routes, containers,
  hooks, realtime wiring, game components composed from `ui` primitives.

## Layering inside `apps/web`

Data flows down: **pages → containers → components → primitives →
services**.

- **Pages/routes** (`src/routes/`) — routing and orchestration only; they
  pick containers, they don't own logic.
- **Containers** — own state and server data for one surface; hold the
  hooks; pass plain props down.
- **Components** — presentational; receive all data and callbacks as
  props; no fetching, no stores.
- **Services/data** — the API and realtime access layer; containers reach
  data through hooks that wrap it (TanStack Query), never inline fetches
  in components.

Discipline that keeps this honest (source: the Carbonteq frontend
architecture guide,
<https://dev-portal-fuma.vercel.app/docs/best-practices/frontend/architecture/overview>
and its best-practices page — stack prescriptions excluded per ADR-0027):

- **Logic lives in custom hooks**, co-located with the surface that uses
  it; a hook used by one container sits beside it, promoted to a shared
  location only at second use.
- **`useEffect` is for genuine side effects.** Derived state is computed
  during render; mutable non-rendering values go in refs; effects that
  exist to "sync state" are a smell.
- **Composition over prop drilling and inheritance**; context only for
  genuinely global state (session, theme) — never for game state a
  container already owns.

## Styling and tokens

Tailwind v4, CSS-first, per ADR-0027: every design token is a CSS
variable in the `@theme` block of `packages/ui/src/styles.css`, mirroring
`design-system/references/tokens.md` (primitives → semantic roles; the
four-tier model raw → primitive → semantic → component, kept shallow to
avoid token proliferation). **No hardcoded visual values anywhere** — an
arbitrary-value utility (`bg-[#f6dcae]`, `p-[13px]`) is an audit flag.
New tokens go through the design-system creation gate first (see the
`design-system` skill), then `@theme`.

## What is enforced vs convention

Lint enforces exactly one frontend rule: the workspace-import rows above.
External npm dependencies in `web`/`ui` are **not** restricted (the
effect-only policy covers backend layers only), and no test suite runs in
`apps/web` yet. Everything else in this skill — layering, hooks
discipline, token usage — is convention held by review and the design
tooling, so don't mistake a green gate for compliance.

## Routing

- `design-system` — before any visual work (components, tokens, copy)
- `hidden-information` — before anything touching payloads, realtime, or
  per-player views (read it even for "small" changes)
- `architecture` — for cross-package placement questions
- `ai-tells` / `gate` / `impeccable` — audit and craft tooling; the
  design system outranks them all
