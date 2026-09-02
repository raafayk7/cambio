import { Schema } from "effect"
import { CardSlug, Rank, SlotIndex, Timestamp, Uuid } from "./GamePrimitives.js"

/**
 * The `viewFor` output shape (CAM-6, ADR-0021): everything one player may see
 * of a game, and nothing else. Structural truth only — hands (the viewer's
 * own included) are slot occupancy without values, the deck is a count, and
 * the PRNG state does not exist here at all. Private card values are
 * delivered once, at event time, on the per-player channel (`GameEvents.ts`)
 * and never re-sent in this snapshot.
 *
 * Every field answers the hidden-information gate: may every recipient of
 * this view legally see it?
 */

/** One seat: identity plus occupied slot indices — never card values. */
export const ViewPlayer = Schema.Struct({
  id: Uuid,
  /** Occupied slot indices, ascending. Holes stay holes (§4.3). */
  hand: Schema.Array(SlotIndex),
})
export type ViewPlayer = typeof ViewPlayer.Type

/**
 * The phase as one player sees it. Card-carrying variants hold an *optional*
 * value: present exactly when the viewer is entitled (holder always; everyone
 * when the card came off the public discard pile), absent otherwise — absent,
 * not null, so an unentitled payload contains no card field at all.
 */
const ViewAwaitingDraw = Schema.TaggedStruct("AwaitingDraw", {
  playerId: Uuid,
})

const ViewHoldingCard = Schema.TaggedStruct("HoldingCard", {
  playerId: Uuid,
  source: Schema.Literal("deck", "discard"),
  card: Schema.optional(CardSlug),
})

const ViewResolvingPower = Schema.TaggedStruct("ResolvingPower", {
  playerId: Uuid,
  card: Schema.optional(CardSlug),
})

const ViewResolvingQueenSwap = Schema.TaggedStruct("ResolvingQueenSwap", {
  playerId: Uuid,
  card: Schema.optional(CardSlug),
})

/** Fully public: the rank is the top discard's, already on the pile. */
const ViewSlamWindow = Schema.TaggedStruct("SlamWindow", {
  turnPlayerId: Uuid,
  closesAt: Timestamp,
  rank: Rank,
})

const ViewEnded = Schema.TaggedStruct("Ended", {
  calledBy: Uuid,
})

export const ViewPhase = Schema.Union(
  ViewAwaitingDraw,
  ViewHoldingCard,
  ViewResolvingPower,
  ViewResolvingQueenSwap,
  ViewSlamWindow,
  ViewEnded,
)
export type ViewPhase = typeof ViewPhase.Type

/** One revealed hand at game end: slots with values. */
export const RevealedHand = Schema.Struct({
  playerId: Uuid,
  cards: Schema.Array(
    Schema.Struct({
      slotIndex: SlotIndex,
      card: CardSlug,
    }),
  ),
})
export type RevealedHand = typeof RevealedHand.Type

/**
 * The endgame reveal (§1.8): present on the view exactly when the phase is
 * `Ended`. Totals can be negative; `winners` is a set — ties are real.
 */
export const Reveal = Schema.Struct({
  hands: Schema.Array(RevealedHand),
  scores: Schema.Array(
    Schema.Struct({
      playerId: Uuid,
      total: Schema.Int,
    }),
  ),
  winners: Schema.Array(Uuid),
})
export type Reveal = typeof Reveal.Type

export const PlayerGameView = Schema.Struct({
  /** Seat order — array index is the seat (§4.3). */
  players: Schema.Array(ViewPlayer),
  /** The deck is a count; its order is the shuffled future and never leaves the server. */
  deckCount: Schema.Int.pipe(Schema.nonNegative()),
  /** Public by definition; index 0 is the top (§4.3). */
  discard: Schema.Array(CardSlug),
  phase: ViewPhase,
  /** Present iff `phase` is `Ended` (§1.8). */
  reveal: Schema.optional(Reveal),
})
export type PlayerGameView = typeof PlayerGameView.Type

/** The lobby is fully public — one shape for every viewer (ADR-0019). */
export const LobbyView = Schema.Struct({
  id: Uuid,
  /** Join order — and, at start, the seat order. */
  members: Schema.Array(Uuid),
  status: Schema.Literal("open", "abandoned", "started"),
})
export type LobbyView = typeof LobbyView.Type

export const decodePlayerGameView = Schema.decodeUnknownSync(PlayerGameView)
export const encodePlayerGameView = Schema.encodeSync(PlayerGameView)
export const decodePlayerGameViewEither = Schema.decodeUnknownEither(PlayerGameView)
export const decodeLobbyView = Schema.decodeUnknownSync(LobbyView)
export const encodeLobbyView = Schema.encodeSync(LobbyView)
export const decodeLobbyViewEither = Schema.decodeUnknownEither(LobbyView)
