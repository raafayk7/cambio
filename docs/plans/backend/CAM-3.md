# CAM-3 — Persistence: schema migrations, repositories, event log + fold-to-state (backend)

- **Root plan:** [root/CAM-3.md](../root/CAM-3.md) — the functional contract
  (C1–C6) lives there; this document is implementation detail for the backend
  side.
- **ADRs:** [0014](../../adr/0014-self-contained-event-log-fold-transcribes.md)
  (shuffle events record `PrngState`; the fold transcribes, never recomputes),
  [0015](../../adr/0015-aggregate-game-repository-port.md) (one aggregate
  `GameRepository`; state + events in a single transaction),
  [0016](../../adr/0016-domain-testing-export-subpath.md) (harness ships via
  `@cambio/domain/testing`),
  [0002](../../adr/0002-effect-sql-pg-plain-sql-migrations.md) (plain-SQL
  migrations via the hand-rolled runner).

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

Work spans two packages. Governing skills: **effect-domain-modeling** (all
`packages/domain` work — test-first, branded schemas, `Data.TaggedError`,
exhaustive `satisfies never` matches), **infrastructure-persistence** (the
migration, both adapters, every table decision), **architecture** (repository
ports in domain, adapters in `apps/api/src/infra/`, tags namespaced by
declaring package), **hidden-information** (everything this task builds is
server-only: event payloads and `card_peeks` are full truth, `decks.cards` is
the shuffled future of the game — no `contracts` change exists or may sneak
in, and nothing here is ever sent to a client).

The surfaces this task touches, as they exist today:

- **Domain engine (CAM-1, complete):** `GameState` =
  `{ players, deck, discard, prng, phase, config }`
  (`packages/domain/src/GameState.ts:54-62`); hands are sparse sorted arrays
  of `{ slotIndex, card }` (`GameState.ts:33-40`), holes never compact.
  `Phase` is a 6-variant union with codec (`Phase.ts:68-86`); `GameEvent` is
  a 22-variant union with codecs (`GameEvent.ts:159-183`). `PrngState` is a
  4-number tuple (`Prng.ts:14-15`). The two shuffle sites are
  `Deal.ts:26-29` (deal) and `Engine.ts:68-75` (`reshuffleIfEmpty`); neither
  event currently records the resulting `prng` — M1 adds it (ADR-0014).
  `CardsBlindSwapped` (`GameEvent.ts:85-89`) and `CardGivenFromHand`
  (`GameEvent.ts:129-133`) deliberately omit card identities — the fold
  derives them from its own accumulated state; do **not** add identities to
  them. `Seq` is minted at `Ids.ts:32` and unused so far. Only `GameStarted`
  carries an `at`; every other event is stamped by the persistence layer's
  `at` column (`GameEvent.ts:18-21` says so explicitly) — the `save` port
  therefore takes a `Timestamp`.
- **CAM-2 harness (complete):** `packages/domain/test/sim/{rng, candidates,
policy, invariants, counters, driver, fuzz}.ts` plus six `*.test.ts`
  files. `simulateGame(params): GameRun` (`driver.ts:105`) returns
  `{ finalState, roster, trace, events, steps, turns, counters }`;
  `params.onStep` (`driver.ts:40`) observes each post-step state.
  **`driver.ts:10` and `fuzz.ts:4` import `../fixtures.js`** — so the
  fixture builders (`uid`, `slot`, `ts`, `card` in `test/fixtures.ts`) must
  move with the harness in M2 (they are pure and `effect`-only, so nothing
  changes rule-wise). Test files stay in `test/sim/`; only helper modules
  move (ADR-0016).
- **Domain packaging:** `package.json` exports only `"."`;
  `tsconfig.build.json` compiles `src/` only; `tsconfig.json` covers
  `src/**` + `test/**`; vitest includes `test/**/*.test.ts` with
  `testTimeout: 30_000`. ESLint (layer `domain`) lints `src/**` and
  `test/**` identically: `effect`-only imports, inline type imports,
  NodeNext `.js` extensions.
- **apps/api:** `src/infra/migrate.ts` runs `NodeRuntime.runMain` at module
  scope (`migrate.ts:63`) — unusable programmatically until M5 refactors it.
  The ledger `_cambio_migrations` keys on the full filename; one transaction
  per file; `0001_init.sql` is applied and deliberately empty — **never edit
  it**, CAM-3 starts at `0002_`. `DatabaseLive` reads `DATABASE_URL`
  (`database.ts:12-15`). `runtime.ts:15-17` is where new layers register
  (`AppServices` union + `AppLayer` merge). **No test infra exists**: no
  vitest dep, no `test` script, tsconfig includes `src/` only. `@effect/sql`
  0.52.1 and `@effect/sql-pg` 0.53.0 are already dependencies.
- **Reference shapes:** `packages/application/src/ports/Clock.ts:13-18` is
  the `Context.Tag` class pattern for ports; `apps/api/src/infra/clock.ts`
  is the reference adapter; `packages/domain/src/GameError.ts` is the
  `Data.TaggedError` house style; `test/EndToEnd.test.ts:58` is the
  partition idiom (`[...allCards(state)].sort()` vs sorted
  `ALL_CARD_SLUGS`).
- **Toolchain:** all versions exact-pinned, no carets — apps/api gains
  `vitest` **3.2.7** and `@effect/vitest` **0.30.0** (the workspace's pins,
  from `packages/domain/package.json`). Turborepo runs strict env mode:
  `turbo.json`'s test task declares `SIM_GAMES`/`SIM_SEED`;
  `TEST_DATABASE_URL` joins `globalPassThroughEnv` (runtime config, like
  `DATABASE_URL`) and the new `RT_GAMES`/`RT_SEED` knobs join the test
  task's `env`. Docker Postgres: `postgres:17-alpine`, host port **5433**,
  user/pass `cambio`/`cambio`, one database `cambio`
  (`docker/docker-compose.yml`) — the isolated `cambio_test` database is
  created by test setup, not by compose. Prettier: no semicolons, double
  quotes, width 100; `pnpm format` fixes. If `pnpm` is missing from PATH:
  `source ~/.nvm/nvm.sh && nvm use 22`.
- **Schema decisions already made in the root plan (do not reopen):** decks
  keyed by `game_id` (no `deck_id`), no `called_cambio_by`, `games` carries
  `prng` + `config` jsonb, `status` derived from phase at save, `final_score`
  materialized from `GameEnded` at completion, every unique constraint
  partial on `WHERE deleted_at IS NULL`, `game_events.at` is bigint epoch-ms
  (domain `Timestamp`) while `created_at`/`updated_at`/`deleted_at` stay
  timestamptz.
- **Not in scope:** recovery wiring (CAM-5), `HoldingCard` power refinement
  (CAM-10 — decoded `games.phase` is trusted as written until then),
  pg_cron sweeps (CAM-8), HTTP/realtime surfaces, `contracts`.

## Module layout

New/changed files in `packages/domain`:

