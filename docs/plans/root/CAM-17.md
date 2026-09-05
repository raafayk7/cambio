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
- 2026-09-05 — (review fix cycle) **F1 resolved by scoping, not by
  washing the room**: the wash rule applies to PICTORIAL scenes (a
  painting with subjects — the courtyard); TEXTURE grounds (the paving
  plaid) have no subject to occlude, so the room keeps opaque panels.
  Headings still never sit bare on artwork — the room identity branch's
  h1 moves inside its panel. Rejected: wash everywhere on illustrated
  grounds (would dilute the wash's purpose and change a screen the user
  approved as-is).
- 2026-09-05 — (review fix cycle) **F4's vanished-user projection is the
  literal "—"**, decodable under the new shared DisplayName schema, in
  both producers (viewFor fallback, loadLobby COALESCE) — loud-but-valid
  totality instead of an empty string indistinguishable from a bug.
  Rejected: optional name (ripples every consumer for an FK-unreachable
  arm).
- 2026-09-05 — (review fix cycle) **F12's outsider denial copy merges
  truthfully**: the wire cannot distinguish started-without-you from
  abandoned for a non-member (join 409 + view 404), so the panel says
  both ("This room started without you or has closed."). Rejected: a new
  denial-reason wire signal (contract change out of proportion to the
  copy defect).
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

**Review 2026-09-05 — verdict: fix-then-ship.** Four reviewers (contract

- architecture per side) + independent verification.

### What passed

- **Every functional-contract clause satisfied** on both sides (C1–C5,
  B1–B5, W1–W4, L1–L4, R1–R7, S1–S2) with test-body-verified coverage —
  no contract violations, no unrequested endpoints/fields/side effects.
- **Zero hidden-information findings**: grants never rendered / logged /
  persisted / dehydrated; adversarial sweep asserts names identical per
  viewer; 404 byte-identity real (same `typedErrorBody`, same cookie
  behavior); nothing new on per-player channels.
- Import boundaries clean everywhere (all new imports checked, both
  sides); domain purity holds; ports placed correctly; publisher/viewFor
  ripples complete with zero stale call sites; ADR-0030/0032 conformant;
  ai-tells sweeps clean; new copy conforms to voice.md.
- Verification actually ran: forced full gate **25/25, 0 cached**
  (1m40s, live Postgres + Realtime); `VIEW_GAMES=40` adversarial pass
  green; suite counts independently recomputed (web 71, ui 18, api 118,
  domain 194, application 86, contracts 10, config 16); live two-session
  walkthrough executed this cycle.

### Findings (fix cycle works from THIS list)

Tier 1 — canon/doc contradicts shipped code (all introduced this task):

- **F1 — scenes.md r2's wash rule vs the room screen.** scenes.md:26–28
  (new) says content on an illustrated scene floats on wash with
  headings inside — but paving is now an illustrated scene and the room
  uses opaque `default` panels throughout, with a bare display h1 on the
  artwork in its identity branch (room-screen.tsx:223). Resolve one way:
  scope the rule to the courtyard/lobby, or apply wash + heading-inside
  on the room. Surfaced canon decision, not an auto-fix.
- **F2 — forms.md contradicted by the wash forms; multi-instance
  claim.** forms.md:14 "no scene art behind the fields" vs both lobby
  forms on wash over the painting. Instances found by sweep (re-run the
  sweep before closing): design-system/patterns/forms.md:14;
  apps/web/src/containers/lobby/lobby-screen.tsx:14–18 (prose documents
  the superseded behavior beside code doing the opposite);
  docs/plans/frontend/CAM-17.md:50 and :251. Amend forms.md
  deliberately (wash exception, r2) and fix every instance.
- **F3 — table-surface.md Anatomy describes the deleted
  implementation** (surface.table disc + green-deep rim +
  elevation.float + drawn benches; r2 updated Revisions only). Also
  tokens.md:41 still calls `surface.table` "the play surface" — now
  only true of the gallery wrapper. Reconcile Anatomy + token
  description.
- **F4 — false docstring: "name is 1–32 chars by construction".**
  `""` is producible (game-repository COALESCE arm; ViewFor `?? ""`).
  Instances: packages/contracts/src/GameView.ts:123 (+ dist copies);
  docs/plans/backend/CAM-17.md:135 (shape table). Preferred fix:
  extract a `DisplayName` schema (Trim + min 1 + max 32 — the idiom in
  contracts User.ts:12) and reuse across CreateUserRequest/SessionUser/
  ViewPlayer/LobbyMember, then decide the vanished-user projection
  explicitly instead of `""`; otherwise amend the claim everywhere.

Tier 2 — architecture discipline (backend):

- **F5 — viewFor is no longer the single self-contained projection.**
  `viewFor(viewer, state, names)` with the names map assembled by
  copy-paste at three route sites (games.ts:52, :88, lobbies.ts:163) —
  the per-handler-assembly shape hidden-information §viewFor exists to
  prevent (no leak today; names public). Fix: `viewForEffect(viewer,
state)` requiring UserRepository, pure 3-arg kept as a test seam.
- **F6 — domain module cycle defused only by comments.**
  Lobby→UserRepository→GameRepository→Lobby broken via statement-form
  `import type` with no enforcement (no import/no-cycle rule; no
  eslint.base.test pin) while the repo's own `fixStyle:
