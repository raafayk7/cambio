# CAM-1 — Domain rules engine — pure state machine (backend)

- **Root plan:** [root/CAM-1.md](../root/CAM-1.md) — the functional
  contract (C1–C8) lives there; this document is implementation detail for
  the backend side.
- **ADRs:** [0009](../../adr/0009-zero-card-slammer-draws-then-gives.md)
  (draw-then-give, keep-at-zero),
  [0010](../../adr/0010-jq-swaps-require-occupied-slots-powers-fizzle.md)
  (occupied-slot targets, fizzle),
  [0011](../../adr/0011-slam-window-fixed-close-config-duration.md)
  (fixed close, config duration, skipped draws).

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

All work is inside `packages/domain` plus one docs edit
(`.agents/skills/cambio-rules/SKILL.md`, M8). The domain may import
**only** `effect` (3.22.1) — ESLint fails the build on anything else,
including other workspace packages and zod. Governing skills:
**effect-domain-modeling** (idioms, purity, single legality function),
**cambio-rules** (never fill rule gaps from other variants; the three former
gaps are now decided by ADRs 0009–0011), **architecture** (domain =
`effect`-only leaf).

Current state of the package:

- `packages/domain/src/Card.ts` — complete; reuse as-is. `CardSlug` branded
  literal union of 52 slugs; `rank`/`suit`/`score` pure derivations;
  `POWER_RANKS`/`PowerKind`. Only its "belongs to the rules engine, not
  here" docstring gets refreshed in M8.
- `packages/domain/src/Ids.ts` — complete; reuse as-is (`UserId`, `GameId`,
  `SlotIndex`, `Timestamp`, `Seq`).
- `packages/domain/src/Phase.ts` — types only, with a `PROVISIONAL`
  `CardRef`/`TargetSelection` this task **deletes** (ADR-0010) and a
  "do not add transitions here" docstring this task updates. Rewritten in M1.
- `packages/domain/src/index.ts` — `export *` of every module. There are no
  subpath exports; every new module gets an `export *` line here in the step
  that creates it. **Name collisions across modules are a build break**, so
  this plan fixes a naming convention now: phase cases are noun-ish states
  (`AwaitingDraw`, `SlamWindow`), commands are imperative verbs
  (`DrawFromDeck`, `CallCambio`), events are past-tense facts (`CardDrawn`,
  `CambioCalled`, `SlamWindowOpened`), errors are reason-named classes
  (`NotYourTurn`, `SlamTooLate`). The full export inventory in this plan has
  been checked collision-free — keep any renames within the convention.
- `packages/domain/test/Card.test.ts`, `test/Phase.test.ts` — the idioms to
  imitate: `import { describe, expect, it } from "@effect/vitest"`, plain
  `it` (all code here is pure), decode helpers built with
  `Schema.decodeUnknownSync`, `toStrictEqual` for round-trips.
- Consumers of `@cambio/domain` elsewhere in the repo touch only
  `Timestamp`, `GameId`, `UserId` — the Phase rewrite and all additions
  break nothing outside the package.

Toolchain facts the implementer must honor:

