import { score } from "./Card.js"
import { type GameState, type Hand } from "./GameState.js"
import { type UserId } from "./Ids.js"

/**
 * Scoring (§1.2, §1.8). Score is derived per card (rank *and* suit — the
 * kings differ by color), never stored. Ties are representable: `winnersOf`
 * returns every player sharing the minimum; there is no caller tiebreak.
 */

export const handTotal = (hand: Hand): number => hand.reduce((total, s) => total + score(s.card), 0)

export interface PlayerScore {
  readonly playerId: UserId
  readonly total: number
}

/** Per-player totals, in seat order. */
export const gameScores = (state: GameState): ReadonlyArray<PlayerScore> =>
  state.players.map((p) => ({ playerId: p.id, total: handTotal(p.hand) }))

/** Everyone sharing the lowest total (§1.8) — a set, because ties happen. */
export const winnersOf = (scores: ReadonlyArray<PlayerScore>): ReadonlyArray<UserId> => {
  const min = Math.min(...scores.map((s) => s.total))
  return scores.filter((s) => s.total === min).map((s) => s.playerId)
}