| File                          | Exports                                                                                                                                                                   | Job                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/GameEvent.ts` (edit)     | `GameStarted`, `DeckReshuffled` gain `prng: PrngState`                                                                                                                    | ADR-0014: shuffle events record the post-shuffle PRNG state.                                                                                 |
| `src/Deal.ts` (edit)          | unchanged surface                                                                                                                                                         | `GameStarted` payload gains the post-deal `prng` (same value as `state.prng`).                                                               |
| `src/Engine.ts` (edit)        | unchanged surface                                                                                                                                                         | `reshuffleIfEmpty` emits `prng` on `DeckReshuffled`.                                                                                         |
| `src/Fold.ts` (new)           | `foldEvents`, `EmptyEventLog`, `MissingGameStarted`, `InconsistentEvent`, `FoldError`                                                                                     | Pure event-log fold per ADR-0014: transcription + bounded phase inference; never shuffles, never replays commands; `Either`, never throws.   |
| `src/GameRepository.ts` (new) | `GameRepository` (Context.Tag), `SaveGameInput`, `GameNotFound`, `VersionConflict`, `StorageError`                                                                        | The ADR-0015 aggregate port + its typed error vocabulary. Domain still imports `effect` only.                                                |
| `src/UserRepository.ts` (new) | `UserRepository` (Context.Tag), `User`, `UserNotFound`                                                                                                                    | Minimal users port (C4.1); CAM-4 builds auth on it.                                                                                          |
| `src/Ids.ts` (edit)           | `GameVersion` (branded non-negative Int)                                                                                                                                  | Optimistic-concurrency version, branded like `Seq`.                                                                                          |
| `src/index.ts` (edit)         | re-exports `Fold`, `GameRepository`, `UserRepository`                                                                                                                     | Barrel; does **not** re-export `testing/` (ADR-0016).                                                                                        |
| `src/testing/*.ts` (moved)    | `rng`, `candidates`, `policy`, `invariants`, `counters`, `driver`, `fuzz` — surfaces unchanged, plus `fixtures.ts` (`uid`, `slot`, `ts`, `card`) and an `index.ts` barrel | The CAM-2 harness, now built and published as `@cambio/domain/testing` (ADR-0016). `driver.ts` `onStep` gains a 4th param `eventCount` (M3). |
| `test/fixtures.ts` (edit)     | re-exports `../src/testing/fixtures.js`                                                                                                                                   | Shim so the 15+ existing test files keep their `./fixtures.js` imports untouched.                                                            |
| `test/sim/*.test.ts` (edit)   | —                                                                                                                                                                         | Import paths updated to `../../src/testing/*.js`. Test files themselves do not move.                                                         |
| `test/Fold.test.ts` (new)     | —                                                                                                                                                                         | C2.2 error/transcription units + the C5.1 fold property over harness batches.                                                                |
| `test/Ports.test.ts` (new)    | —                                                                                                                                                                         | C2.3: tag identities, error shapes.                                                                                                          |
| `package.json` (edit)         | `"./testing"` export subpath                                                                                                                                              | `{ "types": "./dist/testing/index.d.ts", "default": "./dist/testing/index.js" }`.                                                            |

New/changed files in `apps/api` (plus repo-root config):

| File                                      | Exports                                                                                      | Job                                                                                                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrations/0002_cambio_schema.sql` (new) | —                                                                                            | The seven §4.3 tables (C1) — DDL sketch in M5.                                                                                                                          |
| `src/infra/migrate.ts` (edit)             | `migrate` (Effect requiring `SqlClient.SqlClient`)                                           | C6.1: module-scope `runMain` removed; the program becomes reusable.                                                                                                     |
| `src/infra/migrate-cli.ts` (new)          | — (entry point)                                                                              | `NodeRuntime.runMain(migrate.pipe(Effect.provide(DatabaseLive), Effect.scoped))`; `package.json`'s `migrate` script points here.                                        |
| `src/infra/game-repository.ts` (new)      | `GameRepositoryLive` (Layer), `actorOf`                                                      | C3: transactional aggregate save + event append, version guard, codec boundary, soft-delete filters, per-tag actor mapping.                                             |
| `src/infra/user-repository.ts` (new)      | `UserRepositoryLive` (Layer)                                                                 | C4.1, same discipline, `clock.ts`-style small adapter.                                                                                                                  |
| `src/runtime.ts` (edit)                   | `AppServices` + `GameRepository` + `UserRepository`                                          | Registers both layers in `AppLayer` (repos consume `SqlClient` from `DatabaseLive`).                                                                                    |
| `package.json` (edit)                     | `test` script; devDeps `vitest` 3.2.7, `@effect/vitest` 0.30.0                               | C6.2.                                                                                                                                                                   |
| `tsconfig.json` (edit)                    | —                                                                                            | `include` gains `test/**/*.ts` (`tsconfig.build.json` stays `src/`-only).                                                                                               |
| `vitest.config.ts` (new)                  | —                                                                                            | `include: ["test/**/*.test.ts"]`, `testTimeout: 30_000`, `globalSetup: "./test/global-setup.ts"`, `fileParallelism: false` (shared DB).                                 |
| `test/global-setup.ts` (new)              | default export                                                                               | Provision `cambio_test` (CREATE DATABASE if missing via the admin `cambio` DB), run the exported `migrate` effect, truncate tables.                                     |
| `test/support/db.ts` (new)                | `TEST_DATABASE_URL`, `TestDatabaseLive`, `TestLayer`, `makeTestRuntime`, `ensureRosterUsers` | `PgClient.layer` on `TEST_DATABASE_URL` (defaulted); repo layers over the test DB; one `ManagedRuntime` (one pool) per suite file; idempotent `uid(0..4)` user seeding. |
| `test/Migrations.test.ts` (new)           | —                                                                                            | C1 schema introspection + idempotence.                                                                                                                                  |
| `test/UserRepository.test.ts` (new)       | —                                                                                            | C4.1.                                                                                                                                                                   |
| `test/GameRepository.test.ts` (new)       | —                                                                                            | C1.6, C3.3–C3.5, C3.7–C3.9 on scripted games.                                                                                                                           |
| `test/RoundTrip.test.ts` (new)            | —                                                                                            | C5.2 harness round-trips + C5.3 §4.5-verbatim row assertions.                                                                                                           |
| `test/SharpEdges.test.ts` (new)           | —                                                                                            | C5.4: version-conflict atomicity, partial-index re-insert, soft-deleted game invisibility.                                                                              |
| `turbo.json` (edit, repo root)            | —                                                                                            | `TEST_DATABASE_URL` → `globalPassThroughEnv`; `RT_GAMES`, `RT_SEED` → test task `env`.                                                                                  |
| `.env.example` (edit, repo root)          | —                                                                                            | `TEST_DATABASE_URL=postgres://cambio:cambio@localhost:5433/cambio_test`.                                                                                                |

## Plan of work

Ordered by root-plan milestone. Domain steps write the named test **first**,
watch it fail, then implement; every step ends with the repo compiling and
`pnpm --filter @cambio/domain test` (or, from M5, the api suite too) green.

### M1 — Event payload extension (C2.1)

**Step 1.1 — `prng` on the two shuffle events.**
Tests first:

- `packages/domain/test/GameEvent.test.ts` — add `prng` to the `GameStarted`
  literal (`:12`) and the `DeckReshuffled` literal (`:92`) using
  `prngStateFromSeed(n)`; the round-trip test now fails to decode until the
  schema changes.
- `packages/domain/test/Deal.test.ts` — in "is deterministic and the
  GameStarted event matches the state" (`:66`), add
  `expect(started.prng).toStrictEqual(state.prng)`.
