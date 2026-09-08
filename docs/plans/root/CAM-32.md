# CAM-32 — CI/CD pipeline: gate on PRs, auto-deploy development, prod migrations

- **Linear:** [CAM-32](https://linear.app/raafayk7/issue/CAM-32/cicd-pipeline-gate-on-prs-auto-deploy-development-to-vercel-backend)
- **Scope:** fullstack (plus repo-level infra that lands on `main` per ADR-0043)
- **Child plans:** [backend](../backend/CAM-32.md) · [frontend](../frontend/CAM-32.md)
- **ADRs:** 0041 (prod topology), 0042 (CI/CD shape), 0043 (deployment-config carve-out)

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

After this task, every PR runs the full gate in GitHub Actions, and a push
to `development` automatically migrates the production database and
deploys: `apps/web` as a static SPA on Vercel, `apps/api` as a single
Render free-tier instance, with Postgres + Realtime on a Supabase cloud
project. Observable proof: the current `development` branch (the scaffold)
is live — the Vercel page loads and `GET https://<vercel-prod>/api/health`
answers through the proxy from Render.

## Context & orientation

- **Nothing exists yet**: no `.github/`, no `vercel.json`, no
  `render.yaml`, no Dockerfile. `development` currently equals `main`
  (scaffold + harness merge-downs), 207 commits behind `release-v0`.
- **Governing decisions**: ADR-0041/0042/0043 (written by this plan),
  ADR-0020 (single-instance room actor — why serverless is out), ADR-0018
  (cookie identity — why single origin), ADR-0024/0032 (realtime; both
  amended by 0041 for deployed environments), ADR-0025 (pg_cron jobs the
  first prod migration installs), HANDOFF §6 (deployment constraints —
  spin-down survivability is designed in).
- **Provider accounts** (all MCPs connected): Vercel team
  `raafeysaeed-1675s-projects` (hobby, no Cambio project yet), Supabase org
  `raafayk7's Org` (no Cambio project yet — must be created), Render
  workspace "My Workspace" (`tea-d8moevcm0tmc73dc3fog`, empty).
- **Key existing facts** (probe-verified by exploration, file:line in the
  child plans): api binds `0.0.0.0:$PORT` already; api routes live at
  root with no `/api` prefix; the web client has a single HTTP choke point
  (`apps/web/src/services/api.ts`) building `${VITE_API_URL}${path}` with
  `credentials: "include"` (pinned by `apps/web/test/api.test.ts`); cookie
  attributes are env-driven (`SESSION_COOKIE_SECURE/_SAMESITE`); the
  migrate runner is idempotent, `DATABASE_URL`-only, and runs via `tsx`
  (devDependency); `RealtimeIntegration.test.ts` hard-requires the compose
  realtime container at `realtime-dev.localhost:4000`; turbo runs strict
  env mode (`globalPassThroughEnv` is the allowlist);
  `apps/web/test/env-declaration.test.ts` pins the `VITE_*` declarations
  in `turbo.json`.

## Functional contract

**CI (lands on `main`, per ADR-0043):**

- **C1** Every pull request (any target branch) triggers a GitHub Actions
  job that runs `pnpm turbo build typecheck lint test` **bare** — no
  pipes; the job's verdict is the gate's exit code. A red gate marks the
  PR check failed.
- **C2** The gate job runs the **full** suite, including
  `RealtimeIntegration.test.ts`: it brings up
  `docker/docker-compose.yml` (`up -d --wait`) and adds
  `127.0.0.1 realtime-dev.localhost` to `/etc/hosts` before testing. The
  gate never shrinks: no test-skipping env vars, no suite filtering.
- **C3** A push to `development` runs, strictly ordered: the same gate →
  a migrate job (`pnpm --filter @cambio/api migrate` with `DATABASE_URL`
  from a GitHub secret) → the Render deploy hook. The hook fires only if
  migrate succeeded; migrate runs only if the gate passed. Vercel deploys
  `development` independently via git integration.
- **C4** Re-running the migrate job against an already-migrated database
  is a no-op success (the runner records applied ids —
  `apps/api/src/infra/migrate.ts`).

**Production behavior (verified live after the first deploy):**

- **C5** `GET https://<vercel-prod>/api/health` returns the api's health
  response — i.e. the Vercel rewrite forwards `/api/:path*` to the Render
  host **with the `/api` prefix stripped** (api routes are at root).
- **C6** `POST /api/users` through the proxy sets the `cambio_session`
  cookie as **first-party**: `Secure`, `SameSite=Lax`, `HttpOnly`,
  `Path=/`, no `Domain` attribute; a subsequent `GET /api/me` with that
  cookie returns the user (the ADR-0018 flow works end to end in prod).
- **C7** The deployed web app is a **static SPA**: the Vercel build
  produces no server runtime, and the deployed `/` page loads and renders
  in a browser.
- **C8** After the first migrate against the Supabase project, the applied
  migrations match the branch's `apps/api/migrations/` and (once
  `0004` is in the deployed branch) `cron.job` lists the three ADR-0025
  jobs. Verifiable via SQL on the prod database.

