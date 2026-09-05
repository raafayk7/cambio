/**
 * anchors.ts — the flight anchor registry (ADR-0034, root plan G2).
 *
 * A flight travels between two stable DOM locations: the deck, the
 * discard pile's public top, or a seated player's hand slot. Anchors are
 * found by a plain data attribute rather than refs threaded through every
 * game object (table-surface → hand → draw-deck → discard-pile) — any
 * component opts in by adding one attribute, and `flight-layer.tsx`
 * measures whatever it finds without knowing which component it came
 * from.
 */

/** The attribute a flight anchor exposes itself under. */
export const FLIGHT_ANCHOR_ATTRIBUTE = "data-flight-anchor"

/**
 * The anchor id vocabulary: the deck, the discard pile, and one id per
 * occupied hand slot. Slot ids are built from the wire's own identifiers
 * (player id + slot index) — never a generated key — so the same slot
 * resolves to the same anchor id across re-renders and across snapshots.
 */
export type AnchorId = "deck" | "discard" | `slot:${string}:${number}`

/** The per-slot anchor id. */
export function slotAnchorId(playerId: string, slotIndex: number): AnchorId {
  return `slot:${playerId}:${slotIndex}`
}

/**
 * Finds the anchor element for `id` inside `root` (the table root in
 * production; a test fixture standing in for it in jsdom). Returns `null`
 * when the anchor isn't mounted — an unmounted destination is exactly the
 * interruption case `flip.ts`'s `FlightSpec` exists to let the flight
 * layer cancel gracefully, never retarget.
 */
export function findAnchor(root: ParentNode, id: AnchorId): Element | null {
  return root.querySelector(`[${FLIGHT_ANCHOR_ATTRIBUTE}="${id}"]`)
}
