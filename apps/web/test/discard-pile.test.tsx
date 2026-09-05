import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DiscardPile } from "../src/components/game/discard-pile.js"

/**
 * discard-pile.md r2 (CAM-18 T1/T2/CH1): the click affordance (accessible
 * button wrap, omitted entirely when taking isn't legal) and the
 * `receiving` settle state.
 */
describe("DiscardPile", () => {
  it("renders as static when no onClick is given", () => {
    render(<DiscardPile top="9D" />)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("wraps the top card in an accessible button when onClick is given, and fires it", () => {
    const onClick = vi.fn()
    render(<DiscardPile top="9D" onClick={onClick} />)
    fireEvent.click(screen.getByRole("button", { name: "Take the top discard" }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("exposes the pile's flight anchor in every state, including empty", () => {
    const { container, rerender } = render(<DiscardPile top="9D" />)
    expect(container.querySelector('[data-flight-anchor="discard"]')).not.toBeNull()
    rerender(<DiscardPile />)
    expect(container.querySelector('[data-flight-anchor="discard"]')).not.toBeNull()
  })

  it("renders the receiving settle state on data-state and the card's leaving-play treatment", () => {
    const { container } = render(<DiscardPile top="9D" receiving />)
    expect(container.firstChild).toHaveAttribute("data-state", "receiving")
    expect(container.querySelector('[data-face="up"]')).toHaveAttribute("data-leaving-play", "true")
  })
})
