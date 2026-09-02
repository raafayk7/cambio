import { expect } from "@effect/vitest"
import { ALL_CARD_SLUGS, type CardSlug, type GameState, type UserId } from "@cambio/domain"

/**
 * The adversarial no-leak toolkit (root plan C2/C3/C6): given a full
 * `GameState` and a viewer, compute the exact set of card slugs the viewer is
 * entitled to see in a snapshot under C2, then scan an arbitrary payload for
 * violations. Scanning walks the object tree and matches whole string values
 * (a slug can only ever appear as a complete JSON string value), and also
 * rejects forbidden keys outright — `deck`, `prng`, `seed` must not exist in
 * any client-bound payload, whatever their values. (`hands` is not on the
 * list: the `Ended` reveal legitimately carries revealed hands, and the slug
 * scan already catches any unentitled hand value elsewhere.)
 */

const SLUG_SET: ReadonlySet<string> = new Set(ALL_CARD_SLUGS)

const FORBIDDEN_KEYS = ["deck", "prng", "seed"] as const

/** C2's entitlement, computed independently of the projection under test. */
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

interface Walk {
  readonly strings: ReadonlyArray<string>
  readonly keys: ReadonlyArray<string>
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

const collect = (payload: unknown): Walk => {
  const strings: Array<string> = []
  const keys: Array<string> = []
  walk(payload, strings, keys)
  return { strings, keys }
}

/** Every card slug appearing anywhere in the payload, as whole string values. */
export const slugsIn = (payload: unknown): ReadonlyArray<string> =>
  collect(payload).strings.filter((s) => SLUG_SET.has(s))

/**
 * Assert the payload leaks nothing: no slug outside `entitled`, and none of
 * the forbidden keys at any depth. `label` names the payload in failures.
 */
export const expectNoLeak = (
  payload: unknown,
  entitled: ReadonlySet<string>,
  label: string,
): void => {
  const { strings, keys } = collect(payload)
  const leaked = strings.filter((s) => SLUG_SET.has(s) && !entitled.has(s))
  expect(leaked, `${label}: leaked card values`).toEqual([])
  const forbidden = keys.filter((k) => (FORBIDDEN_KEYS as ReadonlyArray<string>).includes(k))
  expect(forbidden, `${label}: forbidden keys present`).toEqual([])
}

/** Convenience: the slugs of a set difference, for targeted absence checks. */
export const withoutEntitled = (
  all: ReadonlyArray<CardSlug>,
  entitled: ReadonlySet<string>,
): ReadonlyArray<string> => all.filter((s) => !entitled.has(s))
