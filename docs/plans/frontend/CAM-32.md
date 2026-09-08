# CAM-32 — CI/CD pipeline: static SPA build + Vercel deploy config (frontend)

- **Root plan:** [root/CAM-32.md](../root/CAM-32.md) — the functional
  contract lives there; this document is implementation detail for the
  web/Vercel side.

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

This side owns three lanes, which land in three different places
(ADR-0043 splits the task):

- **Main lane** — `vercel.json` at the repo root. Deployment config joins
  the ADR-0028 carve-out: committed directly to `main`, propagated by
  merge-down (`main` → `development` → `release-v0`). Its file-level spec
  is Step F1 below.
- **Task-branch lane** — `apps/web` app-code/build-config changes (SPA
  build mode, `VITE_API_URL` fallback hardening, realtime env var
  rename) plus their `turbo.json` and test ripples. Normal ADR-0008
  flow: task branch → PR into `release-v0`.
- **Dashboard lane** — Vercel project settings, which live outside git
  entirely (ADR-0043); Step F5 is their system-of-record spec, feeding
  the root plan's environment inventory.

**Governing decisions:** ADR-0041 (static SPA on Vercel, `/api` proxy
rewrite to Render with the prefix stripped, cloud realtime via the new
publishable/secret key model), ADR-0042 (Vercel deploys `development`
independently via git integration; previews out of scope), ADR-0043 (the
lane split above).

**Skills that apply:** `frontend-architecture` (the client stays a
projection renderer; nothing here adds logic, routes, or components —
build config only). This task touches **no design-system surface**: no
components, no tokens, no copy, so the `design-system` skill's creation
gate is not in play. `hidden-information` is likewise untouched — no
payload, channel, or projection changes; the realtime work is env-var
naming and value shapes only.

**Current state, probe-verified (re-verify before building on it):**

- `apps/web/src/services/api.ts:39` is the single HTTP choke point:
  `const API_URL: string = TUNNEL_MODE ? "" : (import.meta.env.VITE_API_URL ?? "http://localhost:3001")`,
  with `credentials: "include"` on every fetch (pinned by
  `apps/web/test/api.test.ts` "sends credentials: include on every
  call" — note it asserts the URL with `toMatch(/\/me$/)`, so it is
  prefix-tolerant and survives the C11 change). All call-site paths are
  root-relative (`/me`, `/lobbies/...`), so `VITE_API_URL=/api` works
  with zero call-site changes.
- `apps/web/src/services/realtime.ts:48-83` builds the browser client
  lazily: `new RealtimeClient(url, { params: { apikey: jwt } })` from
  `VITE_REALTIME_URL` + `VITE_REALTIME_ANON_JWT`, with an explicit
  non-empty guard (lines 73–77). The `@supabase/realtime-js` lib appends
  `/websocket` to the URL itself, so the cloud value is
  `wss://<ref>.supabase.co/realtime/v1` with **no** `/socket` suffix
  (locally the `/socket` suffix stays — the container is mounted there).
- Routes are `/`, `/room/$gameId`, `/game/$gameId`, and the DEV-guarded
  `/dev/components`. **Zero server functions, zero `/api/*` routes** —
  no collision with the rewrite namespace.
- `apps/web/vite.config.ts:70-75` calls `tanstackStart()` with no
  options; the current build emits `dist/client/` assets plus
  `dist/server/server.js` and **no HTML file** — not statically
  deployable today. That is what Step F2 changes.
- Installed versions (from `pnpm-lock.yaml` / `node_modules`):
  `@tanstack/react-start@1.168.35` resolving
  `@tanstack/start-plugin-core@1.171.26`. The plugin's input schema
  (`node_modules/.pnpm/@tanstack+start-plugin-core@1.171.26_*/node_modules/@tanstack/start-plugin-core/dist/esm/schema.js`,
  `spaSchema`) confirms a top-level `spa` option:
  `spa.enabled` (default `true` once the object is present),
  `spa.maskPath` (default `"/"`), and `spa.prerender.outputPath`
  (default `"/_shell"`). Its `post-build.js` forces prerender on and
  emits the shell; `prerender.js` writes the SPA shell to
  `<outputPath>.html`, i.e. **`dist/client/_shell.html`**. These option
  names are verified against the installed package, not memory.
