import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

describe("component test wiring (ADR-0030)", () => {
  it("renders into jsdom and asserts with a jest-dom matcher", () => {
    render(<p>cambio web smoke</p>)
    expect(screen.getByText("cambio web smoke")).toBeInTheDocument()
  })
})
