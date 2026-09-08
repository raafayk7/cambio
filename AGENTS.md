# AGENTS.md — Cambio

Cambio is a hidden-information, memory-based multiplayer card game (lowest score
wins), built as a pnpm/Turborepo monorepo: Fastify + Effect backend, TanStack
Start frontend, Postgres, Supabase Realtime.

This file is the entry point for every AI agent working in this repo.
`CLAUDE.md` is a stub that points here; tool-specific config under `.claude/` is
symlinked from `.agents/`, which is the source of truth for skills, commands,
subagents, settings (hooks), scripts, and templates. The symlink set is
`commands`, `skills`, `agents`, and `settings.json`.

## Sources of truth

- **[docs/HANDOFF.md](docs/HANDOFF.md)** — canonical game rules (§1),
  architecture (§3–§6), data model (§4), build order (§12). When anything
  conflicts with a habit or template you'd normally reach for, the handoff
  wins — **unless a later ADR supersedes the section**: ADRs outrank the
  handoff, and superseded handoff sections carry an amendment blockquote
  pointing at the ADR. Never "correct" code back toward a handoff sketch
  without checking the ADR index first.
- **[docs/adr/](docs/adr/)** — architecture decision records. Start from the
  index at [docs/adr/README.md](docs/adr/README.md) instead of reading each
  file; check them before re-litigating a decision; supersede, don't
  silently contradict.
- **[docs/DECISIONS.md](docs/DECISIONS.md)** — scaffold-era decisions, now
  migrated to ADRs; kept for history.
- **`design-system/`** — the visual identity: every component, token,
  pattern, and copy rule for the UI. The router is
  `design-system/design-system.md`; enter through it, not the folder.
  **It lives on release branches only** — if the folder is absent you are
  on `main` or `development`; stop and say so rather than inventing
  components or tokens from memory. See the `design-system` skill.

Three standing directives from the handoff:

1. **Do not invent game rules.** Every rule is in HANDOFF §1 (also extracted
   into the `cambio-rules` skill). Rules were playtested in person; guesses and
   priors from other Cambio variants will be wrong. If a situation isn't
   covered, stop and ask.
2. **Do not silently resolve open decisions** (HANDOFF §9: zero-card slammer,
   J/Q vs empty hand, slam window duration, temp-user auth). Ask.
3. **No thrown exceptions across layer boundaries; no Zod anywhere.** The
   backend is Effect end to end.

## Architecture

Clean Architecture with strictly enforced import boundaries — see the
`architecture` skill for the full decision procedure. The one-table summary
(ESLint fails CI on violations):

| Package                | May import                                              |
| ---------------------- | ------------------------------------------------------- |
| `packages/domain`      | `effect` only                                           |
| `packages/application` | `domain`, `contracts`, `effect`                         |
| `packages/contracts`   | `effect` only                                           |
| `apps/api`             | `application`, `domain`, `contracts`                    |
| `apps/web`             | `contracts`, `ui` — **never** `domain` or `application` |

Repository ports live in `domain`; infrastructure ports live in
`packages/application/src/ports/`; implementations of both live in
`apps/api/src/infra/`. The domain performs no I/O — no DB, no clock, no
randomness (seeds and ports instead).

## Skills

Layer-specific rules live in skills under `.agents/skills/` (portable
`SKILL.md`, symlinked to `.claude/skills/`):

- `architecture` — where does a new file go; the import table as a procedure
- `effect-domain-modeling` — branded types, Schema, TaggedStruct/TaggedEnum,
  typed errors, purity rules
- `cambio-rules` — HANDOFF §1 extracted; the anti-prior guard
- `application-layer` — use cases, ports, command queue per room
- `infrastructure-persistence` — @effect/sql-pg, migrations, soft delete,
  event log
- `hidden-information` — the `viewFor` projection rule and realtime channel
  discipline (security-critical)
- `adr` — when and how to write an ADR
- `frontend-architecture` — the client as projection renderer;
  pages/containers/components layering; the `apps/web` vs `packages/ui`
  split
- `design-system` — router into `design-system/` (release branches only);
  the creation gate
- `ai-tells` — the repo-facing design audit: scores UI output against the
  design system for AI-default tells (adapted from Carbonteq's original in
  `docs/design/resources/`)
