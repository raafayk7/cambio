# Scaffold decisions

`docs/HANDOFF.md` is kept verbatim as the source of truth. This file records what
was decided _during_ Task 1 (the scaffold) so those choices don't have to be
re-derived. It does not supersede the handoff.

## §9 open decisions — resolved

| #   | Decision                          | Choice                                                   |
| --- | --------------------------------- | -------------------------------------------------------- |
| 1   | Migration tooling                 | `@effect/sql-pg` for queries + plain SQL migration files |
| 6   | Test runner                       | `vitest` + `@effect/vitest`                              |
| 7   | Is `contracts` a separate package | Yes, separate `@cambio/contracts`                        |
| —   | Postgres major version            | 17 (matches the Supabase project)                        |

### Still open — do not resolve without asking

§9.2 (zero-card slammer owing a card), §9.3 (J/Q targeting an empty hand),
§9.4 (slam window duration — must be config, not a literal), §9.5 (temporary-user
auth). All four are game rules or product behaviour and are deliberately
untouched by the scaffold.

## Scaffold-specific choices

**The ten is `T`, not `10`.** The handoff gives `"AS"`, `"7H"`, `"KD"` as example
slugs but never spells out the ten. `CardSlug` uses the fixed-width poker form
(`"TS"`, `"TH"`, …) so every slug is exactly two characters and `rank`/`suit` are
uniform slices. This is a representation choice, not a rule — changing it touches
only `RANKS` and the two derivation functions in `packages/domain/src/Card.ts`.

**Only Postgres is containerized.** Per §10, `docker/docker-compose.yml` holds
Postgres and nothing else; there are no Dockerfiles. `apps/api` and `apps/web` run
natively against the container on `localhost:5433`. Confirmed as the intended
scope — revisit only when Render deployment forces a choice of build mode.

Note for anyone tempted to containerize dev to escape the host's inotify limits:
Docker Desktop on Linux runs a VM whose default watch limits are typically _lower_
than the host's. Raise the host limits instead — see the README.

**TypeScript is pinned to 5.9.3, not 7.x.** TypeScript 7 (the Go rewrite) is
`latest` on npm, but `typescript-eslint` declares `typescript >=4.8.4 <6.1.0`, and
Effect is the most type-checker-demanding library in the stack. Revisit once
typescript-eslint supports 7.

**Migrations run through a small hand-rolled runner.** `@effect/sql`'s migrator
expects TypeScript migration modules; §9.1 chose plain SQL files. The runner is
`apps/api/src/infra/migrate.ts` (~50 lines): applies `NNNN_name.sql` in filename
order, one transaction each, recorded in `_cambio_migrations`. No down-migrations
and no checksums — add them when there is a production database worth protecting.

**`packages/ui` ships source, not `dist`.** It is a Turborepo "just-in-time"
package compiled by the consuming app's bundler, so it has no build step. Its
`styles.css` carries an explicit `@source "./"` because workspace packages live
under `node_modules` via symlink, which Tailwind's automatic source detection
skips.

**`apps/web` has no `start` script.** TanStack Start 1.168 emits a fetch handler,
not a listening server; producing a runnable one needs a host adapter. The
handoff specifies hosting for the API (Render) and the database (Supabase) but
not for the web app, so this is left unwired rather than guessed at.

## Known conflict — zod is in the lockfile

§10 requires "zero occurrences of `zod` in the lockfile". That is currently **not
satisfied**, and it cannot be while TanStack Start is the frontend framework:

```
@tanstack/react-start → @tanstack/start-plugin-core → zod@4.4.3
                     → @tanstack/router-generator  → zod@4.4.3
                     → @tanstack/router-plugin     → zod@4.4.3
```

All three are **build-time** dependencies of the Vite plugin, used to parse its
own config. No first-party package depends on zod, and none ever should.

**Accepted**, on the basis that the rule's intent is "we author validation with
Effect Schema", and zod is unreachable from anything we write. Three independent
things hold that line:

1. No `@cambio/*` package has zod in `dependencies` or `devDependencies`.
2. zod is **not resolvable** from any workspace package — pnpm's isolated
   `node_modules` confines it to TanStack's own subtree, so even a deliberate
   `import "zod"` in `apps/web` fails to resolve. Verify with:
   `node -e "require.resolve('zod',{paths:['apps/api']})"` → throws.
3. `no-restricted-imports` fails the build on any `import ... from "zod"` in any
   package — see `packages/config/eslint.base.js`.

The backend is Effect end to end: `domain`, `contracts`, `application` and
`apps/api` depend on `effect` and never on zod. If TanStack Start is ever
replaced, drop this section and the criterion becomes literally true again.