- tsconfig: `strict`, `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, `verbatimModuleSyntax` (write inline type
  imports: `import { type GameState }`), NodeNext (relative imports need the
  `.js` extension). Prettier: no semicolons, double quotes, width 100,
  trailing commas.
- effect 3.22.1 ships `Utils.PCGRandom` — a pure, seedable PRNG class with
  `constructor(seed)`, `getState(): PCGRandomState`
  (`[number, number, number, number]`), `setState(state)`, and
  `integer(max)` (uniform in `[0, max)`). This is the chosen shuffle source
  (root plan Decision Log): construct locally, `setState` from the state
  carried in `GameState`, `getState` back out — no instance ever escapes,
  so functions stay pure.
- In effect 3.x the success channel comes **first**:
  `Either.Either<A, E>`. The root plan's prose shape
  `Either<GameError, [GameState, GameEvent[]]>` is written in code as
  `Either.Either<readonly [GameState, ReadonlyArray<GameEvent>], GameError>`.
- Errors are `Data.TaggedError` classes (per the effect-domain-modeling
  skill) — they are values returned in `Either.left`, never thrown, and are
  **not** Schema (they are not persisted; commands/events/state are).
- Pattern matching: `Match.value`/`Match.tag` or a `switch` on `_tag` with
  an exhaustiveness check (`satisfies never` on the fallthrough). Never
  `if`-chains.
- Every schema follows the one-name convention:
  `export const X = Schema…; export type X = typeof X.Type`. Docstrings cite
  the HANDOFF section or ADR they implement (`(§1.5)`, `(ADR-0010)`).
- Purity: no `Date.now`, `new Date`, `Math.random`, `crypto`, no I/O
  anywhere in `packages/domain/src`. Time is the `now: Timestamp` parameter;
  randomness is the seed / `PrngState` in `GameState`.

If `pnpm` is not on PATH in a fresh shell, load nvm first
(`source ~/.nvm/nvm.sh && nvm use 22`).

## Plan of work

Ordered by root-plan milestone. Every step writes the named test file (or
addition) **first**, watches it fail, then implements. Each step ends with
the repo compiling and `pnpm --filter @cambio/domain test` green.

### M1 — State model

**Step 1.1 — `GameConfig` and `PrngState`.**
Write `packages/domain/test/GameConfig.test.ts` first: `GameConfig`
round-trips `{ slamWindowMs: 4000 }`, rejects zero/negative/non-integer.
Then create:

- `packages/domain/src/GameConfig.ts` — `GameConfig` as
  `Schema.Struct({ slamWindowMs: Schema.Int.pipe(Schema.positive()) })`
  plus `decodeGameConfig`/`encodeGameConfig`. Docstring cites ADR-0011.2:
  the duration is config, no literal default lives in the domain (the
  default is an application-layer concern).
- `packages/domain/src/Prng.ts` — `PrngState` as
  `Schema.Tuple(Schema.Number, Schema.Number, Schema.Number, Schema.Number)`
  (mirrors `Utils.PCGRandomState`) and
  `prngStateFromSeed = (seed: number): PrngState` implemented as
  `new Utils.PCGRandom(seed).getState()`. A test in
  `test/Prng.test.ts` (created now, grown in M3) pins: same seed ⇒ same
  state; round-trip through the schema. Docstring: this is the only place
  `Utils.PCGRandom` is constructed; instances never escape a function
  (purity, root plan Decision Log).

Add `export * from "./GameConfig.js"` and `export * from "./Prng.js"` to
`src/index.ts`. Pattern to imitate: `Ids.ts` (small schema + brand file).

**Step 1.2 — `GameState` and hand representation.**
Write `packages/domain/test/GameState.test.ts` first, pinning: `GameState`
round-trips a hand-built two-player state; `lowestFreeSlot` on `[]` is 0,
on slots `{0,2,3}` is 1, on `{0,1,2,3}` is 4 (hands grow past four via
penalties, §4.3); `occupiedSlots` lists every `(player, slot)` pair;
`allCards` concatenates deck + discard + hands (the partition-test
workhorse, §4.5); `slotCard` returns `Option.none` for a hole. Then create
`packages/domain/src/GameState.ts`:

- `SlotRef = Schema.Struct({ playerId: UserId, slotIndex: SlotIndex })` —
  the ADR-0010 replacement for the deleted `CardRef`: a reference that the
  legality function (not the schema) validates as **occupied**. Docstring
  cites ADR-0010.1.
- `HandSlot = Schema.Struct({ slotIndex: SlotIndex, card: CardSlug })` and
  `Hand = Schema.Array(HandSlot)` — a sparse list of occupied slots,
  invariant: unique `slotIndex`, kept sorted ascending. This honors §4.3
  index semantics (stable positions, holes never shift, incoming cards fill
  the lowest free index) and mirrors the future `user_cards` rows.
- `GamePlayer = Schema.Struct({ id: UserId, hand: Hand })`.
- `GameState = Schema.Struct({ players: Schema.Array(GamePlayer), deck:
  Schema.Array(CardSlug), discard: Schema.Array(CardSlug), prng: PrngState,
  phase: Phase, config: GameConfig })` — players in seat order (array index
  = seat, §4.3 `game_players`), `deck[0]` = next to draw, `discard[0]` =
  top (§4.3). PRNG state lives here so mid-game reshuffles and penalty
  draws stay deterministic (root plan Decision Log). Plus
  `decodeGameState`/`encodeGameState`.
- Pure helpers (exported; all total, no I/O): `seatOf(state, playerId)`,
  `handOf(state, playerId)`, `lowestFreeSlot(hand): SlotIndex`,
  `slotCard(state, ref): Option.Option<CardSlug>`,
  `occupiedSlots(state): ReadonlyArray<SlotRef>`,
  `allCards(state): ReadonlyArray<CardSlug>`.

`src/index.ts` gains `export * from "./GameState.js"`. Imitate `Card.ts`
(schema + derivation functions in one file).

**Step 1.3 — Phase rewrite.**
Rewrite `packages/domain/test/Phase.test.ts` first for the new union (same
round-trip/discriminate/reject structure as today), then rewrite
`packages/domain/src/Phase.ts`:

- **Delete** `CardRef` and `TargetSelection` (and their exports) — no
  `PROVISIONAL` marker may survive anywhere in the package (root acceptance
  criteria).
- New union (each a `Schema.TaggedStruct`, each type re-exported under the
  same name, `decodePhase`/`encodePhase` kept):
  - `AwaitingDraw { playerId: UserId }` — unchanged.
  - `HoldingCard { playerId: UserId, card: CardSlug, source: HeldCardSource }`
    — unchanged; `source` still decides the legal move set (§4.2): discard
    source must swap (or keep at zero cards, ADR-0009.2), deck source may
    also discard.
  - `ResolvingPower { playerId: UserId, card: CardSlug }` — a drawn power
    awaiting its (first) target command. The §4.2 sketch's `power` field is
    derived via `rank(card)` instead of stored (§4.1: derive, don't store);
    the sketch's `chosen: TargetSelection` is gone because targets arrive on
    the resolving command and resolve immediately (ADR-0010). The card slug
    is carried because the power card must reach the discard pile after
    resolution (§1.3c).
  - `ResolvingQueenSwap { playerId: UserId, card: CardSlug }` — the Queen's
    step two (§1.4): peek done, blind-swap pair still owed. A distinct case
    so the match is exhaustive and step one cannot be replayed.
  - `SlamWindow { turnPlayerId: UserId, closesAt: Timestamp, rank: Rank }`
    — gains `turnPlayerId` (whose turn just resolved) so the close command
    can advance to seat `(seatOf(turnPlayerId) + 1) % n` (§1.6, C4.6);
    `closesAt` is fixed at open (ADR-0011.1).
  - `Ended { calledBy: UserId }` — unchanged.
- Update the module docstring: transitions now live in `Engine.ts`,
  legality in `Legality.ts` — "do not add transitions **here**" stays, but
  points at those files instead of "a later task".

Checkpoint: `pnpm --filter @cambio/domain test` green,
`pnpm --filter @cambio/domain typecheck` clean.

### M2 — Vocabulary: errors, commands, events

**Step 2.1 — `GameError`.**
Write `packages/domain/test/GameError.test.ts` first: each class constructs
with its fields, exposes the right `_tag`, and `GameError` narrows on
`_tag` in a `switch`. Then create `packages/domain/src/GameError.ts` with
one `Data.TaggedError` class per distinguishable failure reason (C7.1) —
imitate the skill's `IllegalMove` example, all fields `readonly`:

- `BadPlayerCount { count: number }` — C1.1.
- `GameAlreadyEnded { calledBy: UserId }` — any command after `Ended`.
- `NotYourTurn { playerId: UserId, activePlayerId: UserId }` — turn-phase
  command from the wrong player (C2.1).
- `WrongPhase { commandTag: string, phaseTag: string }` — command kind not
  applicable to the current phase.
- `PowerDiscardNotTakeable { rank: Rank }` — take-discard on a power top
  (C2.3, §1.3b).
- `MustResolvePower { power: PowerKind }` — swap/discard/keep attempted
  while holding a drawn power (C2.5).
- `EmptySlotTarget { target: SlotRef }` — any command naming an unoccupied
  slot: J/Q swap ends (ADR-0010.1), peeks, swap-into-own-slot, slam target.
- `WrongPeekTarget { power: PowerKind, target: SlotRef }` — 7/8 aimed at
  another player, 9/10 aimed at self (C3.1–2).
- `KeepRequiresEmptyHand { playerId: UserId }` — `KeepHeld` with a
  non-empty hand (keeps exist only at zero cards, §1.6, ADR-0009.2).
- `InvalidGiveSlot { playerId: UserId, giveSlot: SlotIndex | null }` —
  slam give-slot missing/unoccupied when required, or present when it must
  be absent (root Decision Log: upfront give-slot).
- `SlamTooLate { closesAt: Timestamp, at: Timestamp }` — slam with
  `now >= closesAt` (C4.6).
- `WindowStillOpen { closesAt: Timestamp, at: Timestamp }` — close command
  with `now < closesAt` (C4.6).
- `NoCardToDraw {}` — turn draw when deck and reshufflable discard are both
  exhausted (C6.2).

Export `type GameError =` the union of all classes.

**Step 2.2 — `Command`.**
Write `packages/domain/test/Command.test.ts` first (round-trip every case,
reject unknown tag — imitate `Phase.test.ts`). Then create
`packages/domain/src/Command.ts`: one `Schema.TaggedStruct` per case, a
`Schema.Union` named `Command`, `decodeCommand`/`encodeCommand`. Cases
(imperative verbs; every player-issued case carries `playerId: UserId` as
the issuer):

- `CallCambio { playerId }` — C2.2.
- `TakeDiscard { playerId }` — enters `HoldingCard` source `discard`
  (two-step, per §4.2's source semantics).
- `DrawFromDeck { playerId }` — C2.4.
- `SwapHeld { playerId, slotIndex: SlotIndex }` — place the held card into
  a named occupied own slot; displaced card to discard (C2.3, C2.5).
- `DiscardHeld { playerId }` — deck-source non-power only (C2.5).
- `KeepHeld { playerId }` — zero-card keep into the lowest free slot
  (§1.6, ADR-0009.2); works for both held-card sources.
- `PowerPeek { playerId, target: SlotRef }` — resolves 7/8 (own slot), 9/10
  (other's slot), and the Queen's step one (any occupied slot) (C3.1–2,
  C3.4).
- `PowerSwap { playerId, first: SlotRef, second: SlotRef }` — resolves the
  Jack, and the Queen's step two, as a blind swap of two occupied slots
  (C3.3–4, ADR-0010.1).
- `Slam { playerId, target: SlotRef, giveSlot: Schema.NullOr(SlotIndex) }`
  — names owner + slot (C4.2) and carries the give-slot choice **upfront**
  (root Decision Log): required (an occupied own slot) when slamming an
  opponent's card with a non-empty hand; must be `null` otherwise —
  own-card slams and zero-card slammers (draw-then-give, ADR-0009.1).
- `CloseSlamWindow {}` — the explicit close (C4.6, root Decision Log). No
  `playerId`: it is fired by the application layer's timer (or lazily),
  legal for any issuer once `now >= closesAt`.

**Step 2.3 — `GameEvent`.**
Write `packages/domain/test/GameEvent.test.ts` first (round-trip every
case). Then create `packages/domain/src/GameEvent.ts`: one
`Schema.TaggedStruct` per case, union `GameEvent`,
`decodeGameEvent`/`encodeGameEvent`. These are the future `game_events`
payloads (§4.3): they carry **full truth** (card identities included);
redaction is `viewFor`'s job in a later task. Cases (past tense):

- `GameStarted { at: Timestamp, seed: Schema.Number, players:
  Schema.Array(UserId), config: GameConfig, hands: Schema.Array(Hand),
  deck: Schema.Array(CardSlug), firstDiscard: CardSlug }` — records the
  **concrete deal** (hands parallel to `players` in seat order, remaining
  deck order, first discard) so replay never depends on PRNG byte-stability
  (root Decision Log); `seed` kept for audit only. `at` is the only event
  timestamp — later events are stamped by the persistence layer's `at`
  column (§4.3).
- `CambioCalled { playerId }` — C2.2.
- `GameEnded { calledBy: UserId, scores: Schema.Array(Schema.Struct({
  playerId: UserId, total: Schema.Int })), winners: Schema.Array(UserId) }`
  — per-player totals and the possibly-plural lowest-score winner set
  (§1.8, C2.2).
- `CardDrawn { playerId, card: CardSlug }` — turn draw (C2.4).
- `DiscardTaken { playerId, card: CardSlug }` — top discard into held state.
- `HeldSwapped { playerId, slotIndex: SlotIndex, placed: CardSlug,
  discarded: CardSlug }` — held card into slot, displaced card to pile.
- `HeldKept { playerId, slotIndex: SlotIndex, card: CardSlug }` —
  zero-card keep (ADR-0009.2).
- `HeldDiscarded { playerId, card: CardSlug }` — deck-drawn non-power
  discarded directly.
- `CardPeeked { viewerId: UserId, target: SlotRef, card: CardSlug }` —
  7/8, 9/10, and Queen step one; records viewer **and** card identity
  because knowledge follows cards, not slots (§4.4, C3.1).
- `CardsBlindSwapped { by: UserId, first: SlotRef, second: SlotRef }` —
  J/Q swap as a public slot movement; identities deliberately absent
  (§1.4, §4.4).
- `PowerFizzled { playerId, power: PowerKind }` — ADR-0010.2.
- `PowerDiscarded { playerId, card: CardSlug }` — the power card reaching
  the discard pile after resolution or fizzle (§1.3c).
- `SlamWindowOpened { turnPlayerId: UserId, closesAt: Timestamp,
  rank: Rank }` — C4.1.
- `SlamSucceeded { slammerId: UserId, target: SlotRef, card: CardSlug }` —
  the public reveal is part of the cost (§1.5, C4.4).
- `SlamFailed { slammerId: UserId, target: SlotRef, card: CardSlug }` —
  ditto; the card stays put.
- `PenaltyDrawn { playerId, slotIndex: SlotIndex, card: CardSlug }` —
  penalty card into the lowest free slot (§1.5).
- `CardGivenFromHand { slammerId: UserId, fromSlot: SlotIndex,
  to: SlotRef }` — the normal give (§1.5); identity derivable from slots.
- `CardGivenFromDeck { slammerId: UserId, to: SlotRef, card: CardSlug }` —
  zero-card draw-then-give (ADR-0009.1); the card is unseen at the table
  but the log records truth.
- `DrawSkipped { playerId, kind: Schema.Literal("penalty", "give") }` —
  ADR-0011.3.
- `DeckReshuffled { deck: Schema.Array(CardSlug) }` — records the
  **resulting order** (root Decision Log), top discard retained (§1.7).
- `SlamWindowClosed {}` and `TurnAdvanced { playerId: UserId }` — both
  emitted by the close command (C8.2 lists open/close and turn advance
  separately).

Add `export *` lines for the three new modules to `src/index.ts`.
Checkpoint: full domain test suite green.

### M3 — Deal

**Step 3.1 — Shuffle.**
Extend `packages/domain/test/Prng.test.ts` first: `shuffle` of the 52 slugs
is a permutation (same multiset), deterministic (same state ⇒ same order
and same output state, deep-equal across two calls), different for
different seeds, and leaves its input untouched. Then extend
`packages/domain/src/Prng.ts` with

```ts
export const shuffle = <A>(
  items: ReadonlyArray<A>,
  state: PrngState,
): readonly [ReadonlyArray<A>, PrngState]
```

— Fisher–Yates over a local `Utils.PCGRandom` (`setState` a copy of
`state`, swap using `integer(i + 1)`, `getState` out).

**Step 3.2 — `dealGame`.**
Write `packages/domain/test/Deal.test.ts` first, pinning C1 exactly: 1 and
6 players ⇒ `Either.left(BadPlayerCount)`; for 2–5 players — every player
holds 4 cards at slots 0–3, one discard, `deck.length = 52 − 4n − 1`,
`allCards` is the 52-slug partition (no dupes, none missing) (C1.4); phase
is `AwaitingDraw` for seat 0 with **no opening peek** (§1.1, C1.3); same
inputs ⇒ deep-equal state and events; the `GameStarted` event's
`hands`/`deck`/`firstDiscard` match the returned state (C1.3). Then create
`packages/domain/src/Deal.ts`:

```ts
export const dealGame = (
  players: ReadonlyArray<UserId>, // seat order
  seed: number,
  config: GameConfig,
  now: Timestamp,
): Either.Either<readonly [GameState, ReadonlyArray<GameEvent>], GameError>
```

— validate 2 ≤ n ≤ 5, shuffle `ALL_CARD_SLUGS` from
`prngStateFromSeed(seed)`, deal 4 to each seat (slots 0–3), flip one
discard, store the post-deal `PrngState` in the state, emit exactly
`[GameStarted]`. `export * from "./Deal.js"` in `index.ts`. Checkpoint:
suite green.

### M4 — Legality core and engine skeleton

**Step 4.1 — The single legality function.**
Write `packages/domain/test/Legality.test.ts` first: non-active player's
`DrawFromDeck` during `AwaitingDraw` ⇒ `NotYourTurn`; `Slam` during
`AwaitingDraw` ⇒ `WrongPhase`; anything after `Ended` ⇒ `GameAlreadyEnded`;
`TakeDiscard` on a power top ⇒ `PowerDiscardNotTakeable`; `PowerSwap`
naming an empty slot ⇒ `EmptySlotTarget` (ADR-0010 dedicated test);
`legalCommandKinds` returns exactly
`["CallCambio", "TakeDiscard", "DrawFromDeck"]` for the active player in
`AwaitingDraw` (minus `TakeDiscard` when the top is a power) and `[]` for
everyone else. Then create `packages/domain/src/Legality.ts` — the **only**
place any rule check lives (C7.2, effect-domain-modeling skill):

```ts
export const checkCommand = (
  state: GameState,
  command: Command,
  now: Timestamp,
): Option.Option<GameError> // None = legal

