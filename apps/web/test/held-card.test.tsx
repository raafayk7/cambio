import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { HeldCard } from "../src/components/game/held-card.js"

/**
 * held-card.md r1 (CAM-18 T2): entitlement is structural, exactly like
 * `PlayingCard` — a face-down spot has no card field, never a hidden value.
 */
describe("HeldCard", () => {
  it("renders face-up with the entitled value and its label", () => {
    const { container } = render(<HeldCard card="7H" label="You drew" />)
    expect(container.querySelector('[data-face="up"]')).not.toBeNull()
    expect(screen.getByText("You drew")).toBeInTheDocument()
  })

  it("renders face-down with no card value when unentitled", () => {
    const { container } = render(<HeldCard label="Nadia is holding" />)
    const back = container.querySelector('[data-face="down"]')
    expect(back).not.toBeNull()
    expect(back?.textContent).toBe("")
    expect(screen.getByText("Nadia is holding")).toBeInTheDocument()
  })

  it("exposes the held-card flight anchor", () => {
    const { container } = render(<HeldCard label="Nadia is holding" />)
    expect(container.querySelector('[data-flight-anchor="held"]')).not.toBeNull()
  })
})
