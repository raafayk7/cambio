# CAM-20 — Four-player cap and the bench-anchored table (backend)

- **Root plan:** [root/CAM-20.md](../root/CAM-20.md) — the functional
  contract lives there; this document is implementation detail for one side.
  This side owns **clauses 1–4** (the cap and its user-facing copy) and the
  rules-doc half of clause 12's close-out. It is root-plan **M1**.

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

The 2–5 player rule is moving to 2–4, domain-enforced, per
[ADR-0036](../../adr/0036-four-player-cap-bench-anchored-table-layout.md)
(the doctrine inversion: the four painted benches become load-bearing and
the rule bends to them). Governing skills: **effect-domain-modeling**
(purity, test-first for domain work, docstrings cite handoff sections),
**cambio-rules** (the anti-prior guard — the setup line there says 2–5
until this task amends it), **architecture** (nothing new crosses a layer
boundary here). Clause 4's copy strings live in `apps/web`, so
**frontend-architecture** and the design system's
`design-system/references/voice.md` apply to that one step.

### What changes (verified at plan time; line numbers may drift — re-verify)

- `packages/domain/src/Deal.ts:22` — the gate
  `if (players.length < 2 || players.length > 5)` → `BadPlayerCount`. This
  is the **documented single source** of the rule (the `dealGame` doc
  comment at `Deal.ts:11–14` says "2–5 players"; `Lobby.ts`'s `startSeats`
  doc at `Lobby.ts:111–112` and
  `packages/application/src/use-cases/StartGame.ts:29` both point at it as
  the owner). Note the `use-cases` directory spelling — the root plan's
  explorer notes wrote `usecases`.
- `packages/domain/src/Lobby.ts:40` — `MAX_LOBBY_MEMBERS = 5`, consumed by
  the `joinLobby` gate at `Lobby.ts:83`. Doc comments at `Lobby.ts:39`
  ("a sixth member could never be seated") and `Lobby.ts:42` ("already
  holds five members") must follow the constant.
- `packages/domain/src/testing/invariants.ts:56–58` —
  `handIntegrityViolations` checks `< 2 || > 5` and emits the violation
  string `outside 2–5 (C2.2, §1.1)`; the doc comment at `invariants.ts:50`
  restates "within 2–5".
- `packages/domain/src/testing/driver.ts:105` —
  `playerCountFor = (i) => 2 + (i % 4)` yields 2–5; must yield 2–4
  (e.g. `2 + (i % 3)`). The `SimParams.playerCount` doc at `driver.ts:28`
  ("2–5 (§1.1)") and the comment above `playerCountFor` at `driver.ts:104`
  ("Cycle player counts 2→5") follow. This one function drives the roster
  spans of `packages/domain/test/Fold.test.ts`,
  `packages/domain/test/sim/Simulation.test.ts`,
  `packages/domain/test/sim/Fuzz.test.ts`,
  `packages/application/test/AdversarialProjection.test.ts`, and
  `apps/api/test/RoundTrip.test.ts` — none of which hardcode a count and
  none of which need editing (clause 3 is satisfied by the generator plus
  the invariant bound).
- `packages/domain/src/GameError.ts:12` — the `BadPlayerCount` doc comment
  says "2–5 players (§1.1)". The class itself is count-agnostic — **comment
  change only, no code change**.
- Copy strings (clause 4 — owned here; the frontend child plan does NOT
  touch these): `apps/web/src/containers/room/use-room.ts` —
  `START_HELPER = "2–5 players"` (line 47), the `startErrorCopy`
  BadPlayerCount branch "The game needs 2 to 5 players at the table."
  (lines 52–54), and the module doc's "the 2–5 start rule is the server's
  call" (line 36); `apps/web/src/containers/room/room-screen.tsx:34–37` —
  `DENIAL_COPY.full.body` "Five players are already seated — the table
  takes no more."
- Close-out docs: `docs/HANDOFF.md` §1.1 (the "2–5 players" line, near
  line 28) gains an amendment blockquote pointing at ADR-0036;
  `.agents/skills/cambio-rules/SKILL.md` setup line ("2–5 players", line 17) gets the same amendment — **on `main`, per ADR-0028**, merged down as
  part of this task's definition of done.

### What does NOT change (verified at plan time — do not hunt)

- **`packages/contracts`** — no player-count schema or bound exists.
- **`apps/api`** — error pass-through only: `presentation/errors.ts` maps
  `BadPlayerCount` → 422 and `LobbyFull` → 409 by tag, count-agnostic.
  Untouched.
- **Database** — no upper-bound constraint anywhere (`seat_index` has a
  lower bound only). No migration.
- **`packages/domain/test/GameError.test.ts`** — its "constructs every
  class" test builds `new BadPlayerCount({ count: 6 })`; that stays valid
  (the class carries any count) and stays green. Checked; no edit.
- **`packages/domain/test/EndToEnd.test.ts`** — plays a 3-player game;
  inside the new bound, untouched.
- **`apps/web/test/table-geometry.test.ts`** — mentions "2–5 players" in
  test titles, but that file is dissolved by the frontend lane's M3. Not
  this plan's concern; do not edit it here.

## Plan of work

Domain work is **test-first**: within each step, move the failing pin
first, watch it fail for the right reason, then change the constant. Each
numbered step ends with the repo compiling and its package suite green.

### Step 1 — the deal gate (clause 1)

Edit `packages/domain/test/Deal.test.ts` first:

- The rejection test currently titled "rejects player counts outside 2–5
  (C1.1, §1.1)": retitle to the 2–4 bound and extend its loop `[0, 1, 6]`
  to **include 5** — 5 must now be `Either.left` with `_tag`
  `"BadPlayerCount"`.
- The shape test "deals 4 cards to slots 0–3 per player, one discard, rest
  as deck (C1.2, §1.1)": shrink its acceptance loop `[2, 3, 4, 5]` to
  `[2, 3, 4]`. The `52 - 4 * n - 1` deck-length assertion is already
  count-generic.
- The partition test "partitions all 52 slugs with no duplicates (C1.4,
  §4.5)" calls `dealt(5)` — a latent breakage the explorer map missed:
  once the gate tightens, `dealt(5)` throws. Change to `dealt(4)` (the
  partition property is count-independent).