- design-gate family (vendored per ADR-0029, dissolved from Carbonteq's
  plugin): `gate` — the evaluation pipeline (decompose → map → judge, WCAG
  hard checks, **verdicts advisory**); `design-context`,
  `rubric-principles`, `hard-checks`, `intent-prep`, `annotated-exemplars`
  as its supporting skills; `ai-slop` is **gate-internal** — the
  repo-facing audit is `ai-tells`
- `impeccable` — craft linting (installed from pbakaus/impeccable,
  relocated into `.agents/`; product truth in `PRODUCT.md`)
- animation set from emilkowalski/skills (MIT): `animate`,
  `review-animations`, `find-animation-opportunities`,
  `animation-vocabulary`

**Precedence:** the design system outranks impeccable, the gate family,
and the animation skills — always. They judge execution quality, never
components, tokens, or identity; when a generic flag hits deliberate
Cambio identity (cream paper, poster display face), surface the conflict,
never auto-"fix". Third-party provenance and licenses:
`.agents/skills/VENDORED.md`.

## Workflow

Tasks live in **Linear** (personal workspace, team **Cambio**, issues
`CAM-xxx`), accessed via the Linear MCP. The workflow commands take the issue
identifier as their argument:

- `/plan CAM-xxx` — interview, explore, decide ADRs, produce plan documents
- `/implement CAM-xxx` — execute the plan, keeping it updated as a living doc
- `/review CAM-xxx` — review implementation against plan and architecture
- `/ship CAM-xxx` — final commits, push, PR against the release branch,
  linked to the Linear issue (the GitHub↔Linear integration is enabled)

Plan documents are named after the issue and live in `docs/plans/`:
`root/CAM-xxx.md` (the functional contract + milestone plan),
`backend/CAM-xxx.md` and `frontend/CAM-xxx.md` (implementation detail, only for
sides the task touches). Templates: `.agents/templates/`.

### Branching

`main` (stable) → `development` (production: a push auto-deploys via
GitHub Actions — gate → migrate → Render for the api, Vercel git
integration for the web; ADR-0041/0042, landed in CAM-32) →
**release branches** (`release-vN`) → task branches. The current release
branch is the base of all work and the PR target; task branches use Linear's
suggested branch name per issue. Release branches merge into `development`
when deploying. Which release is current is tracked **outside the repo** in
the Linear document
["Release History"](https://linear.app/raafayk7/document/release-history-932e3ba2f8c1)
(deliberately — an in-repo pointer would differ across branches); the
workflow commands read it, sync the release branch, and never commit to the
release branch directly except `/plan`'s docs-only commit. See ADR-0008.
**Exception (ADR-0028):** harness/meta changes — this file, `.agents/`,
harness-task plan docs and ADRs — commit directly to `main` and propagate
by merge-down (`main` → `development` → release branch); the merge-down is
part of the harness task's definition of done.

## Development

Node 22 (nvm) and pnpm 9. Postgres runs in Docker on host port **5433**.

```bash
docker compose -f docker/docker-compose.yml up -d   # start Postgres
pnpm install
pnpm --filter @cambio/api migrate                   # apply SQL migrations
pnpm dev                                            # api :3001, web :3000 (WEB_PORT overrides)
pnpm turbo build typecheck lint test                # the full gate
```

The `lint` task also runs a repo-wide `prettier --check` (a root turbo
task) — formatting is enforced, not aspirational, **with one deliberate
carve-out**: upstream-vendored payloads refreshed wholesale (impeccable,
the animation skills) are listed in `.prettierignore` and kept
byte-identical to upstream (see `.agents/skills/VENDORED.md` and
ADR-0029). `pnpm format` fixes violations everywhere else.

**Run per-package suites through turbo.** The canonical command for one
package's tests is `pnpm turbo test --filter <pkg>` — turbo builds
workspace dependencies first. The bare package script
(`pnpm --filter <pkg> test`) runs vitest against whatever dist is on
disk and fails with import-shaped errors (`.pipe` of undefined) when
it's stale; a comment in `apps/api/test/support/db.ts` used to claim
otherwise (learned in CAM-8). Bare `vitest run <file>` is fine for
iterating on a single suite after a build.

**Never pipe the gate.** `pnpm turbo … | tail` (or any pipe) replaces the
gate's exit code with the filter's, and a broken build has been committed
that way. Run the gate bare and check its exit status directly; if output
must be filtered, `set -o pipefail` first. This applies to every scripted
invocation — commit gates, CI steps, agent tool calls. It is also
mechanically enforced: a PreToolUse hook
(`.agents/hooks/block-piped-gate.sh`, wired via `.claude/settings.json`)
denies Bash commands that pipe a gate invocation without `pipefail`.

**Markdown formats itself — but mind one trap.** A PostToolUse hook
(`.agents/hooks/format-markdown.sh`) auto-formats every `.md` file an
agent edits, so plan docs and ADRs should never fail the gate's prettier
check. The one case the formatter cannot fix: an inline code span broken
across lines inside a list item makes prettier **non-convergent**
(`--write` output still fails `--check`, forever). Keep inline code spans
on one line; if a sentence forces a break, rephrase it.

**Design hooks (advisory, never blocking).** Two more PostToolUse hooks
watch `Edit|Write`: the design-gate auto-nudge
(`.agents/scripts/design-gate/auto-gate.mjs`) fires on `.tsx`/`.jsx`/
`.html` writes (skipping test/spec/stories/config files) and suggests
running the `gate` skill; impeccable's detector
(`.claude/skills/impeccable/scripts/hook.mjs`, plus a Stop-time deep
pass) runs its deterministic checks on UI files. Both only add context.
The **rendered** gate path (screenshot + WCAG hard checks) needs a
one-time per-machine setup — from `.agents/scripts/design-gate/`:
`npm install --omit=dev` then `npx playwright install chromium`. Nothing
downloads at session start, and no user-level install is load-bearing:
everything lives in the repo (ADR-0029).

Environment lives in `.env` at the repo root (copy from `.env.example`). Tests
are vitest + `@effect/vitest`; domain work is test-first (HANDOFF §12).

If the API or integration tests can't reach Postgres (`ECONNREFUSED` on
localhost:5433), the container is simply off — run the `docker compose up -d`
line above and retry. Data persists across restarts in the `cambio-pgdata`
volume, so starting it is always safe. Migrations are idempotent; re-run
`pnpm --filter @cambio/api migrate` after starting if in doubt.

