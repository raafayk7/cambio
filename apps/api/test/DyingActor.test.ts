import { afterAll, describe, expect, it } from "@effect/vitest"
import { RoomRegistry } from "@cambio/application"
import { Effect, Layer, ManagedRuntime } from "effect"
import { pino } from "pino"

import { buildServer } from "../src/presentation/server.js"
import { makeTestApp, TestAppLayer } from "./support/http.js"

/**
 * C1.10 over a stub registry (decision 13): driving the real actor into its
 * teardown race over HTTP is nondeterministic — the actor's own interrupt/
 * defect behavior is pinned by CAM-5's suites. What CAM-6 owns is the route's
 * exit handling: interrupts and defects escaping the typed union become a
 * 500 contract body, and the response always completes.
 */

type Mode = "defect" | "interrupt"
let mode: Mode = "defect"

const dying = <A, E>(): Effect.Effect<A, E> =>
  mode === "defect" ? Effect.die(new Error("actor died mid-flight")) : Effect.interrupt

const StubRegistry = Layer.succeed(RoomRegistry, {
  execute: () => dying(),
  join: () => dying(),
  leave: () => dying(),
  start: () => dying(),
  // Not exercised by this file's suites (neither test hits GET
  // /games/:gameId/view) — a harmless no-op keeps the stub total against
  // the CAM-26 `poke` addition to the RoomRegistry interface.
  poke: () => Effect.void,
  roomCount: Effect.succeed(0),
})

// Later layer wins the tag: same deps as the real harness, stubbed registry.
const runtime = ManagedRuntime.make(Layer.merge(TestAppLayer, StubRegistry))
const base = await makeTestApp()
const app = await buildServer({
  config: base.config,
  logger: pino({ level: "silent" }),
  runtime: await runtime.runtime(),
})

afterAll(async () => {
  await app.close()
  await base.app.close()
  await base.runtime.dispose()
  await runtime.dispose()
})

const newCookie = async (): Promise<string> => {
  const res = await app.inject({ method: "POST", url: "/users", payload: { name: "Dyer" } })
  return res.cookies.find((c) => c.name === "cambio_session")!.value
}

describe("dying room actor (C1.10)", () => {
  it("a defect escaping the typed union becomes a 500 contract body — the reply completes", async () => {
    mode = "defect"
    const cookie = await newCookie()
    const res = await app.inject({
      method: "POST",
      url: "/games/00000000-0000-4000-9000-000000000001/commands",
      cookies: { cambio_session: cookie },
      payload: { _tag: "DrawFromDeck" },
    })
    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({ error: { tag: "Internal", message: "internal error" } })
  })

  it("a bare interrupt becomes a 500 too — never a hang", async () => {
    mode = "interrupt"
    const cookie = await newCookie()
    const res = await app.inject({
      method: "POST",
      url: "/lobbies/00000000-0000-4000-9000-000000000001/join",
      cookies: { cambio_session: cookie },
    })
    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({ error: { tag: "Internal", message: "internal error" } })
  })
})
