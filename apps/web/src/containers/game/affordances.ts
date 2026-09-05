import type { CardSlug, PlayerGameView, Rank, SlotIndex, SlotRef } from "@cambio/contracts"

/**
 * H1 — the two public-rule helpers, and the pure `ViewPhase` → affordance
 * mapping (CAM-18 root plan H1/T1-T3; frontend plan step 10). Every rule
 * encoded here comes straight from `.claude/skills/cambio-rules/SKILL.md`
 * (never memory, never another Cambio/Cabo variant) — the server remains
 * the legality authority via 422s; these helpers exist only so the client
 * doesn't render a dead button for an illegal action.
 *
 * `affordancesFor` never imports `domain` or `application` (architecture
 * skill) — it derives everything from the `ViewPhase` the wire already
 * sent plus public occupancy (`ViewPlayer.hand`), nothing else.
 */

// ---- rank-of-slug + the power set (cambio-rules "Powers") -----------------

/**
 * A wire `CardSlug` is always rank + suit as a two-character template
 * literal (`GamePrimitives.ts`): `"AS"`, `"TH"`, `"KD"`. "10" is
 * wire-encoded as the single character `"T"` (`WIRE_RANKS`), so the rank is
 * unconditionally every character except the last.
 */
export function rankOfSlug(slug: CardSlug): Rank {
  return slug.slice(0, -1) as Rank
}

/**
 * The power-carrying ranks (cambio-rules "Powers": 7, 8, 9, 10, J, Q — "10"
 * is the wire's `"T"`). Mirrors the engine's power set: these trigger only
 * when drawn from the deck, and a power card sitting on the discard pile
 * cannot be taken (turn (b)) though it stays slammable.
 */
const POWER_RANKS: ReadonlySet<Rank> = new Set(["7", "8", "9", "T", "J", "Q"])

export function isPowerRank(rank: Rank): boolean {
  return POWER_RANKS.has(rank)
}

// ---- the slam give-slot rule (cambio-rules "Slamming" + ADR-0009) --------

/**
 * Whether a slam on `targetOwnerId`'s card by `slammerId` requires the
 * slammer to pick one of their own occupied slots to give (cambio-rules:
 * "Opponent's card, correct" — the slammer gives one of their own cards,
 * blind, their choice of slot, into the vacated slot):
 *
 *   - Own-card slam: never required — a correct own slam just removes the
 *     card, no give exists (`SlamWindow.test.ts` "own-card slams carry no
 *     give").
 *   - Opponent's card, slammer holds at least one card: required — the
 *     slammer names which own slot to give from.
 *   - Opponent's card, zero-card slammer: NOT required, even though a give
 *     still happens — ADR-0009 "draw-then-give": the server draws the deck
 *     top and gives it unseen, since the slammer has no slot to name. The
 *     `Slam` command's `giveSlot` is `null` in both non-required cases;
 *     step 13 (slam window) is the actual consumer of this helper.
 */
export function slamGiveSlotRequired(
  slammerId: string,
  targetOwnerId: string,
  slammerHand: ReadonlyArray<SlotIndex>,
): boolean {
  if (slammerId === targetOwnerId) return false
  return slammerHand.length > 0
}

// ---- power targeting classes (cambio-rules "Powers") ----------------------

export type PowerTargeting =
  | { readonly kind: "peek-own" } // 7/8: one of the holder's own occupied slots
  | { readonly kind: "peek-other" } // 9/10: one occupied slot belonging to another player
  | { readonly kind: "swap-two" } // J (and the Queen's second step): two distinct occupied slots, any players
  | { readonly kind: "queen-peek" } // Q's first step: PowerPeek on any occupied slot

function targetingForRank(rank: Rank): PowerTargeting {
  switch (rank) {
    case "7":
    case "8":
      return { kind: "peek-own" }
    case "9":
    case "T":
      return { kind: "peek-other" }
    case "J":
      return { kind: "swap-two" }
    case "Q":
      return { kind: "queen-peek" }
    default:
      // Structurally unreachable: `ResolvingPower` only exists after a power
      // was drawn (cambio-rules "Powers"). A non-power rank here would mean
      // the server sent an illegal phase — a contracts bug to surface, never
      // a client situation to guess around (hidden-information: no invented
      // fallback behavior for a wire violation).
      throw new Error(`ResolvingPower card is not a power rank: ${rank}`)
  }
}

