# CAM-30 — Teach the rules: how-to-play guide + in-game power hints

- **Linear:** [CAM-30](https://linear.app/raafayk7/issue/CAM-30/teach-the-rules-how-to-play-guide-in-game-power-hints)
- **Scope:** frontend
- **Child plans:** [frontend](../frontend/CAM-30.md)
- **ADRs:** none needed — every decision this task forces is a
  design-system canon change (new mark, AppShell revision, modal-rule
  amendment, new pattern doc), governed by the creation gate and recorded
  in the component docs plus this plan's Decision Log. Nothing selects
  between architectural alternatives, touches a HANDOFF §9 open question,
  or changes a package boundary.

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

After this task, a player on any screen (lobby, room, game) can open a
complete, canon-faithful how-to-play guide from a help icon-button in the
app chrome; and during play, drawing a power card shows the active player
what the power does while everyone else's turn indicator says a power is
being resolved. Observe it by running `pnpm dev`, opening
`localhost:3000`, clicking the `?` icon-button top-right, and (in a game)
drawing a 7–Q.

## Context & orientation

Frontend-only. **No contracts or backend change**: every player's view
already carries the phase tag unconditionally
(`packages/contracts/src/GameView.ts:116`, union at `:71-78`;
`ViewResolvingPower`/`ViewResolvingQueenSwap` both carry `playerId`), and
the drawn card is projected to the holder only
(`packages/application/src/projection/ViewFor.ts:47-58` — pinned by
`packages/application/test/ViewFor.test.ts` "ResolvingPower: value for
the holder only" / "ResolvingQueenSwap: value for the holder only").

Current state of the code this touches:

- **No help UI exists anywhere** (grep-verified across `apps/web/src`,
  `packages/ui/src`, `design-system/`). Routes are index/room/game only.
- **AppShell** (`packages/ui/src/components/app-shell.tsx:59-66`) already
  renders a top-right icon-button — but hard-coded to settings via an
  `onSettings` prop that no production screen supplies. The slot exists
  on default chrome and on the game screen's collapsed chrome.
- **Modal** (`packages/ui/src/components/modal.tsx`) is a native
  `<dialog>` with pinned header/footer and a scrolling body
  (`min-h-0 overflow-y-auto`); the gallery's "House rules" overflow demo
  proves long content works. Width is fixed `max-w-md` (28rem),
  spec-carried in `design-system/components/core/modal.md`.
- **Marks** (`packages/ui/src/lib/marks.tsx`) contains only
  `MarkX`/`MarkCheck`/`MarkSettings` — no `?` mark exists.
- **Turn status** (`apps/web/src/containers/game/game-screen.tsx:96-111`,
  copy at `:124-145`) collapses `AwaitingDraw`/`HoldingCard`/
  `ResolvingPower`/`ResolvingQueenSwap` into `your-turn`/`other-turn`
  before copy is chosen; `TurnIndicator`'s `state` prop is a closed
  4-value union (`apps/web/src/components/game/turn-indicator.tsx:16-20`).
- **Held card** (`game-screen.tsx:739-750`, label helper `:164-166`)
  shows "You drew" / "⟨Name⟩ is holding" under the card via
  `HeldCard`'s single `label` prop
  (`apps/web/src/components/game/held-card.tsx:30-40`).
- **Power semantics are already derived client-side**:
  `apps/web/src/containers/game/affordances.ts:79-99`
  (`targetingForRank`: 7/8 → `peek-own`, 9/10 → `peek-other`, J →
  `swap-two`, Q → `queen-peek`). The `ResolvingPower` holder affordance
  carries `card` + `targeting`; the `ResolvingQueenSwap` holder
  affordance carries `targeting` only, deliberately no `card`.
- **Governing sources**: `cambio-rules` skill (HANDOFF §1 + amendments),
  ADRs 0009–0012 (edge-case rules), 0036 (2–4 players), 0039 (empty
  opening discard), 0040 (eager reshuffle); `design-system/` router,
  `references/voice.md` (terminology + register),
  `components/core/modal.md`, `app-shell.md`, `turn-indicator.md`;
  skills `frontend-architecture`, `design-system`, `hidden-information`.

## Functional contract

Rule-content clauses below assert engine behavior; each cites the domain
test that already pins it (probe-verify rule). The guide's prose is
authored from the `cambio-rules` skill and the cited ADRs — never from
priors; published Cambio/Cabo variants differ deliberately.

### F1 — Help entry point

- **F1.1** `AppShell` accepts an `onHelp` callback; when supplied it
  renders a help icon-button (new `MarkHelp` "?" mark,
  `Button variant="icon"`) in the chrome header, with accessible label
  "How to play", mirroring the existing `onSettings` slot. It renders in
  both default chrome and the game screen's collapsed (`state="game"`)
  chrome.
- **F1.2** The lobby, room, and game screens all supply `onHelp`; the
  affordance is present in each screen's production render.
- **F1.3** Activating the entry point opens the how-to-play modal. It is
  available in every game phase **including the slam window** (per the
  revised modal rule, Decision Log D3); it is never disabled or hidden by
  game state, and an open guide is never force-closed by a phase change.

### F2 — How-to-play guide content

- **F2.1** The guide renders in the `Modal` primitive (pinned title,
  scrolling body) at canon width, titled per `voice.md` register, with
  sections covering: setup, scoring, taking a turn, power cards,
  slamming, rare situations (zero cards, fizzles, empty discard,
  reshuffle), and how the game ends.
- **F2.2** Every rule statement in the guide matches canon. The load-
  bearing facts, each with its pin:
  - Setup: 2–4 players; 4 face-down cards each; **no opening peek**; the
    discard pile **starts empty** (ADR-0036, ADR-0039; pinned by
    `packages/domain/test/Deal.test.ts`).
  - Scoring: A = 0; 2–10 face value; J/Q = 11; K♠/K♣ = −1; K♥/K♦ = −2 —
    score follows the specific card, not the rank
    (`packages/domain/test/Card.test.ts` "distinguishes kings by suit,
    not rank (§1.2)", "scores jacks and queens alike at 11 despite
    differing rank", "scores pips at face value").
  - A turn is exactly one of: call Cambio (game ends **immediately** — no
    final round, no caller bonus/penalty); take the top discard (only if
    non-power; **must** swap it in, never discard it back); draw (non-
    power: swap or discard; power: **obligated to play it**)
    (`packages/domain/test/TurnActions.test.ts`,
    `packages/domain/test/Legality.test.ts`).
  - Powers: 7/8 peek one of your own cards; 9/10 peek one of another
    player's cards; J blind-swap any two player-held cards (may be the
    same player's); Q peek any one card, then blind-swap any two; powers
    trigger only when drawn; swaps are visible as slot movements, never
    values (`packages/domain/test/Powers.test.ts`).
  - Slamming: after each turn a time-limited window opens; any player may
    slam any face-down card claiming it matches the top discard **by
    rank, not score**; the four outcome cases (own/other × correct/
    incorrect) per the rules table; every attempt publicly reveals the
    slammed card momentarily (`packages/domain/test/Slam.test.ts`).
  - Rare situations: a zero-card slammer who slams an opponent correctly
    draws the deck top and gives it unseen (ADR-0009); J/Q with fewer
    than two occupied slots fizzles as a no-op (ADR-0010,
    `Powers.test.ts` fizzle describe); an empty discard pile opens no
    slam window and cannot be taken from (ADR-0012); an emptied draw deck
    reshuffles immediately, keeping the top discard (ADR-0040,
    `packages/domain/test/Fold.test.ts` / sim invariants).
  - Ending: only a Cambio call ends the game; lowest total wins; zero
    cards scores 0 and **loses to any negative total**; ties are possible
    (`packages/domain/test/Scoring.test.ts` "scores an empty hand 0 —
    beatable by any negative total (§1.6)", "returns every player sharing
    the minimum — ties are representable").
- **F2.3** The guide is memory-faithful: it contains no aid for tracking
  known cards and never suggests one exists; it may state the rule that
  peeks are brief and remembering is the game.
- **F2.4** All copy follows `design-system/references/voice.md`: sentence
  case for functional UI; canonical terminology (**power card**, **peek**,
  **blind-swap**, **slam window**, **draw deck**/**discard pile**,
  **slot**, **fizzle** — never "special card"/"reveal"/"trade"); card
  names as rank + suit symbol where space allows, spelled out in running
  copy; no over-promise adjectives or triplet taglines.

### F3 — Power hint for the active player

- **F3.1** When the viewer's own view is in `ResolvingPower`, a hint line
  renders beneath the held card (in the `HeldCard` label region) stating
  the power by targeting kind: `peek-own` → "Peek at one of your own
  cards"; `peek-other` → "Peek at one of another player's cards";
  `swap-two` → "Blind-swap any two held cards"; `queen-peek` → "Peek at
  any card, then blind-swap any two held cards". (Exact strings are the
  spec; they use `voice.md` terminology.)
- **F3.2** During `ResolvingQueenSwap` the holder's hint reads "Now
  blind-swap any two held cards". The hint derives from the affordance's
  `targeting` kind alone — never from a `card` field, which the client
  affordance deliberately omits in this phase (pinned by
  `apps/web/test/affordances.test.ts`).
- **F3.3** The hint exists only while its phase does: it appears when the
  power phase starts and is gone once the phase ends. Nothing about the
  drawn power persists afterward.
- **F3.4** Non-holders never render a hint and their payload carries no
  drawn-card field to leak (pinned by `apps/web/test/affordances.test.ts`
  "non-holder: nothing (no card field — pinned by ViewFor.test.ts)" and
  `packages/application/test/ViewFor.test.ts`). The game screen's
  hidden-information structural sweep (every `[data-face="down"]` has
  empty text; no extra requests) stays green.

### F4 — Non-active player indication

- **F4.1** For viewers who are not the resolving player, the turn status
  copy distinguishes power resolution: when the phase is
  `ResolvingPower` or `ResolvingQueenSwap` and `phase.playerId ≠
viewerId`, the indicator copy reads "⟨Name⟩ is playing a power card"
  instead of "⟨Name⟩'s turn".
- **F4.2** `TurnIndicator`'s `state` union stays exactly its current four
  values (`your-turn`/`other-turn`/`slam-window`/`game-over`); the change
  is copy-only — no new visual state, no design-system revision to
  `turn-indicator.md`'s states list.
- **F4.3** The non-active copy never names the rank or the specific power
  — the viewer's payload has no card field to name it from (same pins as
  F3.4).

### F5 — Design-system canon (ships with the code)

- **F5.1** `MarkHelp` is added to the marks set and canonized in
  `app-shell.md` (the marks have no doc file of their own; app-shell.md
  is where the settings mark's rules already live — resolution recorded
  in the child plan).
- **F5.2** `app-shell.md` is revised to document the help icon-button
  slot alongside settings.
- **F5.3** `modal.md`'s slam-window rule is amended: no **game-action**
  modal may be required or block during the slam window; an opt-in
  reference overlay (the guide) is permitted, and missing a slam while
  reading is the player's own cost. The amendment preserves the original
  intent (game flow never waits on a modal).
- **F5.4** The how-to-play guide is documented as a design-system
  extension (component/pattern doc with `status: draft`) and the
  extensions index gains its line, per the creation-gate procedure.
- **F5.5** `held-card.md` gains an r2 Revisions entry documenting the
  optional hint line (the F3 second label line is a change to a
  canonical component; approval is Decision Log D5). The entry states
  explicitly that the hint is instruction copy about the current
  obligation, not an affordance — held-card.md r1's "nothing here
  implies an affordance" rule stands.

### Acceptance criteria

- [ ] `pnpm turbo build typecheck lint test` passes (run bare, never
      piped).
- [ ] Component tests pin every F1–F4 clause per the frontend child
      plan's contract coverage table (filled as tests land).
- [ ] The guide's rule copy is reviewed line-by-line against the
      `cambio-rules` skill + ADRs 0009–0012/0036/0039/0040 (this is the
      `/review` copy-fidelity pass the issue mandates).
- [ ] The existing hidden-information sweep tests in
      `apps/web/test/game-screen.test.tsx` still pass unchanged.
- [ ] Design-system docs (F5) land in the same milestone as the code they
      canonize; the rendered design gate / `ai-tells` audit runs on the
      new surfaces (advisory).

## Plan of work

No contracts freeze is needed — the task changes no schemas, so there are
no parallel lanes to sequence; milestones run in order on one branch.

- **M1 — Canon before code.** Write the design-system doc changes the
  user approved at plan time (Decision Log D2–D3, D6): the `modal.md`
  slam-rule amendment, the `app-shell.md` help-slot revision (including
  the `MarkHelp` mark), and the how-to-play extension doc skeleton +
  extensions-index line. These are the specs M2–M3 build against.
- **M2 — Primitives (`packages/ui`).** Add `MarkHelp` to
  `src/lib/marks.tsx`; add the `onHelp` prop and icon-button to
  `AppShell` (both chrome states), test-first in
  `packages/ui/test/app-shell.test.tsx`. Repo compiles and `ui` suite is
  green at the end of this step.
- **M3 — The guide (`apps/web`).** Author the rules copy module from the
  `cambio-rules` skill + ADRs (never from memory), build the guide
  component hosted in `Modal`, wire `onHelp` + open/close state into the
  lobby, room, and game containers, and add the gallery entry. Tests:
  entry-point presence on all three screens, modal opens/closes,
  copy-fidelity spot pins (king scores, no-opening-peek, obligatory
  power, rank-not-score slam), slam-window availability (F1.3).
- **M4 — Power hints + indicator copy (`apps/web`).** Extend the turn-
  status derivation so the phase tag survives to the copy function
  (F4.1) within the existing 4-state `TurnIndicator` union; add the hint
  line to the `HeldCard` label region driven by the holder affordance's
  `targeting` (F3). Tests in `game-screen.test.tsx` for holder hint per
  rank, queen-swap-step hint, non-active power copy, and
  hint-disappears-with-phase; hidden-info sweeps untouched.
- **M5 — Close-out.** Full gate bare; dev-server walkthrough
  (freshness-check the Vite server per AGENTS.md before any rendered
  verification); advisory `ai-tells`/gate pass on the guide and hint
  surfaces; reconcile the child plan's coverage table against as-built
  tests.

## Validation

- **Automated:** the M2–M4 component tests above, run via
  `pnpm turbo test --filter @cambio/ui --filter web` (through turbo, per
  AGENTS.md), then the full gate. Copy-fidelity pins assert exact rule
  strings the guide must contain (e.g. the king scores row, "no opening
  peek", rank-not-score slam wording anchors).
- **Manual:** `pnpm dev`, walk lobby → room → game; open the guide from
  each screen; in a seeded game draw a power card and observe the hint
  under the held card and a second browser's indicator copy; open the
  guide during a slam window and confirm it neither blocks nor closes.
- **Review:** `/review` performs the line-by-line copy-fidelity diff of
  the guide against `cambio-rules` + the ADRs, and checks the design-
  system docs against what shipped.

## Progress

_(updated continuously; append new entries at the BOTTOM — newest last;
timestamp each entry)_

- [x] 2026-09-08 10:30 — plan written; interview rounds 1–2 complete;
      explorer report folded in.

## Decision log

- 2026-09-08 — **D1: guide depth = core + edge cases** — one complete
  guide; ADR-decided rare situations included in a compact section so
  they don't bury the basics. (User call, round 1.)
- 2026-09-08 — **D2: entry point = AppShell help icon-button** — mint
  `MarkHelp` and an `onHelp` slot mirroring `onSettings`; one consistent
  affordance on all three screens, fits the game's collapsed chrome.
  Rejected: per-screen ghost text buttons (three placements, no home in
  game chrome); mixed icon/text (two patterns to maintain). (User call,
  round 2, creation-gate approval.)
- 2026-09-08 — **D3: modal.md slam rule revised, not obeyed verbatim** —
  the rule predates any player-openable modal; its intent (game flow
  never waits on a modal) is preserved by scoping it to game-action
  modals. The guide stays available during slam windows; missing a slam
  while reading is the player's own cost. Rejected: gating/force-closing
  the guide (affordance flicker after every turn, hostile mid-read
  close). (User call, round 2.)
- 2026-09-08 — **D4: non-active indication is copy-only** — widen the
  copy derivation, keep `TurnIndicator`'s 4-state union and dot styling.
  Rejected: a 5th indicator state (canon revision for marginal gain).
  (User call, round 2.)
- 2026-09-08 — **D5: hint renders under the held card** — second line in
  the `HeldCard` label region, at the player's locus of attention, gone
  when the phase ends. Rejected: chrome band (competes with slam/error
  copy), dock-actions (empty during power resolution — resolution
  happens on slots). (User call, round 2.)
- 2026-09-08 — **D6: guide keeps canon modal width (`max-w-md`)** — 28rem
  gives a sane reading measure at body sizes and both rule tables fit;
  avoids a size-variant canon change. Revisit through the creation gate
  only if M3's rendered check shows the tables genuinely failing.
  (Planner call.)
- 2026-09-08 — **D7: hint copy derives from `targeting`, never `card`** —
  the queen-swap affordance intentionally carries no card; keying copy
  off targeting kind makes the hint uniform across both power phases and
  immune to the `ResolvingQueenSwap.card` server-projection question the
  explorer flagged. (Planner call.)
- 2026-09-08 — **D8: no auto-open/first-run behavior** — entry point
  only; no localStorage, no first-visit tracking. (User call, round 1.)
- 2026-09-08 — **D9: guide format = typeset text + tables** — design-
  system typography and the `Table` component; no card illustrations or
  new art. (User call, round 1.)

## Surprises & discoveries

- The brief's line references had drifted by a line or two after CAM-31
  (`game-screen.tsx` held-card region is 739–750, chrome band 642–652,
  `targetingForRank` 79–99) — regions all exist as described; child plan
  cites the fresh anchors.
- `ViewFor.ts:57` **does** project `card` to the holder during
  `ResolvingQueenSwap`, while a client comment claims it is always absent
  and `affordances.ts:186-189` drops it. Not load-bearing for this task
  (D7), but the comment at `game-screen.tsx:150-152` is unverified
  against the domain — flagged for some future cleanup, do not rely on
  it either way.

## Outcomes & retrospective

_(filled at the end, typically by `/review`)_
