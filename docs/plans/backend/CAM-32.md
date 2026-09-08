# CAM-32 — CI/CD pipeline (backend)

- **Root plan:** [root/CAM-32.md](../root/CAM-32.md) — the functional
  contract lives there; this document is implementation detail for the
  backend/infra side: the two GitHub Actions workflows (ADR-0043 main
  lane), the api application-code changes (task-branch lane), and
  `.env.example`.

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

The Contract coverage table stays test-nameless at plan time — rows hold
clause → planned approach; /implement fills file, test name, and assertion
phrase as each test actually lands — invented test titles become review
findings.

Code sketches (signatures, DDL, exports) are **advisory** — the coverage
table and module layout are the artifacts reconciled against as-built
code.

## Context & orientation

**Two lanes (ADR-0043).** This is a split-landing task. The `.github/`
workflow files commit **directly to `main`** (no task branch, no PR) and
propagate by merge-down `main` → `development` → `release-v0`; the
merge-down is part of the definition of done. The api code changes and
`.env.example` ride the normal task branch → PR into `release-v0`
(ADR-0008). Every step below is marked **[main lane]** or **[task
branch]**. ADR-0028's guard rail applies to the main lane: before writing
a deployment-config file on `main`, diff `.github/` against `release-v0`
(trivially — neither branch has it yet; verified at planning: no
`.github/`, no `vercel.json`, no `render.yaml` anywhere).

**Governing decisions:** ADR-0041 (topology: static SPA + Vercel `/api`
proxy → one Render instance; Supabase Postgres + cloud Realtime with the
new `sb_secret_`/`sb_publishable_` key model), ADR-0042 (CI shape:
compose-backed full gate on PRs; `development` pushes go gate → migrate →
deploy hook), ADR-0043 (the lane split). Root-plan Decision Log entries
that bind this side: **session-pooler URLs for all prod DB paths**
(IPv4 — with a mandatory pg_cron-through-pooler verification and a
documented fallback), Render auto-deploy **off**, turbo remote cache
deferred (`actions/cache` on `.turbo` only), migration checksums/downs
stay deferred.

**Layer skills that apply:** `architecture` (the cloud-auth change is
adapter-internal — it lives in `apps/api/src/infra/`, the
`RealtimePublisherPort` interface in `packages/application` must not
change), `infrastructure-persistence` (migrations stay dumb and
idempotent; no checksums added in passing), `application-layer` (ports
unchanged; no use-case work in this task), `effect-domain-modeling`
(config validation stays in Effect `Config` land — typed failure, no
thrown exceptions), `hidden-information` (the secret key is a server-only
credential: never `VITE_`-prefixed, never logged, never sent to a client).

**Verified current state** (probe-verified 2026-09-08; `src/` line anchors
describe pre-change code):

- `apps/api/src/config.ts:9-70` — every api env var flows through one
  `Config.all`: `DATABASE_URL`/`SESSION_SECRET`/`REALTIME_JWT_SECRET`/
  `TOPIC_SECRET` required (missing ⇒ boot fails), `SESSION_COOKIE_SECURE`
  defaults `false`, `SESSION_COOKIE_SAMESITE` defaults `lax`,
  `REALTIME_URL` defaults `http://realtime-dev.localhost:4000`. `NODE_ENV`
  is **not** read today.
- `apps/api/src/index.ts:14-24` — config resolves first in `main`, before
  the DB probe and `listen`; a failed `Config` load exits nonzero via
  `NodeRuntime.runMain`. This is where a C12 fail-at-boot lands for free.
- `apps/api/src/presentation/auth.ts:32-40` — cookie helper: `httpOnly` +
  `path: "/"` hardcoded invariants, `secure`/`sameSite` from config, no
  `Domain` attribute. Nothing here changes; C6 is satisfied by env values
  (root-plan inventory) plus the C12 guard.
- `apps/api/src/infra/realtime-publisher.ts:38-59` — `makeFetchTransport`
  POSTs `${realtimeUrl}/api/broadcast` with exactly two headers:
  `content-type` and `authorization: Bearer <self-signed HS256>` (signer:
  `apps/api/src/infra/realtime-jwt.ts`). Failures are logged and swallowed
  (`:66-76`) — a misconfigured cloud transport fails **silently**, hence
  the root plan's broadcast smoke requirement.
