# CAM-31 — Deck mechanics: no initial face-up discard + eager reshuffle (backend)

- **Root plan:** [root/CAM-31.md](../root/CAM-31.md) — the functional
  contract lives there; this document is implementation detail for the
  backend side (clauses 1–12 and the backend share of 17).

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

Governing decisions: [ADR-0039](../../adr/0039-game-starts-with-empty-discard-pile.md)
(empty discard at the deal, `firstDiscard` removed outright — breaking wire
change, dev data wiped) and
[ADR-0040](../../adr/0040-eager-single-mechanism-deck-reshuffle.md) (eager
single-mechanism reshuffle; lazy path removed; resting invariant **deck
empty ⟹ discard ≤ 1**). Layer rules that apply: `effect-domain-modeling`
(purity, test-first, exhaustive matches), `cambio-rules` (no invented
rules — the two ADRs are the only deltas), `application-layer` (contracts
are shapes only; the projection is the classification point),
`hidden-information` (leak sweeps are the guard being re-shaped, not
weakened), `infrastructure-persistence` (append-only event log, no
derivable columns — hence no migration).

Files this side touches, and their state as of planning (line anchors
verified 2026-09-08 against a green 196-test domain suite; they describe
**pre-change** code and will be stale after the diff lands):

- `packages/domain/src/Deal.ts` — `firstDiscard` selected at :37, deck cut
  `slice(players.length * 4 + 1)` at :38, initial `discard: [firstDiscard]`,
  event construction carries the field. The doc comment (:10–15) states the
  old §1.1 rule.
- `packages/domain/src/GameEvent.ts` — `GameStarted` TaggedStruct at
  :24–33 with `firstDiscard: CardSlug` at :31; its doc comment (:16–23)
  mentions the first discard. `DeckReshuffled` is unchanged by this task.
- `packages/domain/src/Fold.ts` — `initialState` transcribes
  `discard: [started.firstDiscard]` at :64. The `DeckReshuffled` case
  (:307–315) is pure transcription and needs **no new logic** for eager
  timing — only the batch **position** of the event changes, which the fold
  handles by construction.
- `packages/domain/src/Engine.ts` — the mechanism site. `reshuffleIfEmpty`
  (:68–75, guard via `drawable`) is called **only** from `drawOne` (:82–89),
  which serves three draw sites: `drawFromDeck` (:118–121), the failed-slam
  penalty (:253–267, `DrawSkipped kind:"penalty"` on `None`), and the
  zero-card draw-then-give (:301–318, `DrawSkipped kind:"give"` on `None` —
  note this draw happens **after** the slammed card landed on the discard,
  which is why its event order is already the eager one). Six sites land
  cards on the discard: power fizzle (:136), `swapHeld` (:160),
  `discardHeld` (:173), `powerPeek` (:207), `powerSwap` (:229) — all five
  funnel into `openWindowOrAdvance` (:56–65, which reads `state.discard[0]`
  for the window rank) — plus the slam landing (:279) with three distinct
  returns: own-slam (:281), give-from-hand (:292–299), draw-then-give.
  Every transition is `Step = [GameState, ReadonlyArray<GameEvent>]`;
  helpers thread state and concatenate events (`swapHeld` is the canonical
  composition shape).
- `packages/domain/src/Legality.ts` — `drawable` (:43–44) is the
  reshufflable predicate (`deck > 0 || discard > 1`). **It stays as-is**
  (root-plan Decision Log): still the correct legality for `DrawFromDeck`;
  its disjunction merely becomes redundant for reachable resting states.
- `packages/domain/src/testing/` — the sim harness: `invariants.ts`
  (`stepViolations` is the per-transition bundle the driver runs after
  every accepted command **and** on the initial state), `driver.ts`,
  `counters.ts` (`reshuffles` counter — no change needed, it counts
  `DeckReshuffled` occurrences regardless of position).
- `packages/contracts/src/GameEvents.ts` — wire `GameStarted` at :44–50
  with `firstDiscard` at :47; codecs at :246–255. Wire `DeckReshuffled`
  (:171–173, count only) is unchanged.
- `packages/application/src/projection/EventProjection.ts` — the
  `GameStarted` case copies `event.firstDiscard` at :50; the switch is
  exhaustive with `satisfies never`, so the domain field removal is a
  compile error here, which is the intended discovery mechanism.
- Leak-sweep allowlists — `publicSlugsOf` in
  `packages/application/test/AdversarialProjection.test.ts` and
  `rulePublicSlugs` in `apps/api/test/support/leaks.ts` both whitelist
  `event.firstDiscard` under their `GameStarted` case; both are typed over
  the real `GameEvent` union, so both break as **type errors** when the
  field goes. That is the sweep working as designed — the fix is deleting
  the `GameStarted` case from each, not loosening the types.