// ---- the ViewPhase → affordance mapping (T1-T3) ---------------------------

export type Affordances =
  | { readonly phase: "AwaitingDraw"; readonly holder: false }
  | {
      readonly phase: "AwaitingDraw"
      readonly holder: true
      readonly callCambio: true
      readonly takeDiscard: boolean
      readonly drawFromDeck: boolean
    }
  | { readonly phase: "HoldingCard"; readonly holder: false }
  | {
      readonly phase: "HoldingCard"
      readonly holder: true
      readonly source: "deck" | "discard"
      readonly card: CardSlug | undefined
      readonly swap: boolean
      readonly discardHeld: boolean
      readonly keep: boolean
    }
  | { readonly phase: "ResolvingPower"; readonly holder: false }
  | {
      readonly phase: "ResolvingPower"
      readonly holder: true
      readonly card: CardSlug
      readonly targeting: PowerTargeting
    }
  | { readonly phase: "ResolvingQueenSwap"; readonly holder: false }
  | {
      readonly phase: "ResolvingQueenSwap"
      readonly holder: true
      readonly targeting: { readonly kind: "swap-two" }
    }
  // Slam (M5) and endgame (M6) are out of this milestone's scope — the
  // mapping still covers every `ViewPhase` tag (exhaustiveness), but emits
  // no affordance fields for them; the screen renders whatever minimal
  // branch M3 left for these two.
  | { readonly phase: "SlamWindow" }
  | { readonly phase: "Ended" }

function occupiedSlotsOf(view: PlayerGameView, playerId: string): ReadonlyArray<SlotIndex> {
  return view.players.find((player) => player.id === playerId)?.hand ?? []
}

export function affordancesFor(view: PlayerGameView, viewerId: string): Affordances {
  const phase = view.phase

  switch (phase._tag) {
    case "AwaitingDraw": {
      if (phase.playerId !== viewerId) return { phase: "AwaitingDraw", holder: false }
      const top = view.discard[0]
      const takeDiscard = top !== undefined && !isPowerRank(rankOfSlug(top))
      const drawFromDeck = view.deckCount > 0 || view.discard.length > 1
      return { phase: "AwaitingDraw", holder: true, callCambio: true, takeDiscard, drawFromDeck }
    }

    case "HoldingCard": {
      if (phase.playerId !== viewerId) return { phase: "HoldingCard", holder: false }
      const ownHand = occupiedSlotsOf(view, viewerId)
      return {
        phase: "HoldingCard",
        holder: true,
        source: phase.source,
        card: phase.card,
        swap: ownHand.length > 0,
        discardHeld: phase.source === "deck",
        keep: ownHand.length === 0,
      }
    }

    case "ResolvingPower": {
      if (phase.playerId !== viewerId || phase.card === undefined) {
        return { phase: "ResolvingPower", holder: false }
      }
      return {
        phase: "ResolvingPower",
        holder: true,
        card: phase.card,
        targeting: targetingForRank(rankOfSlug(phase.card)),
      }
    }

    case "ResolvingQueenSwap": {
      if (phase.playerId !== viewerId) return { phase: "ResolvingQueenSwap", holder: false }
      return { phase: "ResolvingQueenSwap", holder: true, targeting: { kind: "swap-two" } }
    }

    case "SlamWindow":
      return { phase: "SlamWindow" }

    case "Ended":
      return { phase: "Ended" }
  }
}

/** Structural helper for the screen: is `ref` one of the currently-occupied
 * slots in `view`? Targeting must never let a click send a command against
 * an empty slot (J/Q swaps require two distinct OCCUPIED slots —
 * cambio-rules ADR-0010). */
export function isOccupiedSlot(view: PlayerGameView, ref: SlotRef): boolean {
  return occupiedSlotsOf(view, ref.playerId).includes(ref.slotIndex)
}
