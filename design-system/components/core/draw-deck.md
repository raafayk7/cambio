name: draw-deck
status: draft
version: 5
extends: none

The face-down stock. Class: **Game object**.

## Anatomy

- Stack of 2–3 offset card backs (offset = `space.1`, shadows stacked). No
  visual count (r4): the badge covered too much of the tappable surface on
  compact and wasn't needed — sighted players read the stack via the
  low/reshuffle choreography instead. Count stays available to screen
  readers (see Rules).
- Sits on `surface.table` beside the discard-pile; the pair is the table's
  center.

## States

- `populated` — stack, no visible count.
- `low` — count ≤ 5: `data-state="low"` (a styling hook only; r4 dropped
  the badge that used to carry this in `accent.alarm-deep` text — reshuffle
  tension has no visual expression right now beyond that attribute).
- `empty→reshuffling` — the discard pile (minus its retained top card)
  flights over and becomes the new stack. Public, designed moment at
  `duration.track`: every player must see the reshuffle happen. The
  reshuffle is eager (ADR-0040, r5): it fires the instant the deck empties
  or a discard lands on an empty deck, so the deck never rests visibly
  empty while anything is reshufflable — this state is genuinely
  occupancy-independent (r2's original claim), rendering its motion over
  the `empty` dashed outline exactly as it does over a populated stack.
- `draw` — top card flights to the active player at `duration.track`,
  face-down for everyone except the drawer. Occupancy-independent like
  `reshuffling` (r5): its pulse renders over the `empty` dashed outline
  too — the as-built component treats both choreography states
  identically on every count branch.
- `slam-window` — the slam window is open: the stack carries the
  `accent.alarm` frame + soft pulse (the same idiom `discard-pile.md`'s
  `slam-target` echoes from `playing-card.md`'s `slamEligible`), so the
  deck stops being the one silent participant while a window is open.
  Independent of the populated/low/empty split above (a window can be
  open over an empty deck) and composable with a choreography state — see
  Rules.

## Variants

None.

## Rules

- Deck count is public state; the exact card order must never reach any
  client (the shuffled future of the game).
- A drawn card's value travels only on the drawer's per-player channel; the
  public animation shows a back.
- The reshuffle retains the current top discard — visibly: it stays put
  while the rest flights.
- The click affordance (r2) is presentation only — legality is the server's
  and the client mirrors it in its affordance mapping (`deckCount > 0` —
  r5/ADR-0040: the eager reshuffle retired the old `|| discard.length > 1`
  "reshuffle fuel" disjunction, since a resting deck-empty state is never
  reshufflable — a T1-specified rule, distinct from H1's two helpers);
  omitting `onClick` entirely renders the deck as a static, non-interactive
  stack rather than a disabled button.
- `slam-window` (r3) is presentation only, same as the click affordance:
  the deck stays a static stack, never a disabled button, and never grows
  an `onClick` or copy of its own — legality of drawing is still decided
  exactly as above, unaffected by whether the window is open. When a
  choreography state (`reshuffling`/`draw`) is also active, the
  choreography wins on the rendered state (mirrors `discard-pile.md`'s
  `receiving`-over-`slam-target` precedence) — the pulse is a phase
  overlay, not a state that can starve a flight already in progress.
- The stock exposes `data-flight-anchor="deck"` for the flight layer.
- The count is exposed to screen readers, never sighted-only (r4): on the
  interactive stack (`onClick` present) it rides the "Draw a card" button's
  `aria-describedby`, so the button's accessible name still names the
  action, not the state; on the static stack (no `onClick`) it's the
  `role="img"` wrapper's `aria-label` directly, since there's no action
  name to protect there.

## Revisions

- r1: initial, from the CAM-13 specimen board.
- r2 (CAM-18, T1/T2): `onClick` (accessible-button wrap, Hand's internal
  slot-button precedent) and the `reshuffling`/`draw` choreography states —
  the CAM-15 carve-out this task repays.
- r3 (CAM-26, 2026-09-07): `slam-window` state — the deck was the only
  table object that gave no signal while a slam window was open (root
  plan); this closes that gap with the existing alarm-frame idiom, no new
  tokens. Crossing the creation gate was explicitly authorized by the user
  (root plan Decision Log, 2026-09-07) rather than proposed unprompted.
- r4 (CAM-29, 2026-09-08): dropped the visual count badge — it covered too
  much of the tappable deck surface on compact and wasn't load-bearing for
  sighted play. Count moved to accessibility-only exposure (`aria-describedby`
  on the interactive stack, `role="img"`/`aria-label` on the static one); no
  new tokens, no replacement visual for `low`.
- r5 (CAM-31, 2026-09-08): the reshuffle became eager (ADR-0040) — the
  empty-branch previously rendered no motion during `reshuffling` (a latent
  gap, now the guaranteed path since a resting empty deck is always
  mid-reshuffle-or-nothing); the empty stack now carries the same
  `--animate-pulse-soft` treatment the populated branch already had — for
  both choreography states, `reshuffling` and `draw` — no new tokens. The
  click-affordance formula simplifies to `deckCount > 0`.
  Pre-authorized through the creation gate by the CAM-31 root plan's
  Decision Log (2026-09-08): "the empty-branch reshuffle-motion fix and
  canon r-bumps are in scope for CAM-31, not deferred."