- `apps/api/src/infra/game-repository.ts` — `actorOf` already maps
  `GameStarted` and `DeckReshuffled` to null; no change. The `textArray`
  helper (:90–91) binds text[] columns via `string_to_array` and handles
  empty arrays, but **no existing integration test persists an empty
  discard or deck** — clause 5 exists to close that gap.
- **No migration.** `firstDiscard` exists only inside `game_events.payload`
  jsonb (the schema stores nothing derivable). Old payloads become
  undecodable; per ADR-0039 the dev data is wiped instead (M6).
- Docs (M6 backend share): `docs/HANDOFF.md` §1.1 (the "One card is turned
  face up" bullet, line 39) and §1.7 (line 114) get amendment blockquotes
  in the ADR-0036 pattern (HANDOFF.md:30–35);
  `.agents/skills/cambio-rules/SKILL.md` gets the same two amendments (its
  existing ADR-0036 blockquote is the pattern; the §1.1 bullet and the
  §1.7 bullet under "Zero cards, deck exhaustion, endgame" are the targets).
  These commit on the **task branch** (CAM-20 precedent — root-plan
  Decision Log), not via the ADR-0028 main-first path.

**One deliberate compile-red window.** Removing `firstDiscard` from the
domain event (M1) necessarily breaks `EventProjection.ts` and both leak
sweeps until M2 lands — there is no ordering of the cross-package removal
that keeps every intermediate step compiling, and the type errors ARE the
reader-discovery sweep. So: M1's checkpoint is domain-scoped
(`pnpm turbo test --filter @cambio/domain` green); the first repo-wide
green gate is M2's checkpoint. M1 and M2 should land as one contiguous
working session (they can be one commit if the implementer prefers —
the milestone boundary is about wire-freeze sequencing for the frontend,
not about commit granularity).

## Plan of work

### M1 — Domain, game start (clauses 1, 2, 4; test-first)

1. **Rewrite the deal tests first** (`packages/domain/test/Deal.test.ts`):
   - "deals 4 cards to slots 0–3 per player, one discard, rest as deck
     (C1.2, §1.1)" — retitle and repoint: expect `discard: []` and a deck
     of `52 − 4n`; both numbers change.
   - "is deterministic and the GameStarted event matches the state (C1.3,
     C8.1)" — drop the `started.firstDiscard` assertion; assert the event
     mirrors the (now larger) deck and that no discard field exists.
   - Extend or add a case for clause 2's opening-state behavior: from the
     freshly dealt state, `TakeDiscard` fails with `EmptyDiscard` and
     `legalCommandKinds` yields exactly draw-or-call. The existing ADR-0012
     machinery already implements this (pinned for mid-game states by
     "rejects taking from an empty pile (ADR-0012)" in
     `packages/domain/test/TurnActions.test.ts`); the new coverage is that
     the **dealt** state exercises it — a real state, not a hand-built one.
   - "partitions all 52 slugs with no duplicates (C1.4, §4.5)" should pass
     unchanged — the partition just has one more card in the deck bucket.
2. **Change `Deal.ts`**: delete the `firstDiscard` selection, cut the deck
   at `players.length * 4`, seed `discard: []`, drop the field from the
   `GameStarted` construction, and rewrite the doc comment to state the
   ADR-0039 rule (keep the §1.1-as-amended citation style).
3. **Change `GameEvent.ts`**: remove `firstDiscard` from the `GameStarted`
   TaggedStruct and from its doc comment. Update the round-trip fixture in
   `packages/domain/test/GameEvent.test.ts` ("round-trips each member of
   the union").
4. **Change `Fold.ts`** `initialState` to `discard: []`. Update
   `packages/domain/test/Fold.test.ts` "the folded deal carries
   GameStarted's payload verbatim — hands, deck, discard, prng" (the
   verbatim payload no longer includes a discard; the folded discard is
   empty). The fold-equals-dealt-state property is clause 4's pin.
5. Sweep remaining domain-side readers: the sim/end-to-end suites compile
   against the event union — expect fixture fallout in
   `packages/domain/test/EndToEnd.test.ts` (the scripted seed-42 game's
   card sequence shifts because the deck cut moved by one; the script is
   adaptive but its mechanic-coverage checklist and any seed-specific
   assertions may need a re-script or seed hunt) and possibly in
   `packages/domain/test/sim/` fixtures. Hand-built `base` states in
   `Legality.test.ts` / `TurnActions.test.ts` / `Slam.test.ts` /
   `Powers.test.ts` / `GameState.test.ts` / `Scoring.test.ts` construct
   their own discards and do not break; leave them alone in M1.