- `apps/api/package.json:10` — `migrate` runs
  `node --env-file-if-exists=../../.env --import tsx src/infra/migrate-cli.ts`;
  `tsx` is a devDependency, alive in any full (unpruned) install. The
  runner (`apps/api/src/infra/migrate.ts`) is idempotent
  (`_cambio_migrations` ledger, files applied in name order, each in its
  own transaction) and reads only `DATABASE_URL` via `DatabaseLive`.
- `apps/api/migrations/0004_data_lifecycle.sql:170-182` — a guarded `DO`
  block: if `pg_cron` is available (Supabase, not local Docker), it
  creates the extension and `cron.schedule`s the three ADR-0025 jobs
  (`cambio-expire-lobbies`, `cambio-soft-delete`, `cambio-hard-delete`).
  This is the block that must be proven to work **through the session
  pooler** (root Decision Log).
- Tests need no secrets in CI: the HTTP harness
  (`apps/api/test/support/http.ts`) builds its `AppConfig` as a literal
  (`baseConfig` at `:128`) with literal test secrets; the DB support
  (`apps/api/test/support/db.ts:20-21`) falls back to
  `postgres://cambio:cambio@localhost:5433/cambio_test`; the global setup
  (`apps/api/test/global-setup.ts`) derives its admin connection by
  rewriting the path to `/cambio` and needs `CREATE DATABASE` rights —
  all satisfied by the compose Postgres. `RealtimeIntegration.test.ts`
  uses literal constants (`realtime-dev.localhost:4000`, the compose JWT
  secret) and **hard-fails** in `beforeAll` when the container is
  unreachable — no skip path, by design.
- `docker/docker-compose.yml` — `postgres` (host 5433, healthcheck),
  one-shot `realtime-init` (`restart: "no"`), `realtime` (host 4000,
  healthcheck with `start_period: 15s`). CI reuses this file verbatim
  (ADR-0042).
- `turbo.json` — strict env mode: `globalPassThroughEnv` is the allowlist
  (any new runtime var must be added or tasks never see it); `NODE_ENV`
  is already in `globalEnv`; `//#format:check` rides `lint`.
- Toolchain pins for the workflows: `.nvmrc` = `22`, root `package.json`
  `packageManager: "pnpm@9.0.0"` (corepack-ready).

**Module layout (reconciled at close-out):**

| Lane        | File                                       | Change                                                              |
| ----------- | ------------------------------------------ | ------------------------------------------------------------------- |
| main        | `.github/workflows/gate.yml`               | new — the reusable full gate (`pull_request` + `workflow_call`)     |
| main        | `.github/workflows/deploy.yml`             | new — `push` to `development`: gate → migrate → Render hook         |
| task branch | `apps/api/src/config.ts`                   | `nodeEnv` + optional `REALTIME_SECRET_KEY` + C12 validation         |
| task branch | `apps/api/src/infra/realtime-publisher.ts` | `makeFetchTransport` learns cloud-auth headers (C9)                 |
| task branch | `apps/api/test/support/http.ts`            | `baseConfig` literal gains the new `AppConfig` fields (no behavior) |
| task branch | `apps/api/test/RealtimeTransport.test.ts`  | new — stubbed-fetch unit suite pinning both C9 header sets          |
| task branch | `turbo.json`                               | `REALTIME_SECRET_KEY` added to `globalPassThroughEnv`               |
| task branch | `.env.example`                             | cloud-flavor docs + SameSite guidance correction (C13)              |

## Plan of work

### B1 — [main lane] The two workflow files (C1, C2, C3, C4's runner)

Root plan M1. Commit both files to `main` in one commit, then merge down
`main` → `development` → `release-v0` immediately (the PR gate starts
protecting every branch, and the task branch itself gets CI). Design is
fixed by ADR-0042; the file-level spec:

