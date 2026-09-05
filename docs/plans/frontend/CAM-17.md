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
  the conditional spreads in `packages/ui/src/components/app-shell.tsx`).
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
| `routes/index.tsx`                         | replace | lobby page — one-line picker for `LobbyScreen`; the container owns its AppShell + courtyard scene (deviation logged in Surprises) (L1, L3)                                                         |
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
   (a) The shell root (`packages/ui/src/components/app-shell.tsx`)
   lacked `relative` while `state="game"` renders absolute controls —
   add it, then delete the gallery's compensating `relative` wrapper on
   the game StateCard (the game StateCard in `apps/web/src/components/gallery/generic.tsx`)
   so the fix is proven where the workaround lived. (b) The
   `safe-area-shell` utility (`packages/ui/src/styles.css`) padded
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
   the `scene-paving` utility in `packages/ui/src/styles.css`), wait
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

| Clause | Test (file + name)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | What is asserted                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| W1     | `apps/web/test/api.test.ts` — "sends credentials: include on every call", "JSON-encodes a POST body and sets the content-type header", "decodes a 2xx body through the contracts schema", "throws on an undecodable 2xx body — never silently-wrong state", "maps a non-2xx error body to a typed ApiError {status, tag, message}", "falls back to a generic ApiError when the error body is undecodable". Plus `apps/web/test/env-declaration.test.ts` — "declares VITE_API_URL / VITE_REALTIME_URL / VITE_REALTIME_ANON_JWT for the web build" | fetch init carries `credentials: "include"`; decoded value returned; ApiError fields; rejects on bad wire |
| W2     | `apps/web/test/lobby-screen.test.tsx` — "renders the name form for an unauthenticated visitor (401 from /me)", "submits a valid name to POST /users and flips to authenticated without a reload", "rejects an empty name on submit with the field error — no request leaves", "surfaces a server 400 as the submit alert per forms.md"                                                                                                                                                                                                           | 401 → form; POST body `{name}`; greeting + Create room appear on the same mount; field/submit error copy  |
| W3     | `apps/web/test/realtime.test.ts` — "subscribes the granted topic with the pinned channel pattern and delivers broadcasts", "returns an unsubscribe that closes the channel and stops event delivery", "exposes connection status: a drop flips to reconnecting, recovery flips back and fires onResubscribe", "resets to connected when the last subscription is dropped — no stale banner on idle screens"                                                                                                                                      | fake-client topic/on/subscribe wiring; unsubscribe spy; status source transitions                         |
| W4     | `apps/web/test/room-screen.test.tsx` — "shows the reconnecting alert under the header while the seat view stays live, then refetches on recovery"                                                                                                                                                                                                                                                                                                                                                                                                | banner text `Reconnecting…` present with both seat names still rendered; one extra GET after recovery     |
| L1     | `apps/web/test/lobby-screen.test.tsx` — "greets by name and offers create + join-by-link", "join-by-link rejects garbage with the voice.md field error and stays put"; `apps/web/test/parse-room-link.test.ts` — "accepts a full room URL", "accepts a scheme-less pasted link", "accepts a bare UUID, trimmed and case-normalized", "returns null for garbage"                                                                                                                                                                                  | greeting + create + join affordances per session state; parser accepts URL/UUID, nulls garbage            |
| L2     | `apps/web/test/lobby-screen.test.tsx` — "create room POSTs /lobbies and navigates to the new room route"                                                                                                                                                                                                                                                                                                                                                                                                                                         | memory-router pathname becomes `/room/<id>` after the 201                                                 |
| L3     | non-vitest: creation-gate round run and approved (Progress 11:30); asset + utility + shell wiring + gallery card landed; _gate rendered pass pending step 12_                                                                                                                                                                                                                                                                                                                                                                                    | courtyard branch renders the asset (held by ui suite + step 12 rendered pass)                             |
| L4     | `apps/web/test/lobby-screen.test.tsx` — "shows the first-load skeleton while /me resolves", "renders the page-error alert with retry when /me fails outright"; `apps/web/test/room-screen.test.tsx` — "shows the first-load skeleton while bootstrap resolves", "renders the page-error alert with retry on a bootstrap 5xx"; N/A calls held by the ledger above                                                                                                                                                                                 | skeleton after the 300ms no-flash; alarm alert + `Try again` per screen                                   |
| R1     | `apps/web/test/room-screen.test.tsx` — "renders every member by name in join order from the GET alone — no join call"                                                                                                                                                                                                                                                                                                                                                                                                                            | both names at ascending `data-seat-index`; viewer's seat `data-own`; link/copy/start/leave present        |
| R2     | `apps/web/test/room-screen.test.tsx` — "joins on a bootstrap 404 and renders the room from the join response", "renders the no-access panel when the room is full (409 LobbyFull)", "renders the no-access panel for an unknown room (join 404)", "redirects an already-started refusal to the game route when the view GET succeeds", "renders the no-access panel for an already-started outsider (view GET 404)", "shows the name form in-place for an unauthenticated visitor, then joins — URL unchanged"                                   | each refusal's panel title; game-route pathname on view 200; URL stays `/room/<id>` through identity      |
| R3     | `apps/web/test/room-screen.test.tsx` — "renders every member by name in join order from the GET alone — no join call" (no `/join` in the recorded calls); manual reload in the walkthrough                                                                                                                                                                                                                                                                                                                                                       | full room from bootstrap alone; zero join calls                                                           |
| R4     | `apps/web/test/room-screen.test.tsx` — "applies a newer LobbyUpdated broadcast to the member list without refetching", "discards a LobbyUpdated broadcast not newer than the last-seen version", "renders the room-closed panel when a broadcast closes the room"                                                                                                                                                                                                                                                                                | new member appears with zero extra GETs; stale version leaves both seats; `Room closed` panel             |
| R5     | `apps/web/test/room-screen.test.tsx` — "navigates the starter to the game route on success", "auto-navigates a non-starter on the GameStarted room broadcast", "surfaces a 422 BadPlayerCount as the inline alert with the 2–5 copy"                                                                                                                                                                                                                                                                                                             | pathname `/game/<id>` both paths; inline alert copy while the seat view stays                             |
| R6     | `apps/web/test/game-placeholder.test.tsx` — "renders the holding state — shell, loading object, flavor caption"                                                                                                                                                                                                                                                                                                                                                                                                                                  | shell header + status role + `shuffling…` caption render                                                  |
| R7     | `apps/web/test/room-screen.test.tsx` — "POSTs leave, drops both subscriptions, and returns to the lobby"                                                                                                                                                                                                                                                                                                                                                                                                                                         | leave POST recorded; unsubscribe spy fired on room AND player channels; pathname `/`                      |
| S1     | button.md r2 + `touch-floor` landed; ui suite green (17) as the regression pin; _hardcheck rendered measurement ≥ 44px pending step 12_                                                                                                                                                                                                                                                                                                                                                                                                          | canon + utility exist; suites green                                                                       |
| S2     | `packages/ui/test/app-shell.test.tsx` — "the shell root is a positioned ancestor for the game state's floating controls" + "the game state renders the floating connection + settings controls"; bottom inset is CSS-only, pinned by inspection (Progress)                                                                                                                                                                                                                                                                                       | root className contains `relative`; game-state controls render by accessible label                        |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [x] 2026-09-05 — frontend child plan written
- [x] 2026-09-05 11:20 — step 1 done (orchestrator): `@supabase/realtime-js`
      2.112.4 in apps/web deps, `VITE_REALTIME_URL` + `VITE_REALTIME_ANON_JWT`
      in `.env.example` (with the minting one-liner) and in both turbo.json
      slots; pin test `apps/web/test/env-declaration.test.ts` green (3).
