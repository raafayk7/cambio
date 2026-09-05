import { Schema } from "effect"
import {
  CardSlug,
  GameVersion,
  PowerKind,
  Rank,
  SlotIndex,
  SlotRef,
  Timestamp,
  Uuid,
} from "./GamePrimitives.js"
import { LobbyView } from "./GameView.js"

/**
 * The realtime event contracts (CAM-6): every domain event, classified and
 * projected for its channel (root plan C3, hidden-information skill).
 *
 * Two unions, two channels, split **by construction**:
 *
 *   - `RoomGameEvent` — the room channel. Identical payload for every
 *     participant. A card value appears only when it is public by rule: it
 *     lies face-up on the discard pile, or a slam revealed it (§1.5).
 *   - `PlayerGameEvent` — one player's private channel. The only carrier of
 *     private card values, delivered exactly once, at event time, and never
 *     re-sent (ADR-0021). The recipient is implied by the channel, so these
 *     carry no `playerId`.
 *
 * No schema in the room union can even represent a private value; "mostly
 * public with one private field" does not exist here — such events are split
 * into a stripped room shape plus a private counterpart.
 */

// ---------------------------------------------------------------------------
// Room channel — public events (C3.1 pass-throughs, C3.2 public-with-value,
// C3.3 value-stripped projections).
// ---------------------------------------------------------------------------

/**
 * The deal, stripped for everyone (C3.3): there is no opening peek (§1.1), so
 * not even a hand's owner learns dealt values. `hands`, `deck`, `prng`, and
 * `seed` from the domain event do not exist on the wire.
 */
export const GameStarted = Schema.TaggedStruct("GameStarted", {
  /** Seat order (§4.3). */
  players: Schema.Array(Uuid),
  firstDiscard: CardSlug,
  deckCount: Schema.Int.pipe(Schema.nonNegative()),
  config: Schema.Struct({ slamWindowMs: Schema.Int }),
})

export const CambioCalled = Schema.TaggedStruct("CambioCalled", {
  playerId: Uuid,
})

/** The endgame reveal is public by rule (§1.8). Ties are real. */
export const GameEnded = Schema.TaggedStruct("GameEnded", {
  calledBy: Uuid,
  scores: Schema.Array(
    Schema.Struct({
      playerId: Uuid,
      total: Schema.Int,
    }),
  ),
  winners: Schema.Array(Uuid),
})

/** Stripped (C3.4): the drawer alone gets the value, on their channel. */
export const CardDrawn = Schema.TaggedStruct("CardDrawn", {
  playerId: Uuid,
})

/** Public with value (C3.2): the card came off the top of the pile. */
export const DiscardTaken = Schema.TaggedStruct("DiscardTaken", {
  playerId: Uuid,
  card: CardSlug,
})

/**
 * Stripped (C3.3): `discarded` lands face-up on the pile and stays; the
 * placed card's value is absent — its owner already saw it at draw time and
 * private values are never re-sent (ADR-0021).
 */
export const HeldSwapped = Schema.TaggedStruct("HeldSwapped", {
  playerId: Uuid,
  slotIndex: SlotIndex,
  discarded: CardSlug,
})

/** Stripped (C3.3): the keeper saw the card at draw time; nobody is re-told. */
export const HeldKept = Schema.TaggedStruct("HeldKept", {
  playerId: Uuid,
  slotIndex: SlotIndex,
})

/** Public with value (C3.2): the card lands face-up on the pile. */
export const HeldDiscarded = Schema.TaggedStruct("HeldDiscarded", {
  playerId: Uuid,
  card: CardSlug,
})

/** Stripped (C3.4): everyone learns a peek occurred (§5) — the viewer alone learns the value. */
export const CardPeeked = Schema.TaggedStruct("CardPeeked", {
  viewerId: Uuid,
  target: SlotRef,
})

/** Already value-free in the domain: a public slot movement (§4.4). */
export const CardsBlindSwapped = Schema.TaggedStruct("CardsBlindSwapped", {
  by: Uuid,
  first: SlotRef,
  second: SlotRef,
})

export const PowerFizzled = Schema.TaggedStruct("PowerFizzled", {
  playerId: Uuid,
  power: PowerKind,
})

/** Public with value (C3.2): the power card lands face-up on the pile. */
export const PowerDiscarded = Schema.TaggedStruct("PowerDiscarded", {
  playerId: Uuid,
  card: CardSlug,
})

export const SlamWindowOpened = Schema.TaggedStruct("SlamWindowOpened", {
  turnPlayerId: Uuid,
  closesAt: Timestamp,
  rank: Rank,
})

