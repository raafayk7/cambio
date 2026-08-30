# 0001 — All validation is Effect Schema; zod is banned from first-party code

- **Status:** accepted
- **Date:** 2026-08-30 (decided during Task 1, the scaffold; recorded here on ADR migration)

## Context

The stack commits to Effect end to end (HANDOFF §2): branded types, Schema
validation, tagged unions, typed errors. A second validation library would
split the vocabulary and invite drift between wire schemas and domain
schemas. The handoff's acceptance criterion was "zero occurrences of `zod`
in the lockfile."

## Decision

We author all validation with Effect Schema. No first-party package may
depend on zod, directly or as a type import.

The lockfile criterion is **not literally satisfiable**: TanStack Start's
Vite plugin depends on zod at build time
(`@tanstack/start-plugin-core`, `router-generator`, `router-plugin` → zod).
Accepted on the basis that the rule's intent is "we author validation with
Effect Schema." Three enforcement mechanisms hold the line:

1. No `@cambio/*` package lists zod in any dependency field.
2. pnpm's isolated `node_modules` makes zod unresolvable from workspace
   packages — a deliberate `import "zod"` fails to resolve.
3. `no-restricted-imports` in `packages/config/eslint.base.js` fails lint on
   any zod import.

## Consequences

One schema language everywhere; contracts and domain share codecs and
brands. If TanStack Start is ever replaced, the lockfile criterion becomes
literally true again. Anyone tempted to add zod "just for one endpoint" is
overruled by this ADR.