- Env vars the web bundle reads: `VITE_API_URL` (api.ts),
  `VITE_REALTIME_URL` + `VITE_REALTIME_ANON_JWT` (realtime.ts),
  `VITE_TUNNEL_HOST` (untouched — root plan decision log).
  `turbo.json` (`@cambio/web#build`, lines 65–75) hashes the first three
  in its `env` array; `apps/web/test/env-declaration.test.ts` ("the
  @cambio/web#build hashed env array declares %s" and "the dev
  passThroughEnv array declares %s") pins each var in **both** the
  build `env` array and the `dev` `passThroughEnv` array — any rename
  must touch realtime.ts, turbo.json (both arrays), and that test's
  `VITE_VARS` list in one commit.
- Monorepo build: `@cambio/web` depends on `@cambio/contracts` (exports
  `./dist` — must be **built** first) and `@cambio/ui` (exports raw
  `./src` — vite transpiles it). A naive `pnpm --filter @cambio/web build`
  fails on a clean checkout; the correct shape is
  `pnpm turbo run build --filter=@cambio/web...` (the `...` pulls
  workspace dependencies into the build graph). Root `package.json`:
  `packageManager: pnpm@9.0.0`, `engines.node >=22.0.0 <23`, `.nvmrc`
  is `22`, `turbo@2.10.8` is a root devDependency.

**Plan-time discipline (both rules verbatim):**

"The Contract coverage table stays test-nameless at plan time — rows
hold clause → planned approach; /implement fills file, test name, and
assertion phrase as each test actually lands — invented test titles
become review findings."

"Code sketches (signatures, DDL, exports) are advisory — the coverage
table and module layout are the artifacts reconciled against as-built
code."

## Plan of work

Ordered so each step leaves the repo compiling and the gate green. F1 is
main-lane and independent of F2–F4 (task-branch); F5 is dashboard-only
and can happen any time after F1 (root plan M0/M3).

### F1 — `vercel.json` at the repo root (MAIN LANE, ADR-0043)

**File created:** `/vercel.json` (repo root). Committed directly to
`main`, then merged down `main` → `development` → `release-v0`
(ADR-0028 guard rail: diff against `release-v0` first — the file exists
on no branch today, so this is trivially clean).

The Vercel project is a **repo-root project** (Root Directory left
unset), because Vercel reads `vercel.json` from the project's root
directory and ADR-0043 places the file at the repo root. That makes the
build a root-orchestrated turbo build with the output directory pointing
into `apps/web`'s static output. (The root plan's M0 sketch says "root
directory `apps/web`" — this plan supersedes that line; see Surprises.)

Advisory sketch of the full file (drift expected; the constraints in
prose below are what must hold):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "installCommand": "corepack enable && pnpm install --frozen-lockfile",
  "buildCommand": "pnpm turbo run build --filter=@cambio/web...",
  "outputDirectory": "apps/web/dist/client",
  "ignoreCommand": "[ \"$VERCEL_GIT_COMMIT_REF\" != \"development\" ]",
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://<render-service>.onrender.com/:path*"
    },
    { "source": "/:path*", "destination": "/_shell.html" }
  ]
}
```

Constraints that must hold whatever the final syntax:

- **The `/api` rewrite strips the prefix** (root contract C5): source
  `/api/:path*`, destination `https://<render-host>/:path*` — api
  routes live at root (`/health`, `/lobbies`, …). The Render hostname is
  captured during root-plan M0 provisioning and embedded literally; it
  is a public hostname, not a secret, so committing it is fine.