Run the suite, confirm exactly the moved pins fail (5 now dealt where it
should be rejected). Then edit `packages/domain/src/Deal.ts`: the gate
becomes `players.length < 2 || players.length > 4`, and the doc comment's
"2–5 players" becomes "2–4 players (§1.1 as amended by ADR-0036)" — keep
the section citation, add the ADR, per the effect-domain-modeling
docstring convention. Green.

### Step 2 — the lobby ceiling (clause 2)

Edit `packages/domain/test/Lobby.test.ts` first: the join-ceiling test
"a fifth member fills the lobby; a sixth is LobbyFull (§1.1 ceiling)"
becomes its 4/5 counterpart — a lobby of three gains a fourth member
(length equals `MAX_LOBBY_MEMBERS`), and a fifth join attempt is
`LobbyFull`. The test already imports `MAX_LOBBY_MEMBERS`, so the length
assertion follows the constant; the fixture roster shrinks by one. Confirm
the red, then edit `packages/domain/src/Lobby.ts`:
`MAX_LOBBY_MEMBERS = 4`, doc comments at `:39` (a **fifth** member could
never be seated) and `:42` (already holds **four** members), both citing
ADR-0036 alongside §1.1. `startSeats`' doc comment ("the 2–5 rule")
follows in the same edit. Green.

### Step 3 — the sim harness bound and roster generator (clause 3)

Edit `packages/domain/test/sim/Invariants.test.ts` first: retitle
"rejects rosters outside 2–5 players (§1.1)" to the 2–4 bound and add a
5-player probe alongside the existing 1-player one — build a healthy state
extended to five players and assert `handIntegrityViolations` reports it
(this is what actually pins the upper bound; today only the lower bound is
exercised). Then edit `packages/domain/src/testing/invariants.ts`: the
check becomes `< 2 || > 4`, the violation string becomes
`outside 2–4 (C2.2, §1.1)`, and the doc comment at `:50` follows.

