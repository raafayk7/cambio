# CAM-17 — Lobby + room screens (frontend)

- **Root plan:** [root/CAM-17.md](../root/CAM-17.md) — the functional
  contract lives there; this document is implementation detail for the
  frontend side: clauses **W1–W4, L1–L4, R1–R7, S1–S2**, plus the frontend
  halves of the env plumbing (ADR-0032).

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

### What exists

`apps/web` is TanStack Start (file-based routes in `apps/web/src/routes/`,
`routeTree.gen.ts` is generated — never hand-edit) + TanStack Query with a
**per-request QueryClient** (`apps/web/src/router.tsx:11` — per-player
views; never introduce a module-level or shared cache). Exactly one fetch
exists today: the `/health` smoke check in `apps/web/src/routes/index.tsx`
(no options, no credentials). Its `data-testid="health-status"` has no
other consumers (grepped) — the lobby replaces this route wholesale.

The component layer is complete (CAM-15): 17 generic components in
`packages/ui/src/components/`, 9 game objects in
`apps/web/src/components/game/`, all demoed in `/dev/components`
(`apps/web/src/components/gallery/`). **Screens compose only from these**;
anything missing is a creation-gate stop, never an invention. The
gallery's drafted room-list copy in `gallery/generic.tsx` stays unused —
join is share-link only (root Decision Log).

There is **no data layer**: no `services/`, no `hooks/`, no realtime
dependency, no `credentials: "include"` anywhere. This task builds it
(M3) and CAM-18 reuses it wholesale.

### Laws that govern this side

- `frontend-architecture` — projection renderer; pages → containers →
  components; logic in custom hooks co-located with their surface;
  `apps/web` imports `contracts` + `ui` only; `packages/ui` gets zero app
  knowledge (S1/S2 are styling/structure fixes, nothing app-shaped).
- `hidden-information` — everything this task renders is public (lobby
  membership, names), but the discipline still binds: all data arrives
  via contracts-decoded API responses and Broadcast events; grants are
  capabilities — held in memory, never rendered, never logged. No
  Supabase DB access of any kind (`@supabase/realtime-js` only, per
  ADR-0032 — never `supabase-js`).
- `design-system` — entered through `design-system/design-system.md`.
  Scenes per `patterns/scenes.md` (lobby → full illustrated courtyard;
  room waiting → table + paving; forms → plain cream). Page states per
  `patterns/screen-states.md` (the 8-state MVS row — ledger below).
  Forms per `patterns/forms.md` (field-scaffold, validate on submit,
  re-validate on blur, submit failure → alert above footer). Copy per
  `references/voice.md` ("room" never "lobby" in copy; sentence case
  functional UI; lowercase display only for ambient flavor; errors say
  what went wrong then the fix).
- ADR-0027 — every visual value is a token utility; Tailwind v4 emits
  nothing for unknown utilities (silent failure — grep + eyes).
  Numeric utilities are the ORDINAL scale (`p-5` is 24px).
- ADR-0030 — tests on jsdom + testing-library + user-event; vitest
  globals OFF (import from `"vitest"`); setup files already exist
  (`apps/web/test/setup.ts`, `packages/ui/test/setup.ts`); assert
  behavior/structure, never pixels.
- ADR-0032 — realtime via `@supabase/realtime-js` with static build-time
  `VITE_REALTIME_URL` + `VITE_REALTIME_ANON_JWT`; both must be declared
  in `turbo.json` (strict env mode strips undeclared vars) and listed in
  `.env.example`.

### TS/config constraints (bite if forgotten)

- `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` are ON —
  follow the conditional-spread idiom (see
  `packages/ui/src/components/app-shell.tsx:44`).
- No path aliases: relative imports with explicit `.js` extensions.
- `envDir` is the repo root; Vite reads `.env` there.

### Wire surface consumed (shapes from root M1/M2 — frozen before screens)

