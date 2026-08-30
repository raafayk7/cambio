# 0006 — TypeScript pinned to 5.9.3, not 7.x

- **Status:** accepted
- **Date:** 2026-08-30 (decided during Task 1, the scaffold; recorded here on ADR migration)

## Context

TypeScript 7 (the Go rewrite) is `latest` on npm, but `typescript-eslint`
declares support for `typescript >=4.8.4 <6.1.0`, and Effect is the most
type-checker-demanding library in this stack.

## Decision

Pin `typescript` to 5.9.3 across the workspace.

## Consequences

Toolchain stability over new-compiler speed. Revisit when typescript-eslint
supports 7.x; verify Effect's inference behaves under the new checker before
migrating.
