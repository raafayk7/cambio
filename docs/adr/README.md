# ADR index

The one-glance reference for what has been decided and why. Read this
first; open an individual ADR only when its context or alternatives
matter. Every ADR write, supersession, or status change updates this table
in the same commit (see the `adr` skill).

Statuses: **proposed** ADRs are written during development and are binding
within their release; they become **accepted** by human approval when the
release merges into `development`. Superseded ADRs stay listed — history is
the point.

| #                                                                         | Decision                                                                                                                     | Status   | Date       | Task           |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------- | ---------- | -------------- |
| [0001](0001-effect-schema-not-zod.md)                                     | Effect Schema for validation, never Zod                                                                                      | accepted | 2026-08-30 | —              |
| [0002](0002-effect-sql-pg-plain-sql-migrations.md)                        | @effect/sql-pg with plain-SQL migrations, hand-rolled runner                                                                 | accepted | 2026-08-30 | —              |
| [0003](0003-vitest-effect-vitest.md)                                      | vitest + @effect/vitest as the test runner                                                                                   | accepted | 2026-08-30 | —              |
| [0004](0004-separate-contracts-package.md)                                | contracts is a separate package, not a re-export                                                                             | accepted | 2026-08-30 | —              |
| [0005](0005-postgres-17-only-postgres-containerized.md)                   | Postgres 17 only, containerized locally                                                                                      | accepted | 2026-08-30 | —              |
| [0006](0006-typescript-pinned-5-9.md)                                     | TypeScript pinned to 5.9                                                                                                     | accepted | 2026-08-30 | —              |
| [0007](0007-ai-harness-structure.md)                                      | AI harness: AGENTS.md + .agents/ skills, commands, templates                                                                 | accepted | 2026-08-30 | —              |
| [0008](0008-branching-strategy.md)                                        | Branch hierarchy main → development → release-vN → task                                                                      | accepted | 2026-08-31 | —              |
| [0009](0009-zero-card-slammer-draws-then-gives.md)                        | Zero-card slammer draws-then-gives; discard take at zero cards is a keep                                                     | proposed | 2026-08-31 | CAM-1          |
| [0010](0010-jq-swaps-require-occupied-slots-powers-fizzle.md)             | J/Q swaps need occupied slots; untargetable powers fizzle                                                                    | proposed | 2026-08-31 | CAM-1          |
| [0011](0011-slam-window-fixed-close-config-duration.md)                   | Slam window: fixed close from GameConfig; impossible draws skipped                                                           | proposed | 2026-08-31 | CAM-1          |
| [0012](0012-empty-discard-skips-slam-window.md)                           | Empty discard pile skips the slam window; taking from it is illegal                                                          | proposed | 2026-08-31 | CAM-1          |
| [0013](0013-hand-rolled-seeded-simulation-driver.md)                      | Hand-rolled seeded simulation driver, not a property-testing library                                                         | proposed | 2026-08-31 | CAM-2          |
| [0014](0014-self-contained-event-log-fold-transcribes.md)                 | Shuffle events record resulting PrngState; the fold transcribes                                                              | proposed | 2026-08-31 | CAM-3          |
| [0015](0015-aggregate-game-repository-port.md)                            | Aggregate GameRepository: state + events in one transaction                                                                  | proposed | 2026-08-31 | CAM-3          |
| [0016](0016-domain-testing-export-subpath.md)                             | Simulation harness ships from domain via "./testing" subpath                                                                 | proposed | 2026-08-31 | CAM-3          |
| [0017](0017-effect-only-external-imports-split-src-test-blocks.md)        | Effect-only external imports via ordered boundaries/dependencies, split src/test blocks (amended: also covers Node builtins) | proposed | 2026-09-01 | CAM-11, CAM-12 |
| [0018](0018-stateless-hmac-cookie-sessions.md)                            | Temp-user sessions: stateless HMAC cookie, 7-day sliding, cookie is the identity                                             | proposed | 2026-09-01 | CAM-4          |
| [0019](0019-lobby-pure-domain-model-row-backed-persistence.md)            | Lobby: pure domain model outside the engine, row-backed via GameRepository methods                                           | proposed | 2026-09-01 | CAM-5          |
| [0020](0020-room-actor-queue-deferred-replies-cached-state.md)            | Room actor: per-room queue, Deferred replies, cached state, evict on game end                                                | proposed | 2026-09-01 | CAM-5          |
| [0021](0021-viewfor-structural-projection-event-time-private-delivery.md) | viewFor projects structure only; private values delivered once at event time, never re-sent                                  | proposed | 2026-09-01 | CAM-6          |
| [0022](0022-penalty-cards-enter-hand-unseen.md)                           | Penalty cards enter the slammer's hand unseen by everyone                                                                    | proposed | 2026-09-01 | CAM-6          |
| [0023](0023-channel-privacy-unguessable-capability-topics.md)             | Channel privacy via unguessable capability topics, not Realtime Authorization                                                | proposed | 2026-09-01 | CAM-6          |
| [0024](0024-selfhosted-realtime-container-rest-broadcast-publishing.md)   | Self-hosted Realtime container in compose; publishing via REST broadcast endpoint                                            | proposed | 2026-09-01 | CAM-6          |
| [0025](0025-data-lifecycle-sql-functions-guarded-pg-cron.md)              | Data lifecycle as SQL functions with guarded pg_cron scheduling; row-level hard-delete                                       | proposed | 2026-09-03 | CAM-8          |
| [0026](0026-holdingcard-power-rank-schema-filter.md)                      | HoldingCard rejects power-rank cards via Schema.filter, not a runtime guard                                                  | proposed | 2026-09-03 | CAM-10         |