| Call                          | Response (decode through contracts)                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| `GET /me`                     | `SessionUser` (`decodeSessionUser`); 401 = unauthenticated                                           |
| `POST /users`                 | 201 `SessionUser` + sets `cambio_session` cookie                                                     |
| `POST /lobbies`               | 201 `LobbyResponse` `{ lobby, version, grants }`                                                     |
| `GET /lobbies/:gameId`        | 200 same shape (C5) for members; 404 otherwise (B2, no leak)                                         |
| `POST /lobbies/:gameId/join`  | 200 `LobbyResponse`; 409 full/started; 404 unknown                                                   |
| `POST /lobbies/:gameId/leave` | 200 `LeaveLobbyResponse` (no grants)                                                                 |
| `POST /lobbies/:gameId/start` | 200 `GameReply`; 409 non-member; 422 `BadPlayerCount`                                                |
| Realtime `grants.roomTopic`   | pre-game `LobbyUpdated` (C3, tagged, carries `version`); in-game `RoomGameEvent` incl. `GameStarted` |
| Realtime `grants.playerTopic` | silent pre-game; subscribed anyway so CAM-18 inherits the wiring                                     |

Error bodies are `{ error: { tag, message } }` (`decodeErrorBodyEither`).
After C1, `LobbyView.members` is `{ id, name }[]` — names render straight
from the projection; no client-side lookups or joins, ever.

The realtime client pattern is pinned by
`apps/api/test/RealtimeIntegration.test.ts`:
`new RealtimeClient(url, { params: { apikey: jwt } })`, then
`client.channel(topic).on("broadcast", { event: "*" }, handler)` +
`channel.subscribe(statusCallback)`. Locally the URL is
`ws://realtime-dev.localhost:4000/socket` (tenant from the hostname's
first label — bare `localhost` 404s).

## Module layout

This table (plus the coverage table) is what close-out reconciles against
as-built code. All paths under `apps/web/src/` unless noted.

| File                                       | Status  | Purpose                                                                                                                                                                                            |
| ------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `services/api.ts`                          | new     | fetch wrapper: `VITE_API_URL` base, `credentials: "include"`, contracts decode at the edge, typed `ApiError` from the error body (W1)                                                              |
| `services/realtime.ts`                     | new     | browser-only lazy `RealtimeClient` singleton (ADR-0032 env), subscribe/unsubscribe helpers, connection-status source (W3)                                                                          |
| `hooks/use-session.ts`                     | new     | identity: `GET /me` query (401 → unauthenticated, not error), `POST /users` mutation that seeds the cache so the app is authenticated without reload (W2). Shared — lobby and room both consume it |
| `hooks/use-connection.ts`                  | new     | connected-vs-reconnecting state derived from the realtime socket/channel status; feeds AppShell (W4)                                                                                               |
| `components/identity/name-form.tsx`        | new     | presentational name form (field-scaffold + text-field + primary button), forms.md recipe; props in, callbacks out                                                                                  |
| `containers/lobby/lobby-screen.tsx`        | new     | lobby container: session state, create-room mutation, join-by-link (L1, L2)                                                                                                                        |
| `containers/lobby/parse-room-link.ts`      | new     | pure parser: room URL or bare UUID → gameId or null (unit-testable, no DOM)                                                                                                                        |
| `containers/room/room-screen.tsx`          | new     | room container: bootstrap + join-on-visit, member seats, share/start/leave, live updates (R1–R5, R7)                                                                                               |
| `containers/room/use-room.ts`              | new     | co-located hook: `GET /lobbies/:gameId` bootstrap, 404 → join fallback, `LobbyUpdated`/`GameStarted` subscription, refetch-on-reconnect (R2–R5)                                                    |
| `routes/index.tsx`                         | replace | lobby page — picks `LobbyScreen`, declares the courtyard scene (L1, L3)                                                                                                                            |
| `routes/room.$gameId.tsx`                  | new     | room page — `createFileRoute("/room/$gameId")`, picks `RoomScreen`                                                                                                                                 |
| `routes/game.$gameId.tsx`                  | new     | placeholder game route: design-system-composed holding state (R6)                                                                                                                                  |
| `packages/ui/src/components/app-shell.tsx` | edit    | S2 `relative` root; courtyard scene wiring after the gate round (L3)                                                                                                                               |
| `packages/ui/src/components/button.tsx`    | edit    | S1 padding revision (with `design-system/components/core/button.md` → r2)                                                                                                                          |
| `packages/ui/src/styles.css`               | edit    | S1 comment sync, S2 `safe-area-shell` bottom inset, L3 `scene-courtyard` utility                                                                                                                   |
| `.env.example`, `turbo.json`               | edit    | `VITE_REALTIME_URL`, `VITE_REALTIME_ANON_JWT` — env array of `@cambio/web#build` **and** dev `passThroughEnv` (ADR-0032)                                                                           |
| `apps/web/package.json`                    | edit    | add `@supabase/realtime-js` (runtime dep; the only realtime package)                                                                                                                               |

