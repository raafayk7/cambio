# CAM-17 — Lobby + room screens — identity flow, room lifecycle, contract groundwork

- **Linear:** [CAM-17](https://linear.app/raafayk7/issue/CAM-17) (sub-issue of
  [CAM-16](https://linear.app/raafayk7/issue/CAM-16); blocks
  [CAM-18](https://linear.app/raafayk7/issue/CAM-18))
- **Scope:** fullstack
- **Child plans:** [backend](../backend/CAM-17.md) ·
  [frontend](../frontend/CAM-17.md)
- **ADRs:** 0032 (browser realtime via @supabase/realtime-js with a static
  build-time anon JWT)

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

After this task, a first-time visitor can open the web app, claim a name,
create a room, and share its link; friends who open the link claim their own
names, join, and everyone watches the member list update live; any member
starts the game and every member lands on the game route. Observe it working
by running `pnpm dev`, opening `http://localhost:3000` in two browsers
(one normal, one private window), and walking create → share → join →
start. The game table screen itself is CAM-18; this task ends at a
placeholder game route.

## Context & orientation

The entire backend game/lobby/auth stack exists (CAM-1 through CAM-12): nine
HTTP routes under `apps/api/src/presentation/`, capability-topic realtime
publishing (ADR-0023/0024), stateless HMAC cookie sessions (ADR-0018), and
the `viewFor` projection (ADR-0021). The component layer exists (CAM-15):
17 generic components in `packages/ui/src/components/` and 9 game objects in
`apps/web/src/components/game/`, all token-styled, demoed in the
`/dev/components` gallery. `apps/web` has TanStack Start file-based routing,
TanStack Query with a per-request QueryClient, and exactly one fetch (the
`/health` smoke check) — no API client layer, no auth handling, no realtime
dependency.

Governing law: `frontend-architecture` (projection renderer;
pages → containers → components; logic in hooks), `hidden-information`
(channel discipline; a missing field is a viewFor/contracts change, never a
client workaround), `design-system` (all identity from `design-system/`,
creation gate for anything new), `application-layer` and
`infrastructure-persistence` for the backend additions. HANDOFF §5 (realtime
topology), §6 (deployment constraints). ADRs 0018–0024 govern the surfaces
this task consumes; ADR-0032 (written with this plan) governs the browser
realtime wiring.

Four wire-level gaps block the screens, all confirmed by exploration against
the running code, all public-information changes with no hidden-information
exposure:

1. **No display names on the wire.** `LobbyView.members` is a bare id array
   and `ViewPlayer` is `{ id, hand }` — names exist only in the DB and in
   the caller's own `SessionUser`. `Seat` and `ScoreSheet` require names.
2. **No pre-game state fetch.** There is no GET endpoint for a lobby;
   `GET /games/:gameId/view` fails for a never-dealt game, and re-joining
   returns 409 without grants — so a room-screen reload today loses the
   member list AND the channel grants permanently.
3. **`LobbyUpdated` has no contracts schema.** The publisher broadcasts the
   event name `LobbyUpdated` with a bare `LobbyView` payload and no `_tag`
   field, unlike every other broadcast event.
4. **`slamWindowMs` is unrecoverable.** It is delivered once in the
   `GameStarted` event and appears nowhere in `PlayerGameView`, so a
   mid-game reload cannot scale the slam timer. Frozen here so CAM-18's
   contract surface is stable.

## Functional contract

All claims about existing behavior below are pinned by the cited API test
suites (probe-verified via exploration of `apps/api/test/` on this branch).

### Contracts (frozen first — M1)

- C1. `LobbyView.members` becomes a list of `{ id, name }` (name: the
  user's display name, 1–32 chars as enforced at creation). Existing
  consumers (`LobbyResponse`, `LeaveLobbyResponse`) carry the new shape.
- C2. `ViewPlayer` gains `name`. `viewFor` output for every player includes
  it; names are public information and appear identically in every
  player's view.
- C3. A `LobbyUpdated` tagged event schema exists in `packages/contracts`
  carrying the lobby view **and the room's version**, and the published
  payload includes `_tag`, consistent with the other broadcast events.
  (Version added at plan reconciliation: the client applies a broadcast
  only when newer than its last-seen version, closing the
  bootstrap-response-vs-broadcast race.)
- C4. `PlayerGameView` (or `ViewResponse` — mechanism chosen in the backend
  child plan after probing whether config is persisted with the game)
  exposes `slamWindowMs` such that a client calling the view endpoint
  mid-game can render a correctly-scaled slam timer. The value must equal
  the value the game was started with.
- C5. A response schema for the new lobby GET endpoint exists:
  `{ lobby, version, grants }` — same shape as the join response.

### Backend (M2)

- B1. `GET /lobbies/:gameId` returns 200 `{ lobby, version, grants }` for a
  current member, where `grants` are the caller's own topics (grants
  isolation as pinned for join in `Lobbies.test.ts`).
- B2. `GET /lobbies/:gameId` returns 404 with a body byte-identical to the
  unknown-game 404 for: non-members, unknown ids, and started/abandoned
  lobbies — the same no-existence-leak rule `GET /games/:gameId/view`
  follows (pinned in `GameCommands.test.ts`).
- B3. Malformed UUID in the path → 400, no publisher activity (same as the
  existing lobby routes, pinned in `Lobbies.test.ts`).
- B4. All existing route behavior is unchanged: create 201
  `{ lobby, version, grants }`, join 200 with grants, leave 200 without
  grants, start 200 `{ view, version }`, the 409/422 error taxonomy
  (`Lobbies.test.ts`, `EndToEndGame.test.ts` stay green, updated only
  where C1–C4 change payload shapes).
- B5. Name data flows end to end: after C1/C2, a full game driven over HTTP
  shows every member's name in lobby payloads and every player's name in
  every view (extend the existing integration flow).

### Web foundation (M3)

- W1. Every API call from the browser sends credentials (the session cookie
  crosses the 3000→3001 origin boundary); responses are decoded through
  the contracts schemas — undecodable responses surface as errors, never
  as silently-wrong state.
- W2. Identity flow: on load the app resolves identity via `GET /me`; a 401
  yields the name form; submitting a 1–32-char name calls `POST /users`,
  which sets the session cookie (pinned in `Auth.test.ts`: 201 + cookie,
  server-side trimming, 400 on bad names). After creation the app behaves
  as authenticated without a reload.
- W3. Realtime: the app connects per ADR-0032 (`@supabase/realtime-js`,
  `VITE_REALTIME_URL`, `VITE_REALTIME_ANON_JWT`), subscribes to granted
  topics, and exposes connection state to the UI. Client subscription
  mechanics follow the pattern pinned in `RealtimeIntegration.test.ts`.
- W4. Realtime disconnection renders the design system's `reconnecting`
  page state (alert under the header, screen stays live); recovery
  restores it without a reload. Own connection only — other players'
  connection states are out of scope (v0 decision).

### Lobby screen (M4)

- L1. `/` renders the lobby: identity (name form when unauthenticated,
  greeting when authenticated), a create-room action, and a join-by-link
  affordance (paste field that accepts a room URL or bare UUID and
  navigates to it — pure client-side parsing; no room list, no short
  codes in v0).
- L2. Create room calls `POST /lobbies` (201 `{ lobby, version, grants }`,
  pinned in `Lobbies.test.ts`) and navigates to `/room/:gameId`.
- L3. The lobby uses the courtyard scene: the illustrated courtyard asset is
  produced through the design-system creation gate and wired into
  AppShell's `courtyard` scene (which today silently falls back to plain
  cream).
- L4. The lobby covers the applicable page-class MVS states; states with no
  applicable content on this screen (e.g. no-results with no list to
  filter) are flagged as N/A in the child plan with justification, never
  silently skipped.

### Room screen (M5)

- R1. `/room/:gameId` for a member shows the pre-game seat view: every
  member by name (join-order seating), the room's shareable link with a
  copy action, a start action, and a leave action.
- R2. A non-member (or freshly-arrived link visitor) is joined via
  `POST /lobbies/:gameId/join`; join refusals map to screen states:
  lobby full → no-access panel (what, why, where to go); unknown room →
  no-access; an unauthenticated visitor completes the identity flow
  first, then joins, without losing the target room. On an
  already-started refusal the client checks `GET /games/:gameId/view`:
  a 200 means the visitor is a player of the started game and is
  redirected to `/game/:gameId`; a 404 means a true outsider and gets
  the no-access panel. (Added at plan reconciliation — otherwise a
  member who missed the start and reloads the room dead-ends.)
- R3. A member reloading the room screen recovers members, status, and
  grants via B1 — reload is not a dead end.
- R4. Membership changes arrive live: `LobbyUpdated` broadcasts (C3) update
  the member list without polling; the last member leaving abandons the
  lobby (existing behavior) and remaining viewers see the room close.
- R5. Start: any member may start (no host concept — pinned in
  `Lobbies.test.ts`: non-members get 409); with fewer than 2 members the
  422 `BadPlayerCount` is surfaced inline (start affordance communicates
  the 2–5 rule); on success the starter navigates to `/game/:gameId`
  and other members auto-navigate on the `GameStarted` room event.
- R6. `/game/:gameId` exists as a placeholder route (CAM-18 builds the
  screen); it renders a design-system-composed holding state, not a 404.
- R7. Leave calls `POST /lobbies/:gameId/leave` and returns to `/`;
  the response carries no grants (pinned: leave body keys are exactly
  lobby + version) and the client drops its subscriptions.

### System-wide (M4, applied before the screens' gate runs)

- S1. Touch-target revision: button canon padding is revised through the
  design system so shared controls reach a 44px control box (user-approved
  canon change; `design-system/components/core/button.md` +
  `packages/ui/src/styles.css` move together; every control shifts, the
  gallery and existing component tests stay green).
- S2. AppShell fixes required by real screens: the game-state controls
  anchor to the shell (positioned ancestor bug found in exploration), and
  the safe-area handling covers the bottom inset. Execution fixes in
  `packages/ui`, not canon changes.

### Acceptance criteria

- [x] `pnpm turbo build typecheck lint test` passes, run bare (no pipes) —
      25/25 tasks, 513 tests (contracts 10, domain 194, application 86,
      api 118, ui 18, web 71, config 16).
- [x] Two-browser-equivalent walkthrough verified live (in-app browser as
      player 1, separate-cookie-jar HTTP session as player 2): name →
      create → share link → second player joins → member list updated
      live via LobbyUpdated → start → `/game/:gameId` placeholder; plus
      realtime-container kill/restart showing the reconnecting banner and
      recovery without reload.
- [x] Reloading `/room/:gameId` mid-lobby recovers members, status, and
      grants (R3); visiting the room of a started game redirects the
      player to the game route (R2 reconciliation).
- [x] Both screens through the full design-gate pipeline
      (decompose→map→judge): both **flagged with zero blocking findings**;
      actionable accidentals fixed or logged (frontend plan Progress
      16:00); conflicts with canon surfaced, never auto-fixed. `ai-tells`
      scored the surface 1/30 ("invisible"); impeccable audit ran with 8
      execution findings, all addressed or logged.
- [x] The 8-state MVS ledger answered per screen in the frontend child
      plan (built or justified N/A, verified against source by the
      impeccable pass).
- [x] No hidden-information regressions: `AdversarialProjection.test.ts`
      (with the identical-names-for-every-viewer invariant) and the
      leak-free end-to-end flow green with names added.

## Plan of work

**M1 — Contracts freeze.** C1–C5 are frozen by the pinned shape table in
the backend child plan; because `viewFor`/`lobbyView` type against these
schemas, each clause lands at the head of its vertical slice rather than
as a contracts-only first commit, and nothing after M1 revisits a shape.
`packages/contracts` gains a vitest harness (it has none today) so the
frozen shapes carry schema tests. CAM-18 consumes these same shapes.

**M2 — Backend.** Projection and publisher changes (names, tagged
LobbyUpdated, slamWindowMs), the `GET /lobbies/:gameId` route, repository
support as needed. Integration tests extend the existing suites; the
adversarial projection suite guards the new fields.

**M3 — Web foundation.** The API client layer (`services` + hooks wrapping
TanStack Query, credentials included, Effect Schema decoding at the edge),
the realtime client per ADR-0032 (dependency, env plumbing through
`.env.example` and `turbo.json`, subscription + connection-state hook), and
the identity flow. This is the layer CAM-18 reuses wholesale.

**M4 — System-wide revisions + lobby screen.** The 44px touch-target
revision and AppShell fixes land before screen composition (they move every
control). Then the lobby screen: identity, create, join-by-link, courtyard
illustration through the creation gate, MVS sweep.

**M5 — Room screen.** Join-on-visit flow, live membership, share/copy,
start/leave, placeholder game route, MVS sweep.

**M6 — Audit + gate.** Design-gate on both screens, `ai-tells` on the new
surfaces, impeccable audit pass, full turbo gate, two-browser walkthrough.

Milestone order rationale: contracts before everything (freeze rule); web
foundation before screens (screens are thin over it); system-wide control
changes before screens are gated (so the gate sees final geometry).

## Validation

- Backend: extended integration suites in `apps/api/test/` (Lobbies,
  EndToEndGame, RealtimeIntegration) prove C1–C5/B1–B5 over real HTTP and
  the real Realtime container; the adversarial projection suite proves the
  new fields leak nothing new.
- Frontend: component/hook tests on jsdom per ADR-0030 (identity flow, room
  membership rendering, join-refusal states, reconnecting state); test
  intents live in the frontend child plan's coverage table.
- Manual: the two-browser walkthrough in the acceptance criteria, run
  against `pnpm dev` with Docker Postgres + Realtime up.
- Design tooling: gate + ai-tells + impeccable per acceptance criteria.

## Progress

_(updated continuously; append new entries at the BOTTOM — newest last;
timestamp each entry)_

- [x] 2026-09-05 — plan written and signed off
- [x] 2026-09-05 12:00 — M1 + M2 complete (backend lane): contracts
      harness + C1–C5 frozen shapes landed with schema tests; name
      plumbing (Lobby aggregate + viewFor names argument +
      UserRepository.findManyById), tagged versioned LobbyUpdated,
      config.slamWindowMs on the view, GET /lobbies/:gameId with the
      byte-identical 404 trio. Filtered backend gate green: contracts 10,
      domain 194, application 86, api 118 tests. Coverage table filled.
- [x] 2026-09-05 12:00 — M4 system-wide half done (orchestrator): S1 44px
      touch floor (button.md r2), S2 AppShell fixes, ADR-0032 env
      plumbing, courtyard scene realized through the creation gate
      (user-approved full courtyard; app-shell.md r2). M3 + screens
      running in the frontend lane.
- [x] 2026-09-05 15:00 — M3–M5 complete (frontend lane): API client,
      identity flow, realtime service + connection hook, lobby + room
      screens, placeholder game route, 34 new web tests. Full gate green.
- [x] 2026-09-05 16:00 — M6 complete (orchestrator): live walkthrough
      verified (create/join/live-membership/reload/reconnect/start/
      redirect-rescue, names + slamWindowMs confirmed on the wire, 44px
      floor measured in the rendered DOM); design-gate pipeline per
      screen (both flagged/0-blocking), ai-tells 1/30, impeccable
      audited; fix batches applied and re-verified; final gate 25/25.
      Details in the frontend child plan Progress.
- [x] 2026-09-05 17:00 — post-implementation art revision complete
      (user-directed; Decision Log entry of the same date): painted
      moodboard assets wired for courtyard/paving/table, panel wash
      variant born, canon docs revised, both screens re-rendered and
      user-checkpointed at each step. Suites green throughout.

## Decision log

- 2026-09-05 — CAM-16 split into CAM-17 (this task) + CAM-18 (game table);
  CAM-18 planned separately after CAM-17 ships — user call, keeps the
  game-table plan informed by what this task learns.
- 2026-09-05 — Join model is share-link only: no room list endpoint, no
  short codes — user call; leanest v0, both are additive later. The
  gallery's drafted room-list copy goes unused for now.
- 2026-09-05 — Projection/contract gaps are fixed in-task (fullstack), per
  the hidden-information rule — user call.
- 2026-09-05 — Names embedded in projections (LobbyView members,
  ViewPlayer) rather than a user-lookup endpoint: names are public, the
  view is the single source the client renders, and a lookup endpoint
  would invite client-side joins. Rejected: `GET /users/:id` batch lookup.
- 2026-09-05 — `GET /lobbies/:gameId` 404s identically for non-members,
  unknown ids, and non-open lobbies, mirroring the game-view rule; a link
  visitor's client falls back to join on 404. Rejected: a public lobby
  info response (existence leak, and v0 has no use for it).
- 2026-09-05 — Own-connection presence only; Seat's disconnected state
  stays dormant this release — user call. Realtime Presence would be a new
  design surface (client-announced, unlike broadcast-only publishing).
- 2026-09-05 — Post-game path is score sheet → back to lobby screen (no
  rematch backend) — user call, recorded here for CAM-18.
- 2026-09-05 — No rename in v0: `POST /users` always mints a new identity,
  so the UI never offers "change name"; name is set once at first visit.
  Rejected: a rename endpoint (no v0 need).
- 2026-09-05 — Courtyard illustration is in scope — user call; born through
  the creation gate during M4.
- 2026-09-05 — 44px touch-target revision is in scope — user call; a canon
  revision through the design system, not an auto-fix.
- 2026-09-05 — Static build-time anon JWT for browser realtime — user call,
  promoted to ADR-0032.
- 2026-09-05 — CAM-17 ships `/game/:gameId` as a placeholder route so the
  start flow completes; CAM-18 replaces its content.
- 2026-09-05 — (reconciliation) `LobbyUpdated` carries `version` so the
  client can discard broadcasts older than its last-seen state. Rejected:
  unconditional apply + refetch-on-reconnect only (a bootstrap response
  racing a broadcast could pin a stale member list with no self-heal
  until the next event).
- 2026-09-05 — (reconciliation) already-started join refusals fall back
  to `GET /games/:gameId/view` to distinguish "player of this game"
  (redirect) from "outsider" (no-access) — uses an existing endpoint,
  no contract change.
- 2026-09-05 — (reconciliation) C5 is satisfied by reusing
  `LobbyResponse` — the GET endpoint's shape already exists; no new
  schema export (backend child plan probe).
- 2026-09-05 — S1 mechanism: 44px **minimum control height** in the
  button canon, padding untouched — user call at sign-off. Rejected:
  `space.3` vertical padding (~50px box, larger visual shift).
- 2026-09-05 — (implement) soft-deleted users mid-lobby keep their row
  via LEFT JOIN + COALESCE to an empty name, and viewFor names fall back
  to an empty string — deliberate totality decisions flagged for the
  reviewer in the backend child plan, chosen over dropping rows or
  failing the projection.
- 2026-09-05 — (implement) courtyard realization: the SVG asset inlines
  primitive hex values (an external background image cannot read page
  custom properties) with the token mapping documented in the asset
  header — the scene-paving theme-fixed precedent, noted for the
  hardcheck's token scan. _(Superseded the same day by the art revision
  below — the SVG is gone.)_
- 2026-09-05 — **Post-implementation art revision (user-directed).** The
  user compared the shipped screens against `lums-illustrated/` (the art
  direction itself) and rejected the scene art as not close — correctly:
  the courtyard SVG was outlined clip art where the reference is
  outline-free painterly flat, the paving was a harsh checker where
  image7's ground is a calm plaid, and the benches were straight bars
  where table-surface.md r1 always said CURVED. Resolution, approved
  step by step: (1) paving → first a token-drawn plaid, then the
  user-regenerated painted asset (image10 → `scene-paving.webp`);
  (2) table + benches → first a vector redraw of image7, then the
  user-regenerated painted asset with alpha shadows (image11 →
  `table-top.webp`), the center/scrim/seat overlays staying
  programmatic; (3) courtyard → first an outline-free SVG redraw, then
  the user-regenerated painting (image9 → `scene-courtyard.webp`);
  (4) the user's "ghost modal" idea became the `panel` **wash** variant
  (90% paper, no blur — panel.md r2) so lobby content floats over the
  painting with the hero table visible; headings moved inside the wash.
  Canon revised: panel.md r2, table-surface.md r2, app-shell.md r2
  amended, scenes.md rules updated; provenance in docs/design/README.md.
  Root-cause note for future tasks: scene art must be drawn WITH the
  moodboard images open — the original SVG was drawn from scenes.md's
  one-line description alone.

## Surprises & discoveries

_(anything found mid-implementation that the plan didn't predict — wrong
assumptions, upstream bugs, better approaches. Evidence included.)_

- (from planning exploration, for the implementer) The brief's assumption
  that excluded extensions "exist as canon docs" is wrong — the extensions
  folder is empty; needing tabs/tooltip/etc. means a creation-gate round.
- (from planning exploration) `exactOptionalPropertyTypes` +
  `noUncheckedIndexedAccess` are on: follow the conditional-spread idiom
  used across CAM-15 components.
- (from planning exploration) Tailwind v4 emits nothing for unknown
  utilities — a stale class fails silently; grep + eyes.

## Outcomes & retrospective

_(filled at the end, typically by `/review`: what shipped, what was cut,
what should carry into the next task.)_
