import { createHmac } from "node:crypto"

import { describe, expect, it } from "@effect/vitest"

import { signRealtimeJwt } from "../src/infra/realtime-jwt.js"

/** The hand-rolled HS256 signer, verified independently with node:crypto. */
describe("signRealtimeJwt", () => {
  it("produces a three-part HS256 JWT whose signature verifies", () => {
    const token = signRealtimeJwt("some-secret")
    const [header, payload, signature] = token.split(".") as [string, string, string]
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
      alg: "HS256",
      typ: "JWT",
    })
    const expected = createHmac("sha256", "some-secret")
      .update(`${header}.${payload}`)
      .digest("base64url")
    expect(signature).toBe(expected)
  })

  it("carries the role and a future exp claim", () => {
    const token = signRealtimeJwt("some-secret", { role: "anon", expiresInSeconds: 60 })
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString(),
    ) as { role: string; exp: number }
    expect(payload.role).toBe("anon")
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
    expect(payload.exp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 61)
  })
})
