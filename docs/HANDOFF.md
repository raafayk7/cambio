# Cambio — Project Handoff

**Status:** pre-scaffold. No code exists yet.
**Audience:** Claude Code (and any future agent working in this repo).
**Intended home:** `docs/HANDOFF.md`, committed in the first commit.

---

## 0. How to use this document

This is the source of truth for game rules, architectural decisions, and the data model. It is deliberately **not** a task list for the whole project — it is the context you need before doing any task.

Rules for working from this document:

1. **Do not invent game rules.** Every rule is specified in §1. If a situation isn't covered, stop and ask. Rules were playtested in person; guesses will be wrong.
2. **Do not silently resolve the open decisions in §9.** Ask.
3. **Task 1 is scaffolding only** (§10). Do not begin implementing game logic, even if it seems obvious and cheap. The domain model is built in a later task, deliberately, with tests first.
4. When a decision here conflicts with a habit or a template you'd normally reach for, this document wins.

---

## 1. Game rules (canonical)

Cambio is a hidden-information, memory-based card game. **Lowest score wins.**

### 1.1 Setup

- 2–5 players. Single standard 52-card deck. No jokers.

> **Amended:** [ADR-0036](adr/0036-four-player-cap-bench-anchored-table-layout.md)
> caps games at **2–4 players**, enforced in the domain (`Deal.ts`'s
> player-count gate, `Lobby.ts`'s `MAX_LOBBY_MEMBERS`) — the bench-anchored
> table layout makes the visual metaphor load-bearing, and the rule bends to
> it. The "2–5 players" line above is superseded; a fifth player is no
> longer accepted.

- Each player is dealt **4 face-down cards**. Players do **not** look at any of them.
- **There is no opening peek phase.** This is intentional and differs from most published Cambio variants. Do not add one.
- One card is turned face up to start the discard pile. The remainder is the face-down draw deck.

> **Amended:** [ADR-0039](adr/0039-game-starts-with-empty-discard-pile.md)
> removes the opening face-up card — the deal now leaves the discard pile
> **empty**, and all 52 cards minus the four dealt to each player form the
> draw deck (`52 − 4n`). The first player's opening options are draw or
> call Cambio only; no slam is possible until the first discard lands. The
> "one card is turned face up" line above is superseded.

### 1.2 Scoring

| Card | Score |
|---|---|
| Ace | 0 |
| 2–10 | face value |
| Jack | 11 |
| Queen | 11 |
| King (♠ ♣) | −1 |
| King (♥ ♦) | −2 |

Negative totals are possible and normal. A hand of zero cards scores 0, which is therefore **beatable**.

Score is a property of a specific card, not of a rank — the two black kings and two red kings differ. Derive it from rank **and** suit.

### 1.3 A turn

The active player does exactly one of:

**(a) Call Cambio.** The game ends *immediately*. There is no final round of turns, and no bonus or penalty for the caller. All hands are revealed and scored.

**(b) Take the top discard.** Only permitted if the top discard is **not** a power card (7, 8, 9, 10, J, Q). The taken card **must** be swapped into one of the player's own slots; the displaced card goes face up onto the discard pile. It cannot be discarded straight back.

**(c) Draw from the face-down deck.** Then:

- **Non-power card (A, 2–6, K):** either blind-swap it into one of their own slots (displaced card goes to the discard pile), or discard it directly.
- **Power card (7, 8, 9, 10, J, Q):** the player is **obligated to play the power**. They may not decline it, keep the card, or discard it unused. After resolution the power card goes to the discard pile.

After the turn action resolves, the slam window opens (§1.5).

### 1.4 Powers

| Card | Power |
|---|---|
| 7, 8 | Look at one of your own cards |
| 9, 10 | Look at one of another player's cards |
| J | Blind-swap any two cards belonging to players |
| Q | Look at any one card, then blind-swap any two cards belonging to players |

Notes:

- Powers only trigger when the card is **drawn from the deck**. A power card sitting on the discard pile is inert (and cannot be taken — see 1.3b), though it is still slammable.
- The Queen's swap may include the card just looked at. The swap is not optional in the sense of skipping the whole power — the player is obligated to play the Queen — but the specific pairing is theirs to choose.
- A Jack or Queen swap may involve any two player-held cards, including two belonging to the same player.
- Swaps are **publicly visible as slot movements** — everyone sees which two slots exchanged, just not the values. This matters for knowledge propagation (§4.4).

### 1.5 Slamming

After a turn resolves, a **time-limited window** opens in which any player may slam.

- A slam claims that a chosen face-down card has the **same rank** as the current top discard.
- Matching is on **rank, not score**. A Jack does not match a Queen despite both scoring 11. A black King matches a red King despite different scores.
- Any player may slam. A player may slam their own card or another player's, and may slam multiple times within the window.

Outcomes:

| Slam | Result |
|---|---|
| Own card, correct | Card is removed to the discard pile. Hand shrinks. |
| Own card, incorrect | Card stays; slammer draws a penalty card from the face-down deck. |
| Opponent's card, correct | Card is removed to the discard pile; the slammer gives one of their own cards (blind, slammer's choice of slot) into the vacated slot. |
| Opponent's card, incorrect | Card stays face-down with its owner; slammer draws a penalty card from the face-down deck. |

