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

/** held-card.md r2 (root plan F3, CAM-30 D5): the optional power-hint
 * second line — instruction copy about the current obligation, never an
 * affordance (r1's rule still stands, see the doc's Revisions entry). */
describe("HeldCard hint (r2, F3)", () => {
  it("renders the hint as a second line beneath the label when supplied", () => {
    render(<HeldCard card="7H" label="You drew" hint="Peek at one of your own cards" />)
    expect(screen.getByText("You drew")).toBeInTheDocument()
    expect(screen.getByText("Peek at one of your own cards")).toBeInTheDocument()
  })

  it("renders no second line when the hint is absent", () => {
    render(<HeldCard card="7H" label="You drew" />)
    expect(screen.getByText("You drew")).toBeInTheDocument()
    expect(screen.getByText("You drew").parentElement?.children).toHaveLength(2)
  })
})