- **Rewrite order matters and Vercel is filesystem-first**: static files
  in `outputDirectory` are served before rewrites are consulted (so
  `/assets/*.js` never hits a rewrite), then rewrites evaluate in array
  order — the `/api` rule must precede the SPA catch-all, and the
  catch-all sends every non-file, non-api path to `/_shell.html` (the
  shell F2 emits). Root plan F7 flags rewrite-evaluation-order vs
  framework routing as the top deployment risk: the **first** post-deploy
  probe is `GET /api/health` (see Concrete steps).
- **`framework: null`** — no framework preset. The deployment is pure
  static output + rewrites; a preset (e.g. Vite) would guess an
  `outputDirectory` of `dist` and could inject its own routing.
  There must be **zero serverless functions** in the deployment (C7).
- **`ignoreCommand`** enforces "previews disabled" in git rather than
  only in the dashboard: exit 0 (skip build) for any ref that is not
  `development`, exit 1 (build) for `development`. Production branch =
  `development` is still set in the dashboard (F5).
- **Build settings live in the file, not the dashboard**, so the
  system-of-record drift surface shrinks to env vars + git settings.
  `installCommand` runs at the repo root (pnpm 9 via corepack per
  `packageManager`); `buildCommand` is the turbo-orchestrated build so
  `@cambio/contracts` is built before `@cambio/web` (the naive filter
  fails — see Context).

No app code rides this commit (ADR-0043: the carve-out is not a license
to land application code on `main`).

### F2 — SPA/static build mode in `apps/web/vite.config.ts` (TASK BRANCH)

**File edited:** `apps/web/vite.config.ts`. The one-line-shaped change
(advisory sketch): `tanstackStart()` → `tanstackStart({ spa: { enabled: true } })`,
with a comment citing ADR-0041 and the shell-emission mechanics.

What the installed plugin (verified, see Context) does with this:
prerender is forced on, the `maskPath` (`"/"`) route is rendered
**shell-only** (the `TSS_SHELL` header renders the root document without
route content), and the result is written to `dist/client/_shell.html`.
Defaults are kept: `maskPath: "/"`, `prerender.outputPath: "/_shell"` —
the F1 catch-all rewrite targets exactly `/_shell.html`, so if
`/implement` changes either, both files change together.

Two facts to carry into validation so review doesn't misread C7:

- `dist/server/` **still exists after the build** — the plugin boots the
  server build once, at build time, to prerender the shell. That is not
  a C7 violation: the deployed artifact is `outputDirectory`
  `apps/web/dist/client` only, and C7's claim is that the **deployed**
  app has no server runtime. The proof is that `dist/client` alone,
  served by a dumb static file server, loads and hydrates (commands
  below).
- Shell prerendering executes the root document render at build time.
  All data fetching lives in client-side `useQuery`/effects (ADR-0041
  context: zero SSR features), and `realtime.ts` hard-guards against
  server-side construction, so the shell render performs no I/O. If the
  prerender step surprises us (it fetches `http://localhost/` against
  the booted server), that lands in Surprises with the failure output.

`routeTree.gen.ts` / route files are untouched — SPA mode is a
build-output concern, not a router concern. `turbo.json` needs no output
changes (`dist/**` already covers `dist/client/_shell.html`).

Sanity check for this step: the local static-build verification block in
Concrete steps (shell exists, static serve renders). The gate stays
green — no test currently asserts the absence of `_shell.html`.

### F3 — `VITE_API_URL` fallback hardening (TASK BRANCH, C11)

**Files edited:** `apps/web/src/services/api.ts`, plus a new/extended
case in `apps/web/test/api.test.ts`.

Change the fallback at `apps/web/src/services/api.ts:39` from
`"http://localhost:3001"` to `""` (same-origin relative), keeping the
`TUNNEL_MODE` ternary intact. Rationale against C11's two allowed
failure shapes: a production build with `VITE_API_URL` missing then
issues **same-origin relative requests** — behind the Vercel proxy those
hit the static host and fail loudly (non-JSON body → the existing
decode/ApiError path throws), and in local dev they hit :3000 and fail
equally loudly — instead of today's silent
`http://localhost:3001`-baked-into-a-prod-bundle. A build-time throw was
considered and rejected: `""` is already a legitimate value of this
const (tunnel mode), the same-origin shape is exactly what the proxy
topology wants long-term, and C11 explicitly blesses this failure mode.
Local dev is unaffected — `.env.example` ships
`VITE_API_URL=http://localhost:3001` and every real `.env` carries it.