Every slam attempt, correct or not, **publicly reveals** the slammed card momentarily. That information leak is part of the cost.

### 1.6 Zero-card and edge cases

- A player may reach zero cards through slamming. This is **not** an instant win — a score of 0 loses to any negative total.
- A zero-card player still takes turns: they draw and may either keep the card (hand becomes 1) or discard it.
- **Open question — see §9:** what happens when a slammer with zero cards correctly slams an opponent and owes them a card? And what happens when a J/Q swap targets a player with no cards?

### 1.7 Deck exhaustion

When the draw deck empties, reshuffle the discard pile (retaining the current top card as the new top discard) to form a new draw deck.

> **Amended:** [ADR-0040](adr/0040-eager-single-mechanism-deck-reshuffle.md)
> makes the reshuffle **eager**: it fires the instant a draw empties the
> deck, or a discard lands on an empty deck making the pile reshufflable —
> never waiting for the next draw. The engine enforces a resting invariant
> (deck empty ⟹ discard ≤ 1) from exactly one mechanism; the retain-top
> rule above is unchanged, only the timing.

### 1.8 End of game

Triggered only by a Cambio call. All hands revealed, scores summed, lowest total wins. **Ties are possible and must be representable** — there is no caller tiebreak.

---

## 2. Stack

Locked in:

| Layer | Choice |
|---|---|
| Monorepo | Turborepo |
| Runtime | Node 22 |
| Package manager | pnpm (workspaces) |
| Backend framework | Fastify |
| Domain modelling / FP | Effect — Branded types for primitives, Schema for validation, Tagged Structs (Data.TaggedEnum / Schema.TaggedStruct) for ADTs |
| Validation | Effect Schema. **Not Zod.** Do not add Zod for any reason. |
| Error handling | Effect typed errors throughout. No thrown exceptions across layer boundaries. |
| Logging | Pino |
| Database | Postgres (Supabase in deployed envs, Docker locally) |
| Realtime | Supabase Realtime, **Broadcast mode only** (§5) |
| Cache | Redis only if a concrete need appears. Not in the initial scaffold. |
| Frontend meta-framework | TanStack Start |
| Server-state | TanStack Query (lobby, auth, match history — **not** live game state) |
| Client game state | Zustand |
| Components | shadcn/ui |
| Hosting | Render free tier (API), Supabase (DB + realtime) |

Visual design direction is being decided separately. Do not invent a design system beyond shadcn defaults.

---

## 3. Repo layout

