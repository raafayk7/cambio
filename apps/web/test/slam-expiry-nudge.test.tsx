import { act, cleanup, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setRealtimeClientForTests } from "../src/services/realtime.js"
import { FakeRealtimeClient } from "./support/fake-realtime.js"
import {
  FRIEND,
  GAME_ID,
  GRANTS,
  json,
  ME,
  renderGameApp,
  stubApi,
  viewResponse,
} from "./support/harness.js"

/**
 * CAM-26 C2/C5: the bounded client expiry nudge (ADR-0037 layer 4) — kept
 * in its own file, deliberately separate from `game-screen.test.tsx`'s
 * real-timers convention (its header comment is explicit that choice is
 * load-bearing for that suite). This suite owns fake timers instead, to
 * pace an already-expired window plus several ~2s re-nudge intervals
 * without real waiting.
 *
 * `shouldAdvanceTime: true` is the seam that keeps `waitFor`/`findBy*`
 * usable under fake timers: vitest's mocked clock (and `Date.now()` with
 * it) still auto-advances alongside real wall-clock time, so
 * testing-library's own internal polling keeps working, while
 * `vi.advanceTimersByTime` still lets a test jump straight over an
 * interval instead of waiting it out for real.
 */

const GET_VIEW = `GET /games/${GAME_ID}/view`

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  setRealtimeClientForTests(null)
})

const setupFake = () => {
  const fake = new FakeRealtimeClient()
  setRealtimeClientForTests(fake)
  return fake
}

const channelsReady = async (fake: FakeRealtimeClient) => {
  await waitFor(() => {
    expect(fake.channels).toHaveLength(2)
  })
  return {
    room: fake.find(GRANTS.roomTopic)!,
    player: fake.find(GRANTS.playerTopic)!,
  }
}

/** An already-expired `SlamWindow` view: `SlamTimer`'s effect calls
 * `update()` synchronously on mount, so `onExpire` fires on the mount
 * commit itself — no timer advance needed just to arm the nudge loop. */
