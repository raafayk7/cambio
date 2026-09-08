/**
 * How-to-play guide copy (root plan F2.1/F2.2/F2.4, extension doc
 * `design-system/components/extensions/how-to-play-guide.md`).
 *
 * Authored from the `cambio-rules` skill (HANDOFF §1 + its amendments)
 * and ADRs 0009–0012, 0036, 0039, 0040 — transcribed from those sources,
 * never from memory or another Cambio/Cabo variant (this game deliberately
 * differs: no opening peek, no caller bonus/penalty, no final round, 2–4
 * players, suit-split king scores). Every load-bearing fact in root F2.2
 * appears somewhere below; the power-card row copy matches the F3.1 hint
 * strings verbatim (`apps/web/src/containers/game/game-screen.tsx`) so the
 * guide and the in-game hint never drift apart.
 *
 * Voice (F2.4): sentence case throughout, canonical terminology only
 * (power card, peek, blind-swap, slam window, draw deck/discard pile,
 * slot, fizzle), true minus sign on scores, card names spelled out in
 * running copy. Memory-faithful (F2.3): no card-tracking aid is offered
 * or implied anywhere in this copy.
 */

export interface GuideSection {
  readonly heading: string
  readonly paragraphs: readonly string[]
}

export interface ScoringRow {
  readonly card: string
  readonly score: string
}

export interface PowerRow {
  readonly card: string
  readonly power: string
}

export interface SlamOutcomeRow {
  readonly slam: string
  readonly result: string
}

export const SETUP_SECTION: GuideSection = {
  heading: "Setup",
  paragraphs: [
    "2 to 4 players, one standard deck, no jokers. Each player is dealt 4 face-down cards and does not look at any of them — there is no opening peek.",
    "The discard pile starts empty. Everything else forms the face-down draw deck.",
  ],
}

export const SCORING_SECTION: GuideSection = {
  heading: "Scoring",
  paragraphs: [
    "A card's score follows the specific card, not just its rank — suit matters for kings. Lowest total wins.",
  ],
}

export const SCORING_TABLE: ReadonlyArray<ScoringRow> = [
  { card: "Ace", score: "0" },
  { card: "2 – 10", score: "face value" },
  { card: "Jack, Queen", score: "11" },
  { card: "King ♠, King ♣", score: "−1" },
  { card: "King ♥, King ♦", score: "−2" },
]

export const TURN_SECTION: GuideSection = {
  heading: "Taking a turn",
  paragraphs: [
    "On your turn, do exactly one of the following.",
    "Call Cambio — the game ends immediately. No final round, no bonus or penalty for calling.",
    "Take the top discard — only if it isn't a power card. You must swap it into one of your own slots; the displaced card goes face up onto the discard pile. You can't discard it straight back.",
    "Draw from the deck — a non-power card can be blind-swapped into a slot or discarded directly. A power card obligates you to play it: you can't decline, keep, or discard a drawn power card unused.",
  ],
}

export const POWERS_SECTION: GuideSection = {
  heading: "Power cards",
  paragraphs: [
    "Power cards trigger only when drawn from the deck — one sitting on the discard pile is inert (though still slam-eligible). Swaps are visible as slot movements, never values, so knowledge follows the card, not the slot.",
    "Peeks are brief and shown once — the guide won't remember a value for you. Remembering what you saw is the game.",
  ],
}

export const POWERS_TABLE: ReadonlyArray<PowerRow> = [
  { card: "7, 8", power: "Peek at one of your own cards" },
  { card: "9, 10", power: "Peek at one of another player's cards" },
  { card: "Jack", power: "Blind-swap any two held cards" },
  { card: "Queen", power: "Peek at any card, then blind-swap any two held cards" },
]

export const SLAM_SECTION: GuideSection = {
  heading: "Slamming",
  paragraphs: [
    "After each turn resolves, a time-limited slam window opens. Any player may slam a face-down card, claiming it matches the current top discard's rank — matching is by rank, not score, so a jack never matches a queen despite scoring the same, and a black king matches a red king despite scoring differently.",
    "Every slam attempt, correct or not, publicly reveals the slammed card for a moment — that's part of the cost.",
  ],
}

export const SLAM_TABLE: ReadonlyArray<SlamOutcomeRow> = [
  { slam: "Your own card, correct", result: "Card removed to the discard pile — your hand shrinks." },
  { slam: "Your own card, incorrect", result: "Card stays — you draw a penalty card." },
  {
    slam: "An opponent's card, correct",
    result:
      "Card removed to the discard pile — you give one of your own cards, blind, your choice of slot, into the vacated slot.",
  },
  { slam: "An opponent's card, incorrect", result: "Card stays with its owner — you draw a penalty card." },
]

export const RARE_SITUATIONS_SECTION: GuideSection = {
  heading: "Rare situations",
  paragraphs: [
    "A zero-card player still takes turns — draw, then keep (hand becomes 1) or discard. Reaching zero cards is not a win.",
    "A zero-card player who slams an opponent's card correctly draws the deck's top card and gives it unseen, since there's no slot to give from.",
    "A blind-swap or the queen's swap needs two distinct occupied slots — an obligatory power with no valid target fizzles to the discard pile as a no-op.",
    "An empty discard pile opens no slam window, and it can't be taken from.",
    "When the draw deck empties, the discard pile reshuffles into a new draw deck immediately, keeping the current top card as the new top discard.",
  ],
}

export const ENDGAME_SECTION: GuideSection = {
  heading: "How the game ends",
  paragraphs: [
    "Only a Cambio call ends the game. Every hand is revealed and scored, and the lowest total wins.",
    "A hand of zero cards scores 0, which loses to any negative total. Ties are possible.",
  ],
}

export const HOW_TO_PLAY_SECTIONS: readonly GuideSection[] = [
  SETUP_SECTION,
  SCORING_SECTION,
  TURN_SECTION,
  POWERS_SECTION,
  SLAM_SECTION,
  RARE_SITUATIONS_SECTION,
  ENDGAME_SECTION,
]