Container/hook placement follows the co-location rule: `use-room.ts` sits
beside its one consumer; `use-session.ts`/`use-connection.ts` are shared
because two surfaces need them from day one. Containers live outside
`routes/` so the file-based router never picks them up.

## Plan of work

Ordered; each step leaves the repo compiling and green. Steps 1–4 are
root M3, 5–8 root M4, 9–11 root M5, 12 root M6. Steps 1–2 can start
against today's contracts; steps 8+ need M1 (C1/C3/C5) and step 9 needs
M2 (B1) — coordinate with the backend lane before wiring the room screen.

1. **Env + dependency plumbing (ADR-0032).** Add `VITE_REALTIME_URL` and
   `VITE_REALTIME_ANON_JWT` to `.env.example` (with the
   realtime-dev.localhost caveat and a note that the JWT is minted by an
   operator, public by design) and to `turbo.json`: the `env` array of
   `@cambio/web#build` and the dev task's `passThroughEnv` (today only
   `VITE_API_URL` appears in both). Add `@supabase/realtime-js` to
   `apps/web` dependencies. Pin the declaration per the ADR's warning:
   a small vitest test in `apps/web/test/` that reads the raw
   `turbo.json` text (it has comments — no `JSON.parse`) and asserts
   both variable names appear; cheap insurance against silent stripping.

2. **API client (`services/api.ts`) — W1.** One function in the spirit of
   the existing smoke fetch, generalized: takes path, method, optional
   body, and a contracts decoder; always sends `credentials: "include"`
   (the httpOnly `cambio_session` cookie must cross 3000→3001; CORS is
   already `credentials: true`); returns the decoded value. Non-2xx:
   decode the body with `decodeErrorBodyEither` into a typed `ApiError`
   carrying `status`, `tag`, `message` (fallback for undecodable
   bodies). Decode failures on 2xx throw too — undecodable responses
   surface as query/mutation errors, never as silently-wrong state.
   Tests mock `fetch` and assert the credentials option, the decode
   path, and the error mapping. Advisory sketch — the coverage table is
   what gets reconciled.

3. **Identity (`hooks/use-session.ts` + `components/identity/name-form.tsx`) — W2.**
   The hook wraps a `["me"]` query on `GET /me` where a 401 resolves to
   "unauthenticated" data rather than an error (so error state means
   _broken_, not _new visitor_), plus a `POST /users` mutation that
   writes the created `SessionUser` into the `["me"]` cache on success —
   the app behaves authenticated without a reload. No rename in v0: the
   form only ever shows when unauthenticated. `NameForm` is
   presentational per forms.md: field-scaffold label/error, validate
   1–32 chars on submit, re-validate on blur, never on first keystroke;
   server 400s land as the field/submit error (voice.md error style).
   Primary label is a verb phrase — `Deal me in` is voice.md's own
   example for this moment (final copy at implement, per voice.md).

4. **Realtime (`services/realtime.ts` + `hooks/use-connection.ts`) — W3, W4 (hook half).**
   Module-lazy `RealtimeClient` built from the two ADR-0032 env vars,
   created only in the browser (TanStack Start SSRs the first render —
   no socket on the server; all subscriptions live in effects). Follow
   the `RealtimeIntegration.test.ts` pattern verbatim for channel
   setup. Expose: `subscribeTopic(topic, onEvent, onStatus)` returning
   an unsubscribe, and a connection-status source the
   `use-connection.ts` hook adapts to `"connected" | "reconnecting"`
   for AppShell. `@supabase/realtime-js` reconnects with backoff on its
   own; on re-subscribe after a drop the room hook refetches its query
   (step 9) so missed broadcasts are absorbed — recovery without
   reload. Design the service so tests can inject a fake client
   (constructor injection or a setter) — jsdom never opens sockets.

