import { afterEach, describe, expect, it, vi } from "vitest"

import {
  getConnectionStatus,
  onConnectionStatusChange,
  setRealtimeClientForTests,
  subscribeTopic,
} from "../src/services/realtime.js"
import { FakeRealtimeClient } from "./support/fake-realtime.js"

/**
 * W3 — the realtime service over an injected fake client (jsdom never opens
 * sockets, ADR-0030). The channel-mechanics pattern itself is pinned
 * against the real container by apps/api/test/RealtimeIntegration.test.ts.
 */

afterEach(() => {
  setRealtimeClientForTests(null)
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("subscribeTopic (W3)", () => {
  it("subscribes the granted topic with the pinned channel pattern and delivers broadcasts", () => {
    const fake = new FakeRealtimeClient()
    setRealtimeClientForTests(fake)
    const events: Array<{ event: string; payload: unknown }> = []

    subscribeTopic("room:secret:g1", {
      onEvent: (event, payload) => events.push({ event, payload }),
    })

    expect(fake.channels).toHaveLength(1)
    const channel = fake.channels[0]!
    expect(channel.topic).toBe("room:secret:g1")

    channel.emit("LobbyUpdated", { _tag: "LobbyUpdated" })
    expect(events).toEqual([{ event: "LobbyUpdated", payload: { _tag: "LobbyUpdated" } }])
  })

  it("returns an unsubscribe that closes the channel and stops event delivery", () => {
    const fake = new FakeRealtimeClient()
    setRealtimeClientForTests(fake)
    const onEvent = vi.fn()

    const unsubscribe = subscribeTopic("room:secret:g1", { onEvent })
    const channel = fake.channels[0]!
    unsubscribe()

    expect(channel.unsubscribe).toHaveBeenCalledTimes(1)
    channel.emit("LobbyUpdated", {})
    expect(onEvent).not.toHaveBeenCalled()
  })

  it("exposes connection status: a drop flips to reconnecting, recovery flips back and fires onResubscribe", () => {
    const fake = new FakeRealtimeClient()
    setRealtimeClientForTests(fake)
    const onResubscribe = vi.fn()
    const statusChanges: string[] = []
    const stopListening = onConnectionStatusChange(() => statusChanges.push(getConnectionStatus()))

    subscribeTopic("room:secret:g1", { onEvent: vi.fn(), onResubscribe })
    const channel = fake.channels[0]!
    expect(getConnectionStatus()).toBe("connected")
    expect(onResubscribe).not.toHaveBeenCalled()

    channel.setStatus("CHANNEL_ERROR")
    expect(getConnectionStatus()).toBe("reconnecting")

    channel.setStatus("SUBSCRIBED")
    expect(getConnectionStatus()).toBe("connected")
    expect(onResubscribe).toHaveBeenCalledTimes(1)
    expect(statusChanges).toEqual(["reconnecting", "connected"])
    stopListening()
  })

  it("degrades legibly on empty/whitespace env — no throw, one config error, reconnecting reported (F10)", () => {
    // Clear the injection seam so getClient really runs its env guard —
    // with a fake injected the guard is never reached.
    setRealtimeClientForTests(null)
    // .env.example ships the apikey blank; whitespace on the URL pins the
    // trim half of the guard. If the `url.trim() === ""` check were removed
    // (the mutant), getClient would construct a real client from junk env,
    // never throw, and neither assertion below could pass.
    vi.stubEnv("VITE_REALTIME_URL", "   ")
    vi.stubEnv("VITE_REALTIME_APIKEY", "local-anon-jwt")
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const statusChanges: string[] = []
    const stopListening = onConnectionStatusChange(() => statusChanges.push(getConnectionStatus()))

    let unsubscribe: (() => void) | undefined
    expect(() => {
      unsubscribe = subscribeTopic("room:secret:g1", { onEvent: vi.fn() })
    }).not.toThrow()

    // One legible diagnostic: the config message, never the topic value.
    expect(errorSpy).toHaveBeenCalledTimes(1)
    const logged = String(errorSpy.mock.calls[0]![0])
    expect(logged).toContain("realtime env missing")
    expect(logged).not.toContain("room:secret:g1")

    // The listeners were notified — the screen shows the truthful W4 banner.
    expect(getConnectionStatus()).toBe("reconnecting")
    expect(statusChanges).toEqual(["reconnecting"])

    // The no-op unsubscribe is safe to call.
    expect(() => unsubscribe!()).not.toThrow()
    stopListening()
  })

  it("names VITE_REALTIME_APIKEY when only the apikey is blank — pins the rename code-side (review F3)", () => {
    setRealtimeClientForTests(null)
    // Valid URL so the guard's URL term passes and the APIKEY term is the one
    // that trips — the previous case short-circuits on the URL and would stay
    // green if realtime.ts silently read the old var name. The old name is
    // stubbed VALID on purpose: a surgical revert to reading
    // VITE_REALTIME_ANON_JWT would sail past the guard here (and then fail
    // this test's single-legible-error assertions), so both the wholesale and
    // the surgical rename-revert mutants go red.
    vi.stubEnv("VITE_REALTIME_URL", "ws://realtime-dev.localhost:4000/socket")
    vi.stubEnv("VITE_REALTIME_APIKEY", "   ")
    vi.stubEnv("VITE_REALTIME_ANON_JWT", "old-name-still-valid")
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    expect(() => {
      subscribeTopic("room:secret:g2", { onEvent: vi.fn() })
    }).not.toThrow()

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const logged = String(errorSpy.mock.calls[0]![0])
    expect(logged).toContain("VITE_REALTIME_APIKEY")
    expect(logged).not.toContain("room:secret:g2")
  })

  it("resets to connected when the last subscription is dropped — no stale banner on idle screens", () => {
    const fake = new FakeRealtimeClient()
    setRealtimeClientForTests(fake)

    const unsubscribe = subscribeTopic("room:secret:g1", { onEvent: vi.fn() })
    fake.channels[0]!.setStatus("CLOSED")
    expect(getConnectionStatus()).toBe("reconnecting")

    unsubscribe()
    expect(getConnectionStatus()).toBe("connected")
  })
})
