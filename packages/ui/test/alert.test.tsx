import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Alert } from "../src/components/alert.js"
import { Button } from "../src/components/button.js"

/**
 * alert.md (r2) — the action slot on a dark ground (CAM-17 review F14a).
 * Structural pin only, per ADR-0030 (no class-name styling assertions):
 * this asserts the alarm alert renders its action node; the ink itself
 * (inverse on alarm/success) is verified by the design-gate rendered
 * path, not by asserting classes here.
 */
describe("Alert action slot", () => {
  it("renders the action node inside an alarm alert", () => {
    render(
      <Alert variant="alarm" action={<Button variant="ghost">Try again</Button>}>
        Couldn't reach the room.
      </Alert>,
    )

    const alert = screen.getByRole("alert")
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeInTheDocument()
  })
})
