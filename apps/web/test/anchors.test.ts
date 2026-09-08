import { describe, expect, it } from "vitest"

import {
  FLIGHT_ANCHOR_ATTRIBUTE,
  findAnchor,
  slotAnchorId,
} from "../src/components/game/flight/anchors.js"

/**
 * flight/anchors.ts — root plan G2: the anchor id vocabulary and its DOM
 * resolver, pure enough to unit test directly against a detached fragment
 * (no render needed).
 */
describe("anchors", () => {
  it("builds a stable per-slot id from the wire's own player id and slot index", () => {
    expect(slotAnchorId("p1", 0)).toBe("slot:p1:0")
    expect(slotAnchorId("p1", 0)).toBe(slotAnchorId("p1", 0))
    expect(slotAnchorId("p1", 1)).not.toBe(slotAnchorId("p1", 0))
    expect(slotAnchorId("p2", 0)).not.toBe(slotAnchorId("p1", 0))
  })

  it("finds an anchor by its data attribute inside a root", () => {
    const root = document.createElement("div")
    const deck = document.createElement("div")
    deck.setAttribute(FLIGHT_ANCHOR_ATTRIBUTE, "deck")
    const slot = document.createElement("div")
    slot.setAttribute(FLIGHT_ANCHOR_ATTRIBUTE, slotAnchorId("p1", 2))
    root.append(deck, slot)

    expect(findAnchor(root, "deck")).toBe(deck)
    expect(findAnchor(root, slotAnchorId("p1", 2))).toBe(slot)
    expect(findAnchor(root, "discard")).toBeNull()
  })

  it("only searches inside the given root, not the whole document", () => {
    const outside = document.createElement("div")
    outside.setAttribute(FLIGHT_ANCHOR_ATTRIBUTE, "deck")
    document.body.append(outside)
    const root = document.createElement("div")

    expect(findAnchor(root, "deck")).toBeNull()
    outside.remove()
  })
})