const expiredSlamView = (version = 3) =>
  viewResponse({
    players: [
      { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
      { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
    ],
    deckCount: 37,
    discard: ["KH"],
    phase: {
      _tag: "SlamWindow",
      turnPlayerId: ME.userId,
      closesAt: Date.now() - 1000,
      rank: "7",
    },
    version,
  })

const getViewCount = (calls: readonly string[]) => calls.filter((call) => call === GET_VIEW).length

describe("slam expiry nudge (C2, C5)", () => {
  it("nudges on expiry, keeps nudging while the view stays the same stale window, and stops at the cap", async () => {
    const fake = setupFake()
    const { calls } = stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, expiredSlamView()),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)
    const getsBefore = getViewCount(calls)

    // The window was already expired at mount — the nudge fires without
    // any broadcast at all.
    await waitFor(() => {
      expect(getViewCount(calls)).toBeGreaterThan(getsBefore)
    })

    // Every subsequent view answer is still the identical stale window —
    // no progress ever, from the nudge loop's own responses. Advance well
    // past the cap's worth of intervals.
    for (let i = 0; i < 8; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })
    }
    const getsAtCap = getViewCount(calls)
    expect(getsAtCap).toBeGreaterThan(getsBefore + 1)

    // One more interval span produces no further GETs — the loop stopped.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(getViewCount(calls)).toBe(getsAtCap)
  })

  it("a refetch showing progress ends the nudge loop — no further GETs after it", async () => {
    const fake = setupFake()
    const { handlers, calls } = stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, expiredSlamView()),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)
    const getsBefore = getViewCount(calls)

    await waitFor(() => {
      expect(getViewCount(calls)).toBeGreaterThan(getsBefore)
    })

    // The server has recovered: the very next nudge sees a moved-on,
    // higher-version view.
    handlers[GET_VIEW] = json(
      200,
      viewResponse({
        players: [
          { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
          { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
        ],
        deckCount: 37,
        discard: ["7H"],
        phase: { _tag: "AwaitingDraw", playerId: FRIEND.id },
        version: 99,
      }),
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    await waitFor(() => {
      expect(screen.getByText(`${FRIEND.name}'s turn`)).toBeInTheDocument()
    })
    const getsAfterProgress = getViewCount(calls)

    // Several more interval spans produce no further GETs: the loop ended
    // the moment progress was observed, not merely paused.
    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })
    }
    expect(getViewCount(calls)).toBe(getsAfterProgress)
  })

  it("recovery lands through the broadcast path while nudging — every nudge response stays version-guard-dropped (C5)", async () => {
    const fake = setupFake()
    const { handlers, calls } = stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, expiredSlamView()),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    const { room } = await channelsReady(fake)
    const getsBefore = getViewCount(calls)

    // A couple of nudge round-trips happen first, every one answered with
    // the identical stale, same-version window (guard-dropped by
    // construction — never applied to the cache).
    await waitFor(() => {
      expect(getViewCount(calls)).toBeGreaterThan(getsBefore)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(screen.getByRole("progressbar", { name: "Slam window" })).toBeInTheDocument()

    // The server-side poke (S3, out of this side's scope) closes the
    // window: the view route now answers with the closed, higher-version
    // state, and the close publishes on the room channel exactly like a
    // timer-fired close (S5) — a broadcast, not a nudge response.
    handlers[GET_VIEW] = json(
      200,
      viewResponse({
        players: [
          { id: ME.userId, name: ME.name, hand: [0, 1, 2, 3] },
          { id: FRIEND.id, name: FRIEND.name, hand: [0, 1] },
        ],
        deckCount: 37,
        discard: ["7H"],
        phase: { _tag: "AwaitingDraw", playerId: FRIEND.id },
        version: 99,
      }),
    )
    act(() => {
      room.emit("SlamWindowClosed", { _tag: "SlamWindowClosed" })
      room.emit("TurnAdvanced", { _tag: "TurnAdvanced", playerId: FRIEND.id })
    })
    // The ordinary debounced refetch (REFETCH_DEBOUNCE_MS, not the nudge
    // loop's own timer) carries the new version.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    await waitFor(() => {
      expect(screen.getByText(`${FRIEND.name}'s turn`)).toBeInTheDocument()
    })
    expect(screen.queryByRole("progressbar", { name: "Slam window" })).not.toBeInTheDocument()
  })

  it("unmounting between attempts leaks no timers: no unhandled errors, and the GET count freezes", async () => {
    const fake = setupFake()
    const { calls } = stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, expiredSlamView()),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)
    const getsBefore = getViewCount(calls)

    await waitFor(() => {
      expect(getViewCount(calls)).toBeGreaterThan(getsBefore)
    })

    cleanup()
    const getsAtUnmount = getViewCount(calls)

    expect(() => {
      act(() => {
        vi.advanceTimersByTime(2000 * 10)
      })
    }).not.toThrow()
    expect(getViewCount(calls)).toBe(getsAtUnmount)
  })

  it("unmounting with a nudge fetch IN FLIGHT cancels the loop — the settling fetch must not re-arm it (review finding 1)", async () => {
    const fake = setupFake()

    // The next attempt's fetch is held open across the unmount: the
    // deferred handler resolves only after cleanup(), exercising the
    // settling `.then`'s cancellation guard against a torn-down hook.
    let releaseInFlight: ((r: Response) => void) | null = null
    const staleResponse = () =>
      new Response(JSON.stringify(expiredSlamView()), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    const { handlers, calls } = stubApi({
      "GET /me": json(200, ME),
      [GET_VIEW]: json(200, expiredSlamView()),
    })
    renderGameApp(GAME_ID)
    await screen.findByText(ME.name)
    await channelsReady(fake)

    const getsBefore = getViewCount(calls)
    await waitFor(() => {
      expect(getViewCount(calls)).toBeGreaterThan(getsBefore)
    })

    handlers[GET_VIEW] = (() =>
      new Promise<Response>((resolve) => {
        releaseInFlight = resolve
      })) as unknown as () => Response
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })
    expect(releaseInFlight).not.toBeNull()

    cleanup()
    const getsAtUnmount = getViewCount(calls)

    // Resolve the in-flight fetch only now, after unmount; keep answering
    // stale so a still-alive loop would visibly keep nudging.
    handlers[GET_VIEW] = staleResponse
    releaseInFlight!(staleResponse())
    for (let i = 0; i < 6; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2100)
      })
    }

    expect(getViewCount(calls)).toBe(getsAtUnmount)
  })
})
