# CAM-1 — Domain rules engine — pure state machine

- **Linear:** [CAM-1](https://linear.app/raafayk7/issue/CAM-1/domain-rules-engine-pure-state-machine)
- **Scope:** backend
- **Child plans:** [backend](../backend/CAM-1.md)
- **ADRs:** [0009](../../adr/0009-zero-card-slammer-draws-then-gives.md),
  [0010](../../adr/0010-jq-swaps-require-occupied-slots-powers-fizzle.md),
  [0011](../../adr/0011-slam-window-fixed-close-config-duration.md),
  [0012](../../adr/0012-empty-discard-skips-slam-window.md) *(added during
  implementation — new gap surfaced and resolved with the user)*

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

After this task, the complete rules of Cambio exist as a pure, deterministic
state machine in `packages/domain`: `applyCommand(state, command, now)`
returns `Either<GameError, [GameState, GameEvent[]]>`, and a full game can be
played from seeded deal to Cambio call entirely in memory. Observe it working
by running `pnpm --filter @cambio/domain test` — the suite includes a
scripted end-to-end game. This unblocks CAM-2 (randomized simulation harness)
and everything after it (persistence, use cases, realtime).

## Context & orientation

Everything lives in `packages/domain` (may import **only** `effect`; ESLint
enforces this). Current state:

- `src/Card.ts` — `CardSlug` branded literal union of all 52 slugs,
  `rank`/`suit`/`score` derivations, `POWER_RANKS`/`PowerKind`. Complete;
  reuse as-is.
- `src/Ids.ts` — branded `UserId`, `GameId`, `SlotIndex` (stable positions,
  holes allowed), `Timestamp` (absolute epoch ms), `Seq`. Complete.
- `src/Phase.ts` — the §4.2 phase union, **types only**, with a
  `PROVISIONAL TargetSelection` this task must replace (its docstring says
  so explicitly). The "do not add transitions here" docstring predates this
  task and gets updated to point at the engine.
- No game logic, no PRNG, no `GameState`/commands/events/errors exist
  anywhere. `Match` and `Data` are unused so far — this task introduces them.

Governing docs: HANDOFF §1 (rules — via the `cambio-rules` skill, which
also lists the gaps now resolved by ADRs 0009–0011), §4.1–§4.2, §4.4–§4.5,
§12 step 1; skills `effect-domain-modeling` (idioms, purity, single
legality function), `architecture` (domain imports `effect` only),
`cambio-rules` (never fill rule gaps from other variants). Consumers of
`@cambio/domain` today are four type-level imports (`Timestamp`, `GameId`,
`UserId`) — additive export changes break nothing. Everything funnels
through `src/index.ts` via `export *`, so name collisions across new
modules must be avoided.

Out of scope (later tasks): persistence, use cases, wire contracts in
`packages/contracts`, realtime, `viewFor` projection, the randomized
invariant harness (CAM-2).

## Functional contract

The engine is pure: no `Date.now`, `new Date`, `Math.random`, `crypto`, or
any I/O. Time enters as a `Timestamp` argument; randomness enters as a
numeric seed. Same inputs ⇒ identical outputs, always.

### C1. Game creation and deal

1. `dealGame` (exact name per child plan) takes 2–5 players in seat order, a
   numeric seed, a `GameConfig`, and `now`; fewer than 2 or more than 5
   players is a typed error.
2. The 52-card deck is shuffled deterministically from the seed; each player
   receives 4 face-down cards at slot indices 0–3; one card is turned face
   up as the discard pile; the rest is the draw deck. There is **no opening
   peek** (§1.1).
3. The initial phase is `AwaitingDraw` for seat 0. The emitted game-started
   event records the concrete post-deal arrangement (deck order, hands,
   first discard), so replay never depends on PRNG stability.
4. At every point in every game: the 52 slugs are exactly partitioned
   across deck + discard + hands (no duplicates, none missing).

### C2. Turn actions (phase `AwaitingDraw`, active player only)

1. Exactly three actions are legal: call Cambio, take the top discard, draw
   from the deck. Any command from a non-active player, or any other
   command, is a typed error naming the reason.
2. **Call Cambio** ends the game immediately: phase becomes `Ended`, all
   hands are scored (score is per-card, rank *and* suit, §1.2), and the
   game-ended event carries per-player totals and the (possibly plural) set
   of lowest-score winners. No final round, no caller bonus/penalty. Ties
   must be representable (§1.8).
3. **Take top discard** is legal only when the top discard is not a power
   rank (7,8,9,10,J,Q). The taken card must go into the player's hand: into
   a named occupied slot (displaced card goes face up onto the discard
   pile) — it can never be discarded straight back. A zero-card player may
   take it as a **keep** into their lowest free slot, displacing nothing
   (ADR-0009).
4. **Draw from deck** moves the top deck card into the player's held-card
   state (`HoldingCard`, source `deck`). If the deck is empty it is first
   reshuffled per C6.1.
5. A held **non-power** card (A,2–6,K) may be swapped into a named occupied
   own slot (displaced card to discard) or discarded directly; a zero-card
   player may keep it into their lowest free slot. A held **power** card
   (7,8,9,10,J,Q) can be neither kept nor discarded unused: the only legal
   continuation is resolving its power (or its fizzle, C3.5), after which
   the power card goes to the discard pile.
6. After the turn action fully resolves (including powers), the slam window
   opens (C4).

### C3. Powers (only when drawn from the deck; §1.4)

1. **7/8:** the player looks at one of their own occupied slots. The event
   records viewer + card identity (knowledge follows cards, §4.4).
2. **9/10:** the player looks at one occupied slot of another player.
3. **J:** the player names any two occupied slots belonging to players (may
   be the same player, may include their own); the cards exchange slots
   blind. Naming an empty slot or a zero-card player's slot is a typed
   error (ADR-0010).
4. **Q:** the player first looks at any one occupied slot, then must name
   two occupied slots to blind-swap (the looked-at card may be included).
   Two steps, both mandatory once the Queen is drawn.
5. **Fizzle (ADR-0010):** if at resolution time no valid target exists —
   7/8 with own hand empty; 9/10 with every opponent empty; J/Q with fewer
   than two occupied slots in the game (Q does not partially resolve) — the
   power resolves as a no-op, the card goes to the discard pile, an
   explicit fizzle event is emitted, and play continues to the slam window.
6. A power card on top of the discard pile is inert: it cannot be taken
   (C2.3) and triggers nothing, but is slammable against (C4).

### C4. Slamming (§1.5, ADRs 0009/0011)

1. When a turn resolves, phase becomes `SlamWindow` with
   `closesAt = now + config.slamWindowMs` and the top discard's rank. The
   close time never moves within a window (ADR-0011).
2. While `now < closesAt`, **any** player (including the turn player) may
   slam any face-down card — their own or another's — any number of times.
   A slam names owner + slot and claims rank equality with the top discard.
   Matching is by **rank only** (J ≠ Q; black K matches red K).
3. Outcomes:
   - Own card, correct: card goes to the discard pile; hand shrinks (slot
     becomes a hole; other indices do not shift).
   - Own card, incorrect: card stays; slammer draws a penalty card from the
     deck into their lowest free slot.
   - Opponent's card, correct: card goes to the discard pile; the slammer
     gives one of their own cards — blind, their choice of occupied slot —
     into the vacated slot. A zero-card slammer instead draws the top deck
     card and gives it unseen (ADR-0009).
   - Opponent's card, incorrect: card stays with its owner; slammer draws a
     penalty card.
4. Every slam attempt emits an event revealing the slammed card's identity
   (the public reveal is part of the cost, §1.5).
5. Penalty draws and draw-then-give draws reshuffle first if the deck is
   empty (C6.1); if no card exists even then, the draw is skipped and an
   explicit event records that (ADR-0011).
6. A slam with `now >= closesAt` is a typed "window closed" error. The
   window is closed by an explicit close command (legal only once
   `now >= closesAt`), which advances phase to `AwaitingDraw` for the next
   seat, `(seat + 1) % n` — zero-card players are not skipped (§1.6).
7. Slamming is legal **only** during `SlamWindow` — never while a turn is
   unresolved and never after `Ended`.

### C5. Zero-card players (§1.6, ADR-0009)

1. Reaching zero cards ends nothing; the game continues and 0 loses to any
   negative total.
2. A zero-card active player has the same three turn actions; "swap"
   positions degenerate to keeps into the lowest free slot (C2.3, C2.5).

### C6. Deck exhaustion (§1.7)

1. Whenever a draw is required and the deck is empty, the discard pile
   minus its top card is reshuffled deterministically (from PRNG state
   carried in `GameState`) to form the new deck; the top discard stays. An
   event records the reshuffle.
2. If the reshuffled deck is still empty, penalty/give draws are skipped
   (C4.5); a turn draw (C2.4) is then an illegal move, leaving Cambio and
   (if legal) taking the discard as the player's options.

### C7. Errors and the single legality source

1. Every distinguishable failure reason is its own `Data.TaggedError` class
   (not-your-turn, wrong-phase, empty-slot target, power-on-discard take,
   window-closed, game-over, bad-player-count, …) carrying enough data to
   explain itself.
2. Exactly **one** function answers "is this command legal right now", as a
   function of `(phase, playerId, gameState)`; `applyCommand` consults it
   and no rule check exists anywhere else. It can also enumerate the legal
   command kinds for a player (for future UI/bot use).
3. Illegal commands leave state untouched: `applyCommand` returns
   `Either.left` and never a mutated state. All state is immutable data.

### C8. Determinism & events

1. Replaying the same `dealGame` inputs and command sequence yields
   deeply-equal states and event lists.
2. Every state change is fully described by the returned events (they are
   the future event-log payloads, §4.3): dealing, draws, takes, swaps,
   discards, peeks (with viewer + card), blind swaps (as slot movements),
   fizzles, every slam outcome, skipped draws, reshuffles, window
   open/close, turn advance, Cambio call, game end with scores. Commands,
   events, and all persisted shapes are `Schema.TaggedStruct` unions that
   round-trip encode/decode.

### Acceptance criteria

- [x] `pnpm turbo build typecheck lint test` passes.
- [x] `applyCommand(state, command, now)` with the
      `Either<GameError, [GameState, GameEvent[]]>` shape is exported from
      `@cambio/domain`, plus `dealGame` and the legality function.
- [x] The `PROVISIONAL` `TargetSelection`/`CardRef` shapes in `Phase.ts` are
      gone, replaced per ADR-0010; no `PROVISIONAL` marker remains in
      `packages/domain`.
- [x] `grep -rn "Date.now\|new Date\|Math.random" packages/domain/src`
      returns nothing.
- [x] Every contract clause above (C1–C8) has at least one test naming it;
      each ADR ruling (draw-then-give, keep-at-zero, illegal empty target,
      fizzle, fixed close, skipped draw) has a dedicated test.
- [x] A scripted end-to-end test plays a full game — deal, several turns
      covering a take, swaps/discards, at least one power, at least one
      slam, a reshuffle, then Cambio — and asserts final scores and the
      52-card partition after every step.
- [x] A tie game is constructed and both winners appear in the result.
- [x] Determinism test: same seed + same commands ⇒ identical state/events.
- [x] The `cambio-rules` skill's "open gaps" section is updated to cite
      ADRs 0009–0011 instead of "STOP AND ASK", and `Phase.ts` docstrings
      no longer forbid what this task built.

## Plan of work

All work is in `packages/domain` — no contracts freeze is needed because no
other package changes (wire schemas arrive with the presentation-layer
task). Test-first at every milestone; the repo compiles and tests stay green
after each. File-level detail: [backend child plan](../backend/CAM-1.md).

1. **M1 — State model.** `GameConfig`, hand/slot representation honoring
   stable indices with holes, `GameState` (players in seat order, hands,
   deck, discard, PRNG state, phase, config), and the Phase redesign:
   replace `TargetSelection`, give the slam window its turn context, model
   the Queen's two steps. Schema round-trips proven by tests.
2. **M2 — Vocabulary.** `GameError` tagged errors, `Command` union,
   `GameEvent` union (all `Schema.TaggedStruct`). Round-trip tests.
3. **M3 — Deal.** Seeded Fisher–Yates over `Utils.PCGRandom`, `dealGame`
   per C1, determinism + partition tests.
4. **M4 — Legality core.** The single legality function over
   `(phase, playerId, gameState)` and the `applyCommand` dispatch skeleton
   that routes every transition through it (C7).
5. **M5 — Turn actions.** Cambio call + scoring/ties, take-discard
   (incl. keep-at-zero), draw, swap/discard held, power obligation branch,
   slam-window opening, window close + turn advance, turn-draw reshuffle
   (C2, C5, C6, parts of C4.1/C4.6).
6. **M6 — Powers.** Peeks, Jack swap, Queen peek-then-swap, fizzle
   detection (C3).
7. **M7 — Slamming.** All four outcomes, penalties with reshuffle,
   draw-then-give, skipped-draw, rank-only matching, fixed-close and
   late-slam rejection, multiple slams per window (C4).
8. **M8 — End-to-end + housekeeping.** Scripted full game and tie tests,
   determinism test, docstring updates in `Phase.ts`/`Card.ts`, update the
   `cambio-rules` skill's gap list to cite the ADRs, `index.ts` exports,
   full gate.

## Validation

- Per milestone: `pnpm --filter @cambio/domain test` (child plan names the
  expected new test files and counts).
- Purity spot-check: the grep in the acceptance criteria.
- Final: `pnpm turbo build typecheck lint test` — build/typecheck confirm
  the export surface compiles for existing consumers (`application`,
  `apps/api`); lint confirms the domain still imports only `effect`.

## Progress

*(updated continuously; newest last; timestamp each entry)*

- [x] 2026-08-31 07:20 — plan written; signed off; committed d043edd
- [x] 2026-08-31 12:44 — M1 state model + Phase rewrite (25 tests)
- [x] 2026-08-31 12:47 — M2 error/command/event vocabulary (31 tests)
- [x] 2026-08-31 12:55 — M3 seeded deal (40 tests)
- [x] 2026-08-31 13:00 — M4 legality core + engine skeleton (54 tests)
- [x] 2026-08-31 13:10 — M5 turn actions + scoring; ADR-0012 written
      (72 tests)
- [x] 2026-08-31 13:20 — M6 powers + fizzles (85 tests)
- [x] 2026-08-31 13:25 — M7 slamming complete, scaffold deleted (100 tests)
- [x] 2026-08-31 13:35 — M8 end-to-end/tie/determinism tests, docstring +
      skill updates; full gate `pnpm turbo build typecheck lint test`
      green (18/18 tasks, 106 domain tests); all acceptance criteria hold

## Decision log

*(every non-obvious choice made during planning or implementation: what was
decided, why, what was rejected. Promote to an ADR if it meets the adr
skill's bar.)*

- 2026-08-31 — §9.2, §9.3, §9.4-adjacent rulings decided with the user →
  promoted to ADRs 0009/0010/0011 (see header).
- 2026-08-31 — Shuffle uses effect's built-in `Utils.PCGRandom` (pure,
  seedable) with Fisher–Yates; no new dependency, and the domain stays
  `effect`-only. Rejected: hand-rolled PRNG (needless code to trust).
- 2026-08-31 — The game-started event records the **concrete deal**, not
  just the seed, so event-log replay (§6) never depends on the shuffle
  algorithm staying byte-stable across versions. Reshuffles likewise record
  the resulting order. Rejected: seed-only events (couples recovery to PRNG
  stability forever).
- 2026-08-31 — PRNG state is carried inside `GameState` so mid-game
  reshuffles and penalty draws stay deterministic without new seed inputs.
- 2026-08-31 — The slam command carries the slammer's give-slot choice
  upfront (used only when the slam turns out correct against an opponent);
  a zero-card slammer omits it (draw-then-give). Rejected: a "choose give
  card" sub-phase inside the fixed-close window — it would stall the window
  or leak time, and the upfront choice is strategically equivalent (the
  reveal says nothing about the slammer's own cards).
- 2026-08-31 — Window close is an explicit command legal once
  `now >= closesAt` (the application layer's timer fires it on the happy
  path, and can fire it lazily before a late command after a sleep, per
  §6). The engine never auto-advances on unrelated commands.
- 2026-08-31 (implementation) — Added `UnknownPlayer` error: `Slam` accepts
  any player, so a non-member issuer needs a distinguishable rejection.
- 2026-08-31 (implementation) — Added `SwapTargetsIdentical` error: §1.4's
  "blind-swap any two cards" is read as two *distinct* slots; allowing the
  same slot twice would let a J/Q decline its swap information-free.
- 2026-08-31 (implementation) — `powerHasValidTarget(power, state,
  playerId)` gained the third parameter: 7/8 and 9/10 targets are relative
  to the drawer, which the child plan's two-arg signature couldn't express.
- 2026-08-31 (implementation) — The end-to-end game is driven by a
  deterministic state-reading policy rather than a hand-scripted command
  list: same coverage guarantees (asserted via required-event set), far
  less brittle than 100+ hardcoded expectations, and the determinism test
  replays it verbatim.

## Surprises & discoveries

*(anything found mid-implementation that the plan didn't predict — wrong
assumptions, upstream bugs, better approaches. Evidence included.)*

- **The discard pile can empty** (zero-card keep of the pile's only card,
  reachable right after the deal or a reshuffle), which the handoff never
  contemplates — the slam window would have no rank and TakeDiscard nothing
  to take. Resolved with the user as ADR-0012: skip the window, advance the
  turn; taking from an empty pile is `EmptyDiscard`. Pinned by tests in
  `TurnActions.test.ts`.
- **`allCards` must count the phase-held card**: while a card is held
  (`HoldingCard`/`ResolvingPower`/`ResolvingQueenSwap`) it is in the phase,
  not in deck/discard/hands, so the child plan's deck+discard+hands
  definition breaks the 52-partition mid-turn. Fixed in `GameState.ts`.
- **`DrawSkipped("give")` is unreachable in legal play**: a slam window
  implies a non-empty pile, and a successful slam pushes the slammed card
  onto it, so the give-draw always finds the old top card via reshuffle
  (test: "a zero-card give is satisfied by reshuffling the old top under
  the slammed card"). Only the *penalty* skip is reachable (deck empty +
  pile at exactly its top card). The give branch is kept for totality.

## Outcomes & retrospective

*(filled at the end, typically by `/review`: what shipped, what was cut,
what should carry into the next task.)*
