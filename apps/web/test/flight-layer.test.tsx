import { act, render, renderHook } from "@testing-library/react"
import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FLIGHT_ANCHOR_ATTRIBUTE } from "../src/components/game/flight/anchors.js"
import { FlightLayer, useFlights } from "../src/components/game/flight/flight-layer.js"
import type { FlightOutcome, FlightRect, FlightSpec } from "../src/components/game/flight/flip.js"

/**
 * flight/flight-layer.tsx — root plan G2, ADR-0034/0030. jsdom asserts
 * STRUCTURE only: which nodes render, never a card's pixels in motion.
 * `measure` is injected with realistic rects so flights aren't cancelled
 * as degenerate — the default `getBoundingClientRect` (all-zero in jsdom)
 * is exercised by the "missing anchor" / degenerate-rect test instead.
 */
function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  mockMatchMedia(false)
})

const fakeMeasure = (element: Element): FlightRect => {
  const id = element.getAttribute(FLIGHT_ANCHOR_ATTRIBUTE)
  if (id === "deck") return { top: 0, left: 0, width: 60, height: 84 }
  if (id === "discard") return { top: 0, left: 240, width: 40, height: 56 }
  return { top: 0, left: 0, width: 0, height: 0 }
}

function Harness({
  specs,
  onSettle,
  measure,
  withDiscardAnchor = true,
}: {
  specs: ReadonlyArray<FlightSpec>
  onSettle: (id: string, outcome: FlightOutcome) => void
  measure?: (element: Element) => FlightRect
  withDiscardAnchor?: boolean
}) {
  const [root, setRoot] = React.useState<HTMLElement | null>(null)
  return (
    <div ref={setRoot} style={{ position: "relative" }}>
      <div data-flight-anchor="deck" />
      {withDiscardAnchor ? <div data-flight-anchor="discard" /> : null}
      <FlightLayer
        root={root}
        active={specs}
        onSettle={onSettle}
        {...(measure !== undefined ? { measure } : {})}
      />
    </div>
  )
}

const valueFreeSpec: FlightSpec = {
  id: "f1",
  face: { face: "down" },
  originId: "deck",
  destinationId: "discard",
}

const entitledSpec: FlightSpec = {
  id: "f2",
  face: { face: "up", card: "AS" },
  originId: "deck",
  destinationId: "discard",
}

describe("FlightLayer", () => {
  it("renders a card back for a value-free flight spec", () => {
    const { container } = render(
      <Harness specs={[valueFreeSpec]} onSettle={vi.fn()} measure={fakeMeasure} />,
    )
    const card = container.querySelector("[data-face]")
    expect(card).toHaveAttribute("data-face", "down")
    expect(card).toHaveAttribute("data-in-flight", "true")
    expect(card?.textContent).toBe("")
  })

  it("renders the entitled face for a value-carrying flight spec", () => {
    const { container } = render(
      <Harness specs={[entitledSpec]} onSettle={vi.fn()} measure={fakeMeasure} />,
    )
    const card = container.querySelector("[data-face]")
    expect(card).toHaveAttribute("data-face", "up")
    expect(card?.textContent).toContain("♠")
  })

  it("reduced motion renders origin/destination highlights, never a moving card", () => {
    mockMatchMedia(true)
    const { container } = render(
      <Harness specs={[valueFreeSpec]} onSettle={vi.fn()} measure={fakeMeasure} />,
    )
    const highlights = container.querySelectorAll("[data-flight-highlight]")
    expect(highlights).toHaveLength(2)
    expect(container.querySelector("[data-face]")).toBeNull()
  })

  it("a flight whose destination anchor never mounted cancels: nothing renders, onSettle fires", () => {
    const onSettle = vi.fn()
    const { container } = render(
      <Harness
        specs={[valueFreeSpec]}
        onSettle={onSettle}
        measure={fakeMeasure}
        withDiscardAnchor={false}
      />,
    )
    expect(container.querySelector("[data-face]")).toBeNull()
    expect(container.querySelector("[data-flight-highlight]")).toBeNull()
    expect(onSettle).toHaveBeenCalledWith("f1", "cancelled")
  })

  it("a degenerate rect (jsdom's default getBoundingClientRect) also cancels rather than rendering NaN", () => {
    const onSettle = vi.fn()
    // No `measure` override: the default getBoundingClientRect is all-zero
    // in jsdom, exactly the degenerate case flip.ts guards against.
    const { container } = render(<Harness specs={[valueFreeSpec]} onSettle={onSettle} />)
    expect(container.querySelector("[data-face]")).toBeNull()
    expect(onSettle).toHaveBeenCalledWith("f1", "cancelled")
  })

  it("unmounting the layer clears it from the DOM", () => {
    const { container, unmount } = render(
      <Harness specs={[valueFreeSpec]} onSettle={vi.fn()} measure={fakeMeasure} />,
    )
    expect(container.querySelector("[data-face]")).not.toBeNull()
    unmount()
    expect(container.querySelector("[data-face]")).toBeNull()
  })
})

describe("useFlights", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("enqueue adds a flight to active", () => {
    const { result } = renderHook(() => useFlights())
    act(() => result.current.enqueue(valueFreeSpec))
    expect(result.current.active).toEqual([valueFreeSpec])
  })

  it("settle fires the flight's onDone and removes it from active", () => {
    const onDone = vi.fn()
    const { result } = renderHook(() => useFlights())
    act(() => result.current.enqueue({ ...valueFreeSpec, onDone }))
    act(() => result.current.settle(valueFreeSpec.id, "completed"))
    expect(onDone).toHaveBeenCalledWith("completed")
    expect(result.current.active).toEqual([])
  })

  it("settling an id that isn't active is a no-op", () => {
    const { result } = renderHook(() => useFlights())
    act(() => result.current.settle("unknown", "cancelled"))
    expect(result.current.active).toEqual([])
  })

  it("cancelAll fires onDone for every active flight and clears them", () => {
    const first = vi.fn()
    const second = vi.fn()
    const { result } = renderHook(() => useFlights())
    act(() => {
      result.current.enqueue({ ...valueFreeSpec, id: "a", onDone: first })
      result.current.enqueue({ ...valueFreeSpec, id: "b", onDone: second })
    })
    act(() => result.current.cancelAll())
    expect(first).toHaveBeenCalledWith("cancelled")
    expect(second).toHaveBeenCalledWith("cancelled")
    expect(result.current.active).toEqual([])
  })

  it("unmount cancels every active flight (a flight never outlives its owner)", () => {
    const onDone = vi.fn()
    const { result, unmount } = renderHook(() => useFlights())
    act(() => result.current.enqueue({ ...valueFreeSpec, onDone }))
    unmount()
    expect(onDone).toHaveBeenCalledWith("cancelled")
  })
})
