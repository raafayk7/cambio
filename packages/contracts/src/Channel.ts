import { Schema } from "effect"

/**
 * Realtime channel grants (CAM-6, ADR-0023): the topics one caller may
 * subscribe to. Topics are capabilities — each embeds an unguessable secret
 * derived server-side, and knowing the topic is the authorization.
 *
 * `playerTopic` is the caller's own private channel. Another player's
 * private topic must never appear in any response a caller receives —
 * that is the adversarial test for this shape (root plan C4.4).
 */
export const ChannelGrants = Schema.Struct({
  /** The game's public room channel — every participant receives the same grant. */
  roomTopic: Schema.String,
  /** The caller's own private channel. */
  playerTopic: Schema.String,
})
export type ChannelGrants = typeof ChannelGrants.Type

export const decodeChannelGrants = Schema.decodeUnknownSync(ChannelGrants)
export const encodeChannelGrants = Schema.encodeSync(ChannelGrants)
