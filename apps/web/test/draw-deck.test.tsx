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
    // The count has no visual badge (CAM-29) — it rides the button's
    // accessible description instead, so the name still names the action
    // (game-screen.test.tsx pins the same description elsewhere).
    expect(button).toHaveAccessibleDescription("20 cards in the draw deck")
  })

  it("(CAM-29) exposes the count via role=img aria-label when there's no button to describe", () => {
    render(<DrawDeck count={20} />)
    expect(screen.getByRole("img", { name: "20 cards in the draw deck" })).toBeInTheDocument()
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

  /**
   * CAM-26 C4: the deck signals an open slam window instead of going
   * silently dead. A separate boolean (not a `state` enum member — mirrors
   * `DiscardPile.slamTarget`), presentational only: no button, no copy.
   */
  describe("slam-window state (CAM-26 C4)", () => {
    it("renders data-state='slam-window' over the populated/low/empty split", () => {
      const { container, rerender } = render(<DrawDeck count={20} slamWindow />)
      expect(container.firstChild).toHaveAttribute("data-state", "slam-window")

      rerender(<DrawDeck count={2} slamWindow />)
      expect(container.firstChild).toHaveAttribute("data-state", "slam-window")

      rerender(<DrawDeck count={0} slamWindow />)
      expect(container.firstChild).toHaveAttribute("data-state", "slam-window")
    })

    it("never resurrects the button wrap while the slam window is open, with or without onClick omitted", () => {
      render(<DrawDeck count={20} slamWindow />)
      expect(screen.queryByRole("button")).not.toBeInTheDocument()
    })

    it("choreography wins over the slam-window signal (mirrors DiscardPile's receiving-over-slam-target precedence)", () => {
      const { container, rerender } = render(<DrawDeck count={20} state="draw" slamWindow />)
      expect(container.firstChild).toHaveAttribute("data-state", "draw")
      rerender(<DrawDeck count={20} state="reshuffling" slamWindow />)
      expect(container.firstChild).toHaveAttribute("data-state", "reshuffling")
    })
  })
})
