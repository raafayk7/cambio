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
- Each player is dealt **4 face-down cards** and does **not** look at any of
  them. **There is no opening peek phase — do not add one.**
- One card is turned face up to start the discard pile; the rest is the
  face-down draw deck.

## Scoring

| Card | Score |
| --- | --- |
| Ace | 0 |
| 2–10 | face value |
| Jack, Queen | 11 |
| King ♠ ♣ | −1 |
| King ♥ ♦ | −2 |

Score is a property of a **specific card**, not a rank — derive from rank
*and* suit. Negative totals are normal. A hand of zero cards scores 0, which
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

| Card | Power |
| --- | --- |
| 7, 8 | Look at one of your own cards |
| 9, 10 | Look at one of another player's cards |
| J | Blind-swap any two player-held cards |
| Q | Look at any one card, then blind-swap any two player-held cards |

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

| Slam | Result |
| --- | --- |
| Own card, correct | Card removed to discard pile; hand shrinks. |
| Own card, incorrect | Card stays; slammer draws a penalty card. |
| Opponent's card, correct | Card removed to discard; slammer gives one of their own cards (blind, slammer's choice of slot) into the vacated slot. |
| Opponent's card, incorrect | Card stays with owner; slammer draws a penalty card. |

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

## Open rule gaps — STOP AND ASK

These are deliberately undecided (HANDOFF §9). Never pick an answer, even a
"reasonable" one — flag the gap to the user instead:

1. **Zero-card slammer** correctly slams an opponent and owes a card — skip
   the transfer? draw-then-give? undecided.
2. **J/Q swap targeting a player with zero cards** — no-op or illegal?
   undecided.
3. **Slam window duration** — needs playtesting; must be config, not a
   literal.

UI note: the game is **memory-faithful** — a peeked card is shown briefly
and never again. No persistent markers, tooltips, or "cards you know" panel.
Remembering is the game.
