import { render, screen, waitFor } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { Modal } from "../src/components/modal.js"

/**
 * modal.md (r1) — dismiss behavior is logic (root plan F2.4), pinned
 * test-first: Esc, ✕, and scrim click all close, EXCEPT destructive-
 * confirm, which closes only through explicit buttons (✕ included).
 */
describe("Modal dismiss behavior", () => {
  it("closes on Escape", async () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="Settings">
        <p>body</p>
      </Modal>,
    )
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it("closes on scrim click (click outside the panel content)", async () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="Settings">
        <p>body</p>
      </Modal>,
    )
    const dialog = screen.getByRole("dialog", { hidden: true })
    await userEvent.click(dialog)
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it("closes on the ✕ button", async () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="Settings">
        <p>body</p>
      </Modal>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Close" }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it("destructive-confirm ignores Escape and scrim; ✕ still closes", async () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} variant="confirm" title="Call Cambio — ends the game">
        <p>body</p>
      </Modal>,
    )
    await userEvent.keyboard("{Escape}")
    const dialog = screen.getByRole("dialog", { hidden: true })
    await userEvent.click(dialog)
    expect(onClose).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole("button", { name: "Close" }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it("clicking inside the panel body does not close", async () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="Settings">
        <p>body text</p>
      </Modal>,
    )
    await userEvent.click(screen.getByText("body text"))
    // The closing snap is 140ms; give a would-be close time to fire.
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(onClose).not.toHaveBeenCalled()
  })
})