**`.github/workflows/gate.yml`** — one job, triggered by `pull_request`
(no branch filter — every target branch, C1) **and** `workflow_call` (so
`deploy.yml` reuses it instead of duplicating the definition; "the same
gate job" in C3 is then true by construction). Steps, in order:

1. `actions/checkout@v4`.
2. `corepack enable` (activates pnpm 9 from the root `packageManager`
   field).
3. `actions/setup-node@v4` with `node-version-file: .nvmrc` and
   `cache: pnpm` (corepack must run first or the pnpm cache resolver
   fails).
4. `pnpm install --frozen-lockfile`.
5. `echo "127.0.0.1 realtime-dev.localhost" | sudo tee -a /etc/hosts` —
   bare runners cannot resolve `*.localhost` subdomains (glibc), and the
   realtime tenant is resolved from the Host's first label.
6. `docker compose -f docker/docker-compose.yml up -d --wait` — the dev
   compose file verbatim: Postgres on 5433 (the `TEST_DATABASE_URL`
   fallback just works), Realtime on 4000. Known risk: some compose
   versions fail `--wait` on the one-shot `realtime-init` service exiting;
   if the runner's compose does, the documented fallback is
   `docker compose -f docker/docker-compose.yml up -d --wait postgres realtime`
   (scoping `--wait` to the long-running services; `realtime-init` still
   runs as a dependency). Record which form shipped in Progress.
7. `actions/cache@v4` on `.turbo` (key on `runner.os` + lockfile hash +
   `github.sha`, restore-keys on the prefix) — an optimization only, never
   a substitute for running the gate (ADR-0042).
8. `pnpm turbo build typecheck lint test` — **bare**. No pipe, no `tee`,
   no output filter: the step's exit code is the job's verdict (C1). The
   AGENTS.md never-pipe rule applies to CI steps verbatim. No
   test-skipping env vars, no `--filter` (C2).

The gate job needs **no secrets** (verified above — test config is
literal, DB/realtime are the compose services). Timeout the job
(`timeout-minutes`) generously rather than tightly; a hung realtime
container should fail by healthcheck, not by gate truncation.

**`.github/workflows/deploy.yml`** — `on: push: branches: [development]`,
plus a `concurrency` group (`deploy-development`,
`cancel-in-progress: false` — never cancel a migrate mid-flight). Three
jobs, strictly ordered by `needs` (C3):

1. `gate` — `uses: ./.github/workflows/gate.yml` (the reusable workflow;
   byte-identical gate).
2. `migrate` — `needs: gate`. Checkout → corepack → setup-node → full
   `pnpm install --frozen-lockfile` (this is why `tsx` exists —
   ADR-0042) → `pnpm --filter @cambio/api migrate` with
   `DATABASE_URL: ${{ secrets.DATABASE_URL }}` in the step's `env`. The
   secret holds the Supabase **session-pooler** URL (root Decision Log;
   see B5 for the pg_cron verification this choice mandates). The
   `--env-file-if-exists` flag in the migrate script finds no `.env` on a
   runner and is inert — real env wins. Re-runs are no-op successes (C4;
   the `_cambio_migrations` ledger).
3. `deploy-api` — `needs: migrate`. Single step:
   `curl -fsS -X POST "$RENDER_DEPLOY_HOOK_URL"` with the secret in `env`
   (`-f` so an HTTP error fails the job; never echo the URL — a deploy
   hook is a credential). `needs` semantics mean this job is skipped
   whenever migrate (or the gate) fails — the C3 ordering guarantee, and
   the reason the workflow may land before the secrets exist: until M3
   wires them, migrate fails and the hook never fires, which is the
   designed behavior, not a defect.

Vercel is deliberately absent from this workflow — it deploys
`development` independently via git integration (ADR-0042; frontend
child).

Validation for B1 is behavioral, not unit-testable (see Concrete steps):
a deliberate-failure test PR proves C1/C2 red-then-green; the first
`development` push proves C3's job graph; a migrate re-run proves C4.

### B2 — [task branch] Cloud broadcast auth in the transport (C9)

The design call this plan owns. **Decisions:**

- **New env var: `REALTIME_SECRET_KEY`** — optional
  (`Config.option(Config.redacted(...))` in `apps/api/src/config.ts`).
  Holds the Supabase `sb_secret_…` key in cloud environments; unset
  locally. Its presence is the mode switch — no separate boolean, no way
  for the flag and the credential to disagree.
- **Cloud mode headers:** when the key is present, `makeFetchTransport`
  sends `apikey: <secret key>` **and** `authorization: Bearer <secret key>`,
  and mints no JWT. When absent, the request is **byte-identical to
  today** (two headers, self-signed HS256 bearer, no `apikey`). URL
  construction is unchanged either way — `${realtimeUrl}/api/broadcast`
  composes with `REALTIME_URL=https://<ref>.supabase.co/realtime/v1` into
  the correct cloud path shape (C9), and with the local default into
  today's container path. The exact cloud header set is advisory until
  M4's live broadcast smoke confirms it (Supabase docs say `apikey`; the
  bearer is belt-and-braces) — if the live check shows one header
  suffices or a different bearer is required, adjust and record in
  Surprises.