```
cambio/
├── apps/
│   ├── api/                    # Fastify — presentation + infrastructure
│   │   └── src/
│   │       ├── presentation/   # routes, request/response mapping, realtime handlers
│   │       └── infra/          # adapters: postgres repositories, supabase publisher, pino
│   └── web/                    # TanStack Start
│       └── src/
│           ├── pages/
│           ├── components/
│           ├── containers/
│           ├── services/
│           ├── stores/
│           ├── hooks/
│           └── types/
├── packages/
│   ├── domain/                 # pure. entities, ADTs, rules engine, repository ports
│   ├── application/            # use cases, infrastructure ports
│   ├── contracts/              # wire types shared by api + web (Effect Schema)
│   ├── ui/                     # shadcn primitives, shared components, styles
│   └── config/                 # shared tsconfig / eslint / prettier bases
├── docker/
│   └── docker-compose.yml
├── docs/
│   └── HANDOFF.md              # this file
├── turbo.json
└── pnpm-workspace.yaml
```

Package scope: `@cambio/*`.

### 3.1 Dependency rules (enforced, not aspirational)

| Package | May import |
|---|---|
| `domain` | `effect` only |
| `application` | `domain`, `contracts`, `effect` |
| `contracts` | `effect` only |
| `apps/api` | `application`, `domain`, `contracts` |
| `apps/web` | `contracts`, `ui` — **never** `domain` or `application` |
| `ui` | nothing app-specific |

- **Repository ports live in `domain`.** Their implementations live in `apps/api/src/infra`.
- **Infrastructure ports live in `application`** (clock, id generation, realtime publisher, logger). Implementations also in `apps/api/src/infra`.
- `domain` performs **no I/O**. No database, no clock reads, no randomness. Shuffling takes a seed or an injected RNG port; time is passed in.
- Enforce the table above with `eslint-plugin-boundaries` or `dependency-cruiser`, wired into `turbo lint`. This must actually fail CI, not just warn.

`contracts` exists because `web` needs command and event schemas but must never see the domain — the domain contains full game state including other players' cards. Keeping them separate makes information leakage a compile error rather than a code-review question.

---

## 4. Domain model

### 4.1 Cards are not a table

There are exactly 52 cards. Model them as a domain constant, not a database entity:

- `CardSlug` — a branded Schema literal union of all 52 slugs (`"AS"`, `"7H"`, `"KD"`, …).
- `rank(slug)`, `suit(slug)`, `score(slug)` are **pure derivation functions**. Do not store score.
- No `Card` table, no card UUIDs. `cardSlug` is the natural key and is unique within a single deck, which also makes it a stable identity for peek and knowledge tracking.

This locks the game to one deck. That's acceptable at a 5-player maximum.

> **Amended:** the maximum is now **4 players** (ADR-0036, see the §1.1
> amendment) — which only strengthens this conclusion: one deck covers a
> 4-player game with even more headroom.

### 4.2 Turn phase is a discriminated union

> **Amended:** this sketch is superseded by the implemented union in
> `packages/domain/src/Phase.ts` — ADR-0010 split the Queen's swap into
> `ResolvingQueenSwap`, ADR-0011 added `SlamWindow.turnPlayerId`, and
> `ResolvingPower` carries the drawn card, not `power`/`chosen`. The
> *principles* below (phase carries the turn, one legality function) stand.

A turn is not atomic, and the drawn card must have a home. The game carries a `phase`:

```ts
type Phase =
  | { _tag: "AwaitingDraw";   playerId: UserId }
  | { _tag: "HoldingCard";    playerId: UserId; card: CardSlug; source: "deck" | "discard" }
  | { _tag: "ResolvingPower"; playerId: UserId; power: PowerKind; chosen: TargetSelection }
  | { _tag: "SlamWindow";     closesAt: Timestamp; rank: Rank }
  | { _tag: "Ended";          calledBy: UserId }
```

`source` matters: a card from the discard **must** be swapped, a card from the deck may be discarded. Same phase shape, different legal move set.

Legal moves are a function of `(phase, playerId, gameState)`. There should be exactly one place in the codebase that answers "is this move legal right now."

### 4.3 Persisted schema (sketch, not final DDL)

