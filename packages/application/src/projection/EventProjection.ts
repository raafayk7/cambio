import type * as Contracts from "@cambio/contracts"
import { type GameEvent, type UserId } from "@cambio/domain"

/**
 * Domain events → channel payloads (root plan C3): the total classification
 * of all 22 event variants into the room stream (identical for every
 * participant) and per-player private streams (the only carrier of private
 * card values — delivered once, never re-sent, ADR-0021).
 *
 * Full truth comes in; channel-safe contract shapes go out. The switch is
 * exhaustive with `satisfies never`: a 23rd domain event fails to compile
 * here rather than silently reaching a channel unclassified.
 *
 * Classification recap (the room union in `@cambio/contracts` cannot even
 * represent anything more):
 *   - value kept on room only when public by rule — it lies face-up on the
 *     pile (`DiscardTaken`, `HeldDiscarded`, `PowerDiscarded`,
 *     `HeldSwapped.discarded`) or a slam revealed it (§1.5);
 *   - stripped for everyone: the deal (no opening peek, §1.1), kept/placed
 *     values (already delivered at draw time), penalty draws (ADR-0022),
 *     zero-card gives (ADR-0009), reshuffle orders;
 *   - split: `CardDrawn`/`CardPeeked` — value-free on room, value to exactly
 *     the entitled player's channel.
 */

export interface ProjectedEvents {
  readonly room: ReadonlyArray<Contracts.RoomGameEvent>
  readonly perPlayer: ReadonlyMap<UserId, ReadonlyArray<Contracts.PlayerGameEvent>>
}

export const projectEvents = (events: ReadonlyArray<GameEvent>): ProjectedEvents => {
  const room: Array<Contracts.RoomGameEvent> = []
  const perPlayer = new Map<UserId, Array<Contracts.PlayerGameEvent>>()

  const deliver = (playerId: UserId, event: Contracts.PlayerGameEvent): void => {
    const existing = perPlayer.get(playerId)
    if (existing === undefined) {
      perPlayer.set(playerId, [event])
    } else {
      existing.push(event)
    }
  }

  for (const event of events) {
    switch (event._tag) {
      case "GameStarted":
        room.push({
          _tag: "GameStarted",
          players: [...event.players],
          firstDiscard: event.firstDiscard,
          deckCount: event.deck.length,
          config: { slamWindowMs: event.config.slamWindowMs },
        })
        break
      case "CambioCalled":
        room.push({ _tag: "CambioCalled", playerId: event.playerId })
        break
      case "GameEnded":
        room.push({
          _tag: "GameEnded",
          calledBy: event.calledBy,
          scores: event.scores.map((s) => ({ playerId: s.playerId, total: s.total })),
          winners: [...event.winners],
        })
        break
      case "CardDrawn":
        room.push({ _tag: "CardDrawn", playerId: event.playerId })
        deliver(event.playerId, { _tag: "PrivateCardDrawn", card: event.card })
        break
      case "DiscardTaken":
        room.push({ _tag: "DiscardTaken", playerId: event.playerId, card: event.card })
        break
      case "HeldSwapped":
        room.push({
          _tag: "HeldSwapped",
          playerId: event.playerId,
          slotIndex: event.slotIndex,
          discarded: event.discarded,
        })
        break
      case "HeldKept":
        room.push({ _tag: "HeldKept", playerId: event.playerId, slotIndex: event.slotIndex })
        break
      case "HeldDiscarded":
        room.push({ _tag: "HeldDiscarded", playerId: event.playerId, card: event.card })
        break
      case "CardPeeked":
        room.push({
          _tag: "CardPeeked",
          viewerId: event.viewerId,
          target: { playerId: event.target.playerId, slotIndex: event.target.slotIndex },
        })
        deliver(event.viewerId, {
          _tag: "PrivateCardPeeked",
          target: { playerId: event.target.playerId, slotIndex: event.target.slotIndex },
          card: event.card,
        })
        break
      case "CardsBlindSwapped":
        room.push({
          _tag: "CardsBlindSwapped",
          by: event.by,
          first: { playerId: event.first.playerId, slotIndex: event.first.slotIndex },
          second: { playerId: event.second.playerId, slotIndex: event.second.slotIndex },
        })
        break
      case "PowerFizzled":
        room.push({ _tag: "PowerFizzled", playerId: event.playerId, power: event.power })
        break
      case "PowerDiscarded":
        room.push({ _tag: "PowerDiscarded", playerId: event.playerId, card: event.card })
        break
      case "SlamWindowOpened":
        room.push({
          _tag: "SlamWindowOpened",
          turnPlayerId: event.turnPlayerId,
          closesAt: event.closesAt,
          rank: event.rank,
        })
        break
      case "SlamSucceeded":
        room.push({
          _tag: "SlamSucceeded",
          slammerId: event.slammerId,
          target: { playerId: event.target.playerId, slotIndex: event.target.slotIndex },
          card: event.card,
        })
        break
      case "SlamFailed":
        room.push({
          _tag: "SlamFailed",
          slammerId: event.slammerId,
          target: { playerId: event.target.playerId, slotIndex: event.target.slotIndex },
          card: event.card,
        })
        break
      case "PenaltyDrawn":
        room.push({ _tag: "PenaltyDrawn", playerId: event.playerId, slotIndex: event.slotIndex })
        break
      case "CardGivenFromHand":
        room.push({
          _tag: "CardGivenFromHand",
          slammerId: event.slammerId,
          fromSlot: event.fromSlot,
          to: { playerId: event.to.playerId, slotIndex: event.to.slotIndex },
        })
        break
      case "CardGivenFromDeck":
        room.push({
          _tag: "CardGivenFromDeck",
          slammerId: event.slammerId,
          to: { playerId: event.to.playerId, slotIndex: event.to.slotIndex },
        })
        break
      case "DrawSkipped":
        room.push({ _tag: "DrawSkipped", playerId: event.playerId, kind: event.kind })
        break
      case "DeckReshuffled":
        room.push({ _tag: "DeckReshuffled", deckCount: event.deck.length })
        break
      case "SlamWindowClosed":
        room.push({ _tag: "SlamWindowClosed" })
        break
      case "TurnAdvanced":
        room.push({ _tag: "TurnAdvanced", playerId: event.playerId })
        break
      default:
        event satisfies never
    }
  }

  return { room, perPlayer }
}