In the same step, edit `packages/domain/src/testing/driver.ts`:
`playerCountFor` becomes `(i) => 2 + (i % 3)` (spans exactly 2–4), its
comment becomes "Cycle player counts 2→4", and the `SimParams.playerCount`
doc becomes "2–4 (§1.1, ADR-0036)". No downstream suite edits — Fold,
Simulation, Fuzz, AdversarialProjection, and RoundTrip all take their
counts from this function. Note the mild seed-shift effect: batch index
`i` now maps to different counts, so sim traces differ from previous runs
— that is expected, not a regression; the invariants are
count-independent. Run the domain suite (sim suites included), then
application and api suites to confirm the harness consumers stay green.

### Step 4 — comment-only sweep (no behavior)

- `packages/domain/src/GameError.ts` — `BadPlayerCount` doc: "2–4 players
  (§1.1, ADR-0036)".
- `packages/application/src/use-cases/StartGame.ts` — the doc comment
  naming `dealGame` as owner of "the 2–5 player rule" becomes 2–4.
- Grep guard: `grep -rn "2–5" packages/ apps/ --include="*.ts"
--include="*.tsx"` — every remaining hit should be either a frontend
  file the other lane owns (`table-geometry` and its test) or gone.

### Step 5 — room-screen copy (clause 4)

Frontend files, but this plan's clause: the cap's user-facing surface.
Test-first here too — `apps/web/test/room-screen.test.tsx` pins both
strings:

- The test "surfaces a 422 BadPlayerCount as the inline alert with the
  2–5 copy": retitle to 2–4 and update the asserted alert text to the new
  copy.
- The "Room full" no-access test asserts the panel **title** only ("Room
  full") — the title doesn't change, so the body change is not currently
  pinned. Extend that test (or the assertion) to pin the new body copy so
  the clause-4 coverage row has a real assertion to point at.

Then the strings, following voice.md's register (sentence case, plain
functional copy, "what went wrong, then the fix" for errors — revision
follows the existing string style in place):

- `use-room.ts` `START_HELPER`: `"2–4 players"` (en dash, as today).
- `use-room.ts` `startErrorCopy` BadPlayerCount branch: "The game needs
  2 to 4 players at the table. Share the link and wait for a friend."
- `use-room.ts` module doc comment: "the 2–4 start rule is the server's
  call".
- `room-screen.tsx` `DENIAL_COPY.full.body`: "Four players are already
  seated — the table takes no more. Create a room of your own."

Green on the web suite.

### Step 6 — rules-doc close-out (this side's share of clause 12)

On the task branch: add an amendment blockquote under `docs/HANDOFF.md`
§1.1's "2–5 players" line, in the repo's established amendment style
(a `>` blockquote naming ADR-0036 and stating the 2–4 rule; leave the
original line in place — ADRs outrank the handoff via amendment, never
silent rewrites; check an existing amended section for the exact idiom).

Separately, **on `main`** (ADR-0028 — harness files never land on release
branches): amend `.agents/skills/cambio-rules/SKILL.md`'s setup line
("2–5 players") with the same ADR-0036 pointer, then merge down
`main` → `development` → `release-v0`. This is a distinct commit/branch
step outside the task branch's PR; the merge-down is part of this task's
definition of done. Coordinate with the frontend lane's M6 so the
merge-down happens once.

## Concrete steps & validation

After each step, the canonical per-package command (turbo builds
workspace deps first — never the bare package script against stale dist):

```bash
pnpm turbo test --filter @cambio/domain        # steps 1–4
pnpm turbo test --filter @cambio/application   # step 3 (AdversarialProjection)
pnpm turbo test --filter @cambio/api           # step 3 (RoundTrip; needs Postgres on :5433)
pnpm turbo test --filter @cambio/web           # step 5
```

If the api suite hits `ECONNREFUSED` on localhost:5433:
`docker compose -f docker/docker-compose.yml up -d`, re-run migrations if
in doubt (`pnpm --filter @cambio/api migrate`), retry.

Red checkpoints (test-first evidence): after each step's test edit and
before its src edit, the failing assertions must be the moved pins and
nothing else — 5-player deal accepted (step 1), fifth join accepted
(step 2), 5-player roster unflagged (step 3), old copy rendered (step 5).

Final gate, bare — never piped (the PreToolUse hook enforces this):

```bash
pnpm turbo build typecheck lint test
```

