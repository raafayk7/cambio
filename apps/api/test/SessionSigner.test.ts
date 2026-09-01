import { createHmac } from "node:crypto"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Either, Redacted, Schema } from "effect"
import { Timestamp, UserId } from "@cambio/domain"
import { type SessionPayload } from "@cambio/application"
import { makeSessionSigner } from "../src/infra/session-signer.js"

/**
 * Adapter units for the ADR-0018 HMAC signer (C2.3's adapter half). Pure —
 * no DB, no runtime beyond Effect.runPromise/Effect.either.
 */

const signerA = makeSessionSigner(Redacted.make("test-secret-a"))
const signerB = makeSessionSigner(Redacted.make("test-secret-b"))

const PAYLOAD: SessionPayload = {
  userId: Schema.decodeUnknownSync(UserId)("00000000-0000-4000-8000-0000000000cc"),
  expiresAt: Timestamp.make(1_700_000_000_000),
}

/** Forge tokens the way the adapter mints them, for the hostile cases. */
const forge = (secret: string, payloadPart: string) =>
  `${payloadPart}.${createHmac("sha256", secret).update(payloadPart).digest("hex")}`

const verifyEither = (signer: ReturnType<typeof makeSessionSigner>, token: string) =>
  Effect.runPromise(Effect.either(signer.verify(token)))

describe("session signer adapter (ADR-0018)", () => {
  it("sign → verify round-trips the payload with brands intact", async () => {
    const token = await Effect.runPromise(signerA.sign(PAYLOAD))
    const result = await verifyEither(signerA, token)
    expect(Either.isRight(result)).toBe(true)
    if (Either.isRight(result)) {
      expect(result.right).toEqual(PAYLOAD)
    }
  })

  it("a tampered payload half is rejected (C2.3)", async () => {
    const token = await Effect.runPromise(signerA.sign(PAYLOAD))
    const [payloadPart, mac] = token.split(".")
    const flipped = payloadPart!.slice(0, -1) + (payloadPart!.endsWith("A") ? "B" : "A")
    const result = await verifyEither(signerA, `${flipped}.${mac}`)
    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) expect(result.left._tag).toBe("SessionInvalid")
  })

  it("a token signed under a different secret is rejected (C2.3)", async () => {
    const token = await Effect.runPromise(signerB.sign(PAYLOAD))
    const result = await verifyEither(signerA, token)
    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) expect(result.left._tag).toBe("SessionInvalid")
  })

  it("structurally hopeless tokens fail as SessionInvalid, never throw", async () => {
    const nonJson = Buffer.from("not json at all").toString("base64url")
    const wrongShape = Buffer.from(JSON.stringify({ hello: "world" })).toString("base64url")
    const cases = [
      "",
      "no-dot",
      "a.b.c",
      forge("test-secret-a", nonJson), // authentic MAC, non-JSON payload
      forge("test-secret-a", wrongShape), // authentic MAC, JSON that fails decode
    ]
    for (const token of cases) {
      const result = await verifyEither(signerA, token)
      expect(Either.isLeft(result)).toBe(true)
      if (Either.isLeft(result)) expect(result.left._tag).toBe("SessionInvalid")
    }
  })
})
