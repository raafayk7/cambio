import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Route } from "../src/routes/game.$gameId.js"

/**
 * R6 — the placeholder game route renders a registered-components holding
 * state, not a 404. The component takes no props and reads no params, so
 * it renders bare; the route's existence in the tree is pinned by the
 * generated routeTree (regenerated at build) and the R2/R5 navigation
 * tests that land on it.
 */

describe("game placeholder (R6)", () => {
  it("renders the holding state — shell, loading object, flavor caption", () => {
    const GameHoldingPage = Route.options.component
    if (GameHoldingPage === undefined) throw new Error("game route has no component")
    render(<GameHoldingPage />)

    // The shell header + the Loading role, with loading.md's flavor caption.
    expect(screen.getByText("Cambio")).toBeInTheDocument()
    expect(screen.getByRole("status", { name: "Connected" })).toBeInTheDocument()
    expect(screen.getByText("shuffling…")).toBeInTheDocument()
  })
})
