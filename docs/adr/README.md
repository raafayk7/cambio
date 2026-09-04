# ADR index

The one-glance reference for what has been decided and why. Read this
first; open an individual ADR only when its context or alternatives
matter. Every ADR write, supersession, or status change updates this table
in the same commit (see the `adr` skill).

Statuses: **proposed** ADRs are written during development and are binding
within their release; they become **accepted** by human approval when the
release merges into `development`. Superseded ADRs stay listed — history is
the point.

| #                                                       | Decision                                                                                                  | Status   | Date       | Task   |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------- | ---------- | ------ |
| [0001](0001-effect-schema-not-zod.md)                   | Effect Schema for validation, never Zod                                                                   | accepted | 2026-08-30 | —      |
| [0002](0002-effect-sql-pg-plain-sql-migrations.md)      | @effect/sql-pg with plain-SQL migrations, hand-rolled runner                                              | accepted | 2026-08-30 | —      |
| [0003](0003-vitest-effect-vitest.md)                    | vitest + @effect/vitest as the test runner                                                                | accepted | 2026-08-30 | —      |
| [0004](0004-separate-contracts-package.md)              | contracts is a separate package, not a re-export                                                          | accepted | 2026-08-30 | —      |
| [0005](0005-postgres-17-only-postgres-containerized.md) | Postgres 17 only, containerized locally                                                                   | accepted | 2026-08-30 | —      |
| [0006](0006-typescript-pinned-5-9.md)                   | TypeScript pinned to 5.9                                                                                  | accepted | 2026-08-30 | —      |
| [0007](0007-ai-harness-structure.md)                    | AI harness: AGENTS.md + .agents/ skills, commands, templates (amended: frontend harness landed, see 0029) | accepted | 2026-08-30 | —      |
| [0008](0008-branching-strategy.md)                      | Branch hierarchy main → development → release-vN → task (amended: harness carve-out, see 0028)            | accepted | 2026-08-31 | —      |
| [0027](0027-tailwind-v4-theme-css-variable-tokens.md)   | Tailwind v4 @theme CSS variables carry the design-system tokens                                           | proposed | 2026-09-04 | CAM-14 |
| [0028](0028-harness-changes-land-on-main.md)            | Harness changes land on main and propagate by merge-down                                                  | proposed | 2026-09-04 | CAM-14 |
| [0029](0029-design-tooling-vendored-first-party.md)     | Design tooling vendored in-repo as first-party harness config                                             | proposed | 2026-09-04 | CAM-14 |
