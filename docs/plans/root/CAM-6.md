# CAM-6 — Presentation + realtime: Fastify routes, viewFor projection, Supabase Broadcast

- **Linear:** [CAM-6](https://linear.app/raafayk7/issue/CAM-6/presentation-realtime-fastify-routes-viewfor-projection-supabase)
- **Scope:** backend
- **Child plans:** [backend](../backend/CAM-6.md)
- **ADRs:** 0021 (viewFor structural projection, event-time private delivery), 0022 (penalty cards unseen), 0023 (unguessable capability topics), 0024 (self-hosted realtime container + REST broadcast)

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

After this task, a browser (or curl + a websocket client) can play a full
game of Cambio against the running API: create a lobby, join it, start the
game, and issue every turn command over HTTP — while every participant
receives realtime events on Supabase Broadcast channels, each seeing exactly
what the rules entitle them to see and **nothing else**. Observe it working:
`docker compose -f docker/docker-compose.yml up -d` (now Postgres +
Realtime), `pnpm dev`, then drive a game with authenticated HTTP calls and
watch projected events arrive on the room and per-player topics.

This is HANDOFF §12 step 5. It is also the main event of the
`hidden-information` skill: the single `viewFor` projection and the
never-send-it-at-all invariant get built and adversarially tested here.

## Context & orientation

What exists (all verified against release-v0 tip):

- **Application surface** (CAM-5): `RoomRegistry`
  (`packages/application/src/room/RoomRegistry.ts:87-103`) with
  `execute(gameId, command)`, `join`, `leave`, `start(gameId, {config,…})`,
  all serialized per room through the actor queue (ADR-0020). `createLobby`
  (`packages/application/src/use-cases/CreateLobby.ts`) is a plain use case
  called directly (it mints the id). Replies: `GameAdvanced {state, version,
events}` — **full truth, unprojected** — and `LobbyChanged {lobby,
version}`.
- **The port to implement**: `RealtimePublisherPort`
  (`packages/application/src/ports/RealtimePublisher.ts:22-32`) —
  `publishGame(gameId, state, events)`, `publishLobby(gameId, lobby)`, no
  error channel by design (a persisted command must never fail on realtime).
  `SeedPort` (`packages/application/src/ports/Seed.ts`) also has no adapter
  yet. `runtime.ts` (`apps/api/src/runtime.ts:19-33`) provides neither, nor
  the `RoomRegistry` layer — wiring all three is this task's work.
- **Presentation layer** (CAM-4): `buildServer`
  (`apps/api/src/presentation/server.ts:20-61`), session preHandler
  (`apps/api/src/presentation/auth.ts:48-67`), exhaustive error→status
  mapping pattern (`apps/api/src/presentation/errors.ts:18-29`), the
  Either-decode-before-effect route pattern
  (`apps/api/src/presentation/users.ts:22-32`). No `setNotFoundHandler`
  (deferred CAM-4 → CAM-5 → here), no error contract, no game routes.
- **Contracts** (`packages/contracts`): only `Health` and `User`. Command,
  event, view, and error schemas all land here, in this task (deferred from
  CAM-5 by user call). Contracts may import `effect` only — domain brands
  cannot cross; wire shapes re-declare primitives (`User.ts:19-21`
  precedent).
- **Domain shapes to project**: `GameState`
  (`packages/domain/src/GameState.ts:54-61` — `players/deck/discard/prng/
phase/config`; `deck` and `prng` are the shuffled future), `Phase`
  (`packages/domain/src/Phase.ts:68-75`, six variants, three carrying a card
  value), `Command` (`packages/domain/src/Command.ts:74-85`, ten variants),
  `GameEvent` (`packages/domain/src/GameEvent.ts:167-190`, 22 variants
  carrying full truth), `Lobby` (fully public), `GameConfig`
  (`packages/domain/src/GameConfig.ts:10-12` — exactly `slamWindowMs`).
- **Governing docs**: HANDOFF §5 (all of it), §6 (timers not authoritative),
  §12 step 5; ADRs 0009–0012 (rule semantics), 0018 (sessions), 0020 (room
  actor), and this task's 0021–0024. Skills: `hidden-information`,
  `application-layer`, `architecture`, `infrastructure-persistence`,
  `cambio-rules`.

Key discovery that shaped the design: `GameState` records no peek knowledge
(`card_peeks` is written at `apps/api/src/infra/game-repository.ts:227-229`
but never read), so a snapshot cannot re-derive who saw what — resolved by
ADR-0021: the snapshot is structural, private values ride events exactly
once.

## Functional contract

Numbered for the child plan's coverage table. Engine-behavior claims cite
the test or source that pins them (probe-verify rule).

### C1 — HTTP surface

- **C1.1** `POST /lobbies` (session required) calls `createLobby` with the
  session user as creator and returns 201 with the lobby view, version, and
  the caller's channel grants (room topic + their per-player topic, per
  ADR-0023).
