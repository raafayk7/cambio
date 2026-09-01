import { randomUUID } from "node:crypto"

import { SqlClient } from "@effect/sql"
import { afterAll, describe, expect, it } from "@effect/vitest"
import { Effect, Redacted, Schema } from "effect"
import { Timestamp, UserId } from "@cambio/domain"
import { makeSessionSigner } from "../src/infra/session-signer.js"
import { makeTestApp, testSigner } from "./support/http.js"

/**
 * The C1–C3 HTTP matrix through `app.inject()` (M5) — the repo's first
 * HTTP-level suite. The test signer forges authentic-but-hostile tokens
 * (expired, unknown user) that the server's signer accepts as authentic,
 * which is exactly what makes the 401s here meaningful.
 */

const { app, runtime, config } = await makeTestApp()
const TTL_MS = config.sessionTtlSeconds * 1000

afterAll(async () => {
  await app.close()
  await runtime.dispose()
})

const postUser = (payload: unknown) =>
  app.inject({ method: "POST", url: "/users", payload: payload as object })

const getMe = (cookie?: string) =>
  app.inject({
    method: "GET",
    url: "/me",
    ...(cookie === undefined ? {} : { cookies: { cambio_session: cookie } }),
  })

const sessionCookie = (res: Awaited<ReturnType<typeof postUser>>) => {
  const found = res.cookies.find((c) => c.name === "cambio_session")
  expect(found).toBeDefined()
  return found!
}

const decodeCookie = (value: string) => Effect.runPromise(testSigner.verify(value))

const userCount = () =>
  runtime.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const rows = yield* sql<{ n: number }>`SELECT count(*)::int AS n FROM users`
      return rows[0]!.n
    }),
  )

const userRow = (userId: string) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql<{
        user_name: string
      }>`SELECT user_name FROM users WHERE user_id = ${userId}`
    }),
  )

