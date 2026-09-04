import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { PlayingCard } from "../src/components/game/playing-card.js"

/**
 * playing-card.md + root plan F3.2/F3.3/F3.4, test-first.
 *
 * Entitlement is structural: the face-down variant carries no card value
 * (the prop union has no card field on face:"down" — mirroring the wire,
 * where unentitled payloads simply lack the field), and a card that
 * finished peeking is indistinguishable from one that never peeked.
 */
describe("PlayingCard", () => {
  it("face-down renders a back: no rank, no suit, no value anywhere in the DOM", () => {
    const { container } = render(<PlayingCard face="down" />)
    expect(container.textContent).toBe("")
    expect(container.querySelector("[data-face]")).toHaveAttribute("data-face", "down")
  })

  it("face-up renders rank and suit from the slug; T displays as 10", () => {
    render(<PlayingCard face="up" card="TH" />)
    expect(screen.getByText("10")).toBeInTheDocument()
    expect(screen.getByText("♥")).toBeInTheDocument()
  })

  it("hearts/diamonds pip red, spades/clubs ink", () => {
    const red = render(<PlayingCard face="up" card="KD" />)
    expect(red.getByText("♦")).toHaveClass("text-accent-suit-red")
    red.unmount()
    const black = render(<PlayingCard face="up" card="AS" />)
    expect(black.getByText("♠")).toHaveClass("text-ink-primary")
  })

  it("all seven floor states are reachable and marked", () => {
    const { container, rerender } = render(<PlayingCard face="down" />)
    const stateOf = () => container.querySelector("[data-face]")

    expect(stateOf()).toHaveAttribute("data-face", "down")
    rerender(<PlayingCard face="up" card="AS" />)
    expect(stateOf()).toHaveAttribute("data-face", "up")
    rerender(<PlayingCard face="peeking" card="AS" />)
    expect(stateOf()).toHaveAttribute("data-face", "peeking")
    rerender(<PlayingCard face="down" selected />)
    expect(stateOf()).toHaveAttribute("data-selected", "true")
    rerender(<PlayingCard face="down" slamEligible />)
    expect(stateOf()).toHaveAttribute("data-slam-eligible", "true")
    rerender(<PlayingCard face="down" inFlight />)
    expect(stateOf()).toHaveAttribute("data-in-flight", "true")
    rerender(<PlayingCard face="up" card="AS" leavingPlay />)
    expect(stateOf()).toHaveAttribute("data-leaving-play", "true")
  })

  it("memory fidelity: after a peek ends the DOM equals a never-peeked back", () => {
    const peeked = render(<PlayingCard face="peeking" card="7C" />)
    peeked.rerender(<PlayingCard face="down" />)
    const never = render(<PlayingCard face="down" />)
    expect(peeked.container.innerHTML).toBe(never.container.innerHTML)
  })
})