- `packages/domain/test/TurnActions.test.ts` — in "reshuffles the pile …"
  (`:202`), assert the `DeckReshuffled` event's `prng` equals `after.prng`
  (narrow the event with an `if (events[0]!._tag !== "DeckReshuffled")`
  guard, the file's existing style).

Then implement:

- `src/GameEvent.ts` — import `PrngState` from `./Prng.js`; add
  `prng: PrngState` to `GameStarted` (`:22-30`) and `DeckReshuffled`
  (`:149-151`). Docstrings cite ADR-0014 ("records the state **after** the
  shuffle; the fold transcribes it, never recomputes").
- `src/Deal.ts` — the `started` literal (`:49-58`) gains `prng` (the same
  `prng` already placed in `state` at `:40-47`).
- `src/Engine.ts` — `reshuffleIfEmpty` (`:68-75`) emits
  `{ _tag: "DeckReshuffled", deck, prng }`.
- `test/sim/Simulation.test.ts:134` — the synthetic `DeckReshuffled`
  counter-derivation literal gains a `prng` (any `prngStateFromSeed`
  value).

Checkpoint: full domain suite green (the sim batch replays 250 games —
payload growth must not disturb it; nothing asserts event-shape exhaustively
outside the two files above).

### M2 — Harness relocation (C2.4)

**Step 2.1 — Move, shim, export.** Mechanical, one commit, no behavior
change:

1. `git mv packages/domain/test/sim/{rng,candidates,policy,invariants,counters,driver,fuzz}.ts packages/domain/src/testing/`.
2. Create `src/testing/fixtures.ts` with the current content of
   `test/fixtures.ts` (imports become `../Card.js`, `../Ids.js`); rewrite
   `test/fixtures.ts` to a one-line shim:
   `export * from "../src/testing/fixtures.js"` — the existing 15 test
   files (and `test/sim/*.test.ts`) keep importing `./fixtures.js` /
   `../fixtures.js` untouched. This move is forced by
   `driver.ts:10`/`fuzz.ts:4` importing `../fixtures.js`; the builders are
   pure and `effect`-only, so `src/` standards already hold.
3. Fix relative paths inside the moved modules: `../../src/X.js` → `../X.js`
   and `../fixtures.js` → `./fixtures.js`.
4. Create `src/testing/index.ts` barrelling all eight modules
   (`export * from "./driver.js"` etc.).
5. `package.json` — add the `"./testing"` export (see Module layout).
   `src/index.ts` is **not** touched by this step: simulation machinery
   stays out of the default import path (ADR-0016).
6. Update the six `test/sim/*.test.ts` files: `./driver.js` →
   `../../src/testing/driver.js` and so on (their `../../src/*` engine
   imports are already correct).
7. `pnpm --filter @cambio/domain build` — verify `dist/testing/index.js` +
   `.d.ts` exist (the harness is now compiled under `tsconfig.build.json`,
   which includes `src/**` already).

Checkpoint: domain build, typecheck, lint, test all green;
`git diff --name-only -- packages/domain/test/EndToEnd.test.ts` prints
nothing.

### M3 — foldEvents (C2.2, C5.1)

**Step 3.1 — `onStep` event alignment.** The C5.1 prefix property needs to
know how many events precede each step boundary, and `onStep`
(`driver.ts:40`, called at `driver.ts:209` after `events.push`) doesn't say.
Extend it additively:
`onStep?: (state, now, step, eventCount) => void` where `eventCount` is
`events.length` after the step's append — existing callers
(`Fuzz.test.ts` probes) ignore the extra argument. Test first: add to
`test/sim/Driver.test.ts` a small run collecting `eventCount`s — they are
strictly increasing and the last equals `run.events.length`. Then edit
`src/testing/driver.ts` (interface + the `:209` call site). Under ADR-0016
the harness surface is now API; this is the one deliberate (additive)
change, noted here so `/review` doesn't read it as drift.

**Step 3.2 — The fold, test-first.** Write
`packages/domain/test/Fold.test.ts` before `src/Fold.ts` exists:

- `describe("foldEvents error channel (C2.2)")` — hand-built streams (reuse
  `fixtures` + `dealGame` output):
  - `[]` ⇒ `Either.left` with `_tag: "EmptyEventLog"`.
  - a stream starting with `CambioCalled` ⇒ `MissingGameStarted` carrying
    `firstTag: "CambioCalled"`.
  - a second `GameStarted` at index > 0 ⇒ `InconsistentEvent` (index, tag).
  - a `CardDrawn` whose `card` ≠ the accumulated `deck[0]` ⇒
    `InconsistentEvent` with a reason naming the mismatch.
  - a `CardsBlindSwapped` naming an unoccupied slot ⇒ `InconsistentEvent`.
  - any event after `GameEnded` ⇒ `InconsistentEvent`.
  - none of these **throw** — every case is asserted through `Either.left`.
- `describe("transcription, not recomputation (C2.2, ADR-0014)")` — fold a
  hand-built `GameStarted` + `DeckReshuffled` pair whose `deck` order and
  `prng` are arbitrary values no real shuffle would produce; the folded
  state carries them verbatim (proves the fold copies payloads and never
  calls `shuffle`).
- `describe("fold ≡ live state over the harness batch (C5.1)")` — the
  batch, CAM-2 style (`beforeAll` plays once, `it`s assert): `FOLD_GAMES =
Number(process.env.SIM_GAMES ?? "250")`, `BASE_SEED =
Number(process.env.SIM_SEED ?? "20260831")` (reusing the declared knobs;
  header comment documents this), `config = { slamWindowMs: 4000 }`, seeds
  via `seedPair`, counts via `playerCountFor`, computed `beforeAll` timeout
  `Math.max(120_000, FOLD_GAMES * 120)`. Each game runs with an `onStep`
  that records `{ state, eventCount }` every 7th step. Tests, titles
  verbatim:
  - "folding the full event log reproduces the final state — phase and prng
    included (C5.1, ADR-0014)" — per run,
    `Either.getOrThrow(foldEvents(run.events))` `toStrictEqual`
    `run.finalState` (deep equality covers `prng` and `phase`; also assert
    them individually so a failure names the field).
  - "folding a step-boundary prefix reproduces the intermediate state
    (C5.1)" — for every sample,
    `foldEvents(run.events.slice(0, eventCount))` deep-equals the sampled
    state.

Then implement `src/Fold.ts`:

```ts
export class EmptyEventLog extends Data.TaggedError("EmptyEventLog") {}
export class MissingGameStarted extends Data.TaggedError("MissingGameStarted")<{
  readonly firstTag: string
}> {}
export class InconsistentEvent extends Data.TaggedError("InconsistentEvent")<{
  readonly index: number
  readonly tag: string
  readonly reason: string
}> {}
export type FoldError = EmptyEventLog | MissingGameStarted | InconsistentEvent

export const foldEvents = (
  events: ReadonlyArray<GameEvent>,
): Either.Either<GameState, FoldError>
```

(effect 3.x order: success first, matching `EngineResult`,
`Engine.ts:26`.) Internals: a single `applyEvent(state, event, index)`
returning `Either<GameState, FoldError>`, exhaustive `switch` on
`event._tag` with `default: return event satisfies never`; a local
`sortHand`/`withHand` pair mirroring `Engine.ts:34-39` (private there —
reimplement the three lines rather than exporting engine internals).
Per-event rules (docstring documents each, citing ADR-0014):

- **Transcription:** `GameStarted` ⇒ whole initial state from the payload
  (players×hands zipped, deck, `[firstDiscard]`, config, `prng`), phase
  `AwaitingDraw(players[0])`; `CardDrawn`/`PenaltyDrawn`/`CardGivenFromDeck`
  pop `deck[0]` (asserting it equals the payload card — else
  `InconsistentEvent`); `DiscardTaken` pops `discard[0]`;
  `HeldSwapped`/`HeldKept`/`PenaltyDrawn` place cards at their named slots;
  `HeldDiscarded`/`PowerDiscarded`/`SlamSucceeded` prepend to discard
  (`SlamSucceeded` also removes the target slot, asserting identity);
  `DeckReshuffled` ⇒ `deck = payload.deck`, `discard = [discard[0]]`,
  `prng = payload.prng`; `DrawSkipped`/`SlamFailed`/`PowerFizzled`/
  `CambioCalled`/`SlamWindowClosed`/`CardPeeked` (non-Queen) touch no cards.
- **Derivation (the two identity-less events):** `CardsBlindSwapped` swaps
  the two slots' cards read from accumulated hands; `CardGivenFromHand`
  moves the slammer's `fromSlot` card to `to` — unoccupied source/target ⇒
  `InconsistentEvent`.
- **Phase inference (the only re-derivation, ADR-0014):** `CardDrawn` ⇒
  `HoldingCard(source: "deck")` for non-power ranks, else
  `ResolvingPower`; `DiscardTaken` ⇒ `HoldingCard(source: "discard")`;
  `CardPeeked` while `ResolvingPower` holds a Queen ⇒ `ResolvingQueenSwap`;
  `SlamWindowOpened` ⇒ `SlamWindow` (payload verbatim); `TurnAdvanced` ⇒
  `AwaitingDraw(playerId)`; `GameEnded` ⇒ `Ended(calledBy)`; everything
  else leaves phase alone (slams happen inside a window without changing
  it — `Engine.ts:242-319` never touches phase in `slam`).
- The held card lives in the phase (as in the engine), so
  `HeldSwapped`/`HeldDiscarded`/`HeldKept`/`PowerDiscarded` read
  `phase.card` from the accumulator — a mismatch with the payload is an
  `InconsistentEvent`.
- Module docstring pins the contract: input must be a **whole-command
  prefix** (event batches append atomically per command — the driver, and
  later the repository, only ever cut at step boundaries); folding a
  mid-batch prefix is unspecified. The fold never calls `shuffle` and never
  calls `applyCommand`.

Add `export * from "./Fold.js"` to `src/index.ts` (the fold is real domain
surface — CAM-5's recovery uses it).

Checkpoint: domain suite green, including the new batch (expect roughly
+1 s wall time; the 250-game batch replays in ~1 s per CAM-2's numbers).

### M4 — Repository ports (C2.3)

**Step 4.1 — Ports and error vocabulary, test-first.** Write
`packages/domain/test/Ports.test.ts`:

- `GameRepository.key === "@cambio/domain/GameRepository"` and
  `UserRepository.key === "@cambio/domain/UserRepository"` (the
  architecture skill's namespacing rule, pinned).
- Each error constructs and carries its fields:
  `new VersionConflict({ gameId, expected, actual })` has
  `_tag: "VersionConflict"`; `GameNotFound`, `StorageError`, `UserNotFound`
  likewise. (`GameError.test.ts` is the pattern.)
- `GameVersion` decodes 0 and rejects −1 (mirror the `Seq` tests if any, or
  a direct `Schema.decodeUnknownEither` pair).

Then implement:

- `src/Ids.ts` — add
  `export const GameVersion = Schema.Int.pipe(Schema.nonNegative(), Schema.brand("GameVersion"))`
  (+ type), docstring citing §4.3 optimistic concurrency.
- `src/GameRepository.ts` — errors (one per caller reaction,
  effect-domain-modeling):

  ```ts
  export class GameNotFound extends Data.TaggedError("GameNotFound")<{
    readonly gameId: GameId
  }> {}
  export class VersionConflict extends Data.TaggedError("VersionConflict")<{
    readonly gameId: GameId
    readonly expected: GameVersion
    readonly actual: GameVersion | null // null: no live row (insert lost or game missing)
  }> {}
  export class StorageError extends Data.TaggedError("StorageError")<{
    readonly operation: string
    readonly cause: unknown
  }> {}
  ```

  and the aggregate port (ADR-0015):

  ```ts
  export interface SaveGameInput {
    readonly gameId: GameId
    readonly state: GameState
    /** Version the caller loaded; GameVersion 0 = first save (insert). */
    readonly expectedVersion: GameVersion
    /** Events produced since that version — appended atomically with the state. */
    readonly newEvents: ReadonlyArray<GameEvent>
    /** Stamp for game_events.at (GameEvent payloads carry no timestamps; GameEvent.ts:18-21). */
    readonly at: Timestamp
  }

  export class GameRepository extends Context.Tag("@cambio/domain/GameRepository")<
    GameRepository,
    {
      readonly save: (
        input: SaveGameInput,
      ) => Effect.Effect<GameVersion, VersionConflict | StorageError>
      readonly load: (
        gameId: GameId,
      ) => Effect.Effect<
        { readonly state: GameState; readonly version: GameVersion },
        GameNotFound | StorageError
      >
      readonly getEvents: (
        gameId: GameId,
      ) => Effect.Effect<ReadonlyArray<GameEvent>, GameNotFound | StorageError>
    }
  >() {}
  ```

  (`save` returns the new version so callers chain saves without a
  reload.) Imports: `Context`, `Data`, `type Effect` from `effect` only.

- `src/UserRepository.ts` —
  `export const User = Schema.Struct({ id: UserId, name: Schema.String })`
  (+ type), `UserNotFound` tagged error, and a `Context.Tag` class with
  `create: (user: User) => Effect.Effect<void, StorageError>` and
  `findById: (userId: UserId) => Effect.Effect<User, UserNotFound | StorageError>`
  (`StorageError` imported from `./GameRepository.js` — one shared storage
  error, not one per port).
- `src/index.ts` — export both modules.

Checkpoint: domain suite green; `pnpm --filter @cambio/domain lint` proves
`effect`-only imports still hold over the new files.

### M5 — Migration + test scaffolding (C1, C6)

**Step 5.1 — Refactor the runner (C6.1).** Edit
`apps/api/src/infra/migrate.ts`: drop the module-scope
`NodeRuntime.runMain` (`:63`) and the `Effect.provide(DatabaseLive)` pipe
(`:61`); export the program as
`export const migrate: Effect.Effect<void, SqlError, SqlClient.SqlClient>`
(name it `migrate`; body unchanged — ledger bootstrap, filename-sorted
files, one transaction per file). Create `src/infra/migrate-cli.ts`:

```ts
import { NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"
import { DatabaseLive } from "./database.js"
import { migrate } from "./migrate.js"

NodeRuntime.runMain(migrate.pipe(Effect.provide(DatabaseLive), Effect.scoped))
```

and point `apps/api/package.json`'s `migrate` script at
`src/infra/migrate-cli.ts` (same `node --env-file-if-exists=../../.env
--import tsx` incantation). Verify by hand:
`pnpm --filter @cambio/api migrate` logs "no pending migrations (1
applied)" exactly as before.

**Step 5.2 — The migration (C1.1–C1.7).** Create
`apps/api/migrations/0002_cambio_schema.sql` (`0001_init.sql` untouched).
DDL sketch — the implementer writes the final SQL from this, keeping the
header comment convention of `0001`:

```sql
CREATE TABLE users (
  user_id     uuid PRIMARY KEY,
  user_name   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE TABLE games (
  game_id      uuid PRIMARY KEY,
  status       text NOT NULL CHECK (status IN ('lobby', 'in_progress', 'completed', 'abandoned')),
  phase        jsonb NOT NULL,          -- Phase union via its codec (Phase.ts, not the stale §4.2 sketch)
  discard_pile text[] NOT NULL,         -- element 0 = top
  prng         jsonb NOT NULL,          -- encoded PrngState
  config       jsonb NOT NULL,          -- encoded GameConfig
  version      int NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE TABLE game_players (
  game_id      uuid NOT NULL REFERENCES games (game_id),
  user_id      uuid NOT NULL REFERENCES users (user_id),
  seat_index   int NOT NULL CHECK (seat_index >= 0),
  final_score  int,                     -- null until GameEnded materializes it (C3.5)
  is_connected boolean NOT NULL DEFAULT true,
  is_bot       boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  PRIMARY KEY (game_id, user_id)
);
CREATE UNIQUE INDEX game_players_seat_key
  ON game_players (game_id, seat_index) WHERE deleted_at IS NULL;

CREATE TABLE decks (
  game_id    uuid PRIMARY KEY REFERENCES games (game_id),  -- one deck per game (root decision; no deck_id)
  cards      text[] NOT NULL,          -- element 0 = next to draw; no size column
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE user_cards (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id    uuid NOT NULL REFERENCES games (game_id),
  user_id    uuid NOT NULL REFERENCES users (user_id),
  "index"    int NOT NULL CHECK ("index" >= 0),
  card       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX user_cards_slot_key
  ON user_cards (game_id, user_id, "index") WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX user_cards_card_key
  ON user_cards (game_id, card) WHERE deleted_at IS NULL;

CREATE TABLE card_peeks (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id    uuid NOT NULL REFERENCES games (game_id),
  seq        int NOT NULL,             -- the CardPeeked event's sequence number (C1.6)
  viewer_id  uuid NOT NULL REFERENCES users (user_id),
  card       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX card_peeks_seq_key
  ON card_peeks (game_id, seq) WHERE deleted_at IS NULL;

CREATE TABLE game_events (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id    uuid NOT NULL REFERENCES games (game_id),
  seq        int NOT NULL CHECK (seq >= 0),
  type       text NOT NULL,            -- the event _tag
  payload    jsonb NOT NULL,           -- encoded GameEvent, full truth, server-only
  actor_id   uuid,                     -- null for GameStarted / SlamWindowClosed / DeckReshuffled (C3.8)
  at         bigint NOT NULL,          -- domain Timestamp, epoch ms (root decision)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX game_events_seq_key
  ON game_events (game_id, seq) WHERE deleted_at IS NULL;
```

Design notes the file's header comment records: **every** unique constraint
is partial on `deleted_at IS NULL` (root decision; §7 gotcha 1) — which
forces surrogate identity PKs on `user_cards`, `card_peeks`, and
`game_events`, because a natural composite PK cannot be partial and would
start rejecting re-inserts once soft-deleted rows accumulate.
`game_players` keeps its natural PK `(game_id, user_id)` per C1.3
(re-seating a soft-deleted player is out of scope until CAM-8). `status` is
a CHECK-constrained text, not a PG enum — plain-SQL migrations stay
trivially editable (a new status is a new migration altering one
constraint). No `turn`, `face_up_card`, `size`, `winner`,
`called_cambio_by`, and no card `score` anywhere (store nothing derivable).
Card columns are `text` — `CardSlug` is validated at the codec boundary,
not by the database.

Apply it: `pnpm --filter @cambio/api migrate` (applies `0002`), then again
(no pending).

**Step 5.3 — apps/api test scaffolding (C6.2).**

1. `apps/api/package.json` — devDeps `"vitest": "3.2.7"`,
   `"@effect/vitest": "0.30.0"`; script `"test": "vitest run"`.
   `pnpm install`.
2. `apps/api/tsconfig.json` — `"include": ["src/**/*.ts", "test/**/*.ts"]`
   (`rootDir` is already `"."`; `tsconfig.build.json` untouched).
3. `apps/api/vitest.config.ts` — mirror
   `packages/domain/vitest.config.ts`, plus
   `globalSetup: "./test/global-setup.ts"` and `fileParallelism: false`
   (five files share one database; serial files keep truncation-free
   isolation honest).
4. `apps/api/test/support/db.ts` — the shared plumbing:

   ```ts
   export const TEST_DATABASE_URL =
     process.env.TEST_DATABASE_URL ?? "postgres://cambio:cambio@localhost:5433/cambio_test"
   export const TestDatabaseLive = PgClient.layer({ url: Redacted.make(TEST_DATABASE_URL), ... })
   export const TestLayer // GameRepositoryLive + UserRepositoryLive over TestDatabaseLive (added in M6)
   export const makeTestRuntime // ManagedRuntime.make(TestLayer): one pool per suite file, disposed in afterAll
   export const ensureRosterUsers // INSERT uid(0..4) ... ON CONFLICT DO NOTHING (raw SQL, test-only)
   ```

   The literal default keeps `pnpm --filter @cambio/api test` working with
   nothing but Docker up (vitest is not run through `node --env-file`, so
   `.env` is not auto-loaded; the env var overrides in CI). `uid` comes
   from `@cambio/domain/testing` — the harness rosters are `uid(0..n-1)`
   (`driver.ts:109-110`), so games can share seeded users across files;
   `ON CONFLICT DO NOTHING` makes seeding idempotent.

5. `apps/api/test/global-setup.ts` — default-export an async function:
   derive the admin URL from `TEST_DATABASE_URL` by swapping the pathname
   to `/cambio` (the compose-created DB); via a short-lived `PgClient`
   layer run `SELECT 1 FROM pg_database WHERE datname = 'cambio_test'` and
   `sql.unsafe('CREATE DATABASE cambio_test')` when absent (CREATE
   DATABASE cannot run in a transaction — keep it a bare statement); then
   run the **exported `migrate` effect** from
   `../src/infra/migrate.js` provided with a `cambio_test` client; then
   truncate all seven tables + nothing else
   (`TRUNCATE game_events, card_peeks, user_cards, decks, game_players, games, users`)
   so every suite run starts clean. All through `Effect.runPromise`.
6. `turbo.json` — `"TEST_DATABASE_URL"` appended to
   `globalPassThroughEnv` (runtime config, not hashed — same reasoning as
   `DATABASE_URL`, `turbo.json:5-18`); the `test` task `env` becomes
   `["SIM_GAMES", "SIM_SEED", "RT_GAMES", "RT_SEED"]` (round-trip knobs
   are hashed: a different batch is a different test run).
7. `.env.example` — under the apps/api section:
   `TEST_DATABASE_URL=postgres://cambio:cambio@localhost:5433/cambio_test`
   with a comment ("integration tests; database is created by test setup —
   never point this at a database you care about: setup truncates it").

**Step 5.4 — First integration test.** `apps/api/test/Migrations.test.ts`
(plain `it` + `Effect.runPromise` helpers or `it.effect` with
`TestDatabaseLive` — implementer's choice, note it in Progress; queries via
`SqlClient`):

- "0002 creates the seven §4.3 tables, each with soft-delete columns
  (C1.1)" — `information_schema.tables` contains exactly the seven +
  `_cambio_migrations`; each of the seven has `created_at`, `updated_at`,
  `deleted_at`.
- "re-running migrate is a no-op (C1.1, C6.1)" — run the exported `migrate`
  effect again in-test; `_cambio_migrations` row count unchanged (2), no
  error.
- "games has exactly the decided columns and no derivable ones (C1.2)" —
  column-name set equality against
  `{game_id, status, phase, discard_pile, prng, config, version, created_at, updated_at, deleted_at}`
  (set equality is what proves `turn`/`face_up_card`/`winner`/
  `called_cambio_by` absent).
- "game_players/decks keys match the contract (C1.3, C1.4)" — PK columns
  from `information_schema.table_constraints`/`key_column_usage`:
  `(game_id, user_id)` and `(game_id)`; `decks` has no `deck_id`/`size`
  column.
- "every unique constraint is partial on deleted_at (C1.3, C1.5, C1.7)" —
  `pg_indexes.indexdef` for `game_players_seat_key`, `user_cards_slot_key`,
  `user_cards_card_key`, `card_peeks_seq_key`, `game_events_seq_key` each
  contain `WHERE (deleted_at IS NULL)`.

Checkpoint: `pnpm --filter @cambio/domain build && pnpm --filter
@cambio/api test` green with Docker up (the subpath import resolves against
`dist/` — turbo's `^build` handles this in the gate; building domain first
is only needed for direct `--filter` runs).

### M6 — Adapters (C3, C4)

**Step 6.1 — UserRepositoryLive (C4.1), the pattern-setter.** Test first,
`apps/api/test/UserRepository.test.ts`:

- "create + findById round-trips a user (C4.1)" — decoded `User`
  deep-equals input.
- "findById of an unknown id fails with UserNotFound (C4.1)" — typed error
  via `Effect.either`, never a throw.
- "a soft-deleted user is not found (C4.1, C3.6 discipline)" — raw
  `UPDATE users SET deleted_at = now() …`, then `UserNotFound`.

Then `apps/api/src/infra/user-repository.ts`:
`export const UserRepositoryLive = Layer.effect(UserRepository,
Effect.gen(function* () { const sql = yield* SqlClient.SqlClient; return { … } }))`.
Every query wrapped
`Effect.mapError((cause) => new StorageError({ operation: "users.create", cause }))`;
reads filter `deleted_at IS NULL` in SQL; rows decode through a small
`Schema.Struct` row schema then `User` — raw rows never escape the module.
`clock.ts` is the layer-shape reference; this file is the row-mapping
reference for Step 6.2.

**Step 6.2 — GameRepositoryLive (C3.\*).** Test first,
`apps/api/test/GameRepository.test.ts`, on one scripted harness game
(`simulateGame` with fixed literal seeds, `ensureRosterUsers` in
`beforeAll`):

- "first save inserts, load returns the identical decoded state and version
  (C3.3)" — save with `expectedVersion` 0 and
  `newEvents = run.events`-prefix; `load` result `toStrictEqual`s the
  state (branded, `phase` round-tripped through its codec) and version 1.
- "getEvents returns the complete ordered decoded stream (C3.9)" —
  deep-equals the events saved, in order; seqs implicit by order.
- "sequence numbers are contiguous from 0 across saves (C3.1)" — after a
  second save appending more events, `SELECT seq … ORDER BY seq` is
  `0..n-1` with no gaps.
- "save writes one card_peeks row per CardPeeked with that event's seq
  (C1.6)" — pick a run containing peeks (assert the fixture run has ≥ 1);
  rows match `(seq, viewer_id, card)` of each `CardPeeked` in the log.
- "status derives from phase at save (C3.4)" — mid-flight save ⇒
  `in_progress`; completion save ⇒ `completed`.
- "final_score is null mid-game and materialized from GameEnded at
  completion (C3.5)" — per player, equals `GameEnded.scores` totals.
- "actor_id follows the exhaustive per-tag mapping (C3.8)" — unit-test the
  exported `actorOf` over one literal event of **all 22 tags**: `playerId`
  spellings (`playerId`/`calledBy`/`viewerId`/`by`/`slammerId`) map to the
  right id; `GameStarted` (system-driven deal — see root decision log),
  `SlamWindowClosed`, and `DeckReshuffled` map to null; then
  assert the persisted `actor_id` column agrees for the scripted game's
  rows.
- "SQL failures surface as typed StorageError (C3.7)" — save a game whose
  roster users were never created (FK violation): `Effect.either` yields
  `Either.left` with `_tag: "StorageError"`; nothing throws.

Then `apps/api/src/infra/game-repository.ts`:

- `export const actorOf = (e: GameEvent): UserId | null` — `switch` on
  `e._tag` over all 22 cases, `default: return e satisfies never`
  (compiler-checked exhaustiveness; a 23rd event variant fails this file's
  build).
- Encoding helpers at the codec boundary: `encodeGameState` pieces
  (`encodePhase`, `Schema.encodeSync(PrngState)`, `encodeGameConfig`,
  `encodeGameEvent`) on the way in; on the way out assemble
  `{ players, deck, discard, prng, phase, config }` from rows and run one
  `Schema.decodeUnknown(GameState)` — a decode failure is a
  `StorageError` (corrupt row), never a leak of raw shapes.
- `save(input)` — one `sql.withTransaction`:
  1. `games` guard: `expectedVersion === 0` ⇒ `INSERT … ON CONFLICT
(game_id) DO NOTHING`; zero rows affected ⇒ `VersionConflict`.
     Otherwise `UPDATE games SET status, phase, discard_pile, prng, config,
version = ${expected + 1}, updated_at = now() WHERE game_id = … AND
version = ${expected} AND deleted_at IS NULL`; zero rows ⇒ SELECT the
     live row's version ⇒ `VersionConflict({ expected, actual })` (actual
     null when no live row). This row lock serializes all concurrent
     writers for the game — everything below rides it.
  2. `game_players` upsert (`ON CONFLICT (game_id, user_id) DO UPDATE`)
     from `state.players` seat order; `final_score` set per player exactly
     when `newEvents` contains `GameEnded` (from its `scores`), else left
     as-is (null).
  3. `decks` upsert (`ON CONFLICT (game_id) DO UPDATE`) with
     `state.deck`.
  4. `user_cards` rewrite: soft-delete the game's live rows
     (`UPDATE … SET deleted_at = now() WHERE game_id = … AND deleted_at IS
NULL`), then insert one row per occupied `HandSlot` — exactly the
     occupied slots, never compacted (C1.5). Soft-delete-then-reinsert is
     deliberate: it keeps "no code path hard-deletes rows" uniform and
     exercises the partial unique indexes on every save; CAM-8 sweeps the
     tombstones.
  5. `game_events` append: `SELECT COALESCE(MAX(seq) + 1, 0) …` (safe
     under the step-1 lock), then insert `newEvents` in order with
     `type = _tag`, `payload = encodeGameEvent(e)`,
     `actor_id = actorOf(e)`, `at = input.at`.
  6. `card_peeks`: one row per `CardPeeked` in `newEvents`, carrying the
     seq assigned in step 5.
     A failure anywhere rolls the whole transaction back — no partial
     aggregate, no orphan events (C3.1/C3.2); every SQL error maps to
     `StorageError`, `VersionConflict` passes through untouched.
- `load(gameId)` — `games` row `WHERE deleted_at IS NULL` (else
  `GameNotFound`); `game_players` ordered by `seat_index`, `user_cards`
  ordered by `"index"`, `decks` — all filtered `deleted_at IS NULL`;
  assemble, decode, return `{ state, version }`.
- `getEvents(gameId)` — live-game existence check (`GameNotFound`
  otherwise), then `SELECT payload FROM game_events WHERE game_id = … AND
deleted_at IS NULL ORDER BY seq`, each decoded via `decodeGameEvent`
  (through `Schema.decodeUnknown` + `StorageError` mapping, not the
  throwing helper).
- jsonb parameters go through `sql.json(...)`; `text[]` columns through the
  client's array support — verify both against `@effect/sql-pg` 0.53.0
  while writing the first query, and note the working idiom in Progress
  for the next adapter.

**Step 6.3 — Registration.** `apps/api/src/runtime.ts`: `AppServices`
gains `| GameRepository | UserRepository` (type-only imports from
`@cambio/domain`); `AppLayer` becomes

```ts
export const AppLayer = Layer.mergeAll(
  ClockLive,
  IdGeneratorLive,
  GameRepositoryLive,
  UserRepositoryLive,
).pipe(Layer.provideMerge(DatabaseLive))
```

(repos consume `SqlClient.SqlClient`; `provideMerge` keeps it visible to
`AppServices` as today). `pnpm --filter @cambio/api build` +
`typecheck` prove the wiring.

Checkpoint: domain + api suites green.

### M7 — Round-trip & invariant suite (C5.2–C5.4)

**Step 7.1 — Harness round-trips (C5.2).** `apps/api/test/RoundTrip.test.ts`,
CAM-2 batch shape: `RT_GAMES = Number(process.env.RT_GAMES ?? "25")`,
`RT_SEED = Number(process.env.RT_SEED ?? "20260831")`, seeds via
`seedPair(RT_SEED, i)`, counts via `playerCountFor(i)`,
`config = { slamWindowMs: 4000 }`, computed `beforeAll` timeout
`Math.max(120_000, RT_GAMES * 3_000)` (each game makes several DB
round-trips). Header comment documents the knobs and the repro recipe
(failures print the seeds — replay with `simulateGame({ …literals })`).
`beforeAll`: `ensureRosterUsers`, then per game: `simulateGame` with an
`onStep` recording `{ state, eventCount }` every 10th step; mint a
`GameId` per game (fixed uuid derived from `i` — determinism); then
persist incrementally through `GameRepository.save`: first save at the
first sample (`expectedVersion` 0,
`newEvents = run.events.slice(0, eventCount₀)`), one save per subsequent
sample (sliced diff), final save with the tail and `run.finalState`. Store
per-game `{ run, gameId, samples }` for the `it`s:

- "load deep-equals the live state at every persisted point (C5.2, C3.3)" —
  asserted during the beforeAll loop (load after each save `toStrictEqual`
  the snapshot) with a per-run flag the `it` checks — CAM-2's
  "play once, assert many" pattern.
- "foldEvents(getEvents) deep-equals the live state — state tables and
  event log agree (C5.2)" — per game at completion:
  `Either.getOrThrow(foldEvents(events))` `toStrictEqual` both
  `run.finalState` and the final `load` result; `events.length ===
run.events.length`.

**Step 7.2 — §4.5 verbatim against rows (C5.3, the CAM-2 deferral).** Same
file, a `describe("§4.5 invariants, verbatim against persisted rows")` over
every game persisted in 7.1, by SQL (not through `load` — the point is the
rows):

- "all 52 slugs partition across decks.cards + user_cards +
  games.discard_pile (+ the phase-held card) with no duplicates (C5.3,
  §4.5)" — concatenate `decks.cards`, live `user_cards.card` rows,
  `games.discard_pile`, plus the held card extracted from the `phase`
  jsonb when its `_tag` is `HoldingCard`/`ResolvingPower`/
  `ResolvingQueenSwap`; sorted, `toStrictEqual` sorted `ALL_CARD_SLUGS`
  (the `EndToEnd.test.ts:58` idiom, against rows).
- "no hand has a negative card count and no slot index is negative (§4.5)" —
  live-row counts are ≥ 0 and every `"index"` ≥ 0 (verbatim restatement;
  trivially strong, asserted anyway because the clause names it).
- "seat_index values are contiguous from 0 (C5.3, §4.5)" — per game,
  sorted `seat_index` `toStrictEqual` `[0..n-1]`.
- "final scores sum to the scores of all cards held at game end (C5.3,
  §4.5)" — per completed game, `SUM(final_score)` equals the sum of
  `score(card)` (domain derivation) over the game's live `user_cards`
  rows.
- "phase Ended ⟺ status completed (C5.3, §4.5)" — across **all** persisted
  games, both implication directions on `(phase->>'_tag', status)`.

**Step 7.3 — Sharp edges (C5.4).** `apps/api/test/SharpEdges.test.ts`, one
small scripted game per test:

- "a stale-version save is rejected atomically — no partial aggregate, no
  orphan events (C3.2)" — save v0→1; attempt a second save with
  `expectedVersion` 0 carrying new events ⇒ `Either.left` `VersionConflict`
  with `expected: 0, actual: 1`; then row counts of `game_events`,
  `user_cards` (live), `card_peeks` and `games.version` all unchanged.
- "a soft-deleted row does not block re-insert under the partial unique
  indexes (§7 gotcha 1)" — raw SQL: soft-delete one live `user_cards`
  row, insert an identical `(game_id, user_id, "index", card)` row —
  succeeds; a duplicate insert against the **live** row still fails
  (unique violation), proving the index is partial, not absent.
- "a soft-deleted game behaves as not-found (C3.6)" — raw
  `UPDATE games SET deleted_at = now()`; `load` ⇒ `GameNotFound`,
  `getEvents` ⇒ `GameNotFound`; a subsequent `save` at any version ⇒
  `VersionConflict` with `actual: null` (the live-row filter is in every
  statement, not just reads).

**Step 7.4 — Deep run + gate.** `RT_GAMES=1000 pnpm --filter @cambio/api
test` locally at least once — the root-plan "thousands of randomized
harness games" deliverable (the default batch stays small so the gate is
fast; record wall time in Progress). Then the full gate. Any failing seed:
harness/adapter bug ⇒ fix here; engine defect or rule gap ⇒ the standing
C7-style stop-and-ask — halt and present seeds + trace, never patch rules.

## Concrete steps & validation

Run from the repo root. If `pnpm` is missing:
`source ~/.nvm/nvm.sh && nvm use 22`. Postgres must be up for M5+:

```bash
docker compose -f docker/docker-compose.yml up -d
```

After every domain step (M1–M4):

```bash
pnpm --filter @cambio/domain test        # all green, no skips
pnpm --filter @cambio/domain typecheck   # clean
pnpm --filter @cambio/domain lint        # clean — .js extensions, effect-only imports
```

Expected signals as milestones land:

- **M1**: `GameEvent.test.ts` / `Deal.test.ts` / `TurnActions.test.ts`
  green with `prng` asserted; the 250-game sim batch unchanged and green.
- **M2**: `pnpm --filter @cambio/domain build` emits `dist/testing/`;
  `git diff --name-only -- packages/domain/test/EndToEnd.test.ts` prints
  nothing; full domain suite green with only import paths changed.
- **M3**: `test/Fold.test.ts` green — error-channel units, the
  transcription-not-recomputation unit, and the batch property (fold ≡
  final state and ≡ every sampled prefix state, 250 games).
  `SIM_GAMES=1000 pnpm --filter @cambio/domain test` scales the fold batch
  too (shared knobs).
- **M4**: `test/Ports.test.ts` green; lint still proves domain imports
  `effect` only.
- **M5**:

```bash
pnpm --filter @cambio/api migrate        # "applied 0002_cambio_schema.sql"
pnpm --filter @cambio/api migrate        # "no pending migrations (2 applied)"
pnpm --filter @cambio/domain build       # subpath target for direct --filter runs
pnpm --filter @cambio/api test           # Migrations.test.ts green (schema introspection)
grep -nE "turn|face_up|size|winner|score|called_cambio" apps/api/migrations/0002_cambio_schema.sql
                                         # only final_score lines
```

- **M6**: `pnpm --filter @cambio/api test` — UserRepository +
  GameRepository suites green; `pnpm --filter @cambio/api build`
  typechecks the `runtime.ts` wiring.
- **M7**:

```bash
pnpm --filter @cambio/api test                       # default: 25 round-tripped games + §4.5 rows + edges
RT_GAMES=1000 pnpm --filter @cambio/api test         # deep run, passes locally (record wall time)
RT_GAMES=10 pnpm turbo test --filter=@cambio/api     # proves the turbo.json env declaration is live
```

Untouched-surface checks (must print nothing):

```bash
git diff --name-only origin/release-v0...HEAD -- apps/api/migrations/0001_init.sql packages/contracts
grep -rn "Math.random\|Date.now\|new Date(" packages/domain/src            # domain purity holds (Fold, testing/)
```

Final gate (must pass before /ship, Docker Postgres up):

```bash
pnpm turbo build typecheck lint test
```

Beyond the gate (root plan Validation): eyeball one deep-run failure drill —
in a scratch copy, corrupt one adapter statement (e.g. drop the
`card_peeks` insert), confirm the round-trip suite catches it with seeds
that reproduce, revert.

## Contract coverage

_(maintained by `/implement`, verified by `/review`: one row per root-plan
contract clause this side owns — the test that pins it, or why none can.
Each row must also say **what is asserted**, in one phrase — a test whose
title cites a clause but whose body doesn't assert it is the failure mode
this column exists to catch.)_

| Clause | Test (file + name)                                                                                                                                                  | What is asserted                                                                                                                                                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1.1   | `apps/api/test/Migrations.test.ts` — "0002 creates the seven §4.3 tables…" + "re-running migrate is a no-op"                                                        | information_schema lists exactly the 7 tables, each with created_at/updated_at/deleted_at; second migrate leaves the ledger at 2 rows                                                                                                                                       |
| C1.2   | `Migrations.test.ts` — "games has exactly the decided columns and no derivable ones (C1.2)"                                                                         | column-name **set equality** for `games` (absence of turn/face_up_card/winner/called_cambio_by follows)                                                                                                                                                                     |
| C1.3   | `Migrations.test.ts` — "game_players has exactly the decided columns (C1.3)" + "game_players/decks keys match the contract" + "every unique constraint is partial…" | column-name set equality (final_score/is_connected/is_bot pinned); PK is (game_id, user_id); `game_players_seat_key` indexdef contains `WHERE (deleted_at IS NULL)`                                                                                                         |
| C1.4   | `Migrations.test.ts` — "game_players/decks keys match the contract (C1.3, C1.4)"                                                                                    | decks PK is (game_id) alone; no deck_id or size column exists                                                                                                                                                                                                               |
| C1.5   | `Migrations.test.ts` (partial uniques) + `GameRepository.test.ts` — "persists a hand with a hole uncompacted (C1.5)"                                                | both user_cards uniques are partial; a hand missing slot 1 rounds-trips as `"index"` rows [0, 2, 3] exactly — never renumbered                                                                                                                                              |
| C1.6   | `apps/api/test/GameRepository.test.ts` — "save writes one card_peeks row per CardPeeked with that event's seq (C1.6)"                                               | card_peeks rows match (seq, viewer_id, card) of every CardPeeked in the log, and no others                                                                                                                                                                                  |
| C1.7   | `Migrations.test.ts` (game_events_seq_key partial unique) + `GameRepository.test.ts` — "sequence numbers are contiguous from 0 across saves (C3.1)"                 | unique (game_id, seq) exists; seqs read back as 0..n−1 with no gaps across multiple saves; append-only is structural (no update/delete code path)                                                                                                                           |
| C2.1   | `packages/domain/test/GameEvent.test.ts` round-trip + `Deal.test.ts` "…GameStarted event matches the state" + `TurnActions.test.ts` reshuffle test                  | both payloads decode with `prng`; `started.prng` equals `state.prng`; reshuffle event `prng` equals post-reshuffle state; full suites green                                                                                                                                 |
| C2.2   | `packages/domain/test/Fold.test.ts` — error-channel describe + "transcription, not recomputation"                                                                   | empty/malformed/non-GameStarted streams yield typed `Either.left`s (never throw); an unshuffleable deck order + prng is transcribed verbatim                                                                                                                                |
| C2.3   | `packages/domain/test/Ports.test.ts`                                                                                                                                | tag keys are "@cambio/domain/GameRepository"/"…/UserRepository"; error classes carry their fields; domain lint stays effect-only                                                                                                                                            |
| C2.4   | structural — proven by the gate + apps/api suite importing `@cambio/domain/testing`                                                                                 | `dist/testing` builds; api tests compile against the subpath; `src/index.ts` diff shows no testing re-export; domain sim suite green post-move                                                                                                                              |
| C3.1   | `GameRepository.test.ts` — "sequence numbers are contiguous…" + "…roll the whole transaction back (C3.7, C3.1, C3.2)" + `SharpEdges.test.ts`                        | a mid-transaction FK failure leaves ZERO rows across all six tables (rollback pinned); seq contiguous from 0 across the game's lifetime                                                                                                                                     |
| C3.2   | `apps/api/test/SharpEdges.test.ts` — "a stale-version save is rejected atomically… (C3.2)"                                                                          | stale save ⇒ `VersionConflict{expected, actual}`; game_events/user_cards/card_peeks counts and games.version unchanged                                                                                                                                                      |
| C3.3   | `GameRepository.test.ts` — "first save inserts, load returns the identical decoded state and version (C3.3)"                                                        | `load` result `toStrictEqual`s the in-memory `GameState` (branded, phase codec round-trip); raw row shapes unreachable from the port surface                                                                                                                                |
| C3.4   | `GameRepository.test.ts` — "status derives from phase at save (C3.4)"                                                                                               | mid-flight row has status `in_progress`; post-`Ended` save has `completed`; no other value ever written by this task                                                                                                                                                        |
| C3.5   | `GameRepository.test.ts` — "final_score is null mid-game and materialized from GameEnded at completion (C3.5)"                                                      | final_score NULL before completion; equals each player's `GameEnded.scores` total after                                                                                                                                                                                     |
| C3.6   | `SharpEdges.test.ts` — "a soft-deleted game behaves as not-found (C3.6)"                                                                                            | load/getEvents ⇒ `GameNotFound`; save ⇒ `VersionConflict{actual: null}`; the filter is inside the repository, invisible to domain types                                                                                                                                     |
| C3.7   | `GameRepository.test.ts` — "SQL failures surface as typed StorageError and roll the whole transaction back (C3.7, C3.1, C3.2)"                                      | an FK-violating save yields `Either.left StorageError` through `Effect.either` — nothing thrown; all six tables verified empty afterwards                                                                                                                                   |
| C3.8   | `GameRepository.test.ts` — "actor_id follows the exhaustive per-tag mapping (C3.8)"                                                                                 | `actorOf` over literals of all 22 tags returns the right id per spelling and null for GameStarted/SlamWindowClosed/DeckReshuffled; persisted column agrees                                                                                                                  |
| C3.9   | `GameRepository.test.ts` — "getEvents returns the complete ordered decoded stream (C3.9)"                                                                           | returned array deep-equals the saved `GameEvent`s in seq order, decoded (branded) values                                                                                                                                                                                    |
| C4.1   | `apps/api/test/UserRepository.test.ts` — all three tests                                                                                                            | create/findById round-trip decoded `User`; unknown id ⇒ `UserNotFound`; soft-deleted user ⇒ `UserNotFound`                                                                                                                                                                  |
| C5.1   | `packages/domain/test/Fold.test.ts` — "folding the full event log reproduces the final state…" + "folding a step-boundary prefix…"                                  | over the SIM_GAMES batch: `foldEvents(run.events)` `toStrictEqual` `run.finalState` (prng + phase asserted by name); every sampled prefix equal                                                                                                                             |
| C5.2   | `apps/api/test/RoundTrip.test.ts` — "load deep-equals the live state at every persisted point" + "foldEvents(getEvents) deep-equals the live state…"                | mid-flight and final loads equal the driver's snapshots; fold of the persisted stream equals both the live final state and the final load                                                                                                                                   |
| C5.3   | `RoundTrip.test.ts` — the five "§4.5 … verbatim against persisted rows" tests                                                                                       | 52-slug partition incl. a deliberately mid-flight game exercising the phase-held-card term (vacuity-guarded); seat_index = [0..n−1]; Σfinal_score = Σscore(card); Ended⟺completed — all by SQL over rows. The negative-counts sweep is schema-trivial and disclosed as such |
| C5.4   | `apps/api/test/SharpEdges.test.ts` — all three tests                                                                                                                | conflict atomicity (row counts frozen); re-insert after soft delete succeeds while live-duplicate still rejects; soft-deleted game invisible                                                                                                                                |
| C6.1   | `Migrations.test.ts` — "re-running migrate is a no-op (C1.1, C6.1)" + manual CLI check in M5                                                                        | the exported `migrate` effect runs programmatically against `cambio_test`; `pnpm --filter @cambio/api migrate` output unchanged                                                                                                                                             |
| C6.2   | config, exercised by the M7 command matrix (`RT_GAMES=10` under turbo) and every api test run                                                                       | pinned vitest/@effect/vitest versions install; global-setup provisions + migrates `cambio_test`; TEST_DATABASE_URL/RT_GAMES survive strict env                                                                                                                              |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [ ] 2026-08-31 — backend plan written; awaiting `/implement`
- [x] 2026-08-31 23:53 — review fix cycle (findings F1–F9): rollback pinned in the renamed C3.7 test (all six tables verified empty after a mid-transaction FK failure); `game_players` column set-equality added; hole-uncompacted test added (indices [0,2,3] round-trip); one deliberately mid-flight game added to RoundTrip so the partition's held-card term runs (vacuity-guarded); `GameRepositoryLive` normalized to `SqlClient`; sticky-final_score + F9 stale-comment recorded in root decision log; coverage rows corrected. Api suite 28 green
- [x] 2026-08-31 23:31 — M7 done: `RoundTrip.test.ts` (incremental saves at ~every-10th-step boundaries, load-after-save equality, fold ≡ live ≡ load, five §4.5-verbatim row sweeps) + `SharpEdges.test.ts` (conflict atomicity, partial-index re-insert, soft-deleted invisibility); api suite 26 green; full gate `pnpm turbo build typecheck lint test` 20/20 in 51.5s; RT_GAMES=1000 deep run launched (wall time recorded on completion)
- [x] 2026-08-31 23:27 — M6 done: `user-repository.ts` + `game-repository.ts` adapters, `runtime.ts` + `TestLayer` wiring; 16 api tests green. Surprise logged: driver is node-postgres and `sql.json` mangles JS-array params — see Surprises
- [x] 2026-08-31 23:20 — M5 done: `0002_cambio_schema.sql` applied + idempotent on the dev DB; `migrate` exported (CLI moved to `migrate-cli.ts`); api vitest scaffolding (global-setup provisions/migrates/truncates `cambio_test`, `support/db.ts` with ManagedRuntime helper); `Migrations.test.ts` 5 tests green; turbo/.env.example wired
- [x] 2026-08-31 23:16 — M4 done: `GameVersion` brand, `src/GameRepository.ts` + `src/UserRepository.ts` ports (test-first in `test/Ports.test.ts`), barrel exports; 175 green
- [x] 2026-08-31 23:14 — M3 done: `onStep` eventCount param (test in Driver.test.ts) + `src/Fold.ts` with `test/Fold.test.ts` (6 error-channel units, 2 transcription units, batch property final+prefix over 250 games — passed first run); suite at 172 green
- [x] 2026-08-31 23:10 — M2 done: harness + fixtures moved to `src/testing/` (index barrel, `./testing` export, `test/fixtures.ts` shim); build emits `dist/testing/`; 161 tests, lint, prettier all green; `EndToEnd.test.ts` untouched (commit 68e3093)
- [x] 2026-08-31 23:08 — M1 done: `prng` added to `GameStarted`/`DeckReshuffled` (tests first in GameEvent/Deal/TurnActions tests, then GameEvent.ts + Deal.ts + Engine.ts + the Simulation.test.ts literal); full domain suite 161 green, typecheck clean (commit 5d3e03e)

## Surprises & notes for the root plan

_(anything the root plan's Decision Log or the reviewer must know)_

- **`@effect/sql-pg` 0.53.0 rides node-postgres (`pg` 8.22), not porsager
  `postgres`.** Two consequences bitten during M6, both fixed inside
  `game-repository.ts` with comments:
  1. `sql.json(value)` passes the raw value through as a parameter, and pg
     serializes a JS **array** parameter as a PG array literal (`{a,b,…}`) —
     invalid json for the `PrngState` tuple (`error 22P02: invalid input
syntax for type json`). Fix: a local `jsonb(value)` helper that
     pre-stringifies (`${JSON.stringify(value)}::jsonb`), used for phase,
     prng, config, and event payloads uniformly.
  2. `${array}` in `@effect/sql` is an `ArrayHelper` that renders an IN-list
     `(a, b, c)`, never a PG array — `text[]` columns bind through
     `string_to_array(${items.join(",")}, ',')` (safe: `CardSlug` is a fixed
     two-character token; `string_to_array('', ',')` is `{}`).
- **`actorOf(GameStarted) = null`** — the deal is system-driven; the plan's
  actorless list only named `SlamWindowClosed`/`DeckReshuffled`. Root plan
  C3.8 and decision log updated.
- The fold and all 27 contract clauses passed the batch properties on the
  first green build after the two driver idioms above — no engine or rule
  gaps surfaced; no HANDOFF §9 question was touched.
- `test/support/db.ts` exports ended up as `TEST_DATABASE_URL` /
  `TestDatabaseLive` / `TestLayer` / `makeTestRuntime` / `ensureRosterUsers`
  (Module layout updated; the planned `RepoLayer` name became `TestLayer`).
- RoundTrip's §4.5 row sweeps are scoped to the suite's own game-id prefix
  (`…-4000-c000-…`): the five files share one database and the other suites
  deliberately persist mid-flight and soft-deleted games.
