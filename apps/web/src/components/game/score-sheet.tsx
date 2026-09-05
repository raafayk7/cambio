import type { Reveal, Uuid } from "@cambio/contracts"
import { cn } from "@cambio/ui"
import * as React from "react"

import { PlayingCard } from "./playing-card.js"

/**
 * ScoreSheet — design-system/components/core/score-sheet.md (r2).
 * Class: Game object.
 *
 * The endgame reveal — renders ONLY from reveal data (scores exist at
 * reveal, never during play). Rows order by total ascending — never by
 * card count, and 0 is never styled as automatically winning (it loses
 * to negatives). Winner rows (plural on ties — ties are real, no
 * tiebreak exists) mark in accent.action weight-700. Totals render in
 * numeral type with a TRUE minus (−), per voice.md. The caller gets no
 * marker here — the turn-indicator announced the call.
 *
 * r2 (CAM-18 E2): the `revealing` entrance — every hand's mini cards
 * mount face-down and flip face-up SIMULTANEOUSLY at `duration.track`
 * (score-sheet.md r2), then the sheet settles to `final`. This is a
 * JS-timed state transition, not a CSS-only one (same reasoning as
 * `PEEK_DURATION_MS` in `use-game.ts`: a runtime `getComputedStyle` read
 * buys nothing over a constant kept in sync by hand), so the flip itself
 * still rides `PlayingCard`'s own face-transition CSS (already
 * reduced-motion aware via its motion-reduce cross-fade) — this
 * component only decides WHEN every card's `face` prop flips, together.
 * `revealing` defaults to `false` (already-settled) so a caller with no
 * "moment" to dramatize (e.g. a fresh mount straight into `Ended`, E3)
 * can render the sheet immediately at `final`.
 */
export interface ScoreSheetProps {
  reveal: Reveal
  playerName: (id: Uuid) => string
  /** True on the reveal's first appearance: cards start face-down and the
   * sheet is `data-state="revealing"` for `SCORE_REVEAL_MS`, then flips
   * every card up at once and settles to `data-state="final"`. */
  revealing?: boolean
  className?: string
}

/** voice.md: scores use a true minus sign (−), never a hyphen. */
export function formatScore(total: number): string {
  return total < 0 ? `−${Math.abs(total)}` : `${total}`
}

/** Mirrors `--duration-track` (packages/ui/src/styles.css, tokens.md
 * `duration.track` = 340ms) — kept as a constant for the same reason
 * `PEEK_DURATION_MS` is in `use-game.ts`. */
const SCORE_REVEAL_MS = 340

export function ScoreSheet({ reveal, playerName, revealing = false, className }: ScoreSheetProps) {
  // Starts settled unless a genuine entrance was requested — the flip is a
  // one-shot beat on mount, never re-triggered by a later re-render (a
  // refetch landing after the reveal already settled must not re-flip it).
  const [settled, setSettled] = React.useState(!revealing)
  // Intentionally empty deps: this is the mount-time entrance only, never
  // re-armed by a `revealing` prop flip after the fact (no
  // `react-hooks/exhaustive-deps` rule is registered in this repo's eslint
  // config, so this is a documented deliberate choice, not a lint dodge).
  React.useEffect(() => {
    if (!revealing) return
    const handle = window.setTimeout(() => setSettled(true), SCORE_REVEAL_MS)
    return () => window.clearTimeout(handle)
  }, [])

  const totals = new Map(reveal.scores.map((score) => [score.playerId, score.total]))
  const winners = new Set(reveal.winners)
  const rows = [...reveal.hands].sort(
    (a, b) => (totals.get(a.playerId) ?? 0) - (totals.get(b.playerId) ?? 0),
  )

  return (
    <div
      data-state={settled ? "final" : "revealing"}
      className={cn(
        "flex w-fit flex-col gap-3 rounded-md border-frame bg-surface-raised p-4 shadow-float",
        className,
      )}
    >
      <h2 className="font-display text-2xl">SCORES</h2>
      <ul className="flex flex-col divide-y divide-ink-primary/25">
        {rows.map((hand) => {
          const total = totals.get(hand.playerId) ?? 0
          const won = winners.has(hand.playerId)
          return (
            <li key={hand.playerId} data-winner={won} className="flex items-center gap-3 py-2">
              <span
                className={cn(
                  "min-w-0 flex-1 font-ui text-base",
                  won ? "font-bold text-accent-action" : "font-medium text-ink-primary",
                )}
              >
                {playerName(hand.playerId)}
              </span>
              <span className="flex gap-1">
                {hand.cards.map(({ slotIndex, card }) =>
                  settled ? (
                    <PlayingCard key={slotIndex} face="up" card={card} size="sm" />
                  ) : (
                    <PlayingCard key={slotIndex} face="down" size="sm" />
                  ),
                )}
              </span>
              <span
                className={cn(
                  "font-numeral text-lg",
                  won ? "font-bold text-accent-action" : "text-ink-primary",
                )}
              >
                {formatScore(total)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
