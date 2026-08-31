# 0015 — One aggregate-shaped GameRepository: state written and events appended in a single transaction

- **Status:** proposed
- **Date:** 2026-08-31
- **Task:** CAM-3

## Context

CAM-3 introduces the persisted model: seven tables (HANDOFF §4.3) backing
one in-memory aggregate, `GameState`. Two standing rules shape the port
design: repository ports are domain vocabulary and live in `packages/domain`
(architecture skill), and every state mutation must append its events **in
the same transaction** as the state update (§6, `infrastructure-persistence`
skill) — the event log is the recovery mechanism, so a state row without its
events is corruption, not lag.

The granularity question: one port per table (GameRepository,
DeckRepository, GamePlayerRepository, …) coordinated by a unit-of-work, or
one port treating the game as an aggregate?

## Decision

We declare **one `GameRepository` port in `packages/domain`** that treats
the game as a single aggregate:

- `save` accepts the full `GameState` plus the new events (and the expected
  `version`) and, in **one transaction**, upserts
  `games`/`game_players`/`decks`/`user_cards`, appends to `game_events` and
  `card_peeks`, and bumps `games.version` — failing with a typed conflict
  error when the version check loses.
- Reads are aggregate-shaped too: load a game's state, read its event
  stream.

Alongside it, a small **`UserRepository`** for `users` — the only entity
with a lifecycle independent of a game.

The adapter in `apps/api/src/infra/` implements the port with
`@effect/sql-pg` (ADR-0002), mapping rows ↔ domain types through Schema
codecs at the boundary.

Rejected: **table-per-repository + unit of work** — it multiplies port
surface for tables that are meaningless in isolation (a `decks` row without
its game is nothing), and it demotes the same-transaction invariant from a
structural guarantee to a caller obligation that every future use case must
remember.

## Consequences

- The state+events transactional invariant is unbreakable by construction:
  there is no API for writing state without its events.
- CAM-5's use cases get a minimal port surface: load → engine → save.
- `save` rewrites the whole aggregate each time. At the game's fixed scale
  (≤5 players, 52 cards, one row per table per game) this is trivially
  cheap; revisit only if profiling ever says otherwise.
- Finer-grained access patterns (e.g. a lobby listing) become **new methods
  on the port**, not new repositories.
