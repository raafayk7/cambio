import { Schema } from "effect"

/**
 * Game configuration supplied at creation time (ADR-0011).
 *
 * The slam window duration must be configuration, not a literal (§9.4): no
 * default lives in the domain — supplying a value is an application-layer
 * concern, and the number is expected to change with playtesting.
 */
export const GameConfig = Schema.Struct({
  slamWindowMs: Schema.Int.pipe(Schema.positive()),
})
export type GameConfig = typeof GameConfig.Type

export const decodeGameConfig = Schema.decodeUnknownSync(GameConfig)
export const encodeGameConfig = Schema.encodeSync(GameConfig)