- **C1.2** `POST /lobbies/:gameId/join` calls `RoomRegistry.join(gameId,
sessionUserId)`; success returns the lobby view, version, and the
  caller's channel grants. `POST /lobbies/:gameId/leave` calls
  `RoomRegistry.leave`; success returns the lobby view and version.
- **C1.3** `POST /lobbies/:gameId/start` calls `RoomRegistry.start` with
  `GameConfig` assembled at the route layer from `AppConfig.slamWindowMs`
  (sourced from new env `SLAM_WINDOW_MS`; `StartGame.ts:33` pins that
  presentation assembles it — a static value is not a capability, so no
  port).
- **C1.4** `POST /games/:gameId/commands` decodes a **wire command union of
  exactly the 9 player-issued variants** (`CallCambio`, `TakeDiscard`,
  `DrawFromDeck`, `SwapHeld`, `DiscardHeld`, `KeepHeld`, `PowerPeek`,
  `PowerSwap`, `Slam`) and calls `RoomRegistry.execute`. `CloseSlamWindow`
  is **not** on the wire — the room actor already lazy-closes expired
  windows (pinned: `packages/application/test/RoomRegistry.test.ts:389`
  "timer vs lazy close are equivalent…").
- **C1.5** The domain command's `playerId` is **always** the session user's
  id. A `playerId` field in a request body is either absent from the wire
  schemas or ignored — a client cannot act as another player. (Adversarial
  test required.)
- **C1.6** `GET /games/:gameId/view` (session required) returns the
  caller's `viewFor` snapshot plus the current version and the caller's
  channel grants. A session user who is not a participant of the game gets
  a 404-class error, not a spectator view.
- **C1.7** All lobby and game routes require a session
  (`makeRequireSession`); unauthenticated requests get 401 with the error
  contract body.
- **C1.8** Malformed bodies fail Schema decode and return 400 **before any
  effect runs** (pattern: `users.ts:22-32`).
- **C1.9** Every typed error in the registry/use-case unions maps to a
  status through an exhaustive `switch` ending in `satisfies never`
  (pattern: `errors.ts:18-29`): `GameNotFound` → 404; `UserNotFound` → 404;
  `VersionConflict` → 409; `LobbyFull` / `AlreadyInLobby` / `NotInLobby` /
  `LobbyNotJoinable` → 409; `GameError` (16 variants, all illegal-move
  shaped) → 422; `StorageError` → 500. Error bodies follow a new
  `contracts` error schema (machine-readable tag + human message).
- **C1.10** A request racing a dying room actor (bare interrupt / defect
  escaping the typed union — source: `RoomRegistry.ts:301-303`, flagged in
  CAM-5 root plan) is caught at the route via exit inspection and returns a
  500-class response; it never hangs the request and never crashes the
  process.
- **C1.11** Unmatched routes return a curated 404 body via
  `setNotFoundHandler` (finally landing after two deferrals).

### C2 — viewFor projection (ADR-0021)

Single function, application layer, `(playerId, gameState) → PlayerGameView`
(a `contracts` shape). For every phase and every viewer:

- **C2.1** Opponents' hands appear as slot occupancy only (slot indices +
  card count) — no card values. The viewer's **own hand too** (structural
  only; memory is the game).
- **C2.2** The deck appears as a count only. The full `deck` array and the
  `prng` state appear in **no** view, ever.
