import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ToastStack } from "../src/components/toast.js"

/**
 * toast.md (r1) — the auto-dismiss clock is logic (root plan F6.1):
 * 4s default dwell, hover pauses the clock, max 3 stacked with the
 * oldest collapsing first.
 */
describe("ToastStack timing", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("auto-dismisses after the 4s default dwell", () => {
    const onExpire = vi.fn()
    render(
      <ToastStack
        toasts={[{ id: "a", variant: "success", message: "Link copied" }]}
        onExpire={onExpire}
      />,
    )
    vi.advanceTimersByTime(3999)
    expect(onExpire).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onExpire).toHaveBeenCalledWith("a")
  })

  it("hover pauses the clock; leaving resumes it", () => {
    const onExpire = vi.fn()
    render(<ToastStack toasts={[{ id: "a", message: "Setting saved" }]} onExpire={onExpire} />)
    vi.advanceTimersByTime(2000)
    fireEvent.mouseEnter(screen.getByTestId("toast-stack"))
    vi.advanceTimersByTime(60000)
    expect(onExpire).not.toHaveBeenCalled()
    fireEvent.mouseLeave(screen.getByTestId("toast-stack"))
    vi.advanceTimersByTime(1999)
    expect(onExpire).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onExpire).toHaveBeenCalledWith("a")
  })

  it("stacks at most 3 — the oldest collapses first, immediately", () => {
    const onExpire = vi.fn()
    render(
      <ToastStack
        toasts={[
          { id: "a", message: "one" },
          { id: "b", message: "two" },
          { id: "c", message: "three" },
          { id: "d", message: "four" },
        ]}
        onExpire={onExpire}
      />,
    )
    expect(onExpire).toHaveBeenCalledWith("a")
    expect(screen.queryByText("one")).not.toBeInTheDocument()
    expect(screen.getByText("two")).toBeInTheDocument()
    expect(screen.getByText("four")).toBeInTheDocument()
  })
})