- [x] 2026-09-05 11:21 — step 5 done (orchestrator): button.md r2 (44px
      minimum control height, icon exempt), `touch-floor` utility in
      styles.css, applied per text variant in button.tsx. ui suite green
      (17). Rendered hardcheck re-run deferred to step 12 (needs a dev
      server).
- [x] 2026-09-05 11:22 — step 6 done (orchestrator): shell root `relative`,
      gallery's compensating wrapper removed, `safe-area-shell` bottom
      inset added; structural pin `packages/ui/test/app-shell.test.tsx`.
- [x] 2026-09-05 11:30 — step 7 done (orchestrator): creation-gate round
      run with the user — **full courtyard approved**. Asset at
      `packages/ui/src/assets/scene-courtyard.svg` (flat ink, token
      palette inlined by value with mapping documented in the SVG header,
      edges busy / center calm), `scene-courtyard` utility, AppShell
      courtyard branch wired, app-shell.md → r2, gallery courtyard
      StateCard added, stale gallery note removed. Visually reviewed via
      browser render; rendered gate pass happens in step 12.
- [x] 2026-09-05 15:40 — step 12 audits ran (orchestrator): hardcheck on
      the rendered lobby PASS (0 constraint fails; the CAM-15 43px button
      advisory is gone — S1 verified, all room text buttons measure
      exactly 44px). ai-tells scored the surface 1/30 ("invisible");
      impeccable returned 8 execution findings, no structural issues.
      Fix batch applied from the two audits: clipboard failure now
      surfaces a fallback toast; toast ids use a counter; join-field
      placeholder is origin-neutral; room gets an sr-only h1 + per-route
      document titles (room/game); Alert owns its action-slot ink
      upstream (both app-side overrides dropped); NameForm's maxLength=64
      removed (validator is the only cap); lobby link-field blur
      re-validates fully (matches NameForm); three error/helper strings
      de-dashed to voice.md's two-sentence form. web 71 + ui 17 green
      after the batch.