/** Public with value: the slam reveal is part of the cost (§1.5). */
export const SlamSucceeded = Schema.TaggedStruct("SlamSucceeded", {
  slammerId: Uuid,
  target: SlotRef,
  card: CardSlug,
})

/** Public with value: failed slams reveal too (§1.5). */
export const SlamFailed = Schema.TaggedStruct("SlamFailed", {
  slammerId: Uuid,
  target: SlotRef,
  card: CardSlug,
})

/** Stripped for everyone, the slammer included (ADR-0022): the penalty card is unseen. */
export const PenaltyDrawn = Schema.TaggedStruct("PenaltyDrawn", {
  playerId: Uuid,
  slotIndex: SlotIndex,
})

/** Already value-free: identity is derivable from the slot movement (§1.5). */
export const CardGivenFromHand = Schema.TaggedStruct("CardGivenFromHand", {
  slammerId: Uuid,
  fromSlot: SlotIndex,
  to: SlotRef,
})

/** Stripped for everyone (ADR-0009): the zero-card give is unseen at the table. */
export const CardGivenFromDeck = Schema.TaggedStruct("CardGivenFromDeck", {
  slammerId: Uuid,
  to: SlotRef,
})

export const DrawSkipped = Schema.TaggedStruct("DrawSkipped", {
  playerId: Uuid,
  kind: Schema.Literal("penalty", "give"),
})

/** Stripped (C3.3): "a reshuffle happened" — the new order is the shuffled future. */
export const DeckReshuffled = Schema.TaggedStruct("DeckReshuffled", {
  deckCount: Schema.Int.pipe(Schema.nonNegative()),
})

export const SlamWindowClosed = Schema.TaggedStruct("SlamWindowClosed", {})

export const TurnAdvanced = Schema.TaggedStruct("TurnAdvanced", {
  playerId: Uuid,
})

export const RoomGameEvent = Schema.Union(
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
export type RoomGameEvent = typeof RoomGameEvent.Type

// ---------------------------------------------------------------------------
// Per-player channel — private payloads (C3.4). Distinct tags from the room
// events so the two streams can never be confused; the recipient is the
// channel, so no playerId.
// ---------------------------------------------------------------------------

/** The value of the card you just drew (§1.3c). Shown once; remembering it is the game (§5.1). */
export const PrivateCardDrawn = Schema.TaggedStruct("PrivateCardDrawn", {
  card: CardSlug,
})

/** The value of the card you just peeked at (§1.4). Shown once, never re-sent (ADR-0021). */
export const PrivateCardPeeked = Schema.TaggedStruct("PrivateCardPeeked", {
  target: SlotRef,
  card: CardSlug,
})

export const PlayerGameEvent = Schema.Union(PrivateCardDrawn, PrivateCardPeeked)
export type PlayerGameEvent = typeof PlayerGameEvent.Type

// ---------------------------------------------------------------------------
// Room channel — the pre-game lobby broadcast (CAM-17 C3).
// ---------------------------------------------------------------------------

/**
 * The lobby membership broadcast (ADR-0019 rows, not events): published on
 * the room topic after every create/join/leave, tagged like the 24 in-game
 * broadcasts (event name = `_tag`). Deliberately NOT part of `RoomGameEvent` —
 * that union is the projection of the in-game domain events; this is the
 * row-backed pre-game state. `version` is the room's persisted version so a
 * client can discard a broadcast older than its last-seen bootstrap
 * (root plan reconciliation: the bootstrap-vs-broadcast staleness race).
 */
export const LobbyUpdated = Schema.TaggedStruct("LobbyUpdated", {
  lobby: LobbyView,
  version: GameVersion,
})
export type LobbyUpdated = typeof LobbyUpdated.Type

export const decodeRoomGameEvent = Schema.decodeUnknownSync(RoomGameEvent)
export const encodeRoomGameEvent = Schema.encodeSync(RoomGameEvent)
export const decodeRoomGameEventEither = Schema.decodeUnknownEither(RoomGameEvent)
export const decodePlayerGameEvent = Schema.decodeUnknownSync(PlayerGameEvent)
export const encodePlayerGameEvent = Schema.encodeSync(PlayerGameEvent)
export const decodePlayerGameEventEither = Schema.decodeUnknownEither(PlayerGameEvent)
export const decodeLobbyUpdated = Schema.decodeUnknownSync(LobbyUpdated)
export const encodeLobbyUpdated = Schema.encodeSync(LobbyUpdated)
export const decodeLobbyUpdatedEither = Schema.decodeUnknownEither(LobbyUpdated)
