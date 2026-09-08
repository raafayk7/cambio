import { Schema } from "effect"

/** Branded primitives (§2). These exist so a `UserId` can never be passed where a `GameId` is meant. */

export const UserId = Schema.UUID.pipe(Schema.brand("UserId"))
export type UserId = typeof UserId.Type

export const GameId = Schema.UUID.pipe(Schema.brand("GameId"))
export type GameId = typeof GameId.Type

/**
 * A slot position in a player's hand.
 *
 * Indices are stable positions, not array offsets (§4.3). A slam that removes
 * the card at index 1 leaves a hole; indices 2 and 3 do not shift. Hands can
 * also grow past four via slam penalties, so this is bounded below only.
 */
export const SlotIndex = Schema.Int.pipe(Schema.nonNegative(), Schema.brand("SlotIndex"))
export type SlotIndex = typeof SlotIndex.Type

/**
 * Absolute epoch milliseconds.
 *
 * Deliberately absolute rather than a duration: on a host that sleeps, timers
 * cannot be the authority, so a command arriving late computes "window already
 * closed" from the clock (§6).
 */
export const Timestamp = Schema.Int.pipe(Schema.brand("Timestamp"))
export type Timestamp = typeof Timestamp.Type

/** Monotonic per-game event sequence number (§4.3 `game_events`). */
export const Seq = Schema.Int.pipe(Schema.nonNegative(), Schema.brand("Seq"))
export type Seq = typeof Seq.Type

/** Optimistic-concurrency version of a persisted game (§4.3 `games.version`). */
export const GameVersion = Schema.Int.pipe(Schema.nonNegative(), Schema.brand("GameVersion"))
export type GameVersion = typeof GameVersion.Type