**Application-code changes (land via task branch → `release-v0`):**

- **C9** With cloud realtime env configured, the api's broadcast transport
  authenticates against Supabase cloud Realtime (sends the required
  `apikey` header carrying the secret key; targets the
  `…/realtime/v1/api/broadcast` path shape). With local env, behavior is
  byte-identical to today — the existing realtime tests stay green
  unchanged.
- **C10** The browser realtime client connects to Supabase cloud when
  built with `VITE_REALTIME_URL=wss://<ref>.supabase.co/realtime/v1` and
  the publishable key as its apikey; the local container flow is
  unchanged.
- **C11** A production web build with `VITE_API_URL` missing must **fail
  visibly** (build error or same-origin relative requests) — never
  silently ship `http://localhost:3001` (today's fallback at
  `apps/web/src/services/api.ts:39`).
- **C12** The api refuses to boot (or loudly logs, per child-plan
  decision) when `NODE_ENV=production` and `SESSION_COOKIE_SECURE` is not
  `true` — a forgotten Render env var must not silently issue insecure
  cookies.
- **C13** `.env.example` documents the prod (cloud) flavor of every env
  var this task introduces or re-shapes, and its now-wrong
  "SameSite=none for split-origin production" guidance is corrected to
  the single-origin proxy story.

### Acceptance criteria

- [ ] `pnpm turbo build typecheck lint test` passes locally on the task
      branch (run bare).
- [ ] A test PR shows the gate check red on a deliberate failure and green
      after revert (C1/C2 proven in anger, then the test PR closed).
- [ ] The deploy workflow run for `development` shows gate → migrate →
      deploy-hook ordering in its job graph (C3).
- [ ] Live smoke, **provable at deploy-now**: C5 curl output (`/api/health`
      through the proxy), C4 idempotent re-run, C3 job graph, C8's
      "applied migrations match the deployed branch" SQL — captured in
      Progress.
- [ ] Live smoke, **deferred to the first /release** (the scaffold on
      `development` has no `/users` routes, no `0004` migration, and no
      SPA build mode until release-v0 merges): C6 cookie flow, C7 deployed
      page load, C8's `cron.job` check, C9/C10 end-to-end broadcast.
      These get local/CI proofs now (child plans) and live proofs on
      release day — the /release task's checklist must carry them forward.
- [ ] Merge-down complete: `main` → `development` → `release-v0` carries
      the workflows + `vercel.json` (ADR-0043 definition of done).
- [ ] ADR index rows for 0024/0028/0032 annotated as amended (see
      Plan of work M5).

## Plan of work

**M0 — Provision (dashboards/MCPs, no commits).** Create the Supabase
project (org `raafayk7's Org`, free tier, region nearest players; record
`<ref>`, publishable + secret keys, session-pooler connection string).
Create the Render web service from the GitHub repo (branch `development`,
build `corepack enable && pnpm install --frozen-lockfile && pnpm turbo build --filter @cambio/api...`,
start `node apps/api/dist/index.js`, health check `/health`,
**auto-deploy off**, capture the deploy hook URL). Create the Vercel
project as a **repo-root project** (Root Directory unset — `vercel.json`
at the repo root pins framework/install/build/output; see the frontend
child's F1/F5, which supersede an earlier "root directory `apps/web`"
sketch here), production branch `development`, previews disabled.
Mint prod `SESSION_SECRET`/`TOPIC_SECRET`. Nothing here blocks M1–M2;
user consent is needed only if any step turns out to carry a cost
(everything chosen is free-tier).

