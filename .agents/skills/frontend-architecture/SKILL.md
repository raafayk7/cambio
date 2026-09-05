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

- **Card values a player is not entitled to must not exist in any payload
  sent to that player.** Not hidden by CSS, not present-but-unrendered,
  not sent-then-filtered client-side. If the bytes reach the browser,
  assume they are read — so the client never receives, hides, filters, or
  redacts; the server projection already did.
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
- **Hard prohibitions carried over verbatim:** no Postgres Changes
  replication to clients, ever; and no Supabase anon-key database access
  from the browser — clients get no direct database access of any kind.
  (`apps/web` DOES ship `@supabase/realtime-js` plus a public anon JWT
  for the Broadcast socket — that is not database access; ADR-0032
  explains why the narrow dependency keeps this prohibition structural.)
  All client data arrives via the API's projections and the Broadcast
  channels it publishes.

This section is a summary, not a substitute — `hidden-information` is the
authority and carries the channel discipline this skill doesn't restate.

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

Tailwind v4, CSS-first, per ADR-0027 — read the ADR before implementing;
this is only its shape: `packages/ui/src/styles.css` mirrors
`design-system/references/tokens.md`'s **two layers** — primitives live
as plain CSS custom properties, and only the **semantic roles** are
promoted to utilities, aliasing primitives via `@theme inline` (so the
deferred dark theme lands as a role re-mapping). Keep the layering
shallow — the token-proliferation warning in the Carbonteq reference's
four-tier model (raw → primitive → semantic → component) applies, but
Cambio's canonical vocabulary is the two layers in tokens.md, nothing
more. **No hardcoded visual values anywhere** — an arbitrary-value
utility (`bg-[#f6dcae]`, `p-[13px]`) is an audit flag, and so is a
constant-valued inline `style={{}}` (a `style` prop is legitimate only
for genuinely dynamic values like computed seat positions; a constant in
one must be spec-carried and documented, and audits must grep for both
forms — a CAM-17 review learned the class-only grep misses them). New
tokens go
through the design-system creation gate first (see the `design-system`
skill), then the styles.

## What is enforced vs convention

Lint enforces exactly one **architectural** frontend rule: the
workspace-import rows above, pinned on release branches by
`packages/config/test/eslint.base.test.ts` (both directions since
CAM-15: "blocks apps/web importing the @cambio/domain/testing subpath"
and the `ui: []` row's own pins — contracts rejected, subpaths rejected,
external npm allowed); on `main` the claim is held by live probe, since
that test file lands with the release work. (General lint rules — the
Zod ban, type-import hygiene — do also apply to `web`/`ui`.) External
npm dependencies in `web`/`ui` are **not** restricted — on release
branches the effect-only external-import policy (ADR-0017) scopes to
the backend layers, and on `main` no such policy exists at all. Since
CAM-15, `packages/ui` and `apps/web` carry vitest suites on jsdom with
testing-library (ADR-0030) — run them through turbo like every other
package. Everything else in this skill — layering, hooks discipline,
token usage — is convention held by review and the design tooling, so
don't mistake a green gate for compliance.

## Routing

- `design-system` — before any visual work (components, tokens, copy)
- `hidden-information` — before anything touching payloads, realtime, or
  per-player views (read it even for "small" changes)
- `architecture` — for cross-package placement questions
- `ai-tells` / `gate` / `impeccable` — audit and craft tooling; the
  design system outranks them all