- [x] 2026-09-05 16:00 — step 12 design-gate verdicts (full
      decompose→map→judge pipeline per screen): **lobby flagged/0
      blocking** (3 actionable: maxLength mismatch — already fixed;
      43px text-field — surfaced as canon question; umbrella poles
      ending mid-air — fixed, both poles now ground behind their
      benches) and **room flagged/0 blocking** (4 accidental: seat-ring
      vs bench-ring geometry — logged to CAM-18 with the judge's fix
      options, the 42% radius was chosen for the game screen's hands;
      URL clip — fixed with visible ellipsis; inert settings button —
      fixed, AppShell now renders it only when a handler exists, new ui
      test pins it, gallery passes explicit handlers; occupancy count —
      fixed pre-verdict with the live "n seated" line). Slop convergence
      0 on both screens; D7 personality positive with token-level
      evidence on both. Final full gate green 25/25 (web 71, ui 18);
      final state verified live (no settings control, sr-only h1,
      ellipsis, live count, per-route titles).
- [x] 2026-09-05 12:00 — step 2 done: `apps/web/src/services/api.ts`
      (`apiRequest` + typed `ApiError`; credentials on every call, contracts
      decode at the edge, `decodeErrorBodyEither` on non-2xx with a generic
      fallback). Six pins in `apps/web/test/api.test.ts`.
- [x] 2026-09-05 12:00 — step 3 done: `apps/web/src/hooks/use-session.ts`
      (`["me"]` query with 401-as-data, `POST /users` mutation seeding the
      cache; `sessionErrorCopy` maps the 400) +
      `apps/web/src/components/identity/name-form.tsx` (field-scaffold,
      1–32 validate on submit / re-validate on blur, `Deal me in` primary,
      submit alert above the footer). Pinned via the lobby container suite.
- [x] 2026-09-05 12:01 — step 4 done: `apps/web/src/services/realtime.ts`
      (lazy client from the ADR-0032 env vars, `subscribeTopic` in the
      pinned channel pattern, connection-status store, `onResubscribe`
      recovery signal, idle-reset, `setRealtimeClientForTests` injection
      seam) + `apps/web/src/hooks/use-connection.ts`
      (`useSyncExternalStore` adapter). Four pins in
      `apps/web/test/realtime.test.ts`; fake client in
      `apps/web/test/support/fake-realtime.ts`.
- [x] 2026-09-05 12:03 — step 8 done: `routes/index.tsx` replaced (smoke
      page gone), `containers/lobby/lobby-screen.tsx` +
      `containers/lobby/parse-room-link.ts`. Session-state rendering
      (skeleton / name form / greeting+actions), create → navigate,
      join-by-link with voice.md field error. 10 tests in
      `apps/web/test/lobby-screen.test.tsx`, 4 in
      `apps/web/test/parse-room-link.test.ts`; memory-router harness in
      `apps/web/test/support/harness.tsx`.
- [x] 2026-09-05 12:04 — steps 9+10 done: `routes/room.$gameId.tsx`,
      `containers/room/use-room.ts` (bootstrap → join-on-visit → denial
      map with the LobbyNotJoinable → view-GET fallback; version-guarded
      `LobbyUpdated` apply; `GameStarted` navigate; refetch-on-resubscribe;
      start/leave mutations) + `containers/room/room-screen.tsx` (seating
      TableSurface, share/copy toast, no-access recipes, reconnecting via
      AppShell). 17 tests in `apps/web/test/room-screen.test.tsx`.
