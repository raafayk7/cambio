import { Schema } from "effect"

/**
 * Unbranded wire primitives shared by every game schema (CAM-6).
 *
 * Contracts may import only `effect` (§3.1), so domain brands are re-declared
 * as plain wire shapes here — the `User.ts` `userId: Schema.UUID` precedent.
 * The projection layer (`packages/application`) is where branded domain
 * values become these shapes.
 */

export const Uuid = Schema.UUID
export type Uuid = typeof Uuid.Type

const WIRE_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"] as const
const WIRE_SUITS = ["S", "H", "D", "C"] as const

export const Rank = Schema.Literal(...WIRE_RANKS)
export type Rank = typeof Rank.Type

/**
 * A card slug on the wire: rank × suit as a template literal (`"AS"`, `"TH"`,
 * `"KD"`), matching the domain's fixed-width poker form — precise without
 * duplicating the domain's 52-literal branded union.
 *
 * A slug appearing in any wire schema is an entitlement decision: the
 * recipient may see that card (§5). Schemas that must not carry a value
 * simply have no such field.
 */
export const CardSlug = Schema.TemplateLiteral(
  Schema.Literal(...WIRE_RANKS),
  Schema.Literal(...WIRE_SUITS),
)
export type CardSlug = typeof CardSlug.Type

/** The power-carrying ranks (§1.4), for the `PowerFizzled` event. */
export const PowerKind = Schema.Literal("7", "8", "9", "T", "J", "Q")
export type PowerKind = typeof PowerKind.Type

/** Stable slot position — holes never shift (§4.3). */
export const SlotIndex = Schema.Int.pipe(Schema.nonNegative())
export type SlotIndex = typeof SlotIndex.Type

/** A reference to one card by the slot it occupies. Target identity is data, not issuer identity. */
export const SlotRef = Schema.Struct({
  playerId: Uuid,
  slotIndex: SlotIndex,
})
export type SlotRef = typeof SlotRef.Type

/**
 * A public display name on the wire (CAM-17): trimmed, then 1–32 chars — the
 * one rule for every name-carrying field (`CreateUserRequest`, `SessionUser`,
 * `ViewPlayer`, `LobbyMember`). A vanished (soft-deleted) user projects as
 * the literal `"—"`, which decodes under this schema.
 */
export const DisplayName = Schema.Trim.pipe(Schema.minLength(1), Schema.maxLength(32))
export type DisplayName = typeof DisplayName.Type

/** Absolute epoch milliseconds — timers are never the authority (§6). */
export const Timestamp = Schema.Int
export type Timestamp = typeof Timestamp.Type

/** Optimistic-concurrency version of a game (§4.3), for client staleness checks. */
export const GameVersion = Schema.Int.pipe(Schema.nonNegative())
export type GameVersion = typeof GameVersion.Type

/**
 * The game's fixed config on the wire (CAM-17 C4): one shape for the
 * `GameStarted` event and `PlayerGameView.config`. Positive, matching the
 * domain's `GameConfig` — a zero or negative slam window is not a game.
 */
export const WireGameConfig = Schema.Struct({
  slamWindowMs: Schema.Int.pipe(Schema.positive()),
})
export type WireGameConfig = typeof WireGameConfig.Type
