# ADR index

The one-glance reference for what has been decided and why. Read this
first; open an individual ADR only when its context or alternatives
matter. Every ADR write, supersession, or status change updates this table
in the same commit (see the `adr` skill).

Statuses: **proposed** ADRs are written during development and are binding
within their release; they become **accepted** by human approval when the
release merges into `development`. Superseded ADRs stay listed — history is
the point.

| #                                                             | Decision                                                                 | Status   | Date       | Task  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ | -------- | ---------- | ----- |
| [0001](0001-effect-schema-not-zod.md)                         | Effect Schema for validation, never Zod                                  | accepted | 2026-08-30 | —     |
| [0002](0002-effect-sql-pg-plain-sql-migrations.md)            | @effect/sql-pg with plain-SQL migrations, hand-rolled runner             | accepted | 2026-08-30 | —     |
| [0003](0003-vitest-effect-vitest.md)                          | vitest + @effect/vitest as the test runner                               | accepted | 2026-08-30 | —     |
| [0004](0004-separate-contracts-package.md)                    | contracts is a separate package, not a re-export                         | accepted | 2026-08-30 | —     |
| [0005](0005-postgres-17-only-postgres-containerized.md)       | Postgres 17 only, containerized locally                                  | accepted | 2026-08-30 | —     |
| [0006](0006-typescript-pinned-5-9.md)                         | TypeScript pinned to 5.9                                                 | accepted | 2026-08-30 | —     |
| [0007](0007-ai-harness-structure.md)                          | AI harness: AGENTS.md + .agents/ skills, commands, templates             | accepted | 2026-08-30 | —     |
| [0008](0008-branching-strategy.md)                            | Branch hierarchy main → development → release-vN → task                  | accepted | 2026-08-31 | —     |
| [0009](0009-zero-card-slammer-draws-then-gives.md)            | Zero-card slammer draws-then-gives; discard take at zero cards is a keep | proposed | 2026-08-31 | CAM-1 |
| [0010](0010-jq-swaps-require-occupied-slots-powers-fizzle.md) | J/Q swaps need occupied slots; untargetable powers fizzle                | proposed | 2026-08-31 | CAM-1 |
| [0011](0011-slam-window-fixed-close-config-duration.md)       | Slam window: fixed close from GameConfig; impossible draws skipped       | proposed | 2026-08-31 | CAM-1 |
| [0012](0012-empty-discard-skips-slam-window.md)               | Empty discard pile skips the slam window; taking from it is illegal      | proposed | 2026-08-31 | CAM-1 |
| [0013](0013-hand-rolled-seeded-simulation-driver.md)          | Hand-rolled seeded simulation driver, not a property-testing library     | proposed | 2026-08-31 | CAM-2 |