Checkpoint: `pnpm turbo test --filter @cambio/domain` green. Repo-wide
typecheck is expected red (projection + leak sweeps) until M2.

### M2 — Contracts freeze + projection + leak sweeps (clause 3)

1. Remove `firstDiscard` from the wire `GameStarted` in
   `packages/contracts/src/GameEvents.ts`; adjust its doc comment (the
   "stripped for everyone" story now also has no first discard to keep).
   Codecs need no change — they derive from the union.
2. Fix `EventProjection.ts`'s `GameStarted` case (stop copying the field).
   Update `packages/application/test/EventProjection.test.ts` "GameStarted:
   players, first discard, deck count, config — hands/deck/prng/seed gone"
   — retitle; assert the room payload has players, deckCount, config, and
   **no card value at all**.
3. Delete the `GameStarted` case from `publicSlugsOf`
   (`packages/application/test/AdversarialProjection.test.ts`) and from
   `rulePublicSlugs` (`apps/api/test/support/leaks.ts`). The sweeps now
   assert the deal makes **nothing** public — strictly stronger.
4. Fix the api-side fixture in `apps/api/test/RealtimePublisher.test.ts`
   "a GameStarted batch reaches the room value-stripped" (domain event
   fixture carries `firstDiscard`; wire expectation carries it too — both
   go). `apps/api/test/GameRepository.test.ts` and
   `LobbyRepository.test.ts` build fixtures through `dealGame` and follow
   automatically; re-run to confirm.

Checkpoint: full gate `pnpm turbo build typecheck lint test`, bare, green.
**The wire shape is frozen here** — frontend M5 may start.

### M3 — Domain, eager reshuffle (clauses 6–11 and the domain half of 12; test-first)

1. **Reframe the three ordering tests first** (they pin lazy behavior whose
   hand-built states become unreachable under the resting invariant):
   - `packages/domain/test/TurnActions.test.ts` "reshuffles the pile
     (keeping its top) when the deck is empty (C6.1)" — the state
     `deck: [], discard: 3 cards` is unreachable at rest. Reframe to
     clause 6: a **one-card deck** with a reshufflable pile; the draw that
     takes the last card emits `CardDrawn` then `DeckReshuffled` in the
     same batch; post state has the shuffled former discard (minus retained
     top) as the deck, exactly the retained top as discard, prng
     transcribed onto the event.
   - `packages/domain/test/Slam.test.ts` "penalty draws reshuffle the pile
     (minus top) first" — reframe to clause 7: one-card deck, failed slam;
     order becomes `SlamFailed`, `PenaltyDrawn`, `DeckReshuffled`.
   - `packages/domain/test/Legality.test.ts` describe block "drawable
     (§1.7, CAM-10 — single source for Engine.ts's reshuffleIfEmpty)" —
     keep all three truth-table cases (drawable remains the legality
     truth for hand-built states) but rewrite the describe title/story:
     it is no longer the reshuffle guard's source, and the
     deck-empty-with-fat-discard case is unreachable at rest under
     ADR-0040 (say so in the comment, citing the ADR).
   - **Keep untouched as regression anchors:** Slam.test.ts "skips the
     penalty when no card exists anywhere (dedicated ADR-0011 test)"
     (clause 10 — state `deck: [], discard: [1]` satisfies the invariant)
     and "a zero-card give is satisfied by reshuffling the old top under
     the slammed card" (clause 8 — the expected order `SlamSucceeded`,
     `DeckReshuffled`, `CardGivenFromDeck` is byte-identical under eager,
     because the slammed card lands before the give-draw); TurnActions
     "rejects a draw when no card exists anywhere (C6.2)", "Cambio and a
     legal take remain available when no draw is possible", and "skips
     the slam window when the keep empties the pile (ADR-0012)".