> **Amended:** the shipped DDL is `apps/api/migrations/0002_cambio_schema.sql`
> (CAM-3), which deviates deliberately: no `called_cambio_by` (derivable —
> `CallCambio` ends the game immediately, so it is always `phase.calledBy`),
> `decks` keyed by `game_id` with no surrogate `deck_id`, and `games` gains
> `prng` + `config` jsonb columns (ADR-0014 makes the event log
> self-contained). Where this sketch and the migration disagree, the
> migration and the CAM-3 plan's decision log win.

All tables additionally carry `created_at`, `updated_at`, `deleted_at`.

**`users`** — temporary/anonymous
`user_id` (uuid, pk), `user_name` (text)

**`games`**
`game_id` (uuid, pk), `status` (enum: `lobby` | `in_progress` | `completed` | `abandoned`), `phase` (jsonb — the §4.2 union), `discard_pile` (cardSlug[], ordered, index 0 = top), `called_cambio_by` (uuid, null), `version` (int, optimistic concurrency)

- No `turn` column — the active player lives inside `phase`.
- No `face_up_card` column — it is `discard_pile[0]`.
- Whether the top discard is *drawable* (rank ∉ powers) and whether it is *slammable* are both derived. Store neither.
- No `winner` column — ties are possible. Derive winners from per-player final scores.

**`game_players`** — replaces the `users: userID[]` array
`game_id`, `user_id`, `seat_index` (int), `final_score` (int, null), `is_connected` (bool), `is_bot` (bool, default false)
PK `(game_id, user_id)`. Unique `(game_id, seat_index)`. Turn advance is `(seat_index + 1) % n`.

**`decks`**
`deck_id` (uuid, pk), `game_id`, `cards` (cardSlug[], ordered, index 0 = next to draw)
No `size` column — it is `cards.length`.

**`user_cards`**
`game_id`, `user_id`, `index` (int), `card` (cardSlug)
Unique `(game_id, user_id, index)` and `(game_id, card)`.

**Index semantics:** indices are stable positions, **not** array offsets. When a slam removes the card at index 1, indices 2 and 3 do **not** shift — index 1 becomes a hole. Incoming cards fill the lowest free index. This keeps cards visually stable in the UI, which matters enormously in a memory game where players track "my left-most card."

**`card_peeks`**
`game_id`, `seq` (the event that caused it), `viewer_id`, `card` (cardSlug)
Required even though the UI is memory-faithful: the server needs it to build correct per-player views, and the bot will need it as belief state.

**`game_events`** — append-only
`game_id`, `seq` (int, unique per game), `type`, `payload` (jsonb), `actor_id`, `at`
Source of truth for reconstruction (§6). State tables are a materialized fold over this log.

### 4.4 Knowledge follows cards, not slots

Blind swaps are publicly visible as slot movements. If everyone saw that player 1's slot A swapped with player 2's slot C, then anyone who knew slot A held a 3 now knows player 2's slot C holds a 3.

So belief must be tracked against **card identity** (`cardSlug`), and propagated through the public swap history. Do not model knowledge as `(player, slot) → value`.

### 4.5 Invariants to assert in tests

- All 52 slugs are accounted for across `decks.cards` + `user_cards` + `games.discard_pile`, always, with no duplicates.
- No hand has a negative card count.
- `seat_index` values are contiguous from 0.
- Final scores sum to the sum of scores of all cards held at game end.
- Phase and status are consistent (`Ended` phase ⟺ status `completed`).

---

## 5. Realtime and hidden information

**Clients get no direct database access.** The Postgres service key lives only in `apps/api`. Supabase anon-key access from the browser is not part of this design.

**Use Supabase Realtime Broadcast, with the API server as the only publisher. Do not use Postgres Changes replication.** Reason: `decks.cards` literally contains the shuffled future of the game, and `user_cards` contains everyone's hand. RLS can gate *rows*, but it cannot express "this player may see this card's value because they peeked at it three turns ago" — that is game logic, not a row predicate.

