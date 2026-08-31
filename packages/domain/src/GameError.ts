import { Data } from "effect"
import { type PowerKind, type Rank } from "./Card.js"
import { type SlotRef } from "./GameState.js"
import { type SlotIndex, type Timestamp, type UserId } from "./Ids.js"

/**
 * Typed domain errors (C7.1): one class per reason a caller could react
 * differently. Values, never thrown across the package boundary — the engine
 * returns them in `Either.left`.
 */

/** Game creation requires 2–5 players (§1.1). */
export class BadPlayerCount extends Data.TaggedError("BadPlayerCount")<{
  readonly count: number
}> {}

/** No command is legal after the Cambio call ends the game (§1.3a). */
export class GameAlreadyEnded extends Data.TaggedError("GameAlreadyEnded")<{
  readonly calledBy: UserId
}> {}

/** A turn-phase command from someone other than the active player (§1.3). */
export class NotYourTurn extends Data.TaggedError("NotYourTurn")<{
  readonly playerId: UserId
  readonly activePlayerId: UserId
}> {}

/** The command kind does not apply to the current phase (§4.2). */
export class WrongPhase extends Data.TaggedError("WrongPhase")<{
  readonly commandTag: string
  readonly phaseTag: string
}> {}

/** The top discard is a power card and cannot be taken (§1.3b). */
export class PowerDiscardNotTakeable extends Data.TaggedError("PowerDiscardNotTakeable")<{
  readonly rank: Rank
}> {}

/** A drawn power is obligatory: it can be neither kept nor discarded (§1.3c). */
export class MustResolvePower extends Data.TaggedError("MustResolvePower")<{
  readonly power: PowerKind
}> {}

/** The named slot is unoccupied — swaps, peeks, and slams need cards (ADR-0010). */
export class EmptySlotTarget extends Data.TaggedError("EmptySlotTarget")<{
  readonly target: SlotRef
}> {}

/** A blind swap names *two* cards (§1.4) — the same slot twice is not a swap. */
export class SwapTargetsIdentical extends Data.TaggedError("SwapTargetsIdentical")<{
  readonly target: SlotRef
}> {}

/** 7/8 must aim at your own card, 9/10 at another player's (§1.4). */
export class WrongPeekTarget extends Data.TaggedError("WrongPeekTarget")<{
  readonly power: PowerKind
  readonly target: SlotRef
}> {}

/** Keeps exist only for zero-card hands (§1.6, ADR-0009). */
export class KeepRequiresEmptyHand extends Data.TaggedError("KeepRequiresEmptyHand")<{
  readonly playerId: UserId
}> {}

/**
 * The slam's up-front give-slot is missing/unoccupied when required (opponent
 * slam with a non-empty hand), or present when it must be null (own-card slam
 * or zero-card draw-then-give — ADR-0009).
 */
export class InvalidGiveSlot extends Data.TaggedError("InvalidGiveSlot")<{
  readonly playerId: UserId
  readonly giveSlot: SlotIndex | null
}> {}

/** Slam arrived at or after `closesAt` — the window is closed (§6, ADR-0011). */
export class SlamTooLate extends Data.TaggedError("SlamTooLate")<{
  readonly closesAt: Timestamp
  readonly at: Timestamp
}> {}

/** The close command arrived before `closesAt` (ADR-0011). */
export class WindowStillOpen extends Data.TaggedError("WindowStillOpen")<{
  readonly closesAt: Timestamp
  readonly at: Timestamp
}> {}

/** Turn draw with the deck and reshufflable discard both exhausted (C6.2). */
export class NoCardToDraw extends Data.TaggedError("NoCardToDraw") {}

/** Taking from an empty discard pile — nothing to take (ADR-0012). */
export class EmptyDiscard extends Data.TaggedError("EmptyDiscard") {}

/** The command's issuer is not a player in this game. */
export class UnknownPlayer extends Data.TaggedError("UnknownPlayer")<{
  readonly playerId: UserId
}> {}

export type GameError =
  | UnknownPlayer
  | EmptyDiscard
  | BadPlayerCount
  | GameAlreadyEnded
  | NotYourTurn
  | WrongPhase
  | PowerDiscardNotTakeable
  | MustResolvePower
  | EmptySlotTarget
  | SwapTargetsIdentical
  | WrongPeekTarget
  | KeepRequiresEmptyHand
  | InvalidGiveSlot
  | SlamTooLate
  | WindowStillOpen
  | NoCardToDraw