2. **Add the new discard-landing trigger tests** (clause 9): with
   `deck: []` and a single-card discard (a legal resting state), land a
   discard and assert the reshuffle fires from that site before the
   window opens — e.g. `HeldDiscarded`, `DeckReshuffled`,
   `SlamWindowOpened` with the window rank equal to the retained top.
   Cover at minimum: the `discardHeld` path, one power path (fizzle or
   `powerSwap` — they funnel through the same helper entry), the
   `swapHeld` displaced-card path, and the two non-drawing slam returns
   (own-slam and give-from-hand: `SlamSucceeded`, `DeckReshuffled` [, give
   event] with no window — slams don't open windows). Add clause 8's
   second case: a draw-then-give whose give-draw itself empties the deck
   emits `DeckReshuffled` **after** `CardGivenFromDeck`.
3. **Implement the single eager mechanism** in `Engine.ts` (advisory
   sketch; the tests are the spec):
   - A helper shaped exactly like today's `reshuffleIfEmpty` —
     `(state) => Step`, no-op unless deck is empty **and** discard ≥ 2
     (the guard is naturally idempotent: after a reshuffle the deck is
     non-empty, so composing it twice on one path cannot double-fire).
   - Compose it: at the **entry** of `openWindowOrAdvance` (before the
     rank read — the reshuffle retains the top, so the window rank is
     unchanged and the event lands before `SlamWindowOpened`); at the
     slam's own-slam and give-from-hand returns; and **after** each of
     the three draw sites (normal draw, penalty draw, give-draw — for the
     give-draw this means after the give resolves, matching clause 8's
     order).
   - `drawOne` sheds `reshuffleIfEmpty` entirely — it becomes "take the
     deck top or `None`", no events (single mechanism, ADR-0040). The
     `DrawSkipped` branches at the penalty and give sites keep their
     ADR-0011 outcomes verbatim.
   - Delete the now-unused lazy `reshuffleIfEmpty` (or rename it into the
     eager helper — implementer's choice; one mechanism must remain).
4. **Add the resting invariant to the sim harness** (clause 11): a new
   checker in `packages/domain/src/testing/invariants.ts` — deck empty ⟹
   discard ≤ 1 — composed into `stepViolations`, so the driver asserts it
   on the initial state and after every accepted command across the whole
   seeded batch, with seed/step repro on failure. Unit-test the checker in
   `packages/domain/test/sim/Invariants.test.ts` alongside the existing
   checker tests (accepts a dealt state; rejects a constructed violating
   state; "stepViolations combines both checkers" grows to three).
   **Watch for fallout:** any Coverage/Fuzz scenario that constructs an
   initial state with an empty deck and a fat discard now fails the
   driver's initial-state check — such scenarios pin unreachable states
   and should be reframed, not exempted. The existing
   `packages/domain/test/sim/Simulation.test.ts` reshuffle-reachability
   assertion (`merged.reshuffles > 0` in "the default run reaches the
   batch-reachable ADR rare cases (C5.2)") stays — it now proves the
   **eager** mechanism fires under simulation. `counters.ts` needs no
   change.
5. Fold check (domain half of clause 12): no new Fold cases — verify
   `packages/domain/test/Fold.test.ts` "folding the full event log
   reproduces the final state — phase and prng included (C5.1, ADR-0014)"
   and the step-boundary-prefix test stay green over the harness batch;
   they now exercise eager-positioned `DeckReshuffled` events (including
   mid-batch, before `SlamWindowOpened`). "carries a DeckReshuffled deck
   order and prng no shuffle would produce, verbatim" stays as-is.

Checkpoint: `pnpm turbo test --filter @cambio/domain` green, then the full
gate green (application/api are consumers of unchanged shapes here, but
run the gate anyway — the sim harness exports from `packages/domain`
feed api's RoundTrip suite).

### M4 — API/persistence coverage (clause 5, remainder of 12)

1. **New integration test** (in `apps/api/test/GameRepository.test.ts`,
   alongside "first save inserts, load returns the identical decoded state
   and version (C3.3)"): persist a freshly dealt game and load it back —
   the empty `discard_pile` text[] must round-trip to `discard: []`
   deep-equal with the live state. This is the save/load gap exploration
   found: `textArray` handles empty arrays, but nothing pins it.
2. **Confirm the seeded round-trip suite green** (`apps/api/test/RoundTrip.test.ts`:
   "load deep-equals the live state at every persisted point (C5.2, C3.3)"
   and "foldEvents(getEvents) deep-equals the live state — state tables
   and event log agree (C5.2)") — this is clause 12's
   fold-vs-load-vs-live equality over eager-timed event logs, and the §4.5
   partition sweep ("all 52 slugs partition across decks.cards +
   user_cards + games.discard_pile …") runs against states that now
   legitimately include empty discards.
3. No repository code changes are expected (`actorOf` already returns null
   for both events; no schema change). If any surface, they go through
   the `infrastructure-persistence` rules and get logged in Surprises.

Requires Postgres: `docker compose -f docker/docker-compose.yml up -d`
then `pnpm --filter @cambio/api migrate` if in doubt.

Checkpoint: `pnpm turbo test --filter @cambio/api` green; full gate green.

### M6 (backend share) — Docs + dev-data wipe (clause 17)

1. `docs/HANDOFF.md`: amendment blockquote directly under the §1.1 "One
   card is turned face up…" bullet, pointing at ADR-0039 and stating the
   line is superseded (copy the ADR-0036 amendment's voice and shape);
   amendment blockquote under §1.7 pointing at ADR-0040, recording that
   the reshuffle timing is eager/single-mechanism and the resting
   invariant. Do not rewrite the original lines — amend, per the
   supersession convention.
2. `.agents/skills/cambio-rules/SKILL.md`: the same two amendments — under
   the setup bullet "One card is turned face up to start the discard
   pile…" and under the §1.7 deck-exhaustion bullet — in the pattern of
   its existing ADR-0036 blockquote. Commits on the task branch (CAM-20
   precedent; root-plan Decision Log). Note: the markdown-format hook
   runs on these files; keep inline code spans on one line.
3. **Dev-data wipe** (old `GameStarted` payloads are undecodable):
   canonical path is recreating the volume —
   `docker compose -f docker/docker-compose.yml down -v` then `up -d`,
   then `pnpm --filter @cambio/api migrate` (idempotent runner, fresh
   `_cambio_migrations`). A targeted `TRUNCATE` of the game tables is an
   acceptable alternative if the implementer wants to keep users/lobbies.
   Record which was done in Progress.
4. Final gate, bare.

## Concrete steps & validation

Per-checkpoint commands (never pipe any of these; run bare and read the
exit status — the PreToolUse hook enforces it):

- After M1: `pnpm turbo test --filter @cambio/domain` — expect the
  rewritten Deal/Fold/GameEvent tests plus the untouched remainder green;
  repo-wide typecheck deliberately red until M2.
- After M2: `pnpm turbo build typecheck lint test` — first fully green
  gate; announces the wire freeze.
- During M3 iteration: after a `pnpm turbo build --filter @cambio/domain`,
  bare `vitest run packages/domain/test/TurnActions.test.ts` (or
  Slam/Legality/sim files) is fine for the inner loop; finish every M3
  session with `pnpm turbo test --filter @cambio/domain`.
- After M3: `pnpm turbo build typecheck lint test`.
- M4 (Postgres up first): `pnpm turbo test --filter @cambio/api`; watch
  the RoundTrip suite names listed above and the new empty-discard
  round-trip test.
- After M6: `pnpm turbo build typecheck lint test` — the task's final
  gate. Prettier-on-markdown is covered by the format hook, but the gate's
  `lint` step is the proof.

Success signals: domain suite count moves from its current 196 as tests
are reframed/added (exact counts recorded in Progress as they land); the
sim batch prints its one-line summary with `reshuffles > 0`; no leak-sweep
weakening (the sweeps end the task with **fewer** whitelisted public
values than they started with).

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

| Clause                                                                                                                                                                             | Test (file + name)                                                                                                                                                                                                                                                                                                                                                                                                                            | What is asserted                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — planned: rewrite the Deal.test.ts deal-shape and determinism tests for `discard: []`, deck `52 − 4n`, event without the field, partition intact (M1)                           | packages/domain/test/Deal.test.ts "deals 4 cards to slots 0–3 per player, empty discard, rest as deck (C1.2, §1.1, ADR-0039)", "is deterministic and the GameStarted event matches the state (C1.3, C8.1)", "partitions all 52 slugs with no duplicates (C1.4, §4.5)"                                                                                                                                                                         | discard is [] and deck is 52-4n for each n; event carries no firstDiscard; 52-card partition still holds                                                                                                                      |
| 2 — planned: opening-state case over the **dealt** state — `TakeDiscard` → `EmptyDiscard`, `legalCommandKinds` = draw-or-call (M1, extends the ADR-0012 pins)                      | packages/domain/test/Deal.test.ts "opening state (empty discard, ADR-0039): TakeDiscard is illegal, only draw-or-call is legal (C2)"                                                                                                                                                                                                                                                                                                          | TakeDiscard on the dealt state fails EmptyDiscard; legalCommandKinds is exactly [CallCambio, DrawFromDeck]                                                                                                                    |
| 3 — planned: projection test reshaped to assert no card value in the room `GameStarted`; both leak-sweep allowlists shed their `GameStarted` case (type-level proof) (M2)          | packages/application/test/EventProjection.test.ts "GameStarted: players, deck count, config — no card value at all (ADR-0039: hands/deck/prng/seed/discard gone)"; packages/application/test/AdversarialProjection.test.ts publicSlugsOf (GameStarted case removed); apps/api/test/support/leaks.ts rulePublicSlugs (GameStarted case removed); apps/api/test/RealtimePublisher.test.ts "a GameStarted batch reaches the room value-stripped" | room GameStarted payload has no card slug (slugsIn === []); both leak-sweep allowlists compile with no GameStarted case, i.e. nothing about the deal is whitelisted as public                                                 |
| 4 — planned: Fold.test.ts verbatim-deal test asserts folded `discard: []`; fold-equals-dealt-state property unchanged (M1)                                                         | packages/domain/test/Fold.test.ts "the folded deal carries GameStarted's payload verbatim — hands, deck, discard, prng"                                                                                                                                                                                                                                                                                                                       | foldEvents([GameStarted]) deep-equals the dealt state, discard: [] included                                                                                                                                                   |
| 5 — planned: new GameRepository integration test — save a freshly dealt game, load deep-equals with empty `discard_pile` (M4)                                                      | apps/api/test/GameRepository.test.ts "a freshly dealt game round-trips an empty discard_pile (C3.3, ADR-0039)"                                                                                                                                                                                                                                                                                                                                | save+load of a freshly dealt state deep-equals, with discard: [] on both sides                                                                                                                                                |
| 6 — planned: reframed C6.1 test — last-card draw emits `CardDrawn` then `DeckReshuffled`, retained top is the whole discard (M3)                                                   | packages/domain/test/TurnActions.test.ts "draws the last deck card, then eagerly reshuffles the pile (keeping its top) (C6.1, ADR-0040)"                                                                                                                                                                                                                                                                                                      | one-card deck draw emits CardDrawn then DeckReshuffled in the same batch; post state's deck is the shuffled remainder, discard is exactly the retained top                                                                    |
| 7 — planned: reframed Slam penalty test — order `SlamFailed`, `PenaltyDrawn`, `DeckReshuffled` on a last-card penalty draw (M3)                                                    | packages/domain/test/Slam.test.ts "a penalty draw that takes the last deck card reshuffles the pile after (minus top) (ADR-0040)"                                                                                                                                                                                                                                                                                                             | order is SlamFailed, PenaltyDrawn, DeckReshuffled; post state's discard is the retained top, deck is the shuffled remainder                                                                                                   |
| 8 — planned: existing zero-card-give test kept verbatim as the regression anchor; new case for a give-draw that empties the deck (`DeckReshuffled` after `CardGivenFromDeck`) (M3) | packages/domain/test/Slam.test.ts "a zero-card give is satisfied by reshuffling the old top under the slammed card" (regression anchor, unchanged); "a give-draw that itself takes the last deck card reshuffles after the give (ADR-0040)" (new second case)                                                                                                                                                                                 | byte-identical order SlamSucceeded/DeckReshuffled/CardGivenFromDeck when the deck was already empty at landing; SlamSucceeded/CardGivenFromDeck/DeckReshuffled when the give-draw itself empties the deck                     |
| 9 — planned: new discard-landing trigger tests — representative sites through `openWindowOrAdvance` plus the two non-drawing slam returns; window rank = retained top (M3)         | packages/domain/test/TurnActions.test.ts describe "eager reshuffle re-arms on a discard landing (ADR-0040, C9)" (HeldDiscarded, SwapHeld, power-fizzle cases); packages/domain/test/Slam.test.ts describe "eager reshuffle re-arms on a slam landing (ADR-0040, C9)" (own-slam, give-from-hand cases)                                                                                                                                         | each site's landing event is followed by DeckReshuffled before SlamWindowOpened (or, for slams, with no window at all); window rank equals the retained top                                                                   |
| 10 — planned: existing ADR-0011 skip test and `NoCardToDraw` test kept verbatim — their states satisfy the resting invariant (M3)                                                  | packages/domain/test/Slam.test.ts "skips the penalty when no card exists anywhere (dedicated ADR-0011 test)"; packages/domain/test/TurnActions.test.ts "rejects a draw when no card exists anywhere (C6.2)" (both regression anchors, unchanged)                                                                                                                                                                                              | deck empty + single-card discard: DrawFromDeck is illegal (NoCardToDraw); a penalty draw skips via DrawSkipped, no reshuffle attempted                                                                                        |
| 11 — planned: new resting-invariant checker in `stepViolations`, unit-tested in Invariants.test.ts, asserted per step across the seeded batch by the driver (M3)                   | packages/domain/src/testing/invariants.ts deckRestingInvariantViolations, unit-tested in packages/domain/test/sim/Invariants.test.ts describe "deck resting invariant checker (§1.7, ADR-0040)"; composed into stepViolations, asserted per step by the 250-game sim batch (Simulation.test.ts) and the sim/Fold.test.ts harness batch                                                                                                        | deck empty with a >1-card discard is flagged at every step (and the initial state); the seeded batches run clean, proving the eager trigger actually fires under simulation (reshuffles=129>0 at the resurveyed default seed) |
| 12 — planned: existing Fold transcription + harness fold-equals-live tests over eager-positioned events (M3); RoundTrip fold-vs-load-vs-live equality (M4)                         | packages/domain/test/Fold.test.ts fold-vs-live batch tests (unchanged, now exercising eager-positioned DeckReshuffled); apps/api/test/RoundTrip.test.ts "load deep-equals the live state at every persisted point (C5.2, C3.3)" and "foldEvents(getEvents) deep-equals the live state (C5.2)"                                                                                                                                                 | fold-equals-live-state and load-equals-live-state hold over the seeded batch with eager reshuffle events at their mid-batch positions                                                                                         |
| 17 (backend share) — planned: not a test — HANDOFF §1.1/§1.7 + cambio-rules amendment blockquotes landed and dev data wiped, recorded in Progress (M6)                             |                                                                                                                                                                                                                                                                                                                                                                                                                                               |                                                                                                                                                                                                                               |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [x] 2026-09-08 14:00 — M1 (domain, game start): `Deal.ts` seeds
      `discard: []` and cuts the deck at `players.length * 4` (52 − 4n,
      one more card than before); `GameStarted` sheds `firstDiscard`
      (`GameEvent.ts`); `Fold.ts`'s `initialState` seeds `discard: []`.
      Deal.test.ts rewritten test-first (deal-shape, determinism, new
      opening-state case for clause 2). `pnpm turbo test --filter
@cambio/domain` green except two pieces of fallout (below), both fixed
      within M1: `sim/Driver.test.ts`'s "fresh deal" candidate-enumeration
      test assumed a discard top (rewritten for draw-or-call-only), and
      `sim/Simulation.test.ts`'s C5.2 rare-case-reachability test lost the
      9/T fizzle at the old default seed (deck cut shift). Domain suite:
      197/197 green.
- [x] 2026-09-08 14:10 — M2 (contracts freeze + projection + leak sweeps):
      removed wire `firstDiscard` from `packages/contracts/src/GameEvents.ts`;
      fixed `EventProjection.ts`'s `GameStarted` case; deleted the
      `GameStarted` case from both leak-sweep allowlists
      (`AdversarialProjection.test.ts`'s `publicSlugsOf`,
      `apps/api/test/support/leaks.ts`'s `rulePublicSlugs`) — both are now
      strictly stronger (nothing about the deal is whitelisted). Fixed
      fixtures: `EventProjection.test.ts` (asserts `slugsIn(out.room) ===
[]`), `RealtimePublisher.test.ts`. `apps/web` typecheck stayed green
      untouched, confirming the plan's zero-production-readers claim.
      **First repo-wide green gate**: `pnpm turbo build typecheck lint
test` — 25/25 tasks green (contract wire frozen; frontend M5 unblocked).
- [x] 2026-09-08 14:20 — M2 fallout found only by the full gate (not
      caught by `@cambio/domain`'s own suite): `apps/api/test/SlamWindow.test.ts`
      failed 3/9 (own/correct, opponent/correct-with-give, and the CAM-26
      GET-poke case) — its documented "offline seed survey" ("TEST_SEED's
      FIRST window has a rank-matching card in Bob's hand") no longer held
      under the shifted deck cut. Re-surveyed locally (scratch domain-level
      script replicating the file's `choose`/`driveToWindow` policy, not
      committed) and bumped `TEST_SEED` 424_242 → 424_243 in
      `apps/api/test/support/http.ts` (comment records why). Verified this
      doesn't disturb `GameCommands.test.ts` / `EndToEndGame.test.ts`,
      which use `TEST_SEED` only for local-replay-vs-server consistency,
      never hardcoded card literals. Full gate re-run green, 121/121 api
      tests.
- [x] 2026-09-08 14:45 — M3 (domain, eager reshuffle, test-first): reframed
      the three ordering tests (`TurnActions.test.ts` C6.1 → one-card-deck
      draw; `Slam.test.ts` penalty-draw case → one-card-deck; `Legality.test.ts`'s
      `drawable` describe retitled, cases kept as regression pins with an
      ADR-0040 unreachable-at-rest note); added the discard-landing trigger
      tests (`TurnActions.test.ts`: HeldDiscarded, SwapHeld, power-fizzle;
      `Slam.test.ts`: own-slam, give-from-hand) plus the give-draw-empties-deck
      second case for clause 8. Implemented the single eager mechanism in
      `Engine.ts`: `eagerReshuffle` (renamed from `reshuffleIfEmpty`, same
      guard) composed at `openWindowOrAdvance`'s entry, the slam's two
      non-window returns, and after each of the three draw sites;
      `drawOne` simplified to a plain take (no events, no reshuffle).
      Design held on the first implementation pass — no test rewrites
      needed after the code landed. Added `deckRestingInvariantViolations`
      to `testing/invariants.ts`, composed into `stepViolations`, unit
      tests added. `pnpm turbo test --filter @cambio/domain`: 208/208
      green on the first run (was 197 after M1/M2); sim summary confirms
      `reshuffles=129`, all six C5.2 rare cases nonzero. Full gate green,
      25/25 (one prettier auto-fix on the new invariant test file, caught
      by the gate's format:check and fixed with `pnpm format`).
- [x] 2026-09-08 14:55 — M4 (API/persistence, clause 5 + remainder of 12):
      added `GameRepository.test.ts` "a freshly dealt game round-trips an
      empty discard_pile (C3.3, ADR-0039)" (`gid(10)`) — save/load
      deep-equals with `discard: []` both sides. `RoundTrip.test.ts`'s
      seeded fold-vs-load-vs-live batch stayed green unchanged, now
      exercising eager-positioned `DeckReshuffled` events. No repository
      code changes needed, as predicted. `pnpm turbo test --filter
@cambio/api`: 122/122 green (was 121, +1 new test). Full gate green,
      25/25. Backend implementation (M1–M4) complete; M6's backend share
      (HANDOFF/cambio-rules amendments, dev-data wipe) deferred to land
      alongside frontend M5's close-out per the root plan's milestone
      order.
- [x] 2026-09-08 15:35 — M6 backend share: amendment blockquotes landed
      under `docs/HANDOFF.md` §1.1 and §1.7 (pointing at ADR-0039/ADR-0040
      respectively) and the matching two amendments in
      `.agents/skills/cambio-rules/SKILL.md`, both in the existing
      ADR-0036 blockquote pattern; `npx prettier --check` on both files
      passes (no inline-code-span line-break trap). Dev data wiped via the
      canonical volume-recreate path: `docker compose down -v` then
      `up -d`, then `pnpm --filter @cambio/api migrate` (4 migrations
      applied clean against the fresh `_cambio_migrations`). Full gate
      re-run against the fresh database: green, 25/25.

## Surprises & notes for the root plan

- (plan-time) The cross-package `firstDiscard` removal has no
  compile-green intermediate ordering; M1's checkpoint is domain-scoped
  and the first full green gate is M2's. Called out in Context so the
  reviewer doesn't read the transient red as a process violation.
  **Confirmed as designed**: M1 alone left `EventProjection.ts` and both
  leak sweeps red; M2 closed it in the same session.
- (plan-time) `EndToEnd.test.ts`'s scripted seed-42 game will see a
  different card sequence (the deck cut moves by one card) — the script is
  policy-adaptive but its "covers every required mechanic in one game"
  checklist may require a seed hunt or re-script. Budget for it in M1/M3;
  log the outcome here.
  **Resolved, no action needed**: `EndToEnd.test.ts` passed unchanged (its
  checklist is adaptive, as predicted) — the seed-hunt need landed
  elsewhere instead (below).
- (M1) `sim/Simulation.test.ts`'s C5.2 default-batch rare-case-reachability
  test needed a reseed the plan anticipated only in the abstract: the deck
  cut shift left the 9/T fizzle unreached at the old default
  (`BASE_SEED=20260831`). Re-surveyed (250-game batches at several
  candidate seeds); `20260908` reaches all six rare cases and is recorded
  in the file's own comment (chosen for being this task's planning date,
  not for any other property). **Flag for M3**: eager reshuffle changes
  card sequences again from the first reshuffle onward — re-verify this
  seed still reaches all six rare cases once M3 lands; reseed again if not.
  **Resolved at M3**: re-ran the full gate after the eager mechanism
  landed — `Simulation.test.ts` stayed green with `reshuffles=129` and
  all six rare cases nonzero at seed `20260908`, no reseed needed.
- (M2) A second, unplanned seed-survey casualty: `apps/api/test/SlamWindow.test.ts`'s
  fixed `TEST_SEED` (`apps/api/test/support/http.ts`) pins a specific
  "Bob holds a rank-matching card at the first window" structural property
  the deck-cut shift broke. Reseeded 424_242 → 424_243 (see Progress).
  Same M3 flag applies: eager reshuffle may perturb reachable windows
  again — re-verify at M3/M6 if `SlamWindow.test.ts` regresses.
  **Resolved at M3**: `apps/api` suite stayed 122/122 green (121 + the new
  M4 test) after the eager mechanism landed, including all of
  `SlamWindow.test.ts` — no reseed needed.
- (plan-time) The driver checks `stepViolations` on **initial** states
  too, so the new resting invariant will reject any constructed sim
  scenario (Coverage/Fuzz) that starts from deck-empty-with-fat-discard.
  Those scenarios pin newly unreachable states — reframe them; do not
  special-case the checker.