"inline-type-imports"` autofix is exactly the style that reintroduces
  it. Fix: extract `User` to packages/domain/src/User.ts (entity out of
  the port file, per architecture skill §file-placement) — or add the
  enforcement test.
- **F7 — null-sentinel entitlement branch.** games.ts:81–98 encodes the
  404-vs-200 refusal in a nullable data field with two `as` casts on a
  security-relevant branch. Dissolves naturally under F5's
  viewForEffect; otherwise use a tagged result.
- **F8 — `config.slamWindowMs` wire schema weaker than domain +
  duplicated.** GameView.ts:115 drops `Schema.positive()` and repeats
  the anonymous struct already at GameEvents.ts:48. Extract one
  `WireGameConfig` (positive) in GamePrimitives and use in both.

Tier 3 — coverage and robustness:

- **F9 — C3's "carries the room's version" has no end-to-end pin.**
  No test asserts a use case publishes the just-persisted version;
  swapping `newVersion`→`version` in JoinLobby would silently kill live
  membership with a green gate. Add
  `toMatchObject({op:"publishLobby", version: result.version})` in
  CreateLobby/JoinLobby/LeaveLobby suites (stub journal already records
  it).
- **F10 — realtime env failure modes.** realtime.ts:53 guards
  `undefined` only, while .env.example ships `VITE_REALTIME_ANON_JWT=`
  empty → `""` passes, handshake fails, room pins to reconnecting with
  no diagnostic; a genuinely absent var throws inside the subscription
  effect and (no errorComponent exists) replaces the room with the
  router's default error page instead of the W4 state. Harden: trim
  check + caught subscribe; also add the cheap SSR guard (throw when
  `window` undefined) so the singleton can never construct server-side.
- **F11 — env-declaration test weaker than its coverage row and
  ADR-0032.** Raw `toContain` can't distinguish the build `env` array
  from dev `passThroughEnv`; a var declared in only one slot passes.
  Scope the assertion to the `@cambio/web#build` env array (both slots).
- **F12 — abandoned rooms tell outsiders "Game already started".**
  use-room.ts denial resolution maps abandoned (LobbyNotJoinable +
  view-404) to `started`; the correct `closed` copy is reachable only
  via the broadcast path. Distinguishing data is absent on the wire —
  fix is either copy that covers both truthfully, or (bigger) a
  denial-reason signal; choose deliberately.
- **F13 — no page h1 on the room's denial and page-error branches**
  (the sr-only h1 lives inside SeatedRoom). Hoist to RoomScreen's
  wrapper.
- **F14 — doc/coverage-row precision batch.** (a) alert.tsx action-ink
  change is uncanonized: alert.md still v1, no revision entry, no test —
  bump r2 + pin; (b) stale r1 citations at app-shell.tsx:9 and
  packages/ui/test/app-shell.test.tsx:8; (c) frontend coverage rows for
  L3 and S1 still read "pending step 12" though Progress 15:40 records
  completion; (d) backend B5 row overstates (publish half asserts the
  domain lobby via the test publisher, not an encoded wire payload —
  reword; wire shape is pinned by the realtime suites); (e) B4 row
  names no test — point it at the enumerated pins; (f) frontend R4 row
  says "both seats" where the body asserts the friend only; W3 row's
  "pinned channel pattern" is type-enforced, not asserted — reword or
  strengthen.

Skill staleness (harness fixes — land on main per ADR-0028, merge down):

- **SS1** infrastructure-persistence §soft-delete needs a third bullet
  naming the joined-table case (filter the join, keep the anchor row,
  represent the absent side explicitly — not `""`).
- **SS2** frontend-architecture + hidden-information "no Supabase
  anon-key access" sentences need a clause pointing at ADR-0032 (the
  realtime-js dependency + bundled anon JWT read as a contradiction
  cold).
- **SS3** frontend-architecture's hardcoded-value audit sentence should
  add constant-valued inline `style={{}}` to the flag list (the
  TABLE_DISC_PCT shape is invisible to the current greps).

Advisory (defer allowed; log only): ADR-0030 class-name assertion in
app-shell.test.tsx (positioned-ancestor claim belongs to the rendered
path; CAM-15 precedent exists); game.$gameId route owns logic (CAM-18
replaces it); Math.max(0, viewerIndex) hides a projection disagreement —
comment why -1 is unreachable; TABLE_DISC_PCT as inline style vs a
custom utility (form question); styles.css:35–38 comment overstates the
primitive wipe (bg-(--var) routes around it); findManyById's documented
absence contract vs the `?? ""` deferral; playerNames N+1 on three hot
routes — CAM-18 candidate: embed names in GameStarted + fold into state,
dissolving F5/F7 permanently; domain testing fixture docstring coupled
to an api test-harness literal; leak scanner now scans player names (≥3
char fixture convention is comment-enforced across three files);
LobbyView "started" status has no room-screen branch (unreachable today
— nothing pins that StartGame never publishes lobby updates); lobby
route has no head title while room/game do.

