import { Schema } from "effect"
import { CardSlug, PowerKind, Rank } from "./Card.js"
import { GameConfig } from "./GameConfig.js"
import { Hand, SlotRef } from "./GameState.js"
import { SlotIndex, Timestamp, UserId } from "./Ids.js"

/**
 * The event ADT: every state change the engine performs, as persistable
 * facts — these become `game_events` payloads (§4.3) and the fold-to-state
 * source of truth (§6). They carry **full truth** (card identities included);
 * redaction for clients is the later `viewFor` projection's job (§5). Past
 * tense throughout.
 */

/**
 * Records the **concrete deal** — hands (parallel to `players`, seat order),
 * remaining deck order, first discard — so event-log replay never depends on
 * the PRNG staying byte-stable across versions. `seed` is audit-only. `at`
 * is the only event timestamp; later events are stamped by the persistence
 * layer's `at` column (§4.3).
 */
export const GameStarted = Schema.TaggedStruct("GameStarted", {
  at: Timestamp,
  seed: Schema.Number,
  players: Schema.Array(UserId),
  config: GameConfig,
  hands: Schema.Array(Hand),
  deck: Schema.Array(CardSlug),
  firstDiscard: CardSlug,
})

export const CambioCalled = Schema.TaggedStruct("CambioCalled", {
  playerId: UserId,
})

/** Per-player totals and the possibly-plural lowest-score winner set (§1.8). */
export const GameEnded = Schema.TaggedStruct("GameEnded", {
  calledBy: UserId,
  scores: Schema.Array(
    Schema.Struct({
      playerId: UserId,
      total: Schema.Int,
    }),
  ),
  winners: Schema.Array(UserId),
})

export const CardDrawn = Schema.TaggedStruct("CardDrawn", {
  playerId: UserId,
  card: CardSlug,
})

export const DiscardTaken = Schema.TaggedStruct("DiscardTaken", {
  playerId: UserId,
  card: CardSlug,
})

export const HeldSwapped = Schema.TaggedStruct("HeldSwapped", {
  playerId: UserId,
  slotIndex: SlotIndex,
  placed: CardSlug,
  discarded: CardSlug,
})

/** Zero-card keep into the lowest free slot (ADR-0009). */
export const HeldKept = Schema.TaggedStruct("HeldKept", {
  playerId: UserId,
  slotIndex: SlotIndex,
  card: CardSlug,
})

export const HeldDiscarded = Schema.TaggedStruct("HeldDiscarded", {
  playerId: UserId,
  card: CardSlug,
})

/** Records viewer **and** card identity: knowledge follows cards, not slots (§4.4). */
export const CardPeeked = Schema.TaggedStruct("CardPeeked", {
  viewerId: UserId,
  target: SlotRef,
  card: CardSlug,
})

/** A J/Q swap as a public slot movement; card identities deliberately absent (§1.4, §4.4). */
export const CardsBlindSwapped = Schema.TaggedStruct("CardsBlindSwapped", {
  by: UserId,
  first: SlotRef,
  second: SlotRef,
})

/** An obligatory power with no valid target resolved as a no-op (ADR-0010). */
export const PowerFizzled = Schema.TaggedStruct("PowerFizzled", {
  playerId: UserId,
  power: PowerKind,
})

/** The power card reaching the discard pile after resolution or fizzle (§1.3c). */
export const PowerDiscarded = Schema.TaggedStruct("PowerDiscarded", {
  playerId: UserId,
  card: CardSlug,
})

export const SlamWindowOpened = Schema.TaggedStruct("SlamWindowOpened", {
  turnPlayerId: UserId,
  closesAt: Timestamp,
  rank: Rank,
})

/** The public reveal is part of the cost (§1.5). */
export const SlamSucceeded = Schema.TaggedStruct("SlamSucceeded", {
  slammerId: UserId,
  target: SlotRef,
  card: CardSlug,
})

export const SlamFailed = Schema.TaggedStruct("SlamFailed", {
  slammerId: UserId,
  target: SlotRef,
  card: CardSlug,
})

export const PenaltyDrawn = Schema.TaggedStruct("PenaltyDrawn", {
  playerId: UserId,
  slotIndex: SlotIndex,
  card: CardSlug,
})

/** The normal give (§1.5): identity derivable from the slot movement. */
export const CardGivenFromHand = Schema.TaggedStruct("CardGivenFromHand", {
  slammerId: UserId,
  fromSlot: SlotIndex,
  to: SlotRef,
})

/** Zero-card draw-then-give (ADR-0009): unseen at the table, true in the log. */
export const CardGivenFromDeck = Schema.TaggedStruct("CardGivenFromDeck", {
  slammerId: UserId,
  to: SlotRef,
  card: CardSlug,
})

/** A penalty/give draw that was impossible even after reshuffle (ADR-0011). */
export const DrawSkipped = Schema.TaggedStruct("DrawSkipped", {
  playerId: UserId,
  kind: Schema.Literal("penalty", "give"),
})

/** Records the **resulting order**; the top discard was retained (§1.7). */
export const DeckReshuffled = Schema.TaggedStruct("DeckReshuffled", {
  deck: Schema.Array(CardSlug),
})

export const SlamWindowClosed = Schema.TaggedStruct("SlamWindowClosed", {})

export const TurnAdvanced = Schema.TaggedStruct("TurnAdvanced", {
  playerId: UserId,
})

export const GameEvent = Schema.Union(
  GameStarted,
  CambioCalled,
  GameEnded,
  CardDrawn,
  DiscardTaken,
  HeldSwapped,
  HeldKept,
  HeldDiscarded,
  CardPeeked,
  CardsBlindSwapped,
  PowerFizzled,
  PowerDiscarded,
  SlamWindowOpened,
  SlamSucceeded,
  SlamFailed,
  PenaltyDrawn,
  CardGivenFromHand,
  CardGivenFromDeck,
  DrawSkipped,
  DeckReshuffled,
  SlamWindowClosed,
  TurnAdvanced,
)
export type GameEvent = typeof GameEvent.Type

export type GameStarted = typeof GameStarted.Type
export type CambioCalled = typeof CambioCalled.Type
export type GameEnded = typeof GameEnded.Type
export type CardDrawn = typeof CardDrawn.Type
export type DiscardTaken = typeof DiscardTaken.Type
export type HeldSwapped = typeof HeldSwapped.Type
export type HeldKept = typeof HeldKept.Type
export type HeldDiscarded = typeof HeldDiscarded.Type
export type CardPeeked = typeof CardPeeked.Type
export type CardsBlindSwapped = typeof CardsBlindSwapped.Type
export type PowerFizzled = typeof PowerFizzled.Type
export type PowerDiscarded = typeof PowerDiscarded.Type
export type SlamWindowOpened = typeof SlamWindowOpened.Type
export type SlamSucceeded = typeof SlamSucceeded.Type
export type SlamFailed = typeof SlamFailed.Type
export type PenaltyDrawn = typeof PenaltyDrawn.Type
export type CardGivenFromHand = typeof CardGivenFromHand.Type
export type CardGivenFromDeck = typeof CardGivenFromDeck.Type
export type DrawSkipped = typeof DrawSkipped.Type
export type DeckReshuffled = typeof DeckReshuffled.Type
export type SlamWindowClosed = typeof SlamWindowClosed.Type
export type TurnAdvanced = typeof TurnAdvanced.Type

export const decodeGameEvent = Schema.decodeUnknownSync(GameEvent)
export const encodeGameEvent = Schema.encodeSync(GameEvent)