Channel topology:

- **Room channel** — public events every player receives: whose turn it is, which slots swapped, that a peek occurred, slam results, phase transitions.
- **Per-player channel** — private payloads: the value of a card you drew, the value of a card you peeked at, your own known cards.

Server-side, there must be a single `viewFor(playerId, gameState)` projection. Card values a player is not entitled to **must not exist in the payload at all** — not hidden by CSS, not present-but-unrendered, not sent-then-filtered client-side. Anyone with devtools open otherwise wins every game.

### 5.1 Memory fidelity

The UI is **memory-faithful**: a peeked card is shown briefly, then never shown again. Remembering it is the player's job — that *is* the game. Do not add persistent markers, tooltips, or a "cards you know" panel. The server records peeks (§4.3) for view construction and future bot use, not to assist the human.

---

## 6. Deployment constraints (these shape the design)

Render's free tier spins down on inactivity and cold-starts slowly. Two consequences:

**Timers cannot be the authority.** The slam window's `closesAt` is an absolute timestamp stored in `phase`. Any command arriving after it computes "window already closed" from the clock. A live Effect fiber still pushes the close event on the happy path, but it is an optimization — a sleeping process fires no timers, and correctness must not depend on one.

**Rooms must be reconstructible.** After a restart, a room rebuilds in-memory state by folding `game_events` from `seq` 0. This is why the event log exists — on a host that restarts often, it's the recovery mechanism, not architectural purity.

**Single instance means no Redis.** In-memory room state plus Postgres is sufficient. Redis becomes necessary only if the API scales horizontally and needs pub/sub to route room events between instances. Do not add it pre-emptively.

**Command serialization.** All commands for a given room go through a single queue — an Effect `Queue` consumed by one fiber per room is a clean actor model. This is what makes slam races deterministic: first-in-queue wins, and ordering is server-authoritative rather than latency-dependent. `games.version` guards against double-submits and stale clients.

---

## 7. Data lifecycle

`pg_cron` on Supabase (no external scheduler needed):

- Weekly: soft-delete users, games, and dependent rows.
- One week later: hard-delete the soft-deleted rows.
- Abandoned **lobbies** expire in hours, not days — they will be the bulk of the rows.

Two gotchas:

1. Soft-delete breaks unique constraints. `UNIQUE (game_id, card)` will start rejecting inserts once soft-deleted rows accumulate. Use **partial** indexes: `... WHERE deleted_at IS NULL`.
2. The `deleted_at IS NULL` filter belongs in the repository layer. The domain must never know soft-delete exists.

---

## 8. Non-goals for now

- Computer/AI opponents. Designed for (the domain being pure and the belief model existing make a bot a pure function from redacted view → command) but **not built yet**.
- Spectator mode, reconnect-mid-game UX polish, match history UI, ranked play, accounts with passwords.
- Horizontal scaling, Redis, multiple decks, more than 5 players (now
  more than **4** — ADR-0036 capped games at 2–4, see the §1.1 amendment).

---

## 9. Open decisions — ask before choosing

These are genuinely undecided. Do not pick one and proceed.

1. **Migration tooling.** Suggested: `@effect/sql-pg` for queries (consistent with the Effect commitment) plus plain SQL migration files. Alternatives: Drizzle, Kysely. Not decided.
2. **Rule gap — zero-card slammer.** A player with no cards correctly slams an opponent and owes them a card. Skip the transfer, draw-then-give, or something else?
3. **Rule gap — J/Q targeting an empty hand.** Can a swap target a player with zero cards (i.e. is it a no-op, or illegal)?
4. **Slam window duration.** Needs a number, and needs playtesting. Should be config, not a literal.
5. **Temporary-user auth.** Presumably a signed cookie or JWT carrying a random `user_id`, no password. Session lifetime and rejoin behaviour unspecified.
6. **Test runner.** `vitest` + `@effect/vitest` is the obvious pairing but is not decided.
7. **Whether `contracts` is a separate package** or lives inside `application` with a re-export. Recommended separate (§3.1); confirm.