- [x] 2026-09-05 12:04 — step 11 done: `routes/game.$gameId.tsx` holding
      state (Loading, caption `shuffling…`); pinned by
      `apps/web/test/game-placeholder.test.tsx` plus the R2/R5 navigation
      tests that land on the route. Web suite: 13 files, 71 tests green
      via `pnpm turbo test --filter @cambio/web`.
- [x] 2026-09-05 12:09 — full gate green, run bare:
      `pnpm turbo build typecheck lint test` → 25/25 tasks successful.
      Suites: web 71, ui 17, api 118, domain 194, application 86,
      contracts 10, config 16 — all passing. Coverage table above filled
      with as-landed test names. Remaining for step 12 (orchestrator):
      design-gate rendered pass + ai-tells + impeccable audits, S1
      hardcheck re-measure, two-browser walkthrough.

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
- **Audit-round conflicts surfaced, not auto-fixed (step 12):**
  (a) impeccable's error-prevention heuristic wants the solo-room Start
  disabled below 2 members — left enabled per the plan's
  server-decides rule; the 422 copy carries the explanation. (b) The
  room's scene depth: scenes.md wants "table + paving with scene at the
  edges" but AppShell offers no edge-scenery ground — the room uses the
  canonical full-bleed paving; the missing edge treatment is a
  design-system gap for CAM-18+, not this screen's defect. (c) The
  lobby's two heading treatments (44px centered first-use vs 28px left
  returning) read as deliberate register shift to ai-tells and as drift
  to impeccable — left as-is, flagged for the reviewer. (d) The 43px
  text-input height (touch-floor applies to buttons only) and the 36px
  icon button are canon-consistent advisories, not fixed here — a
  text-field canon revision would be its own design-system
  conversation.
- **Audit divergence recorded (maxLength):** impeccable said drop the
  64-char maxLength and let the well-worded error do its job; the lobby
  judge preferred maxLength=32 ("makes the limit felt"). We went with
  impeccable's drop — a silent hard-stop gives no feedback about WHY
  typing stops, the error copy does. Reviewer may re-litigate.
- **Forward notes for CAM-18 from the room judge:** (1) seat-ring (42%)
  vs bench-ring (~33%) geometry — reconcile from ONE radius source when
  composing the game screen (the 42% was chosen to leave room for
  hands); (2) the connection dot's C1 pass leans on the reconnecting
  Alert bar — if that banner is ever made conditional, the dot becomes
  a live color-alone failure; the judge's shape-redundancy fix (hollow
  ring when disconnected, ~10-12px) closes it permanently and matters
  in-game where connection state is load-bearing; (3) the tabletop's
  decorative-exemption on the 1.54:1 paving contrast expires the moment
  it carries the deck/discard.
- **Containers own their AppShell** (small deviation from the module
  table's "route picks LobbyScreen inside AppShell" phrasing): the
  connection→shell-state wiring belongs to the surface, and the W4 test
  must see the banner at the container seam. Routes stay one-line
  container pickers, which is the layering rule's actual point. Evidence:
  the W4 test renders `RoomScreen` and finds the shell's `Reconnecting…`
  banner with the seat list still live.
- **The two 409 join refusals are tag-distinguished, not
  status-distinguished:** `LobbyFull` → full panel; `LobbyNotJoinable`
  (covers started AND abandoned) → the view-GET fallback (200 → player
  redirect, 404 → outsider panel — an abandoned lobby's game was never
  dealt, so its view 404s into the same panel); `AlreadyInLobby`
  (bootstrap/join race) → treated as membership, refetch the GET.
  Evidence: `lobbyErrorStatus` in `apps/api/src/presentation/errors.ts`
  maps all three to 409.
- **A bootstrap 404 must not flash as a page error:** between the GET
  erroring and the join effect firing there is a render where no mutation
  is pending; classifying "room query failed" naively as page error
  produced a one-frame alarm alert. `useRoom` therefore computes `failed`
  excluding the 404 case — a 404 is the join trigger (R2), never an
  error state.
- `parseRoomLink` accepts scheme-less pastes (`localhost:3000/room/<id>`)
  by prefixing `https://` before URL parsing — pasted links commonly lose
  their scheme; nothing is ever navigated to, the parser only extracts
  the UUID.