Success: exit 0, all suites green, and the step-4 grep shows no stray
"2–5" outside the frontend lane's geometry files.

## Contract coverage

_(maintained by `/implement`, verified by `/review`: one row per root-plan
contract clause this side owns — the test that pins it, or why none can.
Each row must also say **what is asserted**, in one phrase — a test whose
title cites a clause but whose body doesn't assert it is the failure mode
this column exists to catch. **At plan time, fill only the Clause column
plus a planned-approach note**; test file, name, and assertion phrase are
written by `/implement` when the test actually lands. A plan-time row that
invents a test title and assertion is an overclaim waiting to become a
review finding.)_

| Clause                                        | Test (file + name)                                                                                                                                                                                   | What is asserted                                                                                                                                                                                                                                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — deal rejects outside 2–4; 2/3/4 accepted  | `Deal.test.ts::dealGame > rejects player counts outside 2–4 (C1.1, §1.1)`; `Deal.test.ts::dealGame > deals 4 cards to slots 0–3 per player, one discard, rest as deck (C1.2, §1.1)`                  | 0, 1, 5, 6 rejected as `BadPlayerCount`; 2, 3, 4 accepted with the correct hand/discard/deck shape                                                                                                                                                                                                       |
| 2 — fourth member fills lobby; fifth refused  | `Lobby.test.ts::joinLobby (clause 2) > a fourth member fills the lobby; a fifth is LobbyFull (§1.1 ceiling)`                                                                                         | a fourth join brings the lobby to `MAX_LOBBY_MEMBERS` (4); a fifth join attempt is `LobbyFull`                                                                                                                                                                                                           |
| 3 — harness rosters span exactly 2–4          | `sim/Invariants.test.ts::hand & seat integrity checker (C2.2, §4.5 restated) > rejects rosters outside 2–4 players (§1.1)`                                                                           | a 5-player roster is flagged by `handIntegrityViolations`; `playerCountFor` cycles 2→4 (`2 + (i % 3)`), so every sim/fuzz/roundtrip roster it drives stays in bound                                                                                                                                      |
| 4 — room copy states 2–4 everywhere spoken    | `room-screen.test.tsx::start (R5) > surfaces a 422 BadPlayerCount as the inline alert with the 2–4 copy`; `room-screen.test.tsx > renders the no-access panel when the room is full (409 LobbyFull)` | the inline alert reads "The game needs 2 to 4 players at the table…"; the full-room panel body reads "Four players are already seated — the table takes no more…"                                                                                                                                        |
| 12 (rules-doc half) — HANDOFF + skill amended | _none — prose, no test can pin it; verified by review reading the doc directly_                                                                                                                      | HANDOFF §1.1 gains an amendment blockquote naming ADR-0036 (done, this task branch); the `cambio-rules` skill's setup line amendment + merge-down (`main` → `development` → `release-v0`) is a separate `main`-branch step per ADR-0028, coordinated by the orchestrator — not yet done as of this entry |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [x] 2026-09-06 — plan written during `/plan`; all touchpoints re-verified
      against source (one addition to the explorer map: `Deal.test.ts`'s
      partition test calls `dealt(5)` and must move to `dealt(4)`).