---

## 10. Task 1 — scaffold (this is the whole task)

Produce a working, empty, correctly-wired monorepo. **No game logic.**

### Deliverables

- pnpm workspace + Turborepo with tasks `build`, `dev`, `lint`, `typecheck`, `test`, correctly cached and with correct `dependsOn` graphs.
- Node 22 pinned (`.nvmrc` / `engines` / `packageManager` field).
- Shared `@cambio/config` with base tsconfig (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), eslint, prettier.
- All packages from §3 created, each with a real `package.json`, tsconfig extending the base, and at least one exported symbol so imports can be verified.
- `apps/api`: Fastify boots, Pino configured with request logging, `GET /health` returns `{ ok: true }`. Effect runtime wired at the entry point.
- `apps/web`: TanStack Start boots, renders one page that imports a shadcn primitive from `@cambio/ui`, and one TanStack Query call hitting `/health`.
- `packages/domain`: `CardSlug` as a branded Schema literal union of all 52 slugs, plus `rank`/`suit`/`score` derivation functions, plus one Tagged Struct (use the `Phase` union from §4.2 — types only, no transitions). This exists to prove the Effect + Schema + branded-type toolchain works end to end.
- `docker/docker-compose.yml`: Postgres only. Pin the major version to whatever the Supabase project runs — ask if unknown. No Redis.
- `.env.example` covering every variable read anywhere.
- Boundary linting per §3.1, wired into `turbo lint`.
- `docs/HANDOFF.md` — this file, committed.
- `README.md` — how to install, start Docker, run dev, run tests. Short.

### Acceptance criteria

- `pnpm install && pnpm turbo build typecheck lint test` passes from a clean clone.
- `docker compose up -d` then the API connects to Postgres successfully.
- Both apps run under `pnpm dev` simultaneously without port conflicts.
- Adding `import { Phase } from "@cambio/domain"` to a file in `apps/web` makes `pnpm turbo lint` **fail**. Demonstrate this, then revert it.
- At least one passing test in `packages/domain` asserting all 52 slugs parse and that `score("KH") === -2`, `score("KS") === -1`, `score("QS") === 11`, `score("AS") === 0`.
- Zero occurrences of `zod` in the lockfile.
- No game logic, no migrations beyond an empty initial one, no routes beyond `/health`.

### Explicitly out of scope for Task 1

Game rules, state transitions, database tables from §4.3, realtime wiring, auth, the cron job, UI beyond one smoke-test page.

---

## 11. Task 2 preview — architecture skills and AI harness

After the scaffold, the next task is authoring the agent harness: architecture skills capturing the §3–§6 rules in enforceable form, plus whatever slash-command / SKILL.md structure the repo needs. Keep skills agent-agnostic (portable `SKILL.md`) rather than tool-specific.

Candidate skills, to be discussed rather than assumed:

- **Effect domain modelling** — branded types, Schema, Tagged Structs, typed errors, when to reach for which.
- **DDD boundaries** — where a new file goes, which layer owns what, the §3.1 table as a decision procedure.
- **Hidden-information discipline** — the `viewFor` projection rule, per-player channel rules, the "never send it at all" invariant.
- **Cambio rules reference** — §1 extracted, so rule questions never get answered from a model's prior about other Cambio variants.

---

## 12. Build order after that

1. `domain` rules engine as a pure state machine — `(state, command) => Either<Error, [state, event[]]>`. Zero I/O.
2. A test harness that plays thousands of randomized complete games, asserting the §4.5 invariants. This is where remaining rule ambiguity surfaces — before any DB or UI exists to make fixing it expensive.
3. Persistence: migrations, repositories, event log, fold-to-state.
4. Application use cases + command queue per room.
5. Fastify presentation + realtime publishing + `viewFor` projection.
6. Lobby and game UI.
7. Slamming.
8. Bot.

Steps 1–2 come first specifically because the rules have holes (§9) and a pure state machine with property tests finds them in a day.
