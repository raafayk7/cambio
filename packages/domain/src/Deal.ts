import { Either } from "effect"
import { ALL_CARD_SLUGS, decodeCardSlug } from "./Card.js"
import { type GameConfig } from "./GameConfig.js"
import { BadPlayerCount, type GameError } from "./GameError.js"
import { type GameEvent } from "./GameEvent.js"
import { type GameState, type HandSlot } from "./GameState.js"
import { SlotIndex, type Timestamp, type UserId } from "./Ids.js"
import { prngStateFromSeed, shuffle } from "./Prng.js"

/**
 * Game creation (§1.1): shuffle the 52-card deck from the seed, deal 4
 * face-down cards to each of 2–5 players (slots 0–3, never looked at — there
 * is no opening peek), turn one card face up to start the discard pile, and
 * await seat 0's first draw. Pure: same inputs, same game.
 */
export const dealGame = (
  players: ReadonlyArray<UserId>, // seat order
  seed: number,
  config: GameConfig,
  now: Timestamp,
): Either.Either<readonly [GameState, ReadonlyArray<GameEvent>], GameError> => {
  if (players.length < 2 || players.length > 5) {
    return Either.left(new BadPlayerCount({ count: players.length }))
  }

  const [shuffled, prng] = shuffle(
    ALL_CARD_SLUGS.map((slug) => decodeCardSlug(slug)),
    prngStateFromSeed(seed),
  )

  const hands = players.map((_, seat) =>
    Array.from({ length: 4 }, (_, i): HandSlot => ({
      slotIndex: SlotIndex.make(i),
      card: shuffled[seat * 4 + i]!,
    })),
  )
  const firstDiscard = shuffled[players.length * 4]!
  const deck = shuffled.slice(players.length * 4 + 1)

  const state: GameState = {
    players: players.map((id, seat) => ({ id, hand: hands[seat]! })),
    deck,
    discard: [firstDiscard],
    prng,
    phase: { _tag: "AwaitingDraw", playerId: players[0]! },
    config,
  }

  const started: GameEvent = {
    _tag: "GameStarted",
    at: now,
    seed,
    players,
    config,
    hands,
    deck,
    firstDiscard,
    prng,
  }

  return Either.right([state, [started]] as const)
}
