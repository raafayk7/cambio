import { type CardSlug, score } from "../Card.js"
import { type GameEvent } from "../GameEvent.js"
import { allCards, type GameState } from "../GameState.js"
import { type UserId } from "../Ids.js"

/**
 * Pure invariant checkers (C2): each returns a list of human-readable
 * violation descriptions — empty means healthy — so the driver can wrap
 * failures with seed/step repro info. The C2.4 recomputation is deliberately
 * local (reduced over `score` from Card.ts, min-filtered here) rather than
 * calling `gameScores`/`winnersOf`, which the engine itself uses — comparing
 * the engine to itself would be a tautology.
 */

/**
 * §4.5: every card in the baseline present exactly once — nothing lost,
 * nothing duplicated. `baselineSorted` is the sorted `allCards` of the
 * initial state (the full 52 for dealt games; constructed Coverage scenarios
 * bring their own).
 */
export const cardPartitionViolations = (
  state: GameState,
  baselineSorted: ReadonlyArray<CardSlug | string>,
): ReadonlyArray<string> => {
  const current = [...allCards(state)].sort()
  if (
    current.length === baselineSorted.length &&
    current.every((c, i) => c === baselineSorted[i])
  ) {
    return []
  }
  const count = (cards: ReadonlyArray<string>): Map<string, number> => {
    const m = new Map<string, number>()
    for (const c of cards) m.set(c, (m.get(c) ?? 0) + 1)
    return m
  }
  const expected = count(baselineSorted as ReadonlyArray<string>)
  const actual = count(current)
  const missing = [...expected].filter(([c, n]) => (actual.get(c) ?? 0) < n).map(([c]) => c)
  const extra = [...actual].filter(([c, n]) => (expected.get(c) ?? 0) < n).map(([c]) => c)
  return [
    `card partition broken (C2.1): missing [${missing.join(", ")}], duplicated/foreign [${extra.join(", ")}]`,
  ]
}

/**
 * §4.5 restated for the domain shape (root plan, Context & orientation):
 * slot indices unique and sorted ascending per hand; the roster (count, ids,
 * seat order) identical to the dealt roster; player count within 2–4
 * (§1.1, ADR-0036).
 */
export const handIntegrityViolations = (
  state: GameState,
  roster: ReadonlyArray<UserId>,
): ReadonlyArray<string> => {
  const violations: Array<string> = []
  if (state.players.length < 2 || state.players.length > 4) {
    violations.push(`player count ${state.players.length} outside 2–4 (C2.2, §1.1)`)
  }
  if (
    state.players.length !== roster.length ||
    state.players.some((p, seat) => p.id !== roster[seat])
  ) {
    violations.push(
      `roster drift (C2.2): seats [${state.players.map((p) => p.id).join(", ")}] != dealt [${roster.join(", ")}]`,
    )
  }
  for (const p of state.players) {
    for (let i = 1; i < p.hand.length; i++) {
      if (p.hand[i]!.slotIndex <= p.hand[i - 1]!.slotIndex) {
        violations.push(
          `hand of ${p.id} has non-unique or unsorted slot indices [${p.hand.map((s) => s.slotIndex).join(", ")}] (C2.2)`,
        )
        break
      }
    }
  }
  return violations
}

/** The per-transition bundle the driver runs after every accepted command. */
export const stepViolations = (
  state: GameState,
  roster: ReadonlyArray<UserId>,
  baselineSorted: ReadonlyArray<CardSlug | string>,
): ReadonlyArray<string> => [
  ...cardPartitionViolations(state, baselineSorted),
  ...handIntegrityViolations(state, roster),
]

/**
 * End-of-game consistency (C2.3) and score conservation (C2.4): `Ended`
 * phase ⟺ exactly one `GameEnded`, as the final event; its scores equal an
 * independent per-card recomputation and its winners are exactly the
 * minimum-total players, in seat order.
 */
export const endViolations = (
  finalState: GameState,
  events: ReadonlyArray<GameEvent>,
  roster: ReadonlyArray<UserId>,
): ReadonlyArray<string> => {
  const violations: Array<string> = [...handIntegrityViolations(finalState, roster)]
  const gameEnded = events.filter((e) => e._tag === "GameEnded")
  const ended = finalState.phase._tag === "Ended"

  if (ended !== gameEnded.length > 0) {
    violations.push(`Ended phase is ${ended} but GameEnded count is ${gameEnded.length} (C2.3)`)
  }
  if (gameEnded.length > 1) {
    violations.push(`GameEnded emitted ${gameEnded.length} times (C2.3)`)
  }
  if (gameEnded.length > 0 && events.at(-1)?._tag !== "GameEnded") {
    violations.push(`GameEnded is not the final event (got ${events.at(-1)?._tag}) (C2.3)`)
  }
  const event = gameEnded[0]
  if (!ended || event === undefined || event._tag !== "GameEnded") return violations

  // C2.4: recompute per card, locally — never via gameScores/winnersOf.
  const recomputed = finalState.players.map((p) => ({
    playerId: p.id,
    total: p.hand.reduce((sum, s) => sum + score(s.card), 0),
  }))
  if (
    event.scores.length !== recomputed.length ||
    event.scores.some(
      (s, i) => s.playerId !== recomputed[i]!.playerId || s.total !== recomputed[i]!.total,
    )
  ) {
    violations.push(
      `GameEnded scores [${event.scores.map((s) => s.total).join(", ")}] != recomputed [${recomputed.map((s) => s.total).join(", ")}] (C2.4)`,
    )
  }
  const min = Math.min(...recomputed.map((s) => s.total))
  const expectedWinners = recomputed.filter((s) => s.total === min).map((s) => s.playerId)
  if (
    event.winners.length !== expectedWinners.length ||
    event.winners.some((w, i) => w !== expectedWinners[i])
  ) {
    violations.push(
      `GameEnded winners [${event.winners.join(", ")}] != min-score set [${expectedWinners.join(", ")}] (C2.4)`,
    )
  }
  return violations
}
