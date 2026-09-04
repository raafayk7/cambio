import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { FieldScaffold } from "../src/components/field-scaffold.js"

/**
 * field-scaffold.md (r1) — the canonical wrapper: label association and
 * error wiring are logic (root plan F2.4), pinned here test-first.
 */
describe("FieldScaffold", () => {
  it("associates the label with the wrapped field (real htmlFor/id wiring)", () => {
    render(
      <FieldScaffold label="Player name">
        <input type="text" />
      </FieldScaffold>,
    )
    expect(screen.getByLabelText("Player name")).toBeInstanceOf(HTMLInputElement)
  })

  it("wires helper text to the field via aria-describedby", () => {
    render(
      <FieldScaffold label="Room code" helper="Ask the host for the code.">
        <input type="text" />
      </FieldScaffold>,
    )
    const input = screen.getByLabelText("Room code")
    const describedBy = input.getAttribute("aria-describedby")
    expect(describedBy).toBeTruthy()
    const message = document.getElementById(describedBy as string)
    expect(message).toHaveTextContent("Ask the host for the code.")
  })

  it("error replaces helper and sets aria-invalid + aria-describedby on the field", () => {
    render(
      <FieldScaffold
        label="Room code"
        helper="Ask the host for the code."
        error="Room code not found. Check the code and try again."
      >
        <input type="text" />
      </FieldScaffold>,
    )
    const input = screen.getByLabelText("Room code")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(screen.queryByText("Ask the host for the code.")).not.toBeInTheDocument()
    const message = document.getElementById(input.getAttribute("aria-describedby") as string)
    expect(message).toHaveTextContent("Room code not found. Check the code and try again.")
  })

  it('required renders the word "required", never an asterisk', () => {
    render(
      <FieldScaffold label="Player name" required>
        <input type="text" />
      </FieldScaffold>,
    )
    expect(screen.getByText("required")).toBeInTheDocument()
    expect(document.body.textContent).not.toContain("*")
  })

  it("keeps a caller-supplied field id instead of generating one", () => {
    render(
      <FieldScaffold label="Player name">
        <input id="player-name" type="text" />
      </FieldScaffold>,
    )
    expect(screen.getByLabelText("Player name")).toHaveAttribute("id", "player-name")
  })
})
