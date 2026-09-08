# 0019 — Lobby is a pure domain model outside the engine, persisted as rows via GameRepository lobby methods

- **Status:** accepted
- **Date:** 2026-09-01
- **Task:** CAM-5

## Context

CAM-5 must implement create/join/leave lobby and start game, but nothing in
the codebase models a lobby. The rules engine begins at a dealt state:
`dealGame(players, seed, config, now)` (`packages/domain/src/Deal.ts`) emits
`GameStarted` and produces an `AwaitingDraw` phase — the `Phase` union has no
lobby variant. `foldEvents` requires `GameStarted` as the first event
(`MissingGameStarted` otherwise), so the event log cannot represent a
pre-game lobby without amending ADR-0014's fold rules. On the persistence
side, `GameRepository.save` accepts only a dealt `GameState` and derives
`games.status` as `in_progress`/`completed` — the schema's `'lobby'` and
`'abandoned'` enum values are reserved but unwritable, and the CAM-3 DDL
makes `phase`, `discard_pile`, `prng`, and `config` NOT NULL. HANDOFF §4.3
and §7 imply lobbies **are** `games` rows (`status = 'lobby'`, expired by
pg_cron in hours).

## Decision

**The lobby is a small pure model in `packages/domain`, separate from the
rules engine.** A `Lobby` type (ordered player list + identity) with pure
transition functions — create, join, leave, start-eligibility — returning
typed lobby errors (`LobbyFull`, `AlreadyInLobby`, `NotInLobby`,
`LobbyNotJoinable`, …). `Phase`, `Engine`, `Legality`, and `Fold` are
untouched; starting a game is `Lobby` validation followed by the existing
`dealGame`. Seat indices are assigned from lobby join order at start time,
so §4.5's "contiguous from 0" invariant holds by construction.

**Persistence is row-backed via new methods on the existing `GameRepository`
port** — the path ADR-0015 explicitly anticipated ("finer-grained access
patterns become new methods on the port, not new repositories"). Lobby state
lives in a `games` row with `status = 'lobby'` plus `game_players` rows; a
migration `0003` relaxes the NOT NULL constraints that presume a dealt game
(tying nullability to status). The last player leaving marks the lobby
`status = 'abandoned'` (no soft delete; §7's pg_cron reaps abandoned rows
later). `games.version` guards lobby mutations exactly as it guards game
saves, and the lobby→game transition (`StartGame`) is one version-guarded
save from the lobby's current version.

**Lobby rooms rebuild from rows, not the fold.** `game_events` stays
in-game-only: the first event of every game remains `GameStarted`, and
ADR-0014 is unchanged. "Rooms rebuild from the event log" applies to started
games; a lobby room's authoritative state is its rows.

Alternatives considered:

- **Extend `Phase` with a `Lobby` variant** — makes the engine, `Legality`,
  `Fold`, every exhaustive event switch, and the CAM-1/2/3 test suites carry
  lobby concerns forever; the playtested rule engine would gain commands that
  are not game rules. Rejected as far too expensive for what a lobby is.
- **Separate `LobbyRepository` port** — pushes against ADR-0015's rejection
  of table-per-repository, and splits the lobby→game transition across two
  ports/transactions.
- **Lobby events in `game_events`** — uniform "everything folds" story, but
  amends ADR-0014, complicates `foldEvents` with a pre-`GameStarted` phase,
  and buys nothing: lobby state is trivially row-representable.

## Consequences

- `status = 'lobby'` and `'abandoned'` become writable; §7's lifecycle
  design gets real columns to filter on.
- The domain gains a second aggregate-ish model (`Lobby`) with its own typed
  errors; use cases stay thin because join/leave/start decisions are pure
  and unit-testable.
- Migration `0003` must relax DDL that CAM-3 shipped as NOT NULL; the
  constraint that a **started** game has non-null `phase`/`prng`/etc. should
  be preserved via CHECK so the relaxation doesn't weaken in-game rows.
- The fold's contract is untouched; anything that later wants lobby history
  (e.g. audit) would need to revisit this or add its own record.
- Mid-game leave/abandonment remains deliberately undefined (out of CAM-5's
  scope) — a future task must decide its rules before touching the engine.
