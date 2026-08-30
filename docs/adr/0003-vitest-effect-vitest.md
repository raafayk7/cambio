# 0003 — Test runner is vitest with @effect/vitest

- **Status:** accepted
- **Date:** 2026-08-30 (decided during Task 1, the scaffold; recorded here on ADR migration)

## Context

HANDOFF §9.6 left the test runner open, noting vitest + `@effect/vitest` as
the obvious pairing for an Effect codebase in a Vite-adjacent monorepo.

## Decision

vitest + `@effect/vitest` everywhere. `it.effect` for effectful tests with
provided layers; plain `it` for pure functions.

## Consequences

Domain property tests (thousands of randomized games, HANDOFF §12) run
in-process with seeds; application tests provide stub `Layer`s for ports. No
Jest-family tooling enters the repo.