- **C2.3** The discard pile is included as-is (public by definition).
- **C2.4** Phase projection: `HoldingCard` includes the held card's value
  for the **holder always**, and for **everyone** when `source ===
"discard"` (it came off the public pile); for non-holders with `source
=== "deck"` the value is absent. `ResolvingPower` / `ResolvingQueenSwap`
  include the drawn card's value for the holder only. `SlamWindow` is fully
  public (`turnPlayerId`, `closesAt`, `rank` — the rank is the top
  discard's, already public). `AwaitingDraw` and `Ended` carry no values.
- **C2.5** When phase is `Ended`, the view includes the endgame reveal: all
  hands with values, per-player totals, and the winner set (ties
  representable; scoring pinned by `packages/domain/src/Scoring.ts:19-26`
  and its tests).
- **C2.6** The view includes seat order and whose turn/phase it is; the
  game version travels beside the view in every reply envelope (for
  client-side staleness checks — the pure projection itself cannot know
  the version, which lives outside `GameState`).
- **C2.7** The lobby view (members, status) is fully public — one shape for
  all viewers.

### C3 — Event projection & channel classification

Every domain event is classified and projected before publishing; the
classification is a total function over all 22 variants (exhaustive switch,
`satisfies never`). Full-truth payloads (`GameEvent.ts:11-13`) never reach a
channel unprojected.

- **C3.1 Room channel** (identical payload for all participants):
  `CambioCalled`, `GameEnded` (scores + winners), `CardsBlindSwapped` (slot
  movements only — already value-free), `PowerFizzled`, `SlamWindowOpened`,
  `SlamWindowClosed`, `CardGivenFromHand` (slot movement only),
  `DrawSkipped`, `TurnAdvanced` — published as-is (they carry no card
  values); plus the value-stripped projections below.
- **C3.2 Public-with-value** (the value is on the discard pile or publicly
  revealed by rule): `DiscardTaken`, `HeldDiscarded`, `PowerDiscarded`
  (card lands face-up on the pile), `SlamSucceeded`, `SlamFailed` (the slam
  reveal is part of the cost — §1.5, pinned by
  `packages/domain/test/Slam.test.ts:51-166`). Published on the room
  channel **with** the card value.
- **C3.3 Value-stripped for everyone**: `GameStarted` (room version carries
  players, seat order, first discard, deck count, config — `hands`, `deck`,
  `prng`, `seed` stripped; there is no opening peek, so not even the owner
  sees dealt cards), `HeldSwapped` (slot + the displaced card which lands
  on the pile; the placed card's value is stripped — its owner already saw
  it at draw time, ADR-0021 forbids re-sending), `HeldKept` (slot only,
  value stripped — same reason), `PenaltyDrawn` (slot only — ADR-0022:
  unseen by everyone including the slammer), `CardGivenFromDeck` (slot only
  — ADR-0009: given unseen), `DeckReshuffled` (published as "reshuffle
  happened" + new deck count; `deck` and `prng` stripped).
- **C3.4 Per-player channel** (private payloads, delivered exactly once, at
  event time): `CardDrawn` → the drawer receives the card value on their
  channel; the room receives a value-stripped "player drew" event.
  `CardPeeked` → the viewer receives the card value; the room receives
  "viewer peeked at target slot" without the value.
- **C3.5** No private payload is ever re-sent: the snapshot (C2) never
  includes previously-peeked or previously-drawn values once the phase has
  moved on (ADR-0021).

### C4 — Publisher adapter (ADR-0023, ADR-0024)

- **C4.1** The adapter implements `RealtimePublisherPort` exactly
  (`RealtimePublisher.ts:25-30`; tag key pinned by
  `packages/application/test/Ports.test.ts:40`). `publishGame` projects
  `(state, events)` through C2/C3 into one batch: room-topic messages plus
  per-player-topic messages for each participant; `publishLobby` publishes
  the public lobby view to the room topic.
- **C4.2** Transport is a thin Effect `fetch` wrapper over the Realtime
  REST broadcast endpoint (`POST /api/broadcast`, batch of `{topic, event,
payload}`), authenticated with a self-signed HS256 JWT (claims `role`,
  `exp`) — no SDK dependency in `apps/api`.
- **C4.3** Publish failures (network, non-2xx) are logged and swallowed —
  the port has no error channel; a persisted command never fails because
  realtime hiccupped. (Test: adapter resolves void on transport failure.)
- **C4.4** Topics follow ADR-0023: room `game:{gameId}:{roomSecret}`,
  per-player `game:{gameId}:player:{userId}:{playerSecret}`; secrets are
  derived deterministically (HMAC over gameId/userId with a dedicated
  server secret) so they survive API restarts without persistence, and are
  handed only to the entitled caller via C1 responses. One player's
  response never contains another player's secret. (Adversarial test
  required.)

### C5 — Wiring & environment

- **C5.1** `runtime.ts` gains: a live `SeedPort` adapter (crypto-random),
  the publisher layer, and `RoomRegistryLive`; `AppServices` widens
  accordingly and the API boots with the full layer stack.
- **C5.2** New env vars — `SLAM_WINDOW_MS`, the realtime URL, the realtime
  JWT secret, and the topic-secret — are added to `apps/api/src/config.ts`,
  `.env.example`, and `turbo.json` pass-through in the same change (the
  `.env.example` header claims completeness; keep it true). Test-support
  `baseConfig` (`apps/api/test/support/http.ts:34-45`) is extended to
  match.
- **C5.3** `docker/docker-compose.yml` gains the `supabase/realtime`
  service per ADR-0024 (existing Postgres, `_realtime` schema confined via
  search_path, `SEED_SELF_HOST`, pinned version). `pnpm dev` +
  compose-up yields a working local publish path.

### C6 — HTTP replies are projected (the GameAdvanced gate)

- **C6.1** No route serializes `GameAdvanced.state` or raw `GameEvent`s.
  Command and start replies return `{view: viewFor(caller, state), version}`
  — private values reach clients **only** via the per-player channel (one
  delivery path for event-borne values). Adversarial test: for every
  command reply across simulated games, the response body contains no card
  slug the caller isn't entitled to under C2, and no other player's hand
  values, deck contents, or prng — same assertion applied to the C1.6
  snapshot.
- **C6.2** `GameAdvanced`'s doc comment gains the same full-truth warning
  `RealtimePublisherPort` carries (closing the CAM-5 advisory).

### Acceptance criteria

- [ ] `pnpm turbo build typecheck lint test` passes (run bare — never
      piped).
- [ ] A scripted end-to-end game (create → join → start → commands through
      an ended game) succeeds over `app.inject` with only HTTP + the
      publisher stub/journal, asserting projected payloads throughout.
- [ ] The realtime integration suite passes against the compose Realtime
      container (hard-fails if the container is down, like the Postgres
      suites — no silent skip).
- [ ] Adversarial suites exist and pass: per-phase view assertions (C2),
      per-event channel assertions (C3), reply assertions (C6.1), secret
      isolation (C4.4), impersonation rejection (C1.5) — each asserting
      what payloads do **not** contain.
- [ ] All four ADRs committed with the index updated; `.env.example` and
      `turbo.json` consistent with `config.ts`.

## Plan of work

Milestones in dependency order. **M1 freezes `contracts` first** so nothing
downstream builds against drifting wire shapes (and the future frontend task
consumes a settled language).

1. **M1 — Contracts freeze.** Wire schemas in `packages/contracts`: the
   9-variant command union, the room/per-player event unions (every C3
   classification gets its named, explicit schema — splitting "mostly
   public" events is done _here_, by construction), `PlayerGameView`,
   `LobbyView`, channel-grant shapes, the error contract, and Either-decode
   helpers. Shapes only, no logic; unbranded primitives.
2. **M2 — Projections (application layer).** `viewFor` and the event
   projection/classification as pure functions from domain shapes to
   contracts shapes, TDD'd: unit tests per phase/event, then the
   simulation-driven adversarial sweep (`@cambio/domain/testing`'s `onStep`
   hook walks real games and asserts C2/C3 negatives for every player at
   every step).
3. **M3 — Infrastructure.** Compose gains the Realtime service (ADR-0024);
   `SeedPort` adapter; the publisher adapter (topic derivation per C4.4,
   REST client, projection wiring, swallow-and-log) with stub-based unit
   tests gating CI plus the container-backed integration suite.
4. **M4 — Presentation & wiring.** Config/env additions; error contract
   mapping + `setNotFoundHandler`; lobby routes, command route, view route;
   dying-actor exit handling; `runtime.ts` layer completion; HTTP tests
   including the end-to-end scripted game and the C1.5/C6.1 adversarial
   assertions.
5. **M5 — Close-out.** Full gate, coverage table reconciliation, CAM-5
   advisory cleanups that landed here (C6.2 warning, `RoomRegistry` tag pin
   if done), plan/ADR docs finalized.

File-level detail: [backend child plan](../backend/CAM-6.md).

## Validation

- **Adversarial-by-simulation**: the decisive suites drive
  `simulateGame` over many seeded games and, at every step, project every
  player's view and every event's channel payloads, asserting the
  _absence_ of unentitled card slugs, the deck array, and prng state. This
  covers all phases including rare ones (`ResolvingQueenSwap`, fizzles,
  reshuffles) without hand-built fixtures.
- **Stub-journal ordering**: publisher stub tests reuse the CAM-5 journal
  pattern (`packages/application/test/support/stubs.ts:167-179`) to assert
  persist-before-publish ordering still holds through the real wiring.
- **Integration**: the container-backed suite publishes through the real
  REST endpoint and subscribes with a websocket client to assert delivery
  on the right topics and nothing on wrong ones.
- **End-to-end**: scripted full game over `app.inject` (see acceptance
  criteria).
- Run: `docker compose -f docker/docker-compose.yml up -d`, then
  `pnpm turbo build typecheck lint test` bare.

## Progress

_(updated continuously; append new entries at the BOTTOM — newest last;
timestamp each entry)_

- [x] 2026-09-01 — Planning: interview rounds 1–3 complete, explorers
      reported, ADRs 0021–0024 written, root + backend plans drafted.

## Decision log

- 2026-09-01 — **Slam scope**: CAM-6 exposes the `Slam` command route like
  any other; CAM-7 owns the close-timer optimization fiber, race testing,
  and slam e2e. (User call, round 1.)
- 2026-09-01 — **Snapshot endpoint in scope**: `GET /games/:gameId/view`
  ships here; realtime alone can't bootstrap a (re)connecting client.
  (User call, round 1.)
- 2026-09-01 — **Route shape**: one generic `POST /games/:gameId/commands`
  over a wire union, not per-command routes; `CloseSlamWindow` excluded
  from the wire (issuer-less, actor lazy-closes already). (User call,
  round 2.)
- 2026-09-01 — **Realtime tests hard-fail** when the container is down,
  matching the Postgres suites' philosophy — no silent skip. (User call,
  round 2.)
- 2026-09-01 — **Command replies are `{view, version}` only**; all
  event-borne values (including peeks) travel exclusively via per-player
  channels. One projection path for events, one for snapshots — smaller
  leak surface. Accepted risk: a dropped private broadcast loses that
  knowledge (consistent with ADR-0021's stance).
- 2026-09-01 — **Projections live in `packages/application`** (import
  domain + contracts — the only layer that legally sees both); the wire
  command → domain `Command` mapping lives there too. Routes stay
  technology-only.
- 2026-09-01 — **Topic secrets are HMAC-derived** from a dedicated server
  secret (no persistence, restart-stable) rather than random-and-stored.
- 2026-09-01 — **`SLAM_WINDOW_MS` default 5000** in `.env.example` —
  placeholder pending playtesting (ADR-0011 requires config, not the
  number).
- 2026-09-01 — **Error statuses**: 422 for `GameError` (semantically
  illegal move on a well-formed request), 409 for version/lobby-state
  conflicts, 404 for not-found (including non-participant view requests to
  avoid existence leaks).

## Surprises & discoveries

- `GameState` carries no peek knowledge; `card_peeks` is write-only today.
  This forced the ADR-0021 design (structural snapshot + event-time
  delivery) rather than a "re-send what they know" snapshot.
- `PenaltyDrawn` visibility was a genuine HANDOFF §1 gap — resolved with
  the user as ADR-0022 (unseen by everyone).
- The bare self-hosted Realtime container needs **no cloud API key** — the
  tenant JWT secret is self-chosen; the REST broadcast endpoint exists on
  the bare container at `/api/broadcast` (cloud's `/realtime/v1/api/
broadcast` is just Kong routing to it). Tenant resolution is by Host
  subdomain (`realtime-dev.localhost:4000`), a known pitfall.
- The repo has **no** test-skip-when-infra-down mechanism anywhere —
  the "skip when container off" option originally floated in the interview
  doesn't exist as a pattern; hard-fail chosen instead.

## Outcomes & retrospective

_(filled at the end, typically by `/review`)_