describe("temporary-user auth over HTTP (CAM-4)", () => {
  it("POST /users creates the row and returns it, trimming the name (C1.1)", async () => {
    const res = await postUser({ name: "  Raafay  " })
    expect(res.statusCode).toBe(201)
    const body = res.json() as { userId: string; name: string }
    expect(body.name).toBe("Raafay")
    const rows = await userRow(body.userId)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.user_name).toBe("Raafay")
  })

  it("the 201 sets a signed httpOnly session cookie for that user (C1.2)", async () => {
    const before = Date.now()
    const res = await postUser({ name: "Cookie Check" })
    const after = Date.now()
    expect(res.statusCode).toBe(201)

    const cookie = sessionCookie(res)
    expect(cookie.httpOnly).toBe(true)
    expect(cookie.path).toBe("/")
    expect(cookie.sameSite).toMatch(/lax/i)
    expect(cookie.secure).toBeFalsy()
    expect(cookie.maxAge).toBe(config.sessionTtlSeconds)

    const payload = await decodeCookie(cookie.value)
    expect(payload.userId).toBe((res.json() as { userId: string }).userId)
    expect(payload.expiresAt).toBeGreaterThanOrEqual(before + TTL_MS)
    expect(payload.expiresAt).toBeLessThanOrEqual(after + TTL_MS)
  })

  it("cookie attributes follow config when overridden (C4.2)", async () => {
    const second = await makeTestApp({
      sessionCookieSecure: true,
      sessionCookieSameSite: "strict",
    })
    try {
      const res = await second.app.inject({
        method: "POST",
        url: "/users",
        payload: { name: "Attr Check" },
      })
      const cookie = res.cookies.find((c) => c.name === "cambio_session")!
      expect(cookie.secure).toBe(true)
      expect(cookie.sameSite).toMatch(/strict/i)
    } finally {
      await second.app.close()
      await second.runtime.dispose()
    }
  })

  it("invalid names get 400, no cookie, no row (C1.3)", async () => {
    const countBefore = await userCount()
    for (const payload of [{}, { name: "" }, { name: "   " }, { name: "x".repeat(33) }]) {
      const res = await postUser(payload)
      expect(res.statusCode).toBe(400)
      expect(res.cookies).toHaveLength(0)
    }
    expect(await userCount()).toBe(countBefore)

    const boundary = await postUser({ name: "x".repeat(32) })
    expect(boundary.statusCode).toBe(201)
  })

  it("GET /me with the created cookie resolves the same user (C2.1)", async () => {
    const created = await postUser({ name: "Replayer" })
    const cookie = sessionCookie(created)
    const res = await getMe(cookie.value)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual(created.json())
  })

  it("GET /me without a cookie is 401 (C2.2)", async () => {
    const res = await getMe()
    expect(res.statusCode).toBe(401)
  })

  it("tampered or wrong-secret cookies are 401 (C2.3)", async () => {
    const created = await postUser({ name: "Tamper Target" })
    const value = sessionCookie(created).value
    const [payloadPart, mac] = value.split(".") as [string, string]
    const flipped = (payloadPart.startsWith("A") ? "B" : "A") + payloadPart.slice(1) + "." + mac
    expect((await getMe(flipped)).statusCode).toBe(401)

    const foreign = makeSessionSigner(Redacted.make("some-other-secret"))
    const forged = await Effect.runPromise(
      foreign.sign({
        userId: Schema.decodeUnknownSync(UserId)(randomUUID()),
        expiresAt: Timestamp.make(Date.now() + TTL_MS),
      }),
    )
    expect((await getMe(forged)).statusCode).toBe(401)
  })

  it("an authentic but expired token is 401 (C2.4)", async () => {
    const created = await postUser({ name: "Expired" })
    const { userId } = created.json() as { userId: string }
    const stale = await Effect.runPromise(
      testSigner.sign({
        userId: Schema.decodeUnknownSync(UserId)(userId),
        expiresAt: Timestamp.make(Date.now() - 1000),
      }),
    )
    expect((await getMe(stale)).statusCode).toBe(401)
  })

  it("a valid cookie for an unknown or soft-deleted user is 401 (C2.5)", async () => {
    const orphan = await Effect.runPromise(
      testSigner.sign({
        userId: Schema.decodeUnknownSync(UserId)(randomUUID()),
        expiresAt: Timestamp.make(Date.now() + TTL_MS),
      }),
    )
    expect((await getMe(orphan)).statusCode).toBe(401)

    const created = await postUser({ name: "Doomed" })
    const cookie = sessionCookie(created).value
    const { userId } = created.json() as { userId: string }
    await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql`UPDATE users SET deleted_at = now() WHERE user_id = ${userId}`
      }),
    )
    expect((await getMe(cookie)).statusCode).toBe(401)
  })

  it("every authenticated request re-issues the cookie with a fresh expiry (C3.1)", async () => {
    const created = await postUser({ name: "Slider" })
    const original = await decodeCookie(sessionCookie(created).value)

    const before = Date.now()
    const res = await getMe(sessionCookie(created).value)
    const after = Date.now()
    expect(res.statusCode).toBe(200)

    const renewed = await decodeCookie(sessionCookie(res).value)
    expect(renewed.userId).toBe(original.userId)
    expect(renewed.expiresAt).toBeGreaterThanOrEqual(original.expiresAt)
    expect(renewed.expiresAt).toBeGreaterThanOrEqual(before + TTL_MS)
    expect(renewed.expiresAt).toBeLessThanOrEqual(after + TTL_MS)
  })

  it("errors that never reach a route get a curated body, not Fastify's default", async () => {
    // Malformed JSON dies in the content-type parser, before the handler —
    // exactly the path the setErrorHandler fallback owns.
    const res = await app.inject({
      method: "POST",
      url: "/users",
      headers: { "content-type": "application/json" },
      payload: '{"name": not-json',
    })
    expect(res.statusCode).toBe(400)
    expect(res.cookies).toHaveLength(0)
    const body = res.json() as Record<string, unknown>
    expect(body).toEqual({ error: "bad request" })
    expect(body).not.toHaveProperty("message")
  })
})
