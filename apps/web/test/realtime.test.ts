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
