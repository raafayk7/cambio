import type { Reveal, Uuid } from "@cambio/contracts"
import { cn } from "@cambio/ui"

import { PlayingCard } from "./playing-card.js"

/**
 * ScoreSheet — design-system/components/core/score-sheet.md (r1).
 * Class: Game object.
 *
 * The endgame reveal — renders ONLY from reveal data (scores exist at
 * reveal, never during play). Every hand flips face-up simultaneously
 * (instant full reveal, CAM-13); rows order by total ascending — never
 * by card count, and 0 is never styled as automatically winning (it
 * loses to negatives). Winner rows (plural on ties — ties are real, no
 * tiebreak exists) mark in accent.action weight-700. Totals render in
 * numeral type with a TRUE minus (−), per voice.md. The caller gets no
 * marker here — the turn-indicator announced the call.
 */
export interface ScoreSheetProps {
  reveal: Reveal
  playerName: (id: Uuid) => string
  className?: string
}

/** voice.md: scores use a true minus sign (−), never a hyphen. */
export function formatScore(total: number): string {
  return total < 0 ? `−${Math.abs(total)}` : `${total}`
}

export function ScoreSheet({ reveal, playerName, className }: ScoreSheetProps) {
  const totals = new Map(reveal.scores.map((score) => [score.playerId, score.total]))
  const winners = new Set(reveal.winners)
  const rows = [...reveal.hands].sort(
    (a, b) => (totals.get(a.playerId) ?? 0) - (totals.get(b.playerId) ?? 0),
  )

  return (
    <div
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
                  "w-24 font-ui text-base",
                  won ? "font-bold text-accent-action" : "font-medium text-ink-primary",
                )}
              >
                {playerName(hand.playerId)}
              </span>
              <span className="flex flex-1 gap-1">
                {hand.cards.map(({ slotIndex, card }) => (
                  <PlayingCard key={slotIndex} face="up" card={card} size="sm" />
                ))}
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