- **`REALTIME_JWT_SECRET` stays required in all modes.** Making it
  conditional would change `AppConfig`'s failure behavior and break
  `apps/api/test/Config.test.ts` "missing REALTIME_JWT_SECRET fails to
  load, naming the variable" — C9 demands existing tests stay green
  unchanged, and the smallest honest surface is: required always, unused
  by the transport in cloud mode. Consequence: Render needs a
  `REALTIME_JWT_SECRET` value (mint a throwaway) — flagged below as a
  root-plan inventory addition.
- **Mechanical shape (advisory):** extend `makeFetchTransport`'s options
  bag with an optional `secretKey?: string` rather than a discriminated
  union — existing call sites (`RealtimePublisherLive` at
  `realtime-publisher.ts:110-121`, and the test constructions in
  `RealtimeIntegration.test.ts`) keep compiling and behaving unchanged.
  `RealtimePublisherLive` passes
  `Option.getOrUndefined(config.realtimeSecretKey)` (unwrapping the
  `Redacted`). `makeRealtimePublisher` and the `RealtimePublisherPort`
  interface are untouched — this is adapter-internal (`architecture`
  skill: the port must not change).

Order of work (test-first where a unit test can pin behavior):

1. Add the config entry + a `Config.test.ts` case: absent key loads as
   `Option.none` with everything else unchanged; present key loads
   redacted. (Same `ConfigProvider.fromMap` pattern as the existing
   cases.)
2. Unit-test the transport's two modes by stubbing global `fetch`
   (`vi.stubGlobal`) in the api test suite: assert URL
   (`…/api/broadcast`), method, and the exact header set per mode — the
   local-mode case asserts **no** `apikey` header and a
   `Bearer <jwt-shaped>` authorization, pinning C9's byte-identical
   claim; the cloud-mode case asserts `apikey` + bearer carry the key
   verbatim. Whether these land inside `RealtimePublisher.test.ts` or a
   sibling file is /implement's call.
3. Implement in `realtime-publisher.ts`; wire `RealtimePublisherLive`.
4. Add `REALTIME_SECRET_KEY` to `turbo.json` `globalPassThroughEnv`
   (strict env mode strips it otherwise — runtime config, passed through
   not hashed, like its neighbors).
5. Run the realtime suites unchanged:
   `apps/api/test/RealtimePublisher.test.ts` and
   `apps/api/test/RealtimeIntegration.test.ts` (container up) must pass
   **without edits** — that is C9's local-mode regression proof.

### B3 — [task branch] Production cookie guard (C12)

**Decision: fail-at-boot, in Effect `Config` land.** A loud log can
scroll away; a refused boot cannot be missed on the Render dashboard, and
`apps/api/src/index.ts` already resolves `AppConfig` before binding a
port, so validation failure exits nonzero with no new plumbing
(`NodeRuntime.runMain`).

