---
name: cambio-rules
description: The canonical rules of Cambio, this project's card game — setup, scoring, turns, power cards, slamming, endgame. Consult this for ANY question about game rules and ANY code that implements, tests, or displays rule behavior. Critically important because published Cambio/Cabo variants differ from this one — a model's prior knowledge of the game WILL be wrong here, so never answer a rule question from memory.
---

# Cambio rules (canonical)

Extracted from HANDOFF §1, which is the source of truth. These rules were
playtested in person. **Do not fill gaps from other Cambio/Cabo variants** —
this variant deliberately differs (most notably: **no opening peek phase**,
no caller bonus/penalty, no final round after calling).

Cambio is a hidden-information, memory-based card game. **Lowest score wins.**

## Setup

- 2–5 players, single standard 52-card deck, no jokers.

  > **Amended:** ADR-0036 caps games at **2–4 players**, enforced in the
  > domain (`Deal.ts`'s player-count gate, `Lobby.ts`'s
  > `MAX_LOBBY_MEMBERS`) — the bench-anchored table layout makes the
  > visual metaphor load-bearing, and the rule bends to it. The "2–5
  > players" line above is superseded; a fifth player is no longer
  > accepted.

- Each player is dealt **4 face-down cards** and does **not** look at any of
  them. **There is no opening peek phase — do not add one.**
- One card is turned face up to start the discard pile; the rest is the
  face-down draw deck.

## Scoring

| Card        | Score      |
| ----------- | ---------- |
| Ace         | 0          |
| 2–10        | face value |
| Jack, Queen | 11         |
| King ♠ ♣    | −1         |
| King ♥ ♦    | −2         |

Score is a property of a **specific card**, not a rank — derive from rank
_and_ suit. Negative totals are normal. A hand of zero cards scores 0, which
is beatable.

## A turn

The active player does exactly one of:

**(a) Call Cambio.** Game ends **immediately** — no final round, no bonus or
penalty for the caller. All hands revealed and scored.

**(b) Take the top discard.** Only if it is **not** a power card
(7, 8, 9, 10, J, Q). The taken card **must** be swapped into one of the
player's own slots; the displaced card goes face up onto the discard pile. It
cannot be discarded straight back.

**(c) Draw from the deck.** Then:

- **Non-power (A, 2–6, K):** blind-swap into own slot (displaced card to
  discard) **or** discard directly.
- **Power (7, 8, 9, 10, J, Q):** the player is **obligated to play the
  power** — may not decline, keep, or discard it unused. After resolution the
  power card goes to the discard pile.

After the action resolves, the slam window opens.

## Powers

| Card  | Power                                                           |
| ----- | --------------------------------------------------------------- |
| 7, 8  | Look at one of your own cards                                   |
| 9, 10 | Look at one of another player's cards                           |
| J     | Blind-swap any two player-held cards                            |
| Q     | Look at any one card, then blind-swap any two player-held cards |

- Powers trigger **only when drawn from the deck**. A power card on the
  discard pile is inert (and can't be taken — see turn (b)), though it is
  still slammable against.
- The Queen's swap may include the card just looked at. Playing the Queen is
  obligatory; the specific pairing is the player's choice.
- J/Q swaps may involve any two player-held cards, including two belonging to
  the same player.
- Swaps are **publicly visible as slot movements** — everyone sees which
  slots exchanged, not the values. Knowledge therefore follows **card
  identity**, not slots (HANDOFF §4.4).

## Slamming

After each turn resolves, a **time-limited window** opens in which **any**
player may slam: a claim that a chosen face-down card has the **same rank**
as the current top discard. Matching is **rank, not score** (J ≠ Q despite
both scoring 11; black K matches red K despite different scores). A player
may slam their own or another's card, multiple times within the window.

| Slam                       | Result                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Own card, correct          | Card removed to discard pile; hand shrinks.                                                                            |
| Own card, incorrect        | Card stays; slammer draws a penalty card.                                                                              |
| Opponent's card, correct   | Card removed to discard; slammer gives one of their own cards (blind, slammer's choice of slot) into the vacated slot. |
| Opponent's card, incorrect | Card stays with owner; slammer draws a penalty card.                                                                   |

Every slam attempt, correct or not, **publicly reveals** the slammed card
momentarily — that leak is part of the cost.

## Zero cards, deck exhaustion, endgame

- Reaching zero cards is **not** a win — 0 loses to any negative total. A
  zero-card player still takes turns: draw, then keep (hand becomes 1) or
  discard.
- When the draw deck empties, reshuffle the discard pile into a new draw
  deck, **retaining the current top card** as the new top discard.
- The game ends **only** by a Cambio call. Lowest total wins. **Ties are
  possible and must be representable** — no caller tiebreak, no `winner`
  column.

## Formerly open gaps — now decided (do NOT re-litigate)

The HANDOFF §9 rule gaps were resolved with the user during CAM-1 planning
and implementation. The ADRs are canonical; treat them as rules:

1. **Zero-card slammer** who correctly slams an opponent **draws the deck
   top and gives it unseen** into the vacated slot; a zero-card player may
   also take the (non-power) top discard as a **keep** into the lowest free
   slot — [ADR-0009](../../../docs/adr/0009-zero-card-slammer-draws-then-gives.md).
2. **J/Q swaps must name two distinct occupied slots** (empty-hand players
   cannot be targeted); an obligatory power with **no valid target fizzles**
   to the discard pile as a no-op —
   [ADR-0010](../../../docs/adr/0010-jq-swaps-require-occupied-slots-powers-fizzle.md).
3. **Slam window**: `closesAt` is fixed when the window opens (no reset on
   slams) and the duration comes from `GameConfig.slamWindowMs` — config,
   never a literal; a penalty/give draw that is impossible even after
   reshuffle is **skipped** —
   [ADR-0011](../../../docs/adr/0011-slam-window-fixed-close-config-duration.md).
4. **Empty discard pile** (a zero-card keep took its last card): no slam
   window opens — the turn advances directly — and taking from the empty
   pile is illegal —
   [ADR-0012](../../../docs/adr/0012-empty-discard-skips-slam-window.md).

Any rule situation NOT covered by §1 or these ADRs is still a stop-and-ask:
never fill a gap from other Cambio/Cabo variants or from priors.

UI note: the game is **memory-faithful** — a peeked card is shown briefly
and never again. No persistent markers, tooltips, or "cards you know" panel.
Remembering is the game.