Test intent (planned approach only — titles land with `/implement`): a
case that unsets/stubs `VITE_API_URL` and asserts the requested URL is
the bare relative path (e.g. `/me`), never a localhost-prefixed one.
Mechanical note for the implementer: `API_URL` is computed at **module
scope**, so the test must `vi.stubEnv` + `vi.resetModules` and
dynamically re-import `../src/services/api.js` — a plain import sees the
suite-startup env. The existing pins ("sends credentials: include on
every call", "JSON-encodes a POST body and sets the content-type
header") stay green unchanged — their URL assertion is suffix-based.

### F4 — Realtime env rename `VITE_REALTIME_ANON_JWT` → `VITE_REALTIME_APIKEY` (TASK BRANCH, C10)

**Decision (this plan's call, flagged in the root plan's inventory as
"browser realtime key var — name per frontend child"): rename.** The
value is a Supabase **publishable key** (`sb_publishable_…`) in prod and
a self-minted anon JWT locally; it is passed as
`params: { apikey: … }` either way. A var named `ANON_JWT` holding a
publishable key is actively misleading; `VITE_REALTIME_APIKEY` names
what the wire actually calls it. The local flow is value-compatible —
the self-minted JWT simply moves to the new name; no realtime.ts logic
changes, so C10's "local flow unchanged" holds byte-for-byte at the
protocol level.

Every touch point, one atomic commit (the env-declaration test makes a
partial rename a red gate, which is the point):

1. `apps/web/src/services/realtime.ts` — the `import.meta.env` read
   (line 69), the non-empty guard's error message (lines 73–77, which
   names the var and cites ADR-0032 — update the citation to
   "ADR-0032, amended by ADR-0041"), and the surrounding comments
   ("anon JWT is public by design" becomes "the apikey is public by
   design: locally a self-minted anon JWT, in prod the Supabase
   publishable key").
2. `turbo.json` — `@cambio/web#build.env` **and** `dev.passThroughEnv`
   (the test pins both slots independently — they break independently).
3. `apps/web/test/env-declaration.test.ts` — the `VITE_VARS` array.
4. `apps/web/test/realtime.test.ts` — the `vi.stubEnv("VITE_REALTIME_ANON_JWT", …)`
   call inside the F10 degradation case ("degrades legibly on
   empty/whitespace env — no throw, one config error, reconnecting
   reported (F10)") and any assertion matching the error-message text.
5. `.env.example` — rename the key in the web section and document both
   value flavors (local: self-minted JWT with the existing minting
   recipe; prod: `sb_publishable_…`). **Coordination:** the backend
   child plan owns the overall C13 `.env.example` rewrite; both children
   work the same task branch, so whichever lands second reconciles the
   web section (noted in Surprises).

`VITE_REALTIME_URL`'s **value shape** for prod is documentation, not
code: `wss://<ref>.supabase.co/realtime/v1` — no `/socket` suffix
(that's the local container's mount) and no `/websocket` suffix (the
phoenix lib appends it). This lands in the `.env.example` web section
(same C13 half) and in F5's env-var table. `VITE_TUNNEL_HOST` is
untouched (root plan decision log).

Historical references to `VITE_REALTIME_ANON_JWT` in ADR-0032 stay as
written — ADRs are records; the amendment annotation is root-plan M5's
job.

### F5 — Vercel project configuration (DASHBOARD ONLY, system of record)

No commits. Executed during root-plan M0/M3; recorded here because
ADR-0043 makes the plan docs the system of record for dashboard state.

| Setting                                | Value                                                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Team / project                         | `raafeysaeed-1675s-projects` / new project from the GitHub repo                                           |
| Root Directory                         | _(unset — repo root; `vercel.json` lives there, see F1)_                                                  |
| Framework preset                       | Other/none (pinned by `framework: null` in `vercel.json`)                                                 |
| Build / install / output / rewrites    | all pinned in `vercel.json` (F1) — do not also set in the dashboard                                       |
| Node.js version                        | 22.x (matches `engines` and `.nvmrc`)                                                                     |
| Production branch                      | `development`                                                                                             |
| Preview deployments                    | disabled — belt (dashboard Git settings) and suspenders (`ignoreCommand` in F1)                           |
| Env var `VITE_API_URL`                 | `/api` (build-time, production)                                                                           |
| Env var `VITE_REALTIME_URL`            | `wss://<ref>.supabase.co/realtime/v1` (no `/socket`, no `/websocket` — the client lib appends the latter) |
| Env var `VITE_REALTIME_APIKEY`         | `sb_publishable_…` (from the Supabase project created in root M0)                                         |
| Env var `ENABLE_EXPERIMENTAL_COREPACK` | `1` (pins pnpm to `packageManager: pnpm@9.0.0`; harmless if Vercel's lockfile detection already suffices) |

Turbo's strict env mode is why the three `VITE_` vars reach vite at all:
they are declared in `@cambio/web#build.env` (F4 keeps that true through
the rename), and being in the hashed `env` array means a changed value
correctly busts the build cache.

## Concrete steps & validation

**Local static-build verification (after F2, and again after F3/F4):**

```bash
# Build with prod-shaped values (vars are declared in turbo.json env, so
# shell-env injection reaches vite; dummy values are fine locally):
VITE_API_URL=/api \
VITE_REALTIME_URL=wss://example.supabase.co/realtime/v1 \
VITE_REALTIME_APIKEY=sb_publishable_dummy \
pnpm turbo run build --filter=@cambio/web...

# 1. The shell exists (the artifact F1's catch-all rewrite serves):
test -f apps/web/dist/client/_shell.html && echo "shell: OK"

# 2. The shell references only assets that exist in dist/client:
grep -oE '/(assets/[^"]+)' apps/web/dist/client/_shell.html |
  while read -r a; do test -f "apps/web/dist/client$a" || echo "MISSING $a"; done

# 3. Static self-sufficiency — no node server anywhere in the serving path:
python3 -m http.server 8080 --directory apps/web/dist/client &
curl -sf http://localhost:8080/_shell.html | grep -q "<script" && echo "serves: OK"
kill %1
```

Then load `http://localhost:8080/_shell.html` in a browser and confirm
the page renders and hydrates (the home screen appears; api calls fail
against the dumb server — expected, there is no api behind it).
Success signal for C7's local half: page renders from static files
alone. (`dist/server/` existing on disk is expected — build-time
prerender machinery, not deployed; see F2.)

**Per-step gate (bare, never piped — exit code is the verdict):**

```bash
pnpm turbo build typecheck lint test
```

Expected after F3/F4: `apps/web/test/api.test.ts` green including the
new fallback case; `apps/web/test/env-declaration.test.ts` green with
the renamed var in both slots ("the @cambio/web#build hashed env array
declares %s" / "the dev passThroughEnv array declares %s" each running
3 cases); `apps/web/test/realtime.test.ts` green including the F10
degradation case under the new var name.

**Post-deploy smoke (root-plan M4, dashboard/live — run in this order):**

```bash
# FIRST probe — root plan risk F7 (rewrite evaluation order): the api
# rewrite must win over the SPA catch-all and strip the /api prefix.
curl -si https://<vercel-prod>/api/health          # expect the api's health JSON, not shell HTML

# SPA shell serves at / and at a deep client route:
curl -si https://<vercel-prod>/ | head -5           # 200, text/html (shell)
curl -si https://<vercel-prod>/room/anything | head -5   # 200, same shell (catch-all)
```

Then a real browser load of `https://<vercel-prod>/` (renders +
hydrates), and confirm the Vercel deployment shows **zero serverless
functions** (deployment view → Functions: empty) — that plus the static
serve above is C7's evidence. Realtime's live check (C10) rides the
root-plan M4 end-to-end broadcast smoke — a page-load websocket
connection to `wss://<ref>.supabase.co/realtime/v1/websocket` visible in
devtools, no auth error frame.

## Contract coverage

_(maintained by `/implement`, verified by `/review`: one row per
root-plan contract clause this side owns — the test that pins it, or why
none can. Each row must also say **what is asserted**, in one phrase.)_

"The Contract coverage table stays test-nameless at plan time — rows
hold clause → planned approach; /implement fills file, test name, and
assertion phrase as each test actually lands — invented test titles
become review findings."

"Code sketches (signatures, DDL, exports) are advisory — the coverage
table and module layout are the artifacts reconciled against as-built
code."

| Clause                                                                                                                                                                                                                                                                                                                                    | Test (file + name)                                                                                                                                                                                                                                                                                                                                                                | What is asserted                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C5 — planned: rewrite spec in `vercel.json` (F1: `/api/:path*` → Render host with prefix stripped, ordered before the SPA catch-all); no unit test can pin a Vercel-side rewrite — verification is the live `curl /api/health` probe (first M4 smoke, shared with the backend child)                                                      | no unit test possible (Vercel-side rewrite); vercel.json landed on the main lane (commit 659dc3d) — verification remains the live curl /api/health probe (first root-M4 smoke)                                                                                                                                                                                                    | nothing locally assertable; the /api rewrite order + prefix strip is proven live                                                                                                                                    |
| C7 — planned: SPA mode via `tanstackStart({ spa: … })` (F2); pinned locally by the static-build verification block (shell exists, asset closure, static serve renders) and live by the zero-functions deployment check; a repo test asserting `dist` contents is possible but likely overkill — decided at /implement                     | no repo test (decided at /implement: dist-contents assertion is overkill); locally proven 2026-09-08 by the static-build verification block — prod-shaped build emitted dist/client/_shell.html, asset closure clean, python3 http.server served the shell (HTTP 200, 3 script tags)                                                                                              | dist/client alone is a self-sufficient static artifact; live zero-functions check remains for root M4/release day                                                                                                   |
| C10 — planned: env rename to `VITE_REALTIME_APIKEY` (F4) with the cloud URL/key value shapes documented; the existing realtime suite (channel pattern, F10 degradation) re-pins the unchanged local flow under the new name; the cloud connection itself is live-verified in M4 (no jsdom socket possible, ADR-0030)                      | apps/web/test/env-declaration.test.ts — "the @cambio/web#build hashed env array declares VITE_REALTIME_APIKEY" and "the dev passThroughEnv array declares VITE_REALTIME_APIKEY"; apps/web/test/realtime.test.ts — "degrades legibly on empty/whitespace env — no throw, one config error, reconnecting reported (F10)" plus the channel-pattern cases, all under the new var name | the renamed var is declared in both turbo.json slots, and the unchanged local flow (channel pattern, guard degradation) stays green under VITE_REALTIME_APIKEY; cloud connection itself is live-verified in root M4 |
| C11 — planned: fallback `""` in `api.ts` (F3) + a new api.test.ts case stubbing the var away and asserting relative-path requests with no localhost prefix (module re-import required — `API_URL` is module-scope)                                                                                                                        | apps/web/test/api.test.ts — "issues bare same-origin relative requests when VITE_API_URL is missing (C11)" (stubEnv + resetModules + dynamic re-import; existing pins unchanged)                                                                                                                                                                                                  | with VITE_API_URL unset the fetched URL is exactly the bare relative path (/me), never localhost-prefixed                                                                                                           |
| C13 (frontend half) — planned: `.env.example` web section — `VITE_API_URL` prod value `/api`, cloud `VITE_REALTIME_URL` shape (no `/socket`/`/websocket` suffix), renamed `VITE_REALTIME_APIKEY` with both value flavors; prose-only, no assertable pin — proven by review reading the section (backend child owns the file-wide rewrite) | prose-only, no assertable pin — proven by review reading the .env.example web section (rewritten 2026-09-08, reconciled onto the backend lane's C13 rewrite)                                                                                                                                                                                                                      | VITE_API_URL prod value /api, cloud VITE_REALTIME_URL shape (no /socket or /websocket suffix), VITE_REALTIME_APIKEY with both value flavors documented                                                              |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [ ] 2026-09-08 — frontend child plan written (planning phase; no
      implementation yet)
- [x] 2026-09-08 — F2 landed: `tanstackStart({ spa: { enabled: true } })`
      in `apps/web/vite.config.ts` (option names re-verified against the
      installed `@tanstack/start-plugin-core@1.171.26` `spaSchema` before
      writing — `spa.enabled`, `maskPath` default `"/"`,
      `prerender.outputPath` default `"/_shell"`, exactly as planned).
      Local static-build verification passed: build with prod-shaped env
      (`VITE_API_URL=/api`, dummy realtime values) ran client + ssr builds
      then `[prerender] Prerendered 1 pages: /`;
      `apps/web/dist/client/_shell.html` exists; every `/assets/*` path the
      shell references resolves inside `dist/client` (asset closure clean);
      `python3 -m http.server` on `dist/client` served `_shell.html` with
      HTTP 200 and its 3 script tags intact. `dist/server/` exists as
      predicted — build-time prerender machinery only, not deployed.
- [x] 2026-09-08 — F3 landed (TDD): new red-first case in
      `apps/web/test/api.test.ts` ("issues bare same-origin relative
      requests when VITE_API_URL is missing (C11)") via
      `vi.stubEnv` + `vi.resetModules` + dynamic re-import; then the
      fallback at `apps/web/src/services/api.ts` changed
      `?? "http://localhost:3001"` → `?? ""` (TUNNEL_MODE ternary intact).
      Existing pins green unchanged.
- [x] 2026-09-08 — F4 landed (atomic rename, red-first via the
      env-declaration test's `VITE_VARS` flip): `VITE_REALTIME_ANON_JWT` →
      `VITE_REALTIME_APIKEY` across all five touch points —
      `realtime.ts` (read + guard message, citation now "ADR-0032, amended
      by ADR-0041", apikey-flavor comments), `turbo.json`
      (`@cambio/web#build.env` and `dev.passThroughEnv`),
      `env-declaration.test.ts` `VITE_VARS`, `realtime.test.ts` F10 stub,
      and the `.env.example` web section (reconciled in place on top of the
      backend lane's C13 rewrite — `VITE_API_URL` prod value `/api`
      documented, cloud `VITE_REALTIME_URL` shape
      `wss://<ref>.supabase.co/realtime/v1` with the no-`/socket`/
      no-`/websocket` note, both apikey value flavors). ADR-0032's own
      text untouched (historical record; root M5 annotates the index).
- [x] 2026-09-08 — F3 ripple fixed (see Surprises): two test-support
      `new URL` call sites given a base so relative request paths parse;
      all four affected suites re-verified green.
- [x] 2026-09-08 — checkpoint green: `pnpm turbo test --filter @cambio/web`
      exit 0 — 21 files, 282 tests passed. **Full gate green:**
      `pnpm turbo build typecheck lint test` (bare, docker services up)
      exit 0 — "Tasks: 25 successful, 25 total", api suite 130/130 with
      `RealtimeIntegration.test.ts` executing (2 tests), web 282/282.
      Closes M2 for the frontend lane. Contract coverage rows C5/C7/C10/
      C11/C13 filled via `fill-coverage-row.mjs`.

## Surprises & notes for the root plan

- **C7 sequencing gap (needs a root-plan call before M3/M4):** the SPA
  build mode (F2) is app code and rides the task branch → `release-v0`
  lane, but Vercel's production branch is `development`, which today
  equals `main` — whose `apps/web` builds with `tanstackStart()` bare
  and emits **no HTML at all** (`dist/client` is assets-only). So the
  first `development` deploy after M1 cannot serve a page: C5 (proxy)
  is verifiable live, but C7's "the deployed `/` page loads" is not
  until the SPA change reaches `development` (i.e. /release day), or
  the one-line `spa` toggle in `vite.config.ts` is granted the ADR-0043
  main lane (which would need the ADR's app-code exclusion re-read —
  not this plan's call to make silently). Options for the root plan:
  accept C5-now/C7-at-release, or extend the carve-out deliberately.
- **Root plan M0 phrasing superseded:** M0 sketches "root directory
  `apps/web`"; this plan's file-level spec (F1/F5) lands `vercel.json`
  at the **repo root** with Root Directory unset, because Vercel reads
  `vercel.json` from the project root directory and ADR-0043 requires
  the file at the repo root. Same intent (monorepo-aware turbo build,
  static output from `apps/web`), different mechanism.
- **`.env.example` coordination:** F4 renames the realtime key and
  rewrites the web section's realtime/api guidance; the backend child
  owns the file's overall C13 rewrite (including the SameSite
  correction). Same task branch — whichever child lands second
  reconciles the web section instead of clobbering it.
- **Root env inventory can be resolved:** the row "browser realtime key
  var (name per frontend child)" is now `VITE_REALTIME_APIKEY` (F4).
- **Shell path coupling:** F1's catch-all destination `/_shell.html`
  and F2's default `spa.prerender.outputPath` (`/_shell`) are two files
  in two lanes pointing at one name — if either changes, both must.
- 2026-09-08 (implementation) — **prerender behaved exactly as
  predicted, no surprise to record**: the build booted the server build
  once, logged `[prerender] Crawling: /` then
  `[prerender] Prerendered 1 pages: /`, and wrote
  `dist/client/_shell.html`; no I/O was attempted during the shell
  render (all data fetching is client-side effects; realtime.ts's SSR
  guard never fired). `dist/server/` exists post-build as the plan
  documented — build-time machinery, not deployed.
- 2026-09-08 (implementation) — **`.env.example` reconcile executed as
  planned**: the backend lane (commit cb3d886) had already rewritten the
  api section and the SameSite guidance; the frontend lane landed second
  and edited only the three web VITE\_ blocks in place (`VITE_API_URL`
  prod note, cloud `VITE_REALTIME_URL` shape, the
  `VITE_REALTIME_APIKEY` rename with both value flavors) — no clobber.
- 2026-09-08 (implementation) — **F3 ripple the plan missed: the shared
  test harness broke, 132 jsdom tests red.** The plan checked the
  api.test.ts pins (suffix-based, fine) but not
  `apps/web/test/support/harness.tsx`, whose `stubApi` keyed handlers via
  `new URL(String(input))` — valid only while `API_URL` made every
  request absolute. With the C11 fallback `""` (vitest's env carries no
  `VITE_API_URL`; only turbo injects the repo `.env`), requests became
  bare relative paths and `new URL("/me")` without a base throws, so
  every harness-driven suite failed at render (game-screen, room-screen,
  lobby-screen, slam-expiry-nudge — 132 tests). Evidence: first
  `pnpm turbo test --filter @cambio/web` run,
  "TestingLibraryElementError: Unable to find an element with the text:
  Nadia" with `TypeError: Invalid URL: /me` upstream. Fix: give
  `new URL` a base — `new URL(String(input), "http://localhost")` —
  absolute URLs ignore the base, so both request shapes key on pathname;
  two call sites (`test/support/harness.tsx` `stubApi`, and
  `test/game-screen.test.tsx` `postedCommands`), no production code
  changed. All four suites green after (game-screen 103/103).
  `realtime.test.ts` stays green under either var name (its whitespace
  URL stub trips the guard regardless of the apikey var), so the
  red-first proof of the rename rode the env-declaration test's
  `VITE_VARS` flip (2 red cases: both turbo.json slots), which is
  exactly the "partial rename = red gate" property F4 wanted.