1. Add `nodeEnv: Config.string("NODE_ENV").pipe(Config.withDefault("development"))`
   to the `Config.all` bag (Render sets `NODE_ENV=production` — root
   inventory; `NODE_ENV` is already in turbo's `globalEnv`).
2. Wrap the existing `Config.all` in `Config.validate`: fail when
   `nodeEnv === "production"` and `sessionCookieSecure !== true`, with a
   message naming `SESSION_COOKIE_SECURE` and stating the fix — the
   `Config.test.ts` convention of asserting the variable name in the
   error carries over. The exported `AppConfig` type gains `nodeEnv`
   automatically.
3. Test-first in `apps/api/test/Config.test.ts` (pure `ConfigProvider`
   land, no DB): production + secure-unset ⇒ `Left` naming
   `SESSION_COOKIE_SECURE`; production + `SESSION_COOKIE_SECURE=true` ⇒
   `Right`; no `NODE_ENV` (default `development`) + secure-unset ⇒
   `Right` — the local-dev regression pin. All existing `Config.test.ts`
   cases must pass unchanged (none set `NODE_ENV`, so the default keeps
   them out of the guard).
4. Known compile fallout, by design: the `baseConfig: AppConfig` literal
   in `apps/api/test/support/http.ts` gains
   `nodeEnv: "test"` (and, from B2, `realtimeSecretKey: Option.none()`)
   — type-level discovery, zero behavior change; the cookie-attribute
   route tests keep passing because they drive `secure`/`sameSite`
   through config overrides, not through `NODE_ENV`.

### B4 — [task branch] `.env.example` (C13)

Rewrite in place (`.env.example` at the repo root), keeping the "every
variable read anywhere appears here" law:

- **Fix the wrong guidance** at lines 34–35: delete "Split-origin
  production needs … SAMESITE=none" and replace with the ADR-0041 story —
  production is **single-origin through the Vercel `/api` proxy**, so the
  cookie ships `SESSION_COOKIE_SECURE=true` + `SESSION_COOKIE_SAMESITE=lax`;
  note the C12 boot guard (production refuses to boot without
  `SECURE=true`).
- **`NODE_ENV`**: new documented entry (the api now reads it) — unset/dev
  locally, `production` on Render, drives the C12 guard.
- **`DATABASE_URL`**: extend the existing comment with the cloud flavor —
  the Supabase **session-pooler** URL (IPv4-safe; used by both Render and
  the deploy workflow's migrate secret), not the direct connection.
- **`REALTIME_URL`**: extend with the cloud shape
  `https://<ref>.supabase.co/realtime/v1` (the transport appends
  `/api/broadcast`).
- **`REALTIME_SECRET_KEY`**: new entry, blank by default — leave unset
  locally (local mode = self-signed JWTs against the container); in
  deployed envs the Supabase `sb_secret_…` key. Server-only secret: never
  `VITE_`-prefixed, never logged (`hidden-information`).
- **`REALTIME_JWT_SECRET`**: correct its "in deployed envs, the Supabase
  project's JWT secret" tail — that model is EOL (ADR-0041); in cloud
  mode the var is required-but-unused (set a minted throwaway on Render).
- Leave the `VITE_*` block to the frontend child (its C10/C11 values);
  coordinate so the two edits don't collide — whichever lands second
  rebases. Both land on the same task branch.

The markdown-format hook does not run on `.env.example`, but the gate's
`//#format:check` prettier pass ignores it too (not markdown) — no
formatting trap here. (Plan docs like this one: keep inline code spans on
one line.)

### B5 — Pooler verification for the pg_cron migration (C8's risk item)

Part of root M3/M4 (wire-and-fire), backend-owned. The root Decision Log
chose session-pooler URLs for all prod DB paths and mandates verifying
that `0004_data_lifecycle.sql`'s `DO` block works through Supavisor
session mode. After the first successful migrate job against Supabase:

1. `SELECT id FROM _cambio_migrations ORDER BY id` — must list every file
   in `apps/api/migrations/` present on the deployed branch (C8; the
   scaffold's `development` carries fewer than `release-v0`'s four —
   assert against the deployed branch's set, and re-verify after
   /release day).
2. Once `0004` is in the deployed branch:
   `SELECT jobname FROM cron.job ORDER BY jobname` — must list
   `cambio-expire-lobbies`, `cambio-hard-delete`, `cambio-soft-delete`.
3. **Fallback if the `DO` block fails or silently skips through the
   pooler** (e.g. `pg_available_extensions` visibility or extension
   rights under the pooler role): run that migration's `DO` block via the
   Supabase MCP `execute_sql` (a direct, non-pooled path) and record the
   applied-migration row status; alternatively the paid IPv4 add-on.
   Whichever path is taken gets recorded in this file's Surprises **and**
   the root plan's Surprises (the root Decision Log demands it).

Run these via the Supabase MCP `execute_sql` or `psql` against the
pooler URL; capture the outputs in Progress.

### B6 — Backend halves of the live smoke (C5, C6, C8)

Root M4. These verify deployed behavior; nothing lands in the repo except
recorded evidence. Exact probes:

- **C5:** `curl -si https://<vercel-prod>/api/health` — expect the api's
  health body (the rewrite reached Render with the `/api` prefix
  stripped). Also probe `curl -si https://<vercel-prod>/api/nonexistent`
  expecting the api's 404 shape, proving the wildcard forwards rather
  than serving the SPA shell.
- **C6:** `POST https://<vercel-prod>/api/users` with the create-user
  body the route expects (take the request shape from
  `apps/api/test/Auth.test.ts` / the contracts package — do not guess
  it), then inspect `set-cookie`: `cambio_session=…`, `HttpOnly`,
  `Secure`, `SameSite=Lax`, `Path=/`, **no** `Domain` attribute. Then
  `GET https://<vercel-prod>/api/me` replaying the cookie — expect the
  created user.
- **C8:** the B5 SQL, run post-deploy.
- **Broadcast smoke (root-plan Surprise — silent-failure risk):** after
  the frontend half confirms a live lobby update, additionally check the
  Render logs for the publisher's warning line ("realtime publish failed
  (dropped)") — its absence during the flow is the backend's half of the
  proof that cloud auth (B2) actually worked; its presence is the
  designed loud signal of a misconfigured key.

Config-only fixes discovered here are dashboard-side; any **code** fix
routes to its ADR-0043 lane (workflow fix → `main` + merge-down; api fix
→ task branch) — never patched in place on `development`.

## Concrete steps & validation

Never pipe any gate invocation — run bare, read the exit status (the
PreToolUse hook enforces this locally; the workflows must obey it too).

1. **B1 [main lane]:** `git checkout main && git pull`; write the two
   workflow files; validate YAML locally (`npx yaml-lint` or an
   actionlint pass if available — advisory); commit to `main`; merge down
   `main` → `development` → `release-v0`; push all three. Success signal:
   the Actions tab shows the gate workflow registered; the
   `development` push triggers `deploy.yml`, whose migrate job **fails**
   (no secrets yet) and whose deploy job shows **skipped** — that skip is
   C3's ordering working.
2. **C1/C2 proof (after B1):** open a throwaway test PR against
   `release-v0` with a deliberately failing test; the check must go red
   with the full suite (including `RealtimeIntegration`) visible in the
   log — grep the job log for `RealtimeIntegration` to prove it executed,
   not skipped. Revert the failure, watch green, close the PR. Record
   both run URLs in Progress.
3. **B2–B4 [task branch]** (branch from `release-v0`, Linear's suggested
   name): work test-first as laid out above. Inner loop after a
   `pnpm turbo build --filter @cambio/api`: bare
   `vitest run apps/api/test/Config.test.ts` (from `apps/api/`) and the
   new transport tests. Checkpoint each of B2/B3/B4 with
   `pnpm turbo test --filter @cambio/api` (canonical per-package form —
   turbo builds workspace deps first). Container required:
   `docker compose -f docker/docker-compose.yml up -d` (the realtime
   suite hard-fails without it — that failure means the container is
   down, not a regression).
4. **Task-branch gate:** `pnpm turbo build typecheck lint test` — bare,
   green. Watch specifically: `apps/api/test/RealtimePublisher.test.ts`
   and `apps/api/test/RealtimeIntegration.test.ts` pass **with zero
   edits**; `apps/api/test/Config.test.ts` grows its new cases with all
   existing names intact.
5. **M3 wiring (dashboards, no commits):** set GitHub secrets
   (`DATABASE_URL` = session-pooler URL, `RENDER_DEPLOY_HOOK_URL`) and
   the Render/Vercel env per the root plan's inventory — plus
   `REALTIME_JWT_SECRET` (throwaway) and `REALTIME_SECRET_KEY`
   (`sb_secret_…`) on Render per B2's decisions. Re-run the deploy
   workflow (re-push or `workflow_dispatch` if added): gate ✓ →
   migrate ✓ → hook fired. Then re-run the migrate job alone — second run
   must be a no-op success (C4's live proof).
6. **B5 + B6:** run the SQL probes and curls above; capture outputs
   verbatim in Progress. A deliberate migrate-failure dry run (secret
   temporarily set to a bad URL, then restored) proves the hook stays
   unfired on red — record the run URL (root Validation).
7. **Close-out:** reconcile this file's module-layout table and coverage
   table against the as-built diff; grep this plan for `:<digits>`
   anchors against files the diff touched (the template's rot check).

## Contract coverage

_(maintained by `/implement`, verified by `/review`: one row per root-plan
contract clause this side owns — the test that pins it, or why none can.
Each row must also say **what is asserted**, in one phrase. **At plan
time, fill only the Clause column plus a planned-approach note**; test
file, name, and assertion phrase are written by `/implement` when the test
actually lands. A plan-time row that invents a test title and assertion is
an overclaim waiting to become a review finding.)_

| Clause                                                                                                                                                                                                 | Test (file + name)                                                                                                                                                                                                                                                                                                                                                                                                                                        | What is asserted                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 — planned: no unit test can pin a workflow; proven in anger via the deliberate-failure test PR (red on failure, green on revert), run URLs recorded in Progress (B1, step 2)                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                           |                                                                                                                                                                      |
| C2 — planned: same test-PR evidence + a grep of the CI job log showing `RealtimeIntegration` executed (compose up + `/etc/hosts` line preceding the bare gate in `gate.yml`)                           |                                                                                                                                                                                                                                                                                                                                                                                                                                                           |                                                                                                                                                                      |
| C3 — planned: workflow-run evidence — the `development` job graph shows gate → migrate → deploy-hook with `needs` ordering; pre-secrets run shows deploy **skipped** on migrate failure (B1, step 5)   |                                                                                                                                                                                                                                                                                                                                                                                                                                                           |                                                                                                                                                                      |
| C4 — planned: live re-run of the migrate job against the already-migrated Supabase DB is a no-op success (idempotent `_cambio_migrations` ledger); run URL in Progress (step 5)                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                           |                                                                                                                                                                      |
| C5 (backend half) — planned: live curl of `/api/health` (and a 404-shape probe) through the Vercel proxy, output captured in Progress (B6)                                                             |                                                                                                                                                                                                                                                                                                                                                                                                                                                           |                                                                                                                                                                      |
| C6 (backend half) — planned: live curl cookie flow — `POST /api/users` set-cookie attribute inspection (`Secure`, `SameSite=Lax`, `HttpOnly`, `Path=/`, no `Domain`) then `GET /api/me` replay (B6)    |                                                                                                                                                                                                                                                                                                                                                                                                                                                           |                                                                                                                                                                      |
| C8 (backend half) — planned: SQL against prod — `_cambio_migrations` matches the deployed branch's migrations dir; `cron.job` lists the three ADR-0025 jobs once `0004` deploys; pooler fallback (B5)  |                                                                                                                                                                                                                                                                                                                                                                                                                                                           |                                                                                                                                                                      |
| C9 — planned: transport unit tests with a stubbed `fetch` pinning both header sets (cloud: `apikey` + bearer key; local: byte-identical to today, no `apikey`); existing realtime suites unedited (B2) | apps/api/test/RealtimeTransport.test.ts — "POSTs the batch with exactly content-type + self-signed bearer, no apikey" and "sends apikey + bearer carrying the key verbatim, and mints no JWT"; apps/api/test/Config.test.ts — "absent REALTIME_SECRET_KEY loads as none — local mode, everything else unchanged" and "present REALTIME_SECRET_KEY loads as a redacted some"; RealtimePublisher.test.ts + RealtimeIntegration.test.ts pass with zero edits | both header sets pinned exactly per mode against a stubbed fetch; local mode byte-identical (no apikey, JWT-shaped bearer); existing realtime suites green unchanged |
| C12 — planned: `Config.test.ts` cases — production without `SESSION_COOKIE_SECURE=true` fails config load naming the variable; production with it loads; dev default unaffected (B3, fail-at-boot)     | apps/api/test/Config.test.ts — "NODE_ENV=production without SESSION_COOKIE_SECURE=true fails to load, naming the variable", "NODE_ENV=production with SESSION_COOKIE_SECURE=true loads", "no NODE_ENV defaults to development — secure-unset still loads (local dev regression pin)"                                                                                                                                                                      | production config load fails naming SESSION_COOKIE_SECURE; production+secure loads; dev default unaffected (fail-at-boot via index.ts's AppConfig resolve)           |
| C13 — planned: not a test — `.env.example` rewrite reviewed against B4's checklist (cloud flavors documented, SameSite=none advice corrected to the single-origin lax story, new vars present)         |                                                                                                                                                                                                                                                                                                                                                                                                                                                           |                                                                                                                                                                      |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [ ] 2026-09-08 — backend child plan written; awaiting /implement
- [x] 2026-09-08 — B2 (C9) landed test-first: `REALTIME_SECRET_KEY` as
      `Config.option(Config.redacted(...))` in `apps/api/src/config.ts`;
      `makeFetchTransport` grew an optional `secretKey` (cloud mode:
      `apikey` + `Bearer <key>`, no JWT minted; absent: byte-identical
      request); `RealtimePublisherLive` unwraps via
      `Option.getOrUndefined(Option.map(..., Redacted.value))`;
      `REALTIME_SECRET_KEY` added to turbo `globalPassThroughEnv`. New
      suite `apps/api/test/RealtimeTransport.test.ts` (3 tests, sibling
      file — so `RealtimePublisher.test.ts` stays byte-untouched); two new
      `Config.test.ts` cases. Port interface unchanged.
- [x] 2026-09-08 — B3 (C12) landed test-first: `nodeEnv` (default
      `"development"`) + `Config.validate` wrapping the `Config.all` bag —
      production without `SESSION_COOKIE_SECURE=true` refuses config load
      with a message naming the variable. Three new `Config.test.ts`
      cases; all 7 pre-existing cases pass unchanged. Known compile
      fallout landed as predicted: `baseConfig` in
      `apps/api/test/support/http.ts` gained `nodeEnv: "test"` and
      `realtimeSecretKey: Option.none()` — zero behavior change.
- [x] 2026-09-08 — B4 (C13): `.env.example` rewritten per the checklist —
      SameSite=none advice replaced with the ADR-0041 single-origin
      lax + Secure story and the C12 boot-guard note; `NODE_ENV`
      documented (commented-out entry); `DATABASE_URL` cloud flavor =
      session pooler (with the IPv4 rationale); `REALTIME_URL` cloud
      shape `https://<ref>.supabase.co/realtime/v1`; new blank
      `REALTIME_SECRET_KEY` entry; `REALTIME_JWT_SECRET`'s EOL'd
      "Supabase project's JWT secret" tail corrected to
      required-but-unused-in-cloud + minted throwaway. `VITE_*` block
      untouched (frontend lane owns it).
- [x] 2026-09-08 — checkpoints: `pnpm turbo test --filter @cambio/api`
      green (21 files, 130 tests — `RealtimePublisher.test.ts` and
      `RealtimeIntegration.test.ts` pass with zero edits, container up).
      Full gate `pnpm turbo build typecheck lint test` bare: 25/25 tasks
      successful (first attempt caught an unformatted `Config.test.ts`
      via `//#format:check` — fixed with `prettier --write`; see
      Surprises for a one-off `@cambio/config#test` flake in that same
      run). Module-layout table reconciled: one addition, the new
      `RealtimeTransport.test.ts` row.

## Surprises & notes for the root plan

- (plan-time) **ADR-0042 wording vs the root Decision Log:** ADR-0042's
  migrate bullet says the `DATABASE_URL` secret holds the "direct
  (non-pooler) superuser" connection string, but the root plan's later
  Decision Log entry (pooler-everywhere, IPv4) supersedes that for
  implementation. When the ADRs move from proposed to accepted, align
  ADR-0042's text (or note the amendment) so the two don't contradict.
  **Resolved at planning (2026-09-08):** ADR-0042's migrate bullet was
  rewritten to the session-pooler wording before the planning commit; no
  contradiction remains.
- (plan-time) **Root env inventory addition:** B2's decision to keep
  `REALTIME_JWT_SECRET` required in all modes means Render needs a
  `REALTIME_JWT_SECRET` env var (any minted throwaway value; unused by
  the cloud transport). The root plan's environment inventory table
  should gain that row, and the cloud realtime key var it left to this
  plan is now named: `REALTIME_SECRET_KEY`.
- (plan-time) The compose `--wait` / one-shot `realtime-init` interaction
  (B1 step 6) is the one place the workflow spec may need its documented
  fallback form; whichever form ships, record it here so the ADR-0042
  "compose file verbatim" claim stays honest.
- 2026-09-08 (implement, B2–B4) — **one-off `@cambio/config#test` flake
  under the full gate:** the first full-gate run failed
  `@cambio/config#test` (exit 1) alongside the genuine `//#format:check`
  finding (unformatted `Config.test.ts`). The same turbo input hash
  (`19fb6c4f72f42734`) passed on an immediate bare re-run and again as a
  cache hit in the green gate — nondeterministic, most plausibly resource
  contention while `domain`'s fuzz suite saturated the machine. Not
  reproduced; nothing changed in `packages/config`. If CI ever shows the
  same signature, suspect the runner, not the config package.
- 2026-09-08 (implement, B3) — the C12 guard message deliberately does
  not use `Config.validate`'s per-variable error nesting: `Config.validate`
  wraps the whole bag, so the message itself carries
  `SESSION_COOKIE_SECURE` by name (the `Config.test.ts` convention of
  asserting the variable name in the error still holds — the test greps
  the stringified `Left`).