**Distrust long-running dev servers.** A Vite dev server started in an
earlier session serves STALE TRANSFORMS of files that have since changed
(module-graph caching survives branch switches), and a long-lived api
process can wedge outright. Both happened in CAM-18: an old api returned
500s a fresh instance didn't, and a stale web transform of `button.tsx`
produced a phantom 43px touch-target finding that reached the design
gate's Map stage before a source-vs-served diff exposed it. Before ANY
rendered verification, live walkthrough, or measurement against a dev
server: verify freshness by fetching a recently-changed module through
the server (e.g.
`curl http://localhost:<port>/@fs/<abs-path-to-changed-file> | grep <new-symbol>`)
and restart the server if the grep comes back empty. When in doubt,
restart — a fresh server is cheap; a phantom finding is not.

## Frontend

The design system landed in CAM-13 and the frontend harness in CAM-14; the
deferral is over. The rules, in rank order:

1. **The client is a projection renderer, not a second clean
   architecture.** `apps/web` sees `contracts` and `ui` only and renders
   whatever `viewFor` sent it; business rules never migrate into
   containers or hooks. The `frontend-architecture` skill carries the
   layering; `hidden-information` carries the security law (a missing
   field is a `viewFor`/contracts change, never a client workaround).
2. **The design system is visual law.** All UI identity — components,
   tokens, motion, copy — comes from `design-system/` via the
   `design-system` skill, which also carries the creation gate (nothing
   canonical is invented without stopping). Styling is Tailwind v4 with
   tokens as `@theme` CSS variables (ADR-0027); no hardcoded values.
3. **The tooling judges craft, not identity.** The gate family evaluates
   (verdicts advisory until Carbonteq's validation labeling lands),
   `ai-tells` audits for AI defaults, impeccable lints craft, Emil's
   skills govern animation execution. The design system outranks them
   all; conflicts get surfaced, never auto-resolved.

To refresh impeccable: `npx impeccable update`, then re-verify the
`.claude/` symlinks and that hook entries still live in
`.agents/settings.json` (installers may write through or replace the
symlinks — see ADR-0029).