5. **S1 — button canon padding revision (before any screen is gated).**
   User-approved canon change; `design-system/components/core/button.md`
   and the executable mirror move together. Today's box is ~43px (15px
   text × 1.5 + 2 × 8px `py-2` + 2 × 2px border — the CAM-15 hardcheck
   advisory). **Mechanism decided at plan sign-off: a 44px minimum
   control height in the canon**, keeping the `space.2` × `space.5`
   padding as-is — exact gate compliance with the smallest visual shift
   and no off-scale spacing values (the rejected alternative, `space.3`
   vertical padding, lands at ~50px). Bump button.md to r2 with a
   Revisions entry adding the min-height rule; update
   `packages/ui/src/components/button.tsx` base classes (a `min-h-11`
   equivalent via the token layer — exact utility at implement, no
   hardcoded pixel value outside the canon-cited component CSS).
   Deliberately untouched: the icon variant's own `p-2` square and the
   toggle — separate canon, not user-approved here. Verify: both suites
   green, gallery eyeballed, rendered hardcheck re-run showing shared
   controls ≥ 44px.

6. **S2 — AppShell execution fixes (packages/ui, no canon change).**
   (a) The shell root (`packages/ui/src/components/app-shell.tsx:62`)
   lacks `relative` while `state="game"` renders absolute controls —
   add it, then delete the gallery's compensating `relative` wrapper on
   the game StateCard (`apps/web/src/components/gallery/generic.tsx:635`)
   so the fix is proven where the workaround lived. (b) The
   `safe-area-shell` utility (`packages/ui/src/styles.css:336`) pads
   top/left/right only — add `padding-bottom: env(safe-area-inset-bottom)`
   per app-shell.md's own-hand dock rule. A jsdom test can pin (a)
   structurally (positioned root when game controls render); (b) is
   CSS-only — pinned by inspection + the gate's rendered pass, noted in
   the coverage table as non-vitest.

7. **L3 — courtyard illustration, creation-gate round.** The pattern
   exists (scenes.md: lobby = full illustrated courtyard) but the asset
   does not — AppShell's `courtyard` falls back to plain cream today.
   Procedure per the gate: **STOP**, name the gap (asset + a
   `scene-courtyard` ground utility + AppShell wiring; closest existing:
   the `scene-paving` utility at `packages/ui/src/styles.css:328`), wait
   for the user's explicit go, then produce the asset within scenes.md
   law — flat ink + paper grain, no photos, no gradients, no
   depth-of-field; dusk reserved for the dark theme; **scene art never
   carries information**. Wire it as the `courtyard` branch of the
   shell's ground selection, update app-shell.md's Revisions (its open
   gap closes) and scenes.md/extensions index as the gate procedure
   requires. Likely form: an SVG asset in `packages/ui` referenced by
   the utility — but the gate round decides; nothing here pre-empts it.

