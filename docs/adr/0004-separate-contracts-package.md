# 0004 — Wire types live in a separate @cambio/contracts package

- **Status:** accepted
- **Date:** 2026-08-30 (decided during Task 1, the scaffold; recorded here on ADR migration)

## Context

HANDOFF §9.7: contracts could be a separate package or live inside
`application` with a re-export. `apps/web` needs command/event/response
schemas but must never see the domain — domain state contains every
player's hidden cards.

## Decision

`@cambio/contracts` is its own package, importable by both `apps/api` and
`apps/web`, itself importing only `effect`. `apps/web` importing `domain` or
`application` is an ESLint-enforced build failure.

## Consequences

Information leakage toward the client becomes a compile error rather than a
code-review question. Every client-visible field is an explicit addition to
`contracts`, reviewable as an entitlement decision (see the
`hidden-information` skill). The cost — occasional shape duplication between
domain and contracts — is the point, not an accident to be DRYed away.
