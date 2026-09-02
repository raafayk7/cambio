import { expect } from "@effect/vitest"
import { ALL_CARD_SLUGS, type GameEvent, type GameState, type UserId } from "@cambio/domain"

/**
 * API-side no-leak toolkit (root C6.1, C1.5) — the twin of
 * `packages/application/test/support/leaks.ts` (cross-package test imports
 * don't exist; 30 duplicated lines beat a new package). Computes the exact
 * slug set a viewer is entitled to under C2 from full server truth, then
 * scans HTTP reply bodies for violations: whole-string slug matches outside
 * the set, or any of the forbidden keys (`deck`, `prng`, `seed`) at any
 * depth.
 */

const SLUG_SET: ReadonlySet<string> = new Set(ALL_CARD_SLUGS)

const FORBIDDEN_KEYS = ["deck", "prng", "seed"] as const

export const entitledSlugs = (state: GameState, viewerId: UserId): ReadonlySet<string> => {
  const entitled = new Set<string>(state.discard)
  const phase = state.phase
  switch (phase._tag) {
    case "HoldingCard":
      if (phase.playerId === viewerId || phase.source === "discard") entitled.add(phase.card)
      break
    case "ResolvingPower":
    case "ResolvingQueenSwap":
      if (phase.playerId === viewerId) entitled.add(phase.card)
      break
    case "Ended":
      for (const p of state.players) for (const s of p.hand) entitled.add(s.card)
      break
    case "AwaitingDraw":
    case "SlamWindow":
      break
    default:
      phase satisfies never
  }
  return entitled
}

/**
 * The card values the RULES make public in an event batch: face-up discards
 * and the §1.5 slam reveal. This is the single whitelist the room-stream
 * leak scans compare against (CAM-7 review F7 centralized it here) — typed
 * over the real `GameEvent` union so a renamed field is a compile error,
 * not a silently-empty scan. `PenaltyDrawn` and the give events are
 * deliberately absent (ADR-0009/0022: those values are never public).
 */
export const rulePublicSlugs = (events: ReadonlyArray<GameEvent>): ReadonlySet<string> => {
  const publicSlugs = new Set<string>()
  for (const event of events) {
    switch (event._tag) {
      case "GameStarted":
        publicSlugs.add(event.firstDiscard)
        break
      case "DiscardTaken":
      case "HeldDiscarded":
      case "PowerDiscarded":
      case "SlamSucceeded":
      case "SlamFailed":
        publicSlugs.add(event.card)
        break
      case "HeldSwapped":
        publicSlugs.add(event.discarded)
        break
      default:
        break
    }
  }
  return publicSlugs
}

const walk = (value: unknown, strings: Array<string>, keys: Array<string>): void => {
  if (typeof value === "string") {
    strings.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) walk(item, strings, keys)
    return
  }
  if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      keys.push(k)
      walk(v, strings, keys)
    }
  }
}

/** Every card slug appearing anywhere in the payload, as whole string values. */
export const slugsIn = (payload: unknown): ReadonlyArray<string> => {
  const strings: Array<string> = []
  walk(payload, strings, [])
  return strings.filter((s) => SLUG_SET.has(s))
}

export const expectNoLeak = (
  payload: unknown,
  entitled: ReadonlySet<string>,
  label: string,
): void => {
  const strings: Array<string> = []
  const keys: Array<string> = []
  walk(payload, strings, keys)
  const leaked = strings.filter((s) => SLUG_SET.has(s) && !entitled.has(s))
  expect(leaked, `${label}: leaked card values`).toEqual([])
  const forbidden = keys.filter((k) => (FORBIDDEN_KEYS as ReadonlyArray<string>).includes(k))
  expect(forbidden, `${label}: forbidden keys present`).toEqual([])
}
