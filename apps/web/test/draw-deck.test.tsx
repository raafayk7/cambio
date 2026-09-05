import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DrawDeck } from "../src/components/game/draw-deck.js"

/**
 * draw-deck.md r2 (CAM-18 T1/T2/CH1): the click affordance (accessible
 * button wrap, omitted entirely when drawing isn't legal) and the
 * `reshuffling`/`draw` choreography states.
 */
describe("DrawDeck", () => {
  it("renders as a static, non-interactive stack when no onClick is given", () => {
    render(<DrawDeck count={20} />)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("wraps the stack in an accessible button when onClick is given, and fires it", () => {
    const onClick = vi.fn()
    render(<DrawDeck count={20} onClick={onClick} />)
    const button = screen.getByRole("button", { name: "Draw a card" })
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
    // The count badge keeps its own accessible label regardless of the
    // wrapping button (screen-screen.test.tsx pins this label).
    expect(screen.getByLabelText("20 cards in the draw deck")).toBeInTheDocument()
  })

  it("exposes the deck's flight anchor", () => {
    const { container } = render(<DrawDeck count={20} />)
    expect(container.querySelector('[data-flight-anchor="deck"]')).not.toBeNull()
  })

  it("renders the draw/reshuffling choreography states on data-state, independent of populated/low/empty", () => {
    const { rerender, container } = render(<DrawDeck count={20} state="draw" />)
    expect(container.firstChild).toHaveAttribute("data-state", "draw")
    rerender(<DrawDeck count={20} state="reshuffling" />)
    expect(container.firstChild).toHaveAttribute("data-state", "reshuffling")
    rerender(<DrawDeck count={20} />)
    expect(container.firstChild).toHaveAttribute("data-state", "populated")
  })
})