8. **Lobby screen — L1, L2, L4.** Replace `routes/index.tsx`: the route
   picks `LobbyScreen` inside `AppShell scene="courtyard"`. The
   container renders, per session state: skeleton (resolving `/me`,
   Loading's 300ms no-flash), `NameForm` (unauthenticated — the
   screen's first-use moment), or the authenticated lobby: greeting
   (lowercase-display flavor register), a create-room primary, and the
   join-by-link field. Create room: `POST /lobbies`, decode
   `LobbyResponse`, navigate to `/room/$gameId` (the room screen
   re-bootstraps via B1 — one uniform entry path; the create response's
   grants are not smuggled through navigation state). Join-by-link:
   `parse-room-link.ts` accepts a full room URL or a bare UUID
   (client-side only), navigates on success, field error per voice.md
   on garbage. Forms sit on plain cream panels per forms.md (no scene
   art behind fields) — the courtyard is the screen's ground, the form
   surfaces are panels on it. MVS sweep per the ledger below.

9. **Room bootstrap + join-on-visit (`containers/room/use-room.ts`) — R2, R3.**
   New route `routes/room.$gameId.tsx` → `RoomScreen`. The hook's
   bootstrap: query `GET /lobbies/:gameId` (decode the C5 schema).
   200 → member, done (R3: reload recovers members, status, grants).
   404 → not (yet) a member: if unauthenticated, render `NameForm`
   in-place — the route never changes, so the target room is never
   lost; once authenticated, `POST join`. Join outcomes: 200 → seed the
   query with the returned `{ lobby, version, grants }`; 409 full and
   404 unknown → the no-access recipe (plain cream panel: what this is,
   why you can't enter, where to go). On a 409 already-started refusal,
   first call `GET /games/:gameId/view`: 200 → this visitor is a player
   of the started game (including a member who missed `GameStarted`
   while away) — navigate to `/game/$gameId`; 404 → true outsider →
   no-access panel (root R2, added at plan reconciliation). Keep the
   latest seen `version` to guard against stale event application —
   `LobbyUpdated` carries `version` (C3, reconciled), so broadcasts
   older than the last-seen version are discarded.

10. **Room live view + actions — R1, R4, R5, R7.** Loaded state: room
    (waiting) scene — `AppShell scene="paving"` with `TableSurface`
    `state="seating"`, one `Seat` per member in join order (names from
    the C1 projection, `own` for the viewer, `viewerSeatIndex` set);
    share affordance (the room URL + copy via `navigator.clipboard`,
    success Toast, sentence case); start and leave buttons. Subscribe
    `grants.roomTopic` + `grants.playerTopic` (effect-scoped,
    unsubscribe on unmount): decoded `LobbyUpdated` → update the
    `["lobby", gameId]` query data only when `event.version` exceeds the
    last-seen version (no polling); `status` no longer
    `"open"` → the room-closed panel (abandoned lobby, R4);
    `GameStarted` → navigate to `/game/$gameId` (R5 auto-navigate).
    On re-subscribe after a connection drop, refetch the query (absorbs
    missed events). Start: any member may try (no host concept); the
    affordance's helper copy states the 2–5 rule but the **server
    decides** — a 422 `BadPlayerCount` (or 409) surfaces as an inline
    alert per forms.md, no client-side rule enforcement (projection
    renderer: reflect, don't re-implement). On success the starter
    navigates. Leave: `POST leave` (decode `LeaveLobbyResponse` — no
    grants), drop subscriptions, navigate `/` (R7). Connection state
    from `use-connection.ts` drives AppShell `state="reconnecting"` —
    the alert renders under the header and the seat view stays live
    (W4).

11. **Placeholder game route — R6.** `routes/game.$gameId.tsx`: AppShell
    - a holding state composed purely from registered components
      (Loading with a lowercase-display flavor line — `shuffling…` is
      voice.md's own example; final copy at implement). No game logic, no
      view fetch — CAM-18 replaces the content. It must render, not 404.

12. **M6 frontend share — audits.** Design-gate (`/gate`) on both
    screens' rendered states; `ai-tells` audit on every new surface;
    impeccable pass per screen. Verdicts advisory; the design system
    outranks all three — conflicts (cream paper, poster face) get
    surfaced in this doc, never auto-fixed. Then the bare full gate and
    the two-browser walkthrough (root acceptance criteria).

Testing approach for containers: wrap in a memory-history test router
(TanStack's `createRouter` + `RouterProvider`) with a fresh QueryClient
per test, mock `fetch` at the service seam, inject the fake realtime
client. jsdom per ADR-0030; query by role/label, `data-*` for structural
facts; user-event for the forms.

## Page-state ledger (L4 — the 8-state MVS answered per screen)

Recipes from `design-system/patterns/screen-states.md`. "Built" rows get
realizations; N/A rows carry their justification — nothing silently
skipped.

### Lobby (`/`)

| State            | Call         | Realization / justification                                                                                                                                                       |
| ---------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| loaded           | built        | courtyard scene, identity block, create + join-by-link                                                                                                                            |
| first-load       | built        | skeleton matching the identity/action layout while `GET /me` resolves (Loading's 300ms no-flash)                                                                                  |
| first-use empty  | built        | the unauthenticated state IS first use: `NameForm` with onboarding energy + the primary action                                                                                    |
| no-results empty | N/A          | no list, no filter — join is share-link only (root Decision Log); nothing can produce "no matches"                                                                                |
| page error       | built        | `GET /me` network/5xx failure → full-region alarm alert + retry; shell stays                                                                                                      |
| partial failure  | N/A          | single data region (`/me`); mutation failures are the forms.md submit-failure alert, not a page partial                                                                           |
| no-access        | N/A          | the lobby is the public root; there is no access boundary to deny                                                                                                                 |
| reconnecting     | built (idle) | wired via AppShell `connection`/`state` from `use-connection.ts`; the lobby holds no subscription in v0, so the state cannot trigger here — exercised for real on the room screen |

### Room (`/room/$gameId`)

| State            | Call  | Realization / justification                                                                                                                                                                        |
| ---------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| loaded           | built | paving scene, TableSurface seating, seats by name, share/start/leave                                                                                                                               |
| first-load       | built | skeleton matching the seat-list layout while bootstrap (GET, or join) resolves                                                                                                                     |
| first-use empty  | N/A   | a room always contains at least the viewer once loaded; the one-member room is the loaded state (share affordance carries the inviting energy)                                                     |
| no-results empty | N/A   | no list to filter                                                                                                                                                                                  |
| page error       | built | bootstrap network/5xx failure → full-region alarm alert + retry                                                                                                                                    |
| partial failure  | N/A   | one data source (lobby view + its event stream); a degraded stream is precisely the reconnecting state, and screen-states.md forbids page-error for partials — nothing else can partially fail     |
| no-access        | built | join refusals: full / unknown / abandoned / already-started-outsider → plain cream panel: what, why, where to go (an already-started **player** is redirected to `/game/$gameId` instead — step 9) |
| reconnecting     | built | alert under the header, seat view stays live and current-as-of; refetch on recovery restores without reload (W4)                                                                                   |

### Game placeholder (`/game/$gameId`)

Holding state only (R6): loaded is the composed holding state;
first-load is indistinguishable from it (same skeleton register); all
other states are N/A until CAM-18 builds the real screen — recorded here
so CAM-18 inherits the open ledger, not a silent skip.

## Concrete steps & validation

- Per-package suites (turbo builds deps first — never the bare package
  script): `pnpm turbo test --filter @cambio/web` and
  `pnpm turbo test --filter @cambio/ui`. Baseline before S1/S2: 26
  tests in `apps/web/test/`, 15 in `packages/ui/test/` — all must stay
  green through the canon revision.
- Single-suite iteration after a build: `npx vitest run test/<file>`
  inside the package.
- S1 verification: re-render the gallery and re-run the design-gate
  hardcheck (from `.agents/scripts/design-gate/`, one-time setup:
  `npm install --omit=dev` + `npx playwright install chromium`) —
  shared control box ≥ 44px, no new constraint fails.
- Realtime + walkthrough:
  `docker compose -f docker/docker-compose.yml up -d`, migrations
  applied, `.env` carrying the two new VITE vars, then `pnpm dev` — two
  browsers (one private window): name → create → copy link → second
  browser: name → auto-join → member lists update live both sides →
  start → both land on `/game/:gameId`; reload `/room/:gameId` mid-lobby
  and recover (R3); kill the realtime container mid-room to see
  reconnecting, restart it to see recovery (W4).
- Final gate, run **bare, never piped**:
  `pnpm turbo build typecheck lint test`.

## Contract coverage

_(maintained by `/implement`, verified by `/review`. **Plan-time rule:**
only the Clause column and a planned-approach note are filled here; test
file, name, and assertion phrase are written by `/implement` as each test
lands — invented test titles become review findings.)_

| Clause | Test (file + name)                                                                                                                                                                                                                                                                                                             | What is asserted         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| W1     | _planned: service-level jsdom tests, mocked fetch — credentials option on every call; 2xx decode; error-body mapping; undecodable 2xx surfaces as an error. Plus the turbo.json env-declaration pin (step 1)_                                                                                                                  | _(filled by /implement)_ |
| W2     | _planned: container tests — 401 renders the name form; valid submit POSTs and the UI flips to authenticated without remount/reload; 400 renders the field error per forms.md_                                                                                                                                                  | _(filled by /implement)_ |
| W3     | _planned: fake-client injection tests — granted topics subscribed with the pinned channel pattern; unsubscribe on unmount; connection status exposed_                                                                                                                                                                          | _(filled by /implement)_ |
| W4     | _planned: room container test — status forced to reconnecting renders the alert under the header while the member list stays rendered; recovery flips back and triggers a refetch. (AppShell's own reconnecting render is already pinned in packages/ui)_                                                                      | _(filled by /implement)_ |
| L1     | _planned: lobby container tests per session state (form / greeting+actions); parse-room-link pure unit tests (full URL, bare UUID, garbage → null)_                                                                                                                                                                            | _(filled by /implement)_ |
| L2     | _planned: container test — create success navigates to the new room route (memory router)_                                                                                                                                                                                                                                     | _(filled by /implement)_ |
| L3     | _non-vitest: creation-gate round recorded in Progress + root Decision Log; visual verification via gallery/gate rendered pass; jsdom cannot see the asset_                                                                                                                                                                     | _(filled by /implement)_ |
| L4     | _planned: the ledger above, held by the per-state container tests where mechanical (skeleton, error, no-access) and by this document for the N/A calls_                                                                                                                                                                        | _(filled by /implement)_ |
| R1     | _planned: room container test — every C1 member rendered by name in join order, own seat marked, share/start/leave affordances present_                                                                                                                                                                                        | _(filled by /implement)_ |
| R2     | _planned: container tests — GET 404 then join success renders the room; 409 full and 404 unknown render the no-access panel; 409 already-started with view-GET 200 navigates to the game route, with view-GET 404 renders no-access; unauthenticated visitor sees the name form on the room route (URL unchanged), then joins_ | _(filled by /implement)_ |
| R3     | _planned: container test — mount with GET 200 renders the full room from the bootstrap alone (no join call); manual reload in the walkthrough_                                                                                                                                                                                 | _(filled by /implement)_ |
| R4     | _planned: fake-client broadcast of a tagged LobbyUpdated updates the member list without refetch; a non-open status renders the room-closed panel_                                                                                                                                                                             | _(filled by /implement)_ |
| R5     | _planned: start success navigates the starter; a GameStarted broadcast navigates a non-starter; a 422 BadPlayerCount renders the inline alert (2–5 copy)_                                                                                                                                                                      | _(filled by /implement)_ |
| R6     | _planned: route/component test — the placeholder renders the holding state (registered components), not a 404_                                                                                                                                                                                                                 | _(filled by /implement)_ |
| R7     | _planned: leave POSTs, drops subscriptions (fake-client spy), navigates to `/`_                                                                                                                                                                                                                                                | _(filled by /implement)_ |
| S1     | _planned: non-vitest — button.md r2 + hardcheck rendered measurement ≥ 44px recorded in Progress; existing packages/ui + apps/web suites stay green as the regression pin_                                                                                                                                                     | _(filled by /implement)_ |
| S2     | _planned: jsdom structural test for the positioned shell root under `state="game"`; the safe-area bottom inset is CSS-only — pinned by inspection + gate rendered pass, recorded in Progress_                                                                                                                                  | _(filled by /implement)_ |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [ ] 2026-09-05 — frontend child plan written; implementation not started

## Surprises & notes for the root plan

- **Started-lobby reload edge — RESOLVED at plan reconciliation:** the
  409 already-started join refusal now falls back to
  `GET /games/:gameId/view` (existing endpoint) — 200 auto-redirects a
  player of the started game to `/game/$gameId`; 404 shows the outsider
  no-access panel. Root R2 amended; step 9 carries the mechanism.
- **Reconnecting on the lobby is structurally wired but untriggerable**
  in v0 (no subscription exists there) — recorded as a justified
  idle-realization in the ledger, not a skip. If a future task gives
  the lobby live data, the wiring is already in place.
- **The 44px mechanism — RESOLVED at plan sign-off:** min-height 44px in
  the canon, padding untouched (user call; `space.3` padding rejected as
  ~50px). Step 5 carries the mechanism.
- **`LobbyUpdated` staleness guard — RESOLVED at plan reconciliation:**
  the C3 schema carries `version` (backend child plan, shape table); the
  client applies broadcasts only when newer than the last-seen version.
- Reconciled against `docs/plans/backend/CAM-17.md` (2026-09-05): wire
  shapes in the table above match its frozen shape table, including the
  C3 version field and C5's reuse of `LobbyResponse`.
