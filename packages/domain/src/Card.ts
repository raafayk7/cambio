import { Schema } from "effect"

/**
 * Card representation (§4.1).
 *
 * There are exactly 52 cards and they are a domain constant, not a database
 * entity. `CardSlug` is the natural key: unique within a single deck, and
 * therefore also a stable identity for peek and knowledge tracking (§4.4).
 *
 * NOTE ON THE TEN: the handoff gives `"AS"`, `"7H"`, `"KD"` as examples but
 * never spells out the ten. This scaffold uses the fixed-width poker form
 * `"T"` (so `"TS"`, `"TH"`, …), which keeps every slug exactly two characters
 * and makes `rank`/`suit` uniform slices. This is a representation choice, not
 * a rule; if you want `"10S"` instead, it changes only RANKS and the two
 * derivation functions below.
 */

export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"] as const
export const SUITS = ["S", "H", "D", "C"] as const

export type RankLiteral = (typeof RANKS)[number]
export type SuitLiteral = (typeof SUITS)[number]
export type CardSlugLiteral = `${RankLiteral}${SuitLiteral}`

export const Rank = Schema.Literal(...RANKS)
export type Rank = typeof Rank.Type

export const Suit = Schema.Literal(...SUITS)
export type Suit = typeof Suit.Type

/** All 52 slugs, in a stable order. Rank-major, then suit. */
export const ALL_CARD_SLUGS: ReadonlyArray<CardSlugLiteral> = RANKS.flatMap((rank) =>
  SUITS.map((suit): CardSlugLiteral => `${rank}${suit}`),
)

/** A branded literal union of all 52 card slugs. */
export const CardSlug = Schema.Literal(...ALL_CARD_SLUGS).pipe(Schema.brand("CardSlug"))
export type CardSlug = typeof CardSlug.Type

export const decodeCardSlug = Schema.decodeUnknownSync(CardSlug)
export const decodeCardSlugEither = Schema.decodeUnknownEither(CardSlug)

/**
 * The ranks that carry a power (§1.4). Exported as a type-level constant only —
 * whether a power *triggers*, and what it does, is game logic and belongs to
 * the rules engine, not here.
 */
export const POWER_RANKS = ["7", "8", "9", "T", "J", "Q"] as const
export type PowerKindLiteral = (typeof POWER_RANKS)[number]

export const PowerKind = Schema.Literal(...POWER_RANKS)
export type PowerKind = typeof PowerKind.Type

// ---------------------------------------------------------------------------
// Pure derivations (§4.1). Score is never stored.
// ---------------------------------------------------------------------------

export const rank = (slug: CardSlug): Rank => slug.slice(0, -1) as Rank

export const suit = (slug: CardSlug): Suit => slug.slice(-1) as Suit

/** Scores for every rank except King, which depends on suit (§1.2). */
const NON_KING_SCORES: Record<Exclude<Rank, "K">, number> = {
  A: 0,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 11,
}

/** Black suits score the King at −1, red suits at −2 (§1.2). */
const BLACK_SUITS: ReadonlySet<Suit> = new Set<Suit>(["S", "C"])

/**
 * Score of a specific card (§1.2).
 *
 * Score is a property of a card, not of a rank — the two black kings and the
 * two red kings differ — so this derives from rank *and* suit. Negative totals
 * are normal and a hand of zero cards scores 0, which is therefore beatable.
 */
export const score = (slug: CardSlug): number => {
  const r = rank(slug)
  if (r === "K") return BLACK_SUITS.has(suit(slug)) ? -1 : -2
  return NON_KING_SCORES[r]
}
