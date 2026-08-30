---
name: architecture
description: The Cambio monorepo's Clean Architecture rules — which package a new file belongs in, what each layer may import, where ports and their implementations go, and why the boundaries exist. Use this whenever you create a file, add a dependency, write an import that crosses a package boundary, wonder "where does this code live?", or design anything that spans domain/application/infrastructure — even for small changes, because boundary violations fail CI.
---

# Architecture

Cambio follows Clean Architecture with the dependency rule enforced by ESLint
(`eslint-plugin-boundaries` wired into `turbo lint` — violations **fail CI**,
so getting this right up front is cheaper than discovering it at lint time).

## The import table (law, not guidance)

| Package | May import | Role |
| --- | --- | --- |
| `packages/domain` | `effect` only | Entities, ADTs, rules engine, **repository ports**. Pure — no I/O of any kind. |
| `packages/contracts` | `effect` only | Wire schemas shared by api + web (commands, events, responses). |
| `packages/application` | `domain`, `contracts`, `effect` | Use cases, **infrastructure ports**. |
| `apps/api` | `application`, `domain`, `contracts` | Fastify presentation + all port implementations. |
| `apps/web` | `contracts`, `ui` — **never** `domain` or `application` | TanStack Start frontend. |
| `packages/ui` | nothing app-specific | shadcn primitives, shared components. |

Why `web` can never see `domain`: the domain contains full game state,
including other players' hidden cards. Keeping `contracts` separate makes
information leakage a **compile error** instead of a code-review catch. Never
"fix" a frontend type gap by importing from domain — add the shape to
`contracts` instead, and only if the client is entitled to see it (see the
`hidden-information` skill).

## Ports: the split that is easy to get wrong

- **Repository ports** (persistence of domain aggregates: games, decks, hands,
  events) are declared in **`packages/domain`**, because what can be stored and
  retrieved is domain vocabulary.
- **Infrastructure ports** (clock, id generation, realtime publisher, logger —
  capabilities the application needs but the domain doesn't know about) are
  declared in **`packages/application/src/ports/`**.
- **Implementations of both** live in **`apps/api/src/infra/`** as Effect
  `Layer`s (see `apps/api/src/infra/clock.ts` for the reference adapter).

Ports are `Context.Tag` classes; the tag string is namespaced by declaring
package, e.g. `Context.Tag("@cambio/application/ClockPort")`. Follow the
existing examples: `packages/application/src/ports/Clock.ts`,
`IdGenerator.ts`.

## "Where does this file go?" — decision procedure

1. **Is it a game rule, entity, invariant, or state transition?** → `domain`.
   If it needs time, randomness, or ids, it takes them as parameters or via a
   seed — it does not acquire them.
2. **Is it a shape the browser sends or receives?** → `contracts`. Ask: may
   every player legally see every field? If not, redesign before adding it.
3. **Is it orchestration — "load, decide, persist, publish"?** → `application`
   (a use case). It talks to domain functions and ports, never to Postgres,
   Fastify, or Supabase directly.
4. **Is it a capability contract the application needs?** → a port. Domain
   vocabulary → `domain`; technical capability → `application/src/ports/`.
5. **Does it import `pg`, `fastify`, `pino`, `supabase`, or any SDK?** →
   `apps/api/src/infra/` (adapters) or `apps/api/src/presentation/` (routes,
   request/response mapping, realtime handlers).
6. **Is it a React component with no app logic?** → `packages/ui`. With app
   logic → `apps/web`.

If a piece of code seems to need to live in two layers at once, that's a
signal to split it: pure decision in `domain`, effectful orchestration in
`application`, technology in `infra`.

## Layer-specific rules

Read the matching skill before working in a layer — each encodes rules that
are not obvious from the code:

- `effect-domain-modeling` — for anything in `packages/domain`
- `application-layer` — for use cases, ports, `contracts`
- `infrastructure-persistence` — for migrations, repositories, `apps/api/src/infra`
- `hidden-information` — for anything touching realtime, payloads to clients,
  or per-player views (security-critical; read it even for "small" changes)
- `cambio-rules` — for anything implementing or interpreting game rules

## Verifying a boundary

To confirm a violation is caught (or after changing lint config):
temporarily add an illegal import (e.g. `import { Phase } from
"@cambio/domain"` in `apps/web`), check `pnpm turbo lint` fails, revert.
