import { afterEach, describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { vi } from "vitest"

import { type BroadcastMessage, makeFetchTransport } from "../src/infra/realtime-publisher.js"

/**
 * CAM-32 C9: the fetch transport's two auth modes, pinned against a stubbed
 * global `fetch` — no container involved.
 *
 * Local mode (no secret key) must stay byte-identical to pre-CAM-32
 * behavior: POST `${realtimeUrl}/api/broadcast` with exactly two headers,
 * `content-type` and a self-signed HS256 bearer — and no `apikey`. Cloud
 * mode (secret key present) sends `apikey: <key>` + `authorization:
 * Bearer <key>` and mints no JWT. (`RealtimeIntegration.test.ts` proves
 * local mode against the real container; this suite pins the header sets.)
 */

const REALTIME_URL = "http://realtime-dev.localhost:4000"
const JWT_SECRET = "transport-test-jwt-secret"
const SECRET_KEY = "sb_secret_transport-test-key"

const messages: ReadonlyArray<BroadcastMessage> = [
  { topic: "room:test", event: "LobbyUpdated", payload: { _tag: "LobbyUpdated" } },
]

interface RecordedCall {
  readonly url: string
  readonly method: string | undefined
  readonly headers: Record<string, string>
  readonly body: string
}

const stubFetch = () => {
  const calls: Array<RecordedCall> = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method,
        headers: { ...(init?.headers as Record<string, string>) },
        body: String(init?.body),
      })
      return new Response(null, { status: 202 })
    }),
  )
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// base64url segments of an HS256 JWT: header.payload.signature
const JWT_SHAPE = /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

describe("makeFetchTransport local mode (no secret key) — byte-identical to today (C9)", () => {
  it.effect("POSTs the batch with exactly content-type + self-signed bearer, no apikey", () =>
    Effect.gen(function* () {
      const calls = stubFetch()
      const transport = makeFetchTransport({ realtimeUrl: REALTIME_URL, jwtSecret: JWT_SECRET })

      yield* transport(messages)

      expect(calls).toHaveLength(1)
      const call = calls[0]!
      expect(call.url).toBe(`${REALTIME_URL}/api/broadcast`)
      expect(call.method).toBe("POST")
      expect(Object.keys(call.headers).sort()).toEqual(["authorization", "content-type"])
      expect(call.headers["content-type"]).toBe("application/json")
      expect(call.headers["authorization"]).toMatch(JWT_SHAPE)
      // The bearer is a minted JWT, never the raw secret.
      expect(call.headers["authorization"]).not.toContain(JWT_SECRET)
      expect(JSON.parse(call.body)).toEqual({ messages })
    }),
  )
})

describe("makeFetchTransport cloud mode (secret key present) (C9)", () => {
  it.effect("sends apikey + bearer carrying the key verbatim, and mints no JWT", () =>
    Effect.gen(function* () {
      const calls = stubFetch()
      const transport = makeFetchTransport({
        realtimeUrl: REALTIME_URL,
        jwtSecret: JWT_SECRET,
        secretKey: SECRET_KEY,
      })

      yield* transport(messages)

      expect(calls).toHaveLength(1)
      const call = calls[0]!
      // URL construction is unchanged by mode — the cloud REALTIME_URL
      // (https://<ref>.supabase.co/realtime/v1) composes the same way.
      expect(call.url).toBe(`${REALTIME_URL}/api/broadcast`)
      expect(call.method).toBe("POST")
      expect(Object.keys(call.headers).sort()).toEqual(["apikey", "authorization", "content-type"])
      expect(call.headers["apikey"]).toBe(SECRET_KEY)
      expect(call.headers["authorization"]).toBe(`Bearer ${SECRET_KEY}`)
      expect(JSON.parse(call.body)).toEqual({ messages })
    }),
  )

  it.effect("a non-ok response still fails the transport effect (unchanged by mode)", () =>
    Effect.gen(function* () {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(null, { status: 401 })),
      )
      const transport = makeFetchTransport({
        realtimeUrl: REALTIME_URL,
        jwtSecret: JWT_SECRET,
        secretKey: SECRET_KEY,
      })
      const result = yield* Effect.either(transport(messages))
      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left.message).toContain("401")
      }
    }),
  )
})