### Verification record

`pnpm turbo build typecheck lint test --force` → 25/25, 0 cached.
`VIEW_GAMES=40 VIEW_SEED=1717 pnpm turbo test --filter
@cambio/application --force` → 86 green, adversarial 1 test 2.2s. Live
walkthrough (browser + second cookie-jar session) run this cycle
including reconnect kill/restart and started-room redirect. No timing
findings arose, so no timing probe was required.

### Fix cycle 2026-09-05 — all findings RESOLVED

- **F1 RESOLVED (canon scoped + code)**: scenes.md wash rule scoped to
  pictorial scenes; room keeps opaque panels; the room identity-branch
  h1 moved inside its panel. Branch: canon amended (with the room
  composition kept), not wash-everywhere.
- **F2 RESOLVED (claim amended everywhere, by sweep)**: forms.md amended
  with the wash exception (inline amendment note); lobby-screen.tsx
  prose rewritten; frontend plan laws line and step-8 prose amended.
  Sweep re-run across all phrasings — remaining hits are only the
  finding records themselves.
- **F3 RESOLVED**: table-surface.md Anatomy rewritten for the painted
  asset; tokens.md surface.table + tan-paving + surface.warm
  descriptions and the styles.css surface.warm comment updated
  (checkerboard sweep clean).
- **F4 RESOLVED (test/schema strengthened + claim corrected)**: shared
  `DisplayName` schema in GamePrimitives, reused by
  CreateUserRequest/SessionUser/ViewPlayer/LobbyMember; vanished-user
  fallback is the decodable "—" in both producers; the false docstring
  rewritten; backend plan shape-table instance amended with note;
  "1–32 by construction" sweep clean.
- **F5 RESOLVED**: `viewForEffect` is the single projection entry; all
  three route sites use it; pure `viewFor` kept as the test seam.
- **F6 RESOLVED (structural)**: `User` extracted to its own domain
  module; the cycle no longer exists; the statement-form import-type
  workarounds reverted to house style and their now-stale cycle
  comments deleted (no claim ⇒ no enforcement test owed).
- **F7 RESOLVED**: the GET view refusal is a typed `GameNotFound`
  failure inside the effect (Effect.gen), no sentinel, no casts;
  byte-identical-404 pin stayed green; 404-before-names preserved.
- **F8 RESOLVED (schema strengthened)**: `WireGameConfig` with
  `Schema.positive()` used by both GameStarted.config and
  PlayerGameView.config; contracts pin rejects 0/−1 (contracts 10→11).
- **F9 RESOLVED (tests strengthened)**: all three lobby use-case suites
  assert the published version equals the result version (Join/Leave
  also pin the absolute post-save value) — the newVersion→version swap
  mutant now fails in either direction.
- **F10 RESOLVED (hardened + tested)**: env guard rejects
  empty/whitespace; SSR guard throws before construction; misconfigured
  subscribe reports `reconnecting` (one config-only console.error, no-op
  unsubscribe) instead of crashing to the router error page. Mutant
  (trim-check removal) killed by the new realtime test.
- **F11 RESOLVED (test strengthened)**: env-declaration test slices the
  `@cambio/web#build` and `dev` blocks and asserts each slot's array
  separately — a var in only one slot now fails (both one-slot mutants
  killed).
- **F12 RESOLVED (claim-truthful copy)**: outsider denial reads "No
  open seat / This room started without you or has closed…" — the wire
  cannot distinguish; broadcast-path `closed` copy unchanged.
- **F13 RESOLVED**: sr-only page h1 hoisted to the RoomScreen wrapper
  for every branch except the identity branch (own visible h1);
  Math.max fallback comment added (advisory A5 folded in).
- **F14 RESOLVED**: (a) alert.md → r2 with the action-slot ink rule +
  structural pin (ink verified by the rendered gate path per ADR-0030);
  (b) r1→r2 citations fixed; (c) L3/S1 rows updated to completed; (d)
  B5 row reworded to what is actually asserted; (e) B4 row points at
  the enumerated pins; (f) R4/W3 rows reworded.
- **Skill staleness SS1–SS3**: fixed on `main` per ADR-0028 and merged
  down (see the fix-cycle Progress entry).
- **Discovery during the cycle**: the C4.2 fuzz test
  (packages/domain/test/sim/Fuzz.test.ts) timed out at vitest's 30s
  default under a fully parallel `--force` gate (~14s solo) — a latent
  CAM-2-era load flake surfaced by this review's forced run, fixed with
  an explicit 120s long-test timeout, not a speedup.
- **Advisories**: remain deferred as logged (A5 was folded into F13);
  the playerNames-into-GameStarted idea stands as the named CAM-18
  candidate.

Re-verified after the cycle: forced full gate 25/25 (0 cached), suite
totals contracts 11 / domain 194 / application 86 / api 118 / ui 19 /
web 75 / config 16 = 519.