export const legalCommandKinds = (
  state: GameState,
  playerId: UserId,
  now: Timestamp,
): ReadonlyArray<Command["_tag"]>

export const powerHasValidTarget = (power: PowerKind, state: GameState): boolean
```

`checkCommand` is legality as a function of `(phase, playerId, gameState)`
(§4.2) — the phase comes from `state.phase`, the player from the command.
Structure it as one exhaustive match on `command._tag`, each arm using
shared private predicates (occupancy, active player, window timing) so
`legalCommandKinds` reuses the identical logic — it enumerates the ten
tags and asks the same per-kind predicates whether **any** instantiation
by `playerId` is legal; no rule exists outside this module.
`powerHasValidTarget` implements ADR-0010.2's per-power predicate (7/8:
own hand non-empty; 9/10: some opponent non-empty; J and Q: at least two
occupied slots in the whole game — the Queen is all-or-nothing).

**Step 4.2 — `applyCommand` skeleton.**
Extend `Legality.test.ts` (or start
`packages/domain/test/Engine.test.ts`) first: an illegal command returns
`Either.left` of the same error `checkCommand` gives **and the input state
is referentially untouched** (C7.3). Then create
`packages/domain/src/Engine.ts`:

```ts
export const applyCommand = (
  state: GameState,
  command: Command,
  now: Timestamp,
): Either.Either<readonly [GameState, ReadonlyArray<GameEvent>], GameError>
```

— first `checkCommand`; on `Some(error)` return `Either.left(error)`;
otherwise dispatch through an exhaustive `switch` on `command._tag` to one
private handler per command. In this milestone every handler body returns
`Either.left(new TransitionNotReached({ commandTag }))` where
`TransitionNotReached` is a **private, unexported** `Data.TaggedError` in
`Engine.ts` — a scaffold that M5–M7 replace arm by arm and M7 deletes
(validated by grep in M8). No test may ever rely on it. Add
`export * from "./Legality.js"` and `export * from "./Engine.js"` to
`index.ts`. Checkpoint: suite green, typecheck clean.

### M5 — Turn actions

**Step 5.1 — Scoring.**
Write `packages/domain/test/Scoring.test.ts` first: `handTotal` sums
`score` over a hand (red king −2 pulls a total negative, §1.2); empty hand
totals 0 (§1.6); `winnersOf` returns all players sharing the minimum
(a two-way tie yields both, §1.8). Then create
`packages/domain/src/Scoring.ts`: `handTotal(hand): number`,
`gameScores(state): ReadonlyArray<{ playerId: UserId; total: number }>`,
`winnersOf(scores): ReadonlyArray<UserId>`. `export *` in `index.ts`.

**Step 5.2 — Turn-action transitions.**
Write `packages/domain/test/TurnActions.test.ts` first, one `describe` per
clause:

- **CallCambio (C2.2):** phase becomes `Ended { calledBy }`; events
  `[CambioCalled, GameEnded]` with per-player totals and winner set; no
  further command is legal.
- **TakeDiscard (C2.3):** non-power top ⇒ `HoldingCard` source `discard` +
  `DiscardTaken`; then `SwapHeld` into an occupied slot ⇒ `HeldSwapped`,
  displaced card on top of discard, then the slam window opens;
  `DiscardHeld` from discard source ⇒ `WrongPhase`-family error (never
  straight back); zero-card player: `KeepHeld` ⇒ `HeldKept` into slot 0
  (ADR-0009.2 dedicated test); `KeepHeld` with a non-empty hand ⇒
  `KeepRequiresEmptyHand`.
- **DrawFromDeck (C2.4–5):** ⇒ `HoldingCard` source `deck` + `CardDrawn`;
  non-power then `SwapHeld` or `DiscardHeld` resolves and opens the
  window; power ⇒ `ResolvingPower` (fizzle branch refined in M6);
  `SwapHeld`/`DiscardHeld`/`KeepHeld` while `ResolvingPower` ⇒
  `MustResolvePower`.
- **Window open/close (C4.1, C4.6):** after each resolving action, phase is
  `SlamWindow { turnPlayerId, closesAt: now + config.slamWindowMs, rank:
  rank(discard[0]) }` and `SlamWindowOpened` is emitted; `CloseSlamWindow`
  with `now < closesAt` ⇒ `WindowStillOpen`; with `now >= closesAt` ⇒
  `[SlamWindowClosed, TurnAdvanced]` and `AwaitingDraw` for seat
  `(seat + 1) % n` — including onto a zero-card player (§1.6, C5).
- **Turn-draw reshuffle (C6):** empty deck + drawable discard ⇒
  `DeckReshuffled` (recorded order; top discard retained) before
  `CardDrawn`; deck empty and discard down to its top card ⇒
  `NoCardToDraw`, state untouched.

Then implement the handlers in `Engine.ts` (replacing their
`TransitionNotReached` bodies): `CallCambio`, `TakeDiscard`,
`DrawFromDeck`, `SwapHeld`, `DiscardHeld`, `KeepHeld`, `CloseSlamWindow`,
plus private helpers reused later: `openSlamWindow(state, turnPlayerId,
now)`, `reshuffleIfEmpty(state)` (uses `shuffle` on `discard.slice(1)`,
returns events), `drawOne(state)`. All updates are immutable spreads;
hands stay sorted by `slotIndex`. Checkpoint: suite green.

### M6 — Powers

Write `packages/domain/test/Powers.test.ts` first:

- 7/8: `PowerPeek` at an own occupied slot ⇒ `CardPeeked` (viewer + card,
  §4.4) then `PowerDiscarded` and the window opens; peeking another's slot
  ⇒ `WrongPeekTarget`; empty own slot ⇒ `EmptySlotTarget`.
- 9/10: mirror image (must be another player's occupied slot).
- J: `PowerSwap` of two occupied slots (any owners, may be the same
  player, §1.4) ⇒ `CardsBlindSwapped` + `PowerDiscarded` + window; the two
  cards actually exchange slots in the state; either end empty ⇒
  `EmptySlotTarget` (ADR-0010 dedicated test).
- Q: `PowerPeek` (any occupied slot, own or other's) ⇒ `CardPeeked` and
  phase `ResolvingQueenSwap`; then `PowerSwap` ⇒ `CardsBlindSwapped` +
  `PowerDiscarded` + window; the swap may include the peeked card; a
  second `PowerPeek` in `ResolvingQueenSwap` ⇒ `WrongPhase`; both steps
  mandatory — no command skips the swap (C3.4).
- Fizzles (ADR-0010.2, one dedicated test each): 7/8 drawn with own hand
  empty; 9/10 with every opponent empty; J with fewer than two occupied
  slots in the game; Q likewise (whole-Queen fizzle — no peek happens).
  Each ⇒ draw resolves as `[CardDrawn, PowerFizzled, PowerDiscarded,
  SlamWindowOpened]`, card straight to discard, never entering
  `ResolvingPower`.
- A power on top of the discard is inert but slammable-against: window
  `rank` is the power's rank (C3.6).

Then implement in `Engine.ts`: the `PowerPeek`/`PowerSwap` handlers, and
refine the `DrawFromDeck` handler to consult
`powerHasValidTarget(rank(card), stateAfterDraw)` at draw time — valid
target ⇒ `ResolvingPower`; none ⇒ the fizzle sequence. Legality arms for
`PowerPeek`/`PowerSwap` in `Legality.ts` were written in M4; extend them
here only if the tests expose gaps (any change still lives in
`Legality.ts` alone). Checkpoint: suite green.

### M7 — Slamming

Write `packages/domain/test/Slam.test.ts` first:

- **Outcomes (C4.3), one test each:** own + correct ⇒ `SlamSucceeded`,
  card to discard top, slot becomes a hole (other indices unmoved); own +
  incorrect ⇒ `SlamFailed` + `PenaltyDrawn` into the lowest free slot;
  opponent + correct ⇒ `SlamSucceeded` + `CardGivenFromHand` moving the
  named `giveSlot` card into the vacated slot; opponent + incorrect ⇒
  `SlamFailed` + `PenaltyDrawn`.
- **Rank-only matching (C4.2):** J does not match Q despite equal score; a
  black king matches a red king.
- **Give-slot validation:** opponent slam with a hand and `giveSlot: null`
  ⇒ `InvalidGiveSlot`; `giveSlot` naming a hole ⇒ `InvalidGiveSlot`;
  own-card slam with a non-null `giveSlot` ⇒ `InvalidGiveSlot`.
- **Zero-card slammer (ADR-0009.1 dedicated test):** correct opponent slam
  with empty hand and `giveSlot: null` ⇒ `CardGivenFromDeck` (deck top,
  unseen, into the vacated slot), reshuffling first if needed.
- **Skipped draws (ADR-0011.3 dedicated test):** construct a state where
  deck is empty and discard has only its top card — failed slam ⇒
  `SlamFailed` + `DrawSkipped("penalty")`, hand unchanged; zero-card give
  ⇒ `SlamSucceeded` + `DrawSkipped("give")`, slot stays a hole.
- **Window discipline (ADR-0011.1, C4.2, C4.6–7):** anyone may slam,
  including the turn player; several slams by several players inside one
  window all resolve and `closesAt` never moves; a slam at
  `now >= closesAt` ⇒ `SlamTooLate`; a slam in any non-window phase ⇒
  `WrongPhase`; naming an empty slot ⇒ `EmptySlotTarget`.
- Penalty draws reshuffle first when the deck is empty but the discard has
  depth (C4.5): `DeckReshuffled` precedes `PenaltyDrawn`.

Then implement the `Slam` handler in `Engine.ts` (reusing
`reshuffleIfEmpty`/`drawOne`; ADR-0009's single "obtain the give card"
step — from `giveSlot` or from deck top — then one shared placement path),
tighten the `Slam` arm of `checkCommand` as the tests demand, and **delete
`TransitionNotReached`** — every dispatch arm is now real. Checkpoint:
suite green.

### M8 — End-to-end, determinism, housekeeping

**Step 8.1 — End-to-end tests.**
Write `packages/domain/test/EndToEnd.test.ts` (no production code should
need to change; if it does, record it under Surprises):

- **Scripted full game (root acceptance criteria):** pick a fixed seed,
  `dealGame` 3 players, then drive a hand-scripted command list through
  `applyCommand` that covers at least: a discard take, a swap, a direct
  discard, one power resolution, one slam, one reshuffle, and a Cambio
  call. To script reliably, first log the deal for the chosen seed once
  (the `GameStarted` event makes every card position known), then hardcode
  the commands against it. After **every** step assert the 52-slug
  partition via `allCards` (C1.4, §4.5) and finish by asserting the exact
  final scores and winners.
- **Tie:** build a `GameState` directly (states are plain data — no
  engine needed) where two players hold equal-minimum totals, apply
  `CallCambio`, assert both appear in `GameEnded.winners` (§1.8).
- **Determinism (C8.1):** run the scripted game twice from scratch;
  states and event lists are `toStrictEqual` at every step.
- **Enumeration smoke test:** at a few points mid-script,
  `legalCommandKinds` for each player matches expectation (C7.2).

**Step 8.2 — Housekeeping.**

- `packages/domain/src/Phase.ts` / `src/Card.ts`: final docstring pass —
  both now point at `Engine.ts`/`Legality.ts` as the existing home of
  transitions and power semantics (no more "a later task").
- `packages/domain/src/index.ts`: confirm the final module list —
  `Card`, `Ids`, `Phase`, `GameConfig`, `Prng`, `GameState`, `GameError`,
  `Command`, `GameEvent`, `Deal`, `Legality`, `Engine`, `Scoring` — all
  via `export *`.
- `.agents/skills/cambio-rules/SKILL.md`: rewrite the "Open rule gaps —
  STOP AND ASK" section — the three gaps are now **decided**; cite
  ADR-0009 (draw-then-give; zero-card take is a keep), ADR-0010
  (occupied-slot targets; fizzle), ADR-0011 (fixed close from
  `GameConfig.slamWindowMs`; skipped draws). Keep the section (renamed,
  e.g. "Formerly open gaps — now decided") so the anti-prior guard
  survives; `.claude/skills/` picks it up via the symlink.
- Run the full gate and the greps (below).

## Concrete steps & validation

Run from the repo root. If `pnpm` is missing from PATH:
`source ~/.nvm/nvm.sh && nvm use 22`.

After every step:

```bash
pnpm --filter @cambio/domain test        # all green, no skips
pnpm --filter @cambio/domain typecheck   # clean
```

Expected test-file inventory as milestones land (all under
`packages/domain/test/`): existing `Card.test.ts` + `Phase.test.ts`
(rewritten in M1), then `GameConfig.test.ts`, `Prng.test.ts`,
`GameState.test.ts` (M1); `GameError.test.ts`, `Command.test.ts`,
`GameEvent.test.ts` (M2); `Deal.test.ts` (M3); `Legality.test.ts`
(+ `Engine.test.ts` if split) (M4); `Scoring.test.ts`,
`TurnActions.test.ts` (M5); `Powers.test.ts` (M6); `Slam.test.ts` (M7);
`EndToEnd.test.ts` (M8) — 15±1 files, every C-clause and every ADR ruling
named in at least one test title.

Per-milestone lint (the domain must still import only `effect`):

```bash
pnpm --filter @cambio/domain lint
```

Greps (root acceptance criteria; all must print **nothing**):

```bash
grep -rn "Date.now\|new Date\|Math.random" packages/domain/src   # purity
grep -rn "PROVISIONAL" packages/domain                            # after M1
grep -rn "TransitionNotReached" packages/domain/src               # after M7
grep -rn "STOP AND ASK" .agents/skills/cambio-rules/SKILL.md      # after M8
```

Final gate (must pass before /ship):

```bash
pnpm turbo build typecheck lint test
```

Build/typecheck confirm the enlarged export surface still compiles for the
existing consumers (`packages/application`, `apps/api`); lint confirms the
import boundary; the domain suite includes the scripted end-to-end game,
the tie game, and the determinism replay.

## Progress

- [x] 2026-08-31 12:44 — M1 complete: `GameConfig.ts`, `Prng.ts` (incl.
      `shuffle`, implemented early alongside `prngStateFromSeed` — its tests
      land in M3 as planned), `GameState.ts`, `Phase.ts` rewritten
      (PROVISIONAL shapes deleted), `test/fixtures.ts` helper added
      (uid/slot/ts/card builders, not in plan — reduces fixture noise).
      25 tests green, typecheck clean.
- [x] 2026-08-31 12:47 — M2 complete: `GameError.ts` (13 classes),
      `Command.ts` (10 cases), `GameEvent.ts` (22 cases), all exported.
      31 tests green, typecheck clean. (One test rework: TS narrows a
      const's declared union by its initializer, so the `_tag`-switch test
      routes through a `(err: GameError) => string` function.)

## Surprises & notes for the root plan

*(anything the root plan's Decision Log or the reviewer must know)*