**M1 — CI/CD files on `main` (ADR-0043 lane).** `.github/workflows/`
(gate + deploy per ADR-0042) and `vercel.json` (the `/api/:path*` rewrite
plus the static-output settings — file-level spec in the frontend child).
Commit to `main`, merge down `main` → `development` → `release-v0`. This
immediately gives every existing branch the PR gate. The deploy workflow
will fail at the migrate step until M3 wires secrets — acceptable; it must
not fire the deploy hook on failure (C3's ordering guarantees this).

**M2 — App-code changes on the task branch (release lane).** Backend
child: realtime transport cloud auth (C9), prod cookie guard (C12),
`.env.example` rewrite (C13). Frontend child: SPA/static build mode (C7's
enabler), `VITE_API_URL` fallback hardening (C11), realtime env value
shapes (C10), `turbo.json` declarations kept in lockstep with
`env-declaration.test.ts`. Both sides keep the gate green; no contracts
package changes exist in this task, so the lanes are independent after M1.

**M3 — Wire and fire.** Set GitHub secrets (`DATABASE_URL` for prod,
`RENDER_DEPLOY_HOOK_URL`), Render env vars, Vercel build env vars (full
inventory below). Push/merge-down to `development` triggers the real run:
gate → migrate (applies the scaffold's migrations; the full set arrives on
/release day) → deploy hook. Vercel builds the static SPA.

**M4 — Live verification.** Execute the C5–C8 smoke checks; fix and
re-fire as needed (config fixes are dashboard-side; code fixes route to
their proper lane per ADR-0043). Capture outputs in Progress.

**M5 — Docs close-out.** Annotate ADR index rows 0024/0028/0032 as
amended (by 0041/0043); update AGENTS.md's "deployment target once CI/CD
exists" phrasing (harness edit — lands on `main` with M1's lane); Linear
comment + status.

## Environment inventory (system of record — ADR-0043 consequence)

| Where            | Key                                                                                   | Value shape                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| GitHub secret    | `DATABASE_URL`                                                                        | Supabase **session-pooler** URL (IPv4-safe; see Decision log on pg_cron/IPv6)                                               |
| GitHub secret    | `RENDER_DEPLOY_HOOK_URL`                                                              | from Render service settings                                                                                                |
| Render env       | `DATABASE_URL`                                                                        | Supabase session-pooler URL                                                                                                 |
| Render env       | `SESSION_SECRET`                                                                      | minted for prod                                                                                                             |
| Render env       | `SESSION_COOKIE_SECURE`                                                               | `true`                                                                                                                      |
| Render env       | `SESSION_COOKIE_SAMESITE`                                                             | `lax`                                                                                                                       |
| Render env       | `WEB_ORIGIN`                                                                          | `https://<vercel-prod-domain>`                                                                                              |
| Render env       | `REALTIME_URL`                                                                        | `https://<ref>.supabase.co/realtime/v1`                                                                                     |
| Render env       | `REALTIME_SECRET_KEY` (cloud-mode switch)                                             | `sb_secret_…`                                                                                                               |
| Render env       | `REALTIME_JWT_SECRET`                                                                 | throwaway prod value — stays required by config in all modes (backend child call); unused when `REALTIME_SECRET_KEY` is set |
| Render env       | `TOPIC_SECRET`                                                                        | minted for prod                                                                                                             |
| Render env       | `NODE_ENV`                                                                            | `production`                                                                                                                |
| Vercel build env | `VITE_API_URL`                                                                        | `/api`                                                                                                                      |
| Vercel build env | `VITE_REALTIME_URL`                                                                   | `wss://<ref>.supabase.co/realtime/v1` (no `/socket` suffix — the client lib appends `/websocket`)                           |
| Vercel build env | `VITE_REALTIME_APIKEY` (renamed from `VITE_REALTIME_ANON_JWT`, per frontend child F4) | `sb_publishable_…`                                                                                                          |

Backend child calls (folded back 2026-09-08): the cloud-mode switch is
`REALTIME_SECRET_KEY` (presence = cloud auth headers, absence =
byte-identical local behavior); `REALTIME_JWT_SECRET` stays required in
all modes to keep config tests green, so Render carries a throwaway.

## Validation

- **Gate fidelity:** run the gate locally and in a test PR; the CI log
  must show all suites including `RealtimeIntegration` executing (not
  skipped).
- **Ordering:** the deploy workflow's job graph + a deliberate
  migrate-failure dry run (bad `DATABASE_URL`) proving the deploy hook
  does not fire.
- **Live smoke:** the C5–C8 curls/SQL listed under acceptance criteria,
  with outputs recorded in Progress.
- **No-regression:** existing api realtime tests and
  `apps/web/test/api.test.ts` / `env-declaration.test.ts` pass unchanged
  or with deliberate, contract-mapped updates only.

## Progress

_(updated continuously; append new entries at the BOTTOM — newest last;
timestamp each entry)_

- [x] 2026-09-08 — plan written; ADRs 0041–0043 drafted; signed off
- [x] 2026-09-08 16:20 — **M0 (partial)**: Supabase project `cambio` created (ref `vbrvdqywrehxymbjfbgb`, ap-south-1, free tier, $0 cost confirmed); Render service `cambio-api` created (`srv-dag2djdg1s2s738of660`, singapore, free, auto-deploy **off**, `https://cambio-api-g8uk.onrender.com`); Render env set: NODE_ENV, SESSION_COOKIE_SECURE=true, SESSION_COOKIE_SAMESITE=lax, LOG_LEVEL, SESSION_SECRET, TOPIC_SECRET, REALTIME_JWT_SECRET (throwaway), REALTIME_URL. Publishable key retrieved. Remaining M0 items need the user (see Surprises): Vercel project connect, DB password, sb_secret key, deploy-hook URL.
- [x] 2026-09-08 16:22 — **M1 done**: `659dc3d` on `main` (gate.yml, deploy.yml, vercel.json with the real Render host), merged down `main` → `development` → `release-v0`; task branch fast-forwarded. First `deploy.yml` run [34243991527](https://github.com/raafayk7/cambio/actions/runs/34243991527): gate ✓ 1m30s (compose `--wait` worked on the scaffold), migrate ✗ (missing secret — the designed pre-wiring failure), deploy-api **skipped** — C3 ordering proven pre-secrets.
- [x] 2026-09-08 17:05 — **M2 done**: backend lane `cb3d886` (C9 cloud transport + `REALTIME_SECRET_KEY`, C12 fail-at-boot guard, C13 `.env.example`), frontend lane `f87659d` (C7 SPA static build + local proof, C11 fallback hardening, C10 `VITE_REALTIME_APIKEY` rename). Full gate bare: 25/25 tasks, api 130/130 (RealtimeIntegration executing), web 282/282. Coverage rows filled in both child plans.

## Decision log

- 2026-09-08 — **Render free tier initially** (user call, round 1) — spin-down accepted; HANDOFF §6 designed for it; upgrade is dashboard-only.
- 2026-09-08 — **Supabase free tier** (user call) — pause-after-idle risk accepted for v0; pg_cron + always-on api pool make it unlikely.
- 2026-09-08 — **Vercel proxy rewrite over custom domain** (user call) — first-party cookies for free; domain deferred.
- 2026-09-08 — **Definition of done includes a live deploy of current `development`** (user call) — pipeline proven before /release day.
- 2026-09-08 — **SPA + static web** (user call) — the app uses zero SSR features; rejected the nitro/vercel SSR adapter.
- 2026-09-08 — **New Supabase API keys for prod realtime** (user call) — legacy JWT-secret model EOL end of 2026; local self-minted JWTs unchanged.
- 2026-09-08 — **Split landing** (user call; ADR-0043) — config → `main`, app code → task branch → `release-v0`.
- 2026-09-08 — **Pooler over direct connections everywhere in prod paths** — GitHub runners and (reportedly) Render free egress are IPv4-only while Supabase direct connections are IPv6-first; Supavisor **session mode** is the IPv4-safe default for both runtime and migrations. Implementation must verify the `0004` pg_cron `DO` block succeeds through the pooler; fallback is running that one migration via the Supabase MCP (`execute_sql`) and recording it, or the paid IPv4 add-on. Surprises section must record which path was taken.
- 2026-09-08 — **Migration checksums/down-migrations stay deferred** — the infrastructure-persistence skill forbids adding them "in passing" even though a prod DB now exists; flagged for a future hardening task instead.
- 2026-09-08 — **Turbo remote cache deferred; `actions/cache` on `.turbo`** — no account coupling, good enough.
- 2026-09-08 — **Vercel preview deployments disabled** — out of scope per ticket; revisit with custom domain.
- 2026-09-08 — **C7 sequencing gap accepted (root-plan call on the frontend child's flag)** — the SPA build toggle is app code and stays on the release lane per ADR-0043; therefore the deploy-now proof covers pipeline mechanics + C5, while C7's live proof (deployed page renders) waits for release day. Deliberately NOT extending the carve-out to `vite.config.ts` — ADR-0043 excluded the SPA build mode from the main lane hours earlier with user consent; contradicting it silently is exactly what the ADR discipline forbids. Consequence: until release day the Vercel `/` URL serves a 404/asset-only shell — known, harmless, recorded.
- 2026-09-08 — **`VITE_REALTIME_ANON_JWT` → `VITE_REALTIME_APIKEY` rename** (frontend child F4 call, folded back) — the value is a publishable key in prod; the old name would lie. Five touch points enumerated in the frontend plan, atomic commit.
- 2026-09-08 — **`VITE_TUNNEL_HOST` left untouched** — the tunnel workflow is local-device testing, orthogonal to this task (its undeclared-in-turbo.json quirk noted for a future ticket).

- 2026-09-08 — **Lanes ran sequentially, not parallel** (implementation call) — both child plans share `.env.example`/`turbo.json` and carried a whichever-lands-second-reconciles note; sequential execution (backend → frontend) made the reconcile deterministic. Wall-clock cost accepted.
- 2026-09-08 — **Provider placement**: Supabase `ap-south-1` (nearest players), Render `singapore` (nearest offered region to players and the Mumbai DB); service named `cambio-api`.

## Surprises & discoveries

_(anything found mid-implementation that the plan didn't predict — wrong
assumptions, upstream bugs, better approaches. Evidence included.)_

- 2026-09-08 (planning) — ADR-0024's claim that the deployed realtime env
  "differs only in URL and secret" is wrong: cloud also differs in path
  prefix (`/realtime/v1`), required `apikey` header, and (post-2025) the
  key model itself. ADR-0041 amends it.
- 2026-09-08 (planning) — publish failures are swallowed as warnings
  (`apps/api/src/infra/realtime-publisher.ts` logs and continues), so a
  misconfigured cloud realtime would fail **silently**; the M4 smoke must
  therefore include an end-to-end broadcast check, not just a 200 from
  `/api/health`.

- 2026-09-08 (implementation) — **Direct DB host is IPv6-only, confirmed**:
  `getent hosts db.vbrvdqywrehxymbjfbgb.supabase.co` returns only an AAAA
  record — the pooler-everywhere decision was validated before first use.
- 2026-09-08 (implementation) — **Four wiring steps need the user's
  hands**: (1) the permission classifier (correctly) blocked setting the
  DB password via MCP SQL — dashboard reset instead; (2) the Vercel CLI
  is logged out and the Vercel MCP has no create-project-from-git tool —
  dashboard import; (3) Render's API/MCP does not expose deploy-hook
  URLs — dashboard copy; (4) the `sb_secret_…` key is not retrievable via
  the Supabase MCP — dashboard copy. All four are in the M3 checklist
  posted to the user; none block the code work.
- 2026-09-08 (implementation) — **Render fired a creation-time deploy
  despite `autoDeploy: no`** (and again on env-var updates). Both fail at
  boot on the missing `DATABASE_URL` — harmless, but "auto-deploy off"
  means _push-triggered_ deploys only; API-side actions still deploy.
- 2026-09-08 (implementation) — **Frontend harness ripple from C11** (the
  plan vetted `api.test.ts` but not the shared test harness): 132 jsdom
  tests went red because `new URL(String(input))` in
  `apps/web/test/support/harness.tsx` and the game-screen suite requires
  absolute URLs. Fixed with a base argument in test support only; full
  evidence in the frontend child plan's Surprises.
- 2026-09-08 (implementation) — One-off `@cambio/config#test` flake on an
  untouched package during the backend lane's first full gate (same turbo
  hash failed once, passed bare re-run) — signature recorded in the
  backend child plan; if CI shows it, suspect the runner.

## Outcomes & retrospective

_(filled at the end, typically by `/review`)_
