import { Badge, cn } from "@cambio/ui"

/**
 * DrawDeck — design-system/components/core/draw-deck.md (r1).
 * Class: Game object.
 *
 * The face-down stock: a 2–3 offset stack of card backs + a count badge.
 * Deck count is public state (the wire sends deckCount only — order
 * never reaches a client). `low` (count ≤ 5) shifts the badge text to
 * accent.alarm-deep: reshuffle tension is real information. The
 * reshuffle/draw flights are duration.track choreography owned by the
 * game screen (CAM-16); this renders the stock.
 */
export interface DrawDeckProps {
  count: number
  className?: string
}

export function DrawDeck({ count, className }: DrawDeckProps) {
  const low = count <= 5
  const layers = Math.min(3, Math.max(1, count))

  return (
    <div
      data-state={count === 0 ? "empty" : low ? "low" : "populated"}
      className={cn("relative w-fit", className)}
    >
      {count === 0 ? (
        <span
          aria-hidden
          className="block border-2 border-dashed border-ink-inverse/55 card-frame card-md"
        />
      ) : (
        <div className="relative card-frame card-md">
          {Array.from({ length: layers }, (_, layer) => (
            <span
              key={layer}
              aria-hidden
              className={cn(
                "absolute inset-0 border-interactive card-frame card-back-mark shadow-raised",
                layer === 1 && "translate-x-1 translate-y-1",
                layer === 2 && "translate-x-2 translate-y-2",
              )}
            />
          ))}
        </div>
      )}
      <Badge
        variant="count"
        aria-label={`${count} cards in the draw deck`}
        className={cn(
          "absolute -right-2 -bottom-2 z-10",
          low && count > 0 && "text-accent-alarm-deep",
        )}
      >
        {count}
      </Badge>
    </div>
  )
}
