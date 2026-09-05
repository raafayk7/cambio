import { Schema } from "effect"
import { type CardSlug, decodeCardSlug } from "../Card.js"
import { GameId, SlotIndex, Timestamp, UserId } from "../Ids.js"
import { type User } from "../UserRepository.js"

/** Deterministic test ids/values so fixtures read as data, not noise. */

export const uid = (n: number): UserId =>
  Schema.decodeUnknownSync(UserId)(`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`)

/**
 * Deterministic lobby member (CAM-17 C1). The name matches what the api
 * harness seeds for `uid(n)` (`ensureRosterUsers` in `apps/api/test/support/db.ts`),
 * so domain-built lobbies compare equal to repository-loaded ones. Names stay
 * ≥3 chars — the api leak scanner matches whole strings against card slugs.
 */
export const user = (n: number): User => ({ id: uid(n), name: `sim-player-${n}` })

export const gid = (n: number): GameId =>
  Schema.decodeUnknownSync(GameId)(`00000000-0000-4000-9000-${String(n).padStart(12, "0")}`)

export const slot = (n: number): SlotIndex => Schema.decodeUnknownSync(SlotIndex)(n)

export const ts = (n: number): Timestamp => Schema.decodeUnknownSync(Timestamp)(n)

export const card: (slug: string) => CardSlug = decodeCardSlug
