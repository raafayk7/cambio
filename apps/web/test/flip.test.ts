import { describe, expect, it } from "vitest"

import { cssTransform, planFlight } from "../src/components/game/flight/flip.js"
import type { FlightRect } from "../src/components/game/flight/flip.js"

/**
 * flight/flip.ts — root plan G2, ADR-0034: the pure FLIP planner. Unit
 * tests on plain rect literals only, per the seat-arc/table-geometry
 * precedent (jsdom measures no layout — ADR-0030).
 */
const rect = (partial: Partial<FlightRect>): FlightRect => ({
  top: 0,
  left: 0,
  width: 100,
  height: 140,
  ...partial,
})

describe("planFlight", () => {
  it("plans an identity start transform: the box renders exactly like the origin", () => {
    const plan = planFlight(rect({ top: 10, left: 20 }), rect({ top: 200, left: 300 }))
    expect(plan.box).toEqual(rect({ top: 10, left: 20 }))
    expect(plan.start).toEqual({ translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 })
  })

  it("computes the end transform as the corner delta and the size ratio", () => {
    const origin = rect({ top: 100, left: 50, width: 100, height: 140 })
    const destination = rect({ top: 260, left: 150, width: 60, height: 84 })
    const plan = planFlight(origin, destination)
    expect(plan.end.translateX).toBeCloseTo(100) // 150 - 50
    expect(plan.end.translateY).toBeCloseTo(160) // 260 - 100
    expect(plan.end.scaleX).toBeCloseTo(0.6) // 60 / 100
    expect(plan.end.scaleY).toBeCloseTo(0.6) // 84 / 140
    expect(plan.cancelled).toBe(false)
  })

  it("a same-size flight (deck to a hand slot of the same card footprint) scales by 1", () => {
    const plan = planFlight(rect({ top: 0, left: 0 }), rect({ top: 0, left: 400 }))
    expect(plan.end.scaleX).toBe(1)
    expect(plan.end.scaleY).toBe(1)
    expect(plan.end.translateX).toBe(400)
    expect(plan.end.translateY).toBe(0)
  })

  it("a degenerate origin rect (jsdom's all-zero default) plans to a cancelled no-op, never NaN", () => {
    const plan = planFlight(rect({ width: 0, height: 0 }), rect({ top: 300, left: 400 }))
    expect(plan.cancelled).toBe(true)
    expect(plan.end).toEqual({ translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 })
    expect(Number.isNaN(plan.end.scaleX)).toBe(false)
  })

  it("a degenerate destination rect also plans to a cancelled no-op, never NaN", () => {
    const plan = planFlight(rect({ top: 10, left: 10 }), rect({ width: 0, height: 0 }))
    expect(plan.cancelled).toBe(true)
    expect(plan.end).toEqual({ translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 })
  })

  it("both rects degenerate still plans to a cancelled no-op", () => {
    const plan = planFlight(rect({ width: 0, height: 0 }), rect({ width: 0, height: 0 }))
    expect(plan.cancelled).toBe(true)
  })
})

describe("cssTransform", () => {
  it("renders a translate + scale CSS transform string", () => {
    expect(cssTransform({ translateX: 12, translateY: -4, scaleX: 0.5, scaleY: 2 })).toBe(
      "translate(12px, -4px) scale(0.5, 2)",
    )
  })

  it("renders the identity transform", () => {
    expect(cssTransform({ translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 })).toBe(
      "translate(0px, 0px) scale(1, 1)",
    )
  })
})