- [x] 2026-09-06 — `/implement` steps 1–6 executed test-first, in order.
      Step 1: `Deal.test.ts` pins moved (rejection loop gains 5, acceptance
      loop shrinks to 2–4, `dealt(5)` → `dealt(4)`), confirmed red for the
      right reason, then `Deal.ts`'s gate and doc comment changed to 2–4.
      Step 2: `Lobby.test.ts`'s join-ceiling test rewritten around a 3→4
      roster and `MAX_LOBBY_MEMBERS`, confirmed red, then
      `MAX_LOBBY_MEMBERS = 4` plus its three doc comments. Step 3:
      `sim/Invariants.test.ts` retitled and gained the 5-player probe
      (extended state + matching 5-id roster, isolating the count check
      from roster-drift), confirmed red, then `invariants.ts`'s bound/string
      and `driver.ts`'s `playerCountFor`/docs updated to 2–4. Step 4:
      comment-only sweep on `GameError.ts` and `StartGame.ts`; grep guard
      run twice (before and after) — see below. Step 5: `room-screen.test.tsx`
      retitled and extended (the full-room body copy gained its first
      assertion), confirmed red, then `use-room.ts` and `room-screen.tsx`
      copy updated per voice.md register (sentence case, unchanged). Step 6:
      HANDOFF §1.1 amendment blockquote added, matching the idiom at
      HANDOFF.md:209-213 (`> **Amended:** … superseded …`); the
      `main`-branch `cambio-rules` skill amendment + merge-down is explicitly
      out of scope for this session (coordinated separately by the
      orchestrator per the task briefing).
      Validation: `pnpm turbo test --filter @cambio/domain` (23 files, 194
      tests, green), `--filter @cambio/application` (14 files, 86 tests,
      green), `--filter @cambio/api` (20 files, 118 tests, green, Postgres
      on :5433 already up), `--filter @cambio/web` (20 files, 213 tests,
      green). Grep guard
      (`grep -rn "2–5" packages/ apps/ --include="*.ts" --include="*.tsx"`,
      excluding `dist/` build output) came back clean: every remaining hit
      is in a frontend-lane file this plan explicitly does not touch
      (`table-geometry.ts`/`.test.ts`, `gallery/game.tsx`, `table-surface.tsx`
      — all commented as scenery/seat-arc geometry, clauses 5/9/11, owned by
      the frontend child plan's M3/M5/M6).

## Surprises & notes for the root plan

- `Deal.test.ts`'s partition test ("partitions all 52 slugs…") uses
  `dealt(5)` — not in the explorer's touchpoint map; it would throw under
  the new gate. Folded into step 1.
- The lobby-full **body** copy ("Five players are already seated") is not
  pinned today — `room-screen.test.tsx` asserts the panel title only.
  Step 5 adds the body assertion so clause 4 has real coverage.
- `sim/Invariants.test.ts`'s bound pin only probes the lower bound (a
  1-player roster); step 3 adds the 5-player probe, which is the assertion
  that actually distinguishes 2–4 from 2–5.
- `StartGame.ts` lives at `packages/application/src/use-cases/StartGame.ts`
  (hyphenated `use-cases`), not `usecases` as the explorer map wrote.
- Changing `playerCountFor` shifts which batch index gets which count, so
  sim/fuzz traces differ from previous runs under identical seeds —
  expected, count-independent invariants still hold; not a determinism
  regression.
- The grep guard turned up one stray "2–5" the explorer map and this plan
  didn't list: a comment in
  `packages/application/test/StartGame.test.ts:89` ("Passed through from
  dealGame — the single source of the 2–5 rule"). Not frontend-owned, so
  fixed in the same comment-only sweep as step 4.
- `.agents/scripts/fill-coverage-row.mjs` assumes a 4-column coverage table
  (`Clause | Planned approach | Test | Asserted`, per its own comment), but
  this plan's table (like several other backend plans — CAM-3, CAM-4,
  CAM-5, CAM-6, CAM-8, CAM-10) has only 3 columns
  (`Clause | Test | Asserted`), with the plan-time "planned" note living
  inside the Test cell. Running the script against a 3-column row (verified
  on a scratch copy first, not the live doc) corrupts the row: it writes
  into `cells[3]`/`cells[4]` assuming those are Test/Asserted, but for a
  3-column table `cells[3]` is already Asserted and `cells[4]` is the empty
  string after the closing pipe — the result is a malformed 4-cell row
  under a 3-column header. Filled the table by hand instead (Edit tool);
  the PostToolUse markdown-format hook reflowed it correctly afterward.
  Flagging for whoever maintains the script: it needs either a column-count
  autodetect or a `--no-planned-column` flag before it's safe on the
  3-column table shape most backend plans use.
- HANDOFF.md carries two more player-count mentions outside §1.1 that this
  task's scope (the §1.1 amendment only) deliberately leaves untouched:
  §4.1 ("This locks the game to one deck. That's acceptable at a 5-player
  maximum.") and the out-of-scope list near line 343 ("more than 5
  players"). Both are now stale under the 2–4 cap. Not fixed here because
  the task briefing scoped step 6 to §1.1 specifically; noting for the
  root plan / a future cleanup pass rather than improvising a broader doc
  sweep.
