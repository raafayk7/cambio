import { vi } from "vitest"

import type { RealtimeChannelLike, RealtimeClientLike } from "../../src/services/realtime.js"

/**
 * Fake realtime client for jsdom tests (ADR-0030 — no sockets, ever).
 * Mirrors the exact `RealtimeClientLike` surface the service touches;
 * tests drive broadcasts with `emit` and connection drops with `setStatus`.
 */

interface BroadcastMessage {
  readonly event: string
  readonly payload: unknown
}

export class FakeChannel implements RealtimeChannelLike {
  readonly topic: string
  private handlers: Array<(message: BroadcastMessage) => void> = []
  private statusCallback: ((status: string, err?: Error) => void) | undefined
  readonly unsubscribe = vi.fn()

  constructor(topic: string) {
    this.topic = topic
  }

  on(
    _type: "broadcast",
    _filter: { event: string },
    callback: (message: BroadcastMessage) => void,
  ) {
    this.handlers.push(callback)
    return this
  }

  subscribe(callback?: (status: string, err?: Error) => void) {
    this.statusCallback = callback
    // The pinned pattern reports SUBSCRIBED once the join completes.
    callback?.("SUBSCRIBED")
    return this
  }

  /** Deliver a broadcast to every handler, as the wire would. */
  emit(event: string, payload: unknown): void {
    for (const handler of this.handlers) handler({ event, payload })
  }

  /** Drive the channel status callback (drop, recovery, …). */
  setStatus(status: string): void {
    this.statusCallback?.(status)
  }
}

export class FakeRealtimeClient implements RealtimeClientLike {
  readonly channels: FakeChannel[] = []

  channel(topic: string): FakeChannel {
    const created = new FakeChannel(topic)
    this.channels.push(created)
    return created
  }

  find(topicPart: string): FakeChannel | undefined {
    return this.channels.find((channel) => channel.topic.includes(topicPart))
  }
}
