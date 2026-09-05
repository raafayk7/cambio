import { render } from "@testing-library/react"
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
