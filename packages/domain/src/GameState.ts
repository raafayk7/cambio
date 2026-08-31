import { Option, Schema } from "effect"
import { CardSlug } from "./Card.js"
import { GameConfig } from "./GameConfig.js"
import { SlotIndex, UserId } from "./Ids.js"
import { Phase } from "./Phase.js"
import { PrngState } from "./Prng.js"

/**
 * The full, unredacted game state (§4.2–§4.3). Server-side truth only —
 * clients never see this shape; redaction is the (later) `viewFor`
 * projection's job (§5).
 */

/**
 * A reference to one card by the slot it occupies (ADR-0010).
 *
 * Replaces the scaffold's provisional `CardRef`/`TargetSelection`: targets
 * are always references to **occupied** slots, and occupancy is validated by
 * the legality function, not the schema.
 */
export const SlotRef = Schema.Struct({
  playerId: UserId,
  slotIndex: SlotIndex,
})
export type SlotRef = typeof SlotRef.Type

/**
 * A hand is a sparse list of occupied slots (§4.3): indices are stable
 * positions, not array offsets. A slam that removes slot 1 leaves a hole —
 * slots 2 and 3 do not shift — and incoming cards fill the lowest free
 * index. Invariant (engine-maintained): `slotIndex` unique, sorted ascending.
 */
export const HandSlot = Schema.Struct({
  slotIndex: SlotIndex,
  card: CardSlug,
})
export type HandSlot = typeof HandSlot.Type

export const Hand = Schema.Array(HandSlot)
export type Hand = typeof Hand.Type

export const GamePlayer = Schema.Struct({
  id: UserId,
  hand: Hand,
})
export type GamePlayer = typeof GamePlayer.Type

/**
 * `players` is in seat order (array index = seat, §4.3 `game_players`);
 * `deck[0]` is the next card to draw and `discard[0]` the top of the pile
 * (§4.3). PRNG state lives here so reshuffles and penalty draws are
 * deterministic without new seed inputs.
 */
export const GameState = Schema.Struct({
  players: Schema.Array(GamePlayer),
  deck: Schema.Array(CardSlug),
  discard: Schema.Array(CardSlug),
  prng: PrngState,
  phase: Phase,
  config: GameConfig,
})
export type GameState = typeof GameState.Type

export const decodeGameState = Schema.decodeUnknownSync(GameState)
export const encodeGameState = Schema.encodeSync(GameState)

// ---------------------------------------------------------------------------
// Pure, total helpers. No I/O, no mutation.
// ---------------------------------------------------------------------------

export const seatOf = (state: GameState, playerId: UserId): Option.Option<number> => {
  const seat = state.players.findIndex((p) => p.id === playerId)
  return seat === -1 ? Option.none() : Option.some(seat)
}

export const handOf = (state: GameState, playerId: UserId): Option.Option<Hand> =>
  Option.map(
    Option.fromNullable(state.players.find((p) => p.id === playerId)),
    (p) => p.hand,
  )

/** Incoming cards fill the lowest free index (§4.3); hands may grow past 4. */
export const lowestFreeSlot = (hand: Hand): SlotIndex => {
  const taken = new Set<number>(hand.map((s) => s.slotIndex))
  let i = 0
  while (taken.has(i)) i++
  return SlotIndex.make(i)
}

export const slotCard = (state: GameState, ref: SlotRef): Option.Option<CardSlug> =>
  Option.flatMap(handOf(state, ref.playerId), (hand) =>
    Option.fromNullable(hand.find((s) => s.slotIndex === ref.slotIndex)?.card),
  )

/** Every occupied `(player, slot)` pair, in seat order then slot order. */
export const occupiedSlots = (state: GameState): ReadonlyArray<SlotRef> =>
  state.players.flatMap((p) =>
    p.hand.map((s) => ({ playerId: p.id, slotIndex: s.slotIndex })),
  )

/**
 * The card a phase holds outside deck/discard/hands, if any. Exhaustive on
 * purpose: a future card-carrying phase case must fail to compile here
 * rather than silently vanish from the partition.
 */
const phaseHeldCards = (phase: Phase): ReadonlyArray<CardSlug> => {
  switch (phase._tag) {
    case "HoldingCard":
    case "ResolvingPower":
    case "ResolvingQueenSwap":
      return [phase.card]
    case "AwaitingDraw":
    case "SlamWindow":
    case "Ended":
      return []
    default:
      return phase satisfies never
  }
}

/**
 * Deck + discard + hands + the phase-held card (a card in `HoldingCard`/
 * `ResolvingPower`/`ResolvingQueenSwap` lives in the phase, nowhere else):
 * the §4.5 partition-invariant workhorse — always all 52, no duplicates.
 */
export const allCards = (state: GameState): ReadonlyArray<CardSlug> => [
  ...state.deck,
  ...state.discard,
  ...state.players.flatMap((p) => p.hand.map((s) => s.card)),
  ...phaseHeldCards(state.phase),
]
