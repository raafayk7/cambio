import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { AppShell } from "../src/components/app-shell.js"

/**
 * app-shell.md (r2) — S2 structural fix (CAM-17 root plan): the game
 * state renders absolutely-positioned floating controls, so the shell
 * root must be their positioned ancestor. Before the fix they anchored
 * to whatever ancestor happened to be positioned (the gallery carried a
 * compensating wrapper).
 */
describe("AppShell positioning", () => {
  it("the shell root is a positioned ancestor for the game state's floating controls", () => {
    const { container } = render(
      <AppShell state="game" scene="paving">
        <div>table</div>
      </AppShell>,
    )
    const root = container.firstElementChild
    expect(root).not.toBeNull()
    expect(root?.className).toContain("relative")
  })

  it("the game state renders the floating connection + settings controls", () => {
    const { getByLabelText } = render(
      <AppShell state="game" connection="reconnecting" onSettings={() => {}}>
        <div>table</div>
      </AppShell>,
    )
    expect(getByLabelText("Reconnecting")).toBeInTheDocument()
    expect(getByLabelText("Settings")).toBeInTheDocument()
  })

  it("the settings control renders only when a handler exists (never an inert affordance)", () => {
    const { queryByLabelText } = render(
      <AppShell>
        <div>screen</div>
      </AppShell>,
    )
    expect(queryByLabelText("Settings")).not.toBeInTheDocument()
  })
})

/**
 * app-shell.md (r3) — S1: `state` (chrome) and `connection` (reconnecting)
 * are orthogonal axes. The game chrome must be able to render the
 * reconnecting treatment; the default chrome's existing banner behavior
 * must be unaffected by the split.
 */
describe("AppShell orthogonal reconnecting (r3, S1)", () => {
  it("renders the game chrome and the reconnecting treatment together", () => {
    render(
      <AppShell state="game" scene="paving" connection="reconnecting">
        <div>table</div>
      </AppShell>,
    )
    // Game chrome: floating controls still present.
    expect(screen.getByLabelText("Reconnecting")).toBeInTheDocument()
    // Reconnecting treatment: the Alert reconnecting variant, composed
    // from the same copy as the default chrome's banner — no second
    // visual vocabulary.
    expect(screen.getByText("Reconnecting…")).toBeInTheDocument()
    expect(screen.getByText("table")).toBeInTheDocument()
  })

  it("does not render the reconnecting banner in game chrome when connected", () => {
    render(
      <AppShell state="game" scene="paving" connection="connected">
        <div>table</div>
      </AppShell>,
    )
    expect(screen.queryByText("Reconnecting…")).not.toBeInTheDocument()
  })

  it("leaves the default chrome's reconnecting banner unchanged", () => {
    render(
      <AppShell connection="reconnecting">
        <div>screen</div>
      </AppShell>,
    )
    expect(screen.getByText("Reconnecting…")).toBeInTheDocument()
    expect(screen.getByText("Cambio")).toBeInTheDocument()
    expect(screen.getByText("screen")).toBeInTheDocument()
  })

  it("renders no reconnecting banner on the default chrome when connected", () => {
    render(
      <AppShell>
        <div>screen</div>
      </AppShell>,
    )
    expect(screen.queryByText("Reconnecting…")).not.toBeInTheDocument()
  })
})

/**
 * app-shell.md (r3) — S2: the connection dot is shape-redundant, not
 * color-only. Structural assertion per ADR-0030 (jsdom sees attributes
 * and classes, never pixels) — the rendered ink/size is verified by the
 * design-gate's rendered path.
 */
describe("ConnectionDot shape redundancy (r3, S2)", () => {
  it("marks the connected dot with the connected attribute and a filled-disc class, no ring border", () => {
    const { getByLabelText } = render(
      <AppShell connection="connected">
        <div>screen</div>
      </AppShell>,
    )
    const dot = getByLabelText("Connected")
    expect(dot).toHaveAttribute("data-connection", "connected")
    expect(dot.className).toContain("bg-accent-action")
    expect(dot.className).not.toContain("border-2")
  })

  it("marks the reconnecting dot with the reconnecting attribute and a hollow-ring border, no fill", () => {
    const { getByLabelText } = render(
      <AppShell connection="reconnecting">
        <div>screen</div>
      </AppShell>,
    )
    const dot = getByLabelText("Reconnecting")
    expect(dot).toHaveAttribute("data-connection", "reconnecting")
    expect(dot.className).toContain("border-2")
    expect(dot.className).not.toContain("bg-accent-action")
  })
})
