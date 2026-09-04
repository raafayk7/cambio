import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Hand } from "../src/components/game/hand.js"

/**
 * hand.md + root plan F3.7, test-first: occupancy-only slot grids —
 * holes stay holes at exactly the given indices, indices are stable, no
 * reflow on removal.
 */
const cellsOf = (container: HTMLElement) => [...container.querySelectorAll("[data-slot-index]")]

describe("Hand", () => {
  it("renders vacancies at exactly the missing indices, in index order", () => {
    const { container } = render(<Hand variant="own" slots={[0, 2, 5]} />)
    const cells = cellsOf(container)
    expect(cells).toHaveLength(6)
    expect(cells.map((cell) => cell.getAttribute("data-slot-index"))).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
    ])
    expect(cells.map((cell) => cell.getAttribute("data-occupied"))).toEqual([
      "true",
      "false",
      "true",
      "false",
      "false",
      "true",
    ])
  })

  it("keeps the 2×2 footprint minimum: a single card still shows four slots", () => {
    const { container } = render(<Hand variant="own" slots={[0]} />)
    expect(cellsOf(container)).toHaveLength(4)
  })

  it("removal keeps the slot: dropping index 1 leaves its outline in place", () => {
    const { container, rerender } = render(<Hand variant="own" slots={[0, 1, 2, 3]} />)
    rerender(<Hand variant="own" slots={[0, 2, 3]} />)
    const cells = cellsOf(container)
    expect(cells).toHaveLength(4)
    expect(cells[1]).toHaveAttribute("data-occupied", "false")
    expect(cells[2]).toHaveAttribute("data-occupied", "true")
  })

  it("zero cards renders the all-dashed grid, not an absence", () => {
    const { container } = render(<Hand variant="own" slots={[]} />)
    const cells = cellsOf(container)
    expect(cells).toHaveLength(4)
    expect(cells.every((cell) => cell.getAttribute("data-occupied") === "false")).toBe(true)
  })

  it("renders faces only for slots given a card value", () => {
    const { container } = render(
      <Hand variant="own" slots={[0, 1]} faces={[{ slotIndex: 1, card: "KD" }]} />,
    )
    const cells = cellsOf(container)
    expect(cells[0]?.textContent).toBe("")
    expect(cells[1]?.textContent).toContain("♦")
  })
})
