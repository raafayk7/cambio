import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SlamTimer } from "../src/components/game/slam-timer.js"

/**
 * slam-timer.md + root plan F3.6, test-first: the bar drains linearly
 * toward a FIXED close (ADR-0011 — no refills, no resets on slam
 * attempts); duration is config-fed; hidden when no window exists.
 */
describe("SlamTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const valueNow = () => Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"))

  it("renders nothing when no window is open", () => {
    const { container } = render(<SlamTimer />)
    expect(container.innerHTML).toBe("")
  })

  it("drains linearly from the config-fed window toward closesAt", () => {
    const closesAt = Date.now() + 8000
    render(<SlamTimer window={{ closesAt, durationMs: 8000 }} />)
    expect(valueNow()).toBeGreaterThan(7800)
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(valueNow()).toBeGreaterThan(3800)
    expect(valueNow()).toBeLessThanOrEqual(4000)
  })

  it("never resets on slam attempts: resolving pauses the display, resuming lands on the true remaining", () => {
    const closesAt = Date.now() + 8000
    const { rerender } = render(<SlamTimer window={{ closesAt, durationMs: 8000 }} />)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    const beforeResolve = valueNow()
    rerender(<SlamTimer window={{ closesAt, durationMs: 8000 }} resolving />)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    // Paused visually while the slam resolves…
    expect(valueNow()).toBe(beforeResolve)
    rerender(<SlamTimer window={{ closesAt, durationMs: 8000 }} />)
    act(() => {
      vi.advanceTimersByTime(100)
    })
    // …then lands on the true remaining (≈ 8000 − 5100), never refilled.
    expect(valueNow()).toBeLessThanOrEqual(3000)
    expect(valueNow()).toBeGreaterThan(2600)
  })

  it("shows closed (empty bar), never negative, once closesAt passes", () => {
    const closesAt = Date.now() + 1000
    render(<SlamTimer window={{ closesAt, durationMs: 1000 }} />)
    act(() => {
      vi.advanceTimersByTime(2500)
    })
    expect(valueNow()).toBe(0)
  })

  /**
   * CAM-26 C1: a stale window can strand the game with no recovery signal
   * (root plan) — `onExpire` gives the client something to notice. Fires
   * exactly once per window, past `closesAt` plus a small skew grace, never
   * once per 50ms tick.
   */
  describe("onExpire (C1)", () => {
    it("fires exactly once once time passes closesAt plus the skew grace, despite the interval continuing to tick", () => {
      const onExpire = vi.fn()
      const closesAt = Date.now() + 1000
      render(<SlamTimer window={{ closesAt, durationMs: 1000 }} onExpire={onExpire} />)
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(onExpire).toHaveBeenCalledTimes(1)
    })

    it("does not fire before closesAt plus the skew grace has fully elapsed", () => {
      const onExpire = vi.fn()
      const closesAt = Date.now() + 1000
      render(<SlamTimer window={{ closesAt, durationMs: 1000 }} onExpire={onExpire} />)
      act(() => {
        // Just short of closesAt (1000) + the 500ms grace.
        vi.advanceTimersByTime(1450)
      })
      expect(onExpire).not.toHaveBeenCalled()
    })

    it("does not fire while resolving, then fires once when resolving clears after closesAt has already passed", () => {
      const onExpire = vi.fn()
      const closesAt = Date.now() + 1000
      const { rerender } = render(
        <SlamTimer window={{ closesAt, durationMs: 1000 }} resolving onExpire={onExpire} />,
      )
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(onExpire).not.toHaveBeenCalled()

      rerender(<SlamTimer window={{ closesAt, durationMs: 1000 }} onExpire={onExpire} />)
      expect(onExpire).toHaveBeenCalledTimes(1)
    })

    it("re-arms for a new window: a different closesAt after rerender fires again", () => {
      const onExpire = vi.fn()
      const closesAt1 = Date.now() + 1000
      const { rerender } = render(
        <SlamTimer window={{ closesAt: closesAt1, durationMs: 1000 }} onExpire={onExpire} />,
      )
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(onExpire).toHaveBeenCalledTimes(1)

      const closesAt2 = Date.now() + 1000
      rerender(<SlamTimer window={{ closesAt: closesAt2, durationMs: 1000 }} onExpire={onExpire} />)
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(onExpire).toHaveBeenCalledTimes(2)
    })

    it("never fires for a window that unmounts before expiry", () => {
      const onExpire = vi.fn()
      const closesAt = Date.now() + 1000
      const { unmount } = render(
        <SlamTimer window={{ closesAt, durationMs: 1000 }} onExpire={onExpire} />,
      )
      unmount()
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(onExpire).not.toHaveBeenCalled()
    })

    it("omitting onExpire changes nothing about the existing drain/closed behavior", () => {
      const closesAt = Date.now() + 1000
      render(<SlamTimer window={{ closesAt, durationMs: 1000 }} />)
      expect(() => {
        act(() => {
          vi.advanceTimersByTime(5000)
        })
      }).not.toThrow()
      expect(valueNow()).toBe(0)
    })
  })
})
