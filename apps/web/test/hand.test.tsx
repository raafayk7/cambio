import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { Hand } from "../src/components/game/hand.js"

/**
 * hand.md + root plan F3.7, test-first: occupancy-only slot grids —
 * holes stay holes at exactly the given indices, indices are stable, no
 * reflow on removal.
 */
const cellsOf = (container: HTMLElement) => [...container.querySelectorAll("[data-slot-index]")]

describe("Hand", () => {
  it("renders vacancies at exactly the missing indices, in index order", () => {
    const { container } = render(<Hand variant="own" playerId="p1" slots={[0, 2, 5]} />)
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

  it("keeps the minimum footprint: a single card still shows four slots in one row (hand.md r3)", () => {
    const { container } = render(<Hand variant="own" playerId="p1" slots={[0]} />)
    expect(cellsOf(container)).toHaveLength(4)
    const grid = container.querySelector('[data-variant="own"]')
    expect(grid?.children).toHaveLength(4)
    expect(grid?.className).toContain("grid-cols-4")
  })

  it("renders a 4-card deal as one straight row of four, never padded to a second row", () => {
    const { container } = render(<Hand variant="own" playerId="p1" slots={[0, 1, 2, 3]} />)
    const grid = container.querySelector('[data-variant="own"]')
    expect(grid?.children).toHaveLength(4)
    expect(grid?.className).toContain("grid-cols-4")
  })

  it("keeps a single row up to six cards, without padding to a second row", () => {
    const { container } = render(<Hand variant="own" playerId="p1" slots={[0, 1, 2, 3, 4, 5]} />)
    const cells = cellsOf(container)
    expect(cells).toHaveLength(6)
    const grid = container.querySelector('[data-variant="own"]')
    expect(grid?.children).toHaveLength(6)
    expect(grid?.className).toContain("grid-cols-6")
  })

  it("pads a hand exceeding one row up to a full 6-wide grid, with invisible fillers beyond the highest signal", () => {
    const { container } = render(<Hand variant="own" playerId="p1" slots={[0, 1, 2, 3, 4, 5, 6]} />)
    const cells = cellsOf(container)
    expect(cells).toHaveLength(7)
    const grid = container.querySelector('[data-variant="own"]')
    expect(grid?.children).toHaveLength(12)
    expect(grid?.className).toContain("grid-cols-6")
  })

  it("tolerates a third row: 13 cards pad to 18 slots (6×3)", () => {
    const slots = Array.from({ length: 13 }, (_, index) => index as never)
    const { container } = render(<Hand variant="own" playerId="p1" slots={slots} />)
    const cells = cellsOf(container)
    expect(cells).toHaveLength(13)
    const grid = container.querySelector('[data-variant="own"]')
    expect(grid?.children).toHaveLength(18)
  })

  it("never caps or truncates hand data: a 19-card hand still renders every real slot (root plan clause 7)", () => {
    const slots = Array.from({ length: 19 }, (_, index) => index as never)
    const { container } = render(<Hand variant="own" playerId="p1" slots={slots} />)
    expect(cellsOf(container)).toHaveLength(19)
  })

  it("removal keeps the slot: dropping index 1 leaves its outline in place", () => {
    const { container, rerender } = render(
      <Hand variant="own" playerId="p1" slots={[0, 1, 2, 3]} />,
    )
    rerender(<Hand variant="own" playerId="p1" slots={[0, 2, 3]} />)
    const cells = cellsOf(container)
    expect(cells).toHaveLength(4)
    expect(cells[1]).toHaveAttribute("data-occupied", "false")
    expect(cells[2]).toHaveAttribute("data-occupied", "true")
  })

  it("zero cards renders the all-dashed grid, not an absence", () => {
    const { container } = render(<Hand variant="own" playerId="p1" slots={[]} />)
    const cells = cellsOf(container)
    expect(cells).toHaveLength(4)
    expect(cells.every((cell) => cell.getAttribute("data-occupied") === "false")).toBe(true)
  })

  it("renders faces only for slots given a card value", () => {
    const { container } = render(
      <Hand variant="own" playerId="p1" slots={[0, 1]} faces={[{ slotIndex: 1, card: "KD" }]} />,
    )
    const cells = cellsOf(container)
    expect(cells[0]?.textContent).toBe("")
    expect(cells[1]?.textContent).toContain("♦")
  })

  it("growing: the in-flight slot renders a face-down card in flight, value-free (R1)", () => {
    const { container } = render(
      <Hand variant="own" playerId="p1" slots={[0, 1]} inFlightSlot={2} />,
    )
    const cells = cellsOf(container)
    expect(cells).toHaveLength(4)
    const arriving = cells[2]?.querySelector("[data-face]")
    expect(arriving).toHaveAttribute("data-face", "down")
    expect(arriving).toHaveAttribute("data-in-flight", "true")
    expect(cells[2]?.textContent).toBe("")
  })

  it("shrinking: the leaving slot renders the publicly revealed card departing (R1)", () => {
    const { container } = render(
      <Hand variant="own" playerId="p1" slots={[0, 2]} leaving={{ slotIndex: 1, card: "9H" }} />,
    )
    const cells = cellsOf(container)
    const departing = cells[1]?.querySelector("[data-face]")
    expect(departing).toHaveAttribute("data-face", "up")
    expect(departing).toHaveAttribute("data-leaving-play", "true")
    expect(cells[1]?.textContent).toContain("♥")
    // Untouched slots keep their backs.
    expect(cells[0]?.querySelector("[data-face]")).toHaveAttribute("data-face", "down")
  })

  it("marks an anchor id on every slot, occupied or not (CAM-18 G2/T2)", () => {
    const { container } = render(<Hand variant="own" playerId="nadia" slots={[0, 2]} />)
    expect(container.querySelector('[data-slot-index="0"]')).toHaveAttribute(
      "data-flight-anchor",
      "slot:nadia:0",
    )
    expect(container.querySelector('[data-slot-index="1"]')).toHaveAttribute(
      "data-flight-anchor",
      "slot:nadia:1",
    )
  })

  it("selectedSlots renders `selected` on exactly those occupied slots (CAM-18 T3)", () => {
    const { container } = render(
      <Hand variant="own" playerId="p1" slots={[0, 1]} selectedSlots={[1]} />,
    )
    const cells = cellsOf(container)
    expect(cells[0]?.querySelector("[data-face]")).not.toHaveAttribute("data-selected")
    expect(cells[1]?.querySelector("[data-face]")).toHaveAttribute("data-selected", "true")
  })

  it("empty slots are inert by default and only become clickable with emptySlotsClickable (CAM-18 T2, step-13 give-target)", () => {
    const onSlotClick = vi.fn()
    const { container, rerender } = render(
      <Hand variant="own" playerId="p1" slots={[0]} onSlotClick={onSlotClick} />,
    )
    expect(container.querySelector('[data-slot-index="1"] button')).toBeNull()

    rerender(
      <Hand
        variant="own"
        playerId="p1"
        slots={[0]}
        onSlotClick={onSlotClick}
        emptySlotsClickable
      />,
    )
    const emptySlotButton = container.querySelector('[data-slot-index="1"] button')
    expect(emptySlotButton).not.toBeNull()
    emptySlotButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(onSlotClick).toHaveBeenCalledWith(1)
  })

  describe("rotate (r3, ADR-0036 §5 — side-bench opponents, regular breakpoint only)", () => {
    it("flows column-major instead of row-major once rotated, at regular only", () => {
      const { container } = render(
        <Hand variant="opponent" playerId="p1" slots={[0, 1, 2, 3]} rotate="left" />,
      )
      const grid = container.querySelector('[data-variant="opponent"]')
      // The base (compact) layout is the plain row-major grid-cols-4 —
      // rotation only overrides it at `regular:` (M6 rendered-pass fix: an
      // earlier unprefixed version leaked a 3-column rotated grid into
      // compact and broke the fold at 3–4 players).
      expect(grid?.className).toContain("grid-cols-4")
      expect(grid?.className).toContain("regular:grid-cols-none")
      expect(grid?.className).toContain("regular:grid-flow-col")
      expect(grid?.className).toContain("regular:grid-rows-4")
    })

    it("rotates the card visual, never the slot anchor (ADR-0035/0036 no-transform-above-anchor rule)", () => {
      const { container } = render(
        <Hand variant="opponent" playerId="p1" slots={[0]} rotate="left" />,
      )
      const anchor = container.querySelector('[data-slot-index="0"]')
      expect(anchor?.className ?? "").not.toMatch(/rotate-/)
      const visual = anchor?.querySelector("[data-face]")
      expect(visual).toHaveClass("regular:-rotate-90")
    })

    it("rotates the opposite way for a right-bench opponent", () => {
      const { container } = render(
        <Hand variant="opponent" playerId="p1" slots={[0]} rotate="right" />,
      )
      const visual = container.querySelector('[data-slot-index="0"] [data-face]')
      expect(visual).toHaveClass("regular:rotate-90")
    })

    it("rotates an empty (vacancy) slot's dashed outline the same way as an occupied one", () => {
      const { container } = render(
        <Hand variant="opponent" playerId="p1" slots={[]} rotate="left" />,
      )
      const vacancy = container.querySelector('[data-slot-index="0"] span')
      expect(vacancy).toHaveClass("regular:-rotate-90")
    })

    it("omits rotation entirely for top/bottom benches (no rotate prop)", () => {
      const { container } = render(<Hand variant="own" playerId="p1" slots={[0]} />)
      const grid = container.querySelector('[data-variant="own"]')
      expect(grid?.className).not.toContain("grid-flow-col")
      const visual = container.querySelector('[data-slot-index="0"] [data-face]')
      expect(visual?.className ?? "").not.toMatch(/rotate-/)
    })
  })
})
