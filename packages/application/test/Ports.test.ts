import { describe, expect, it } from "@effect/vitest"
import { Either, Schema } from "effect"
import { SessionInvalid, SessionPayload, SessionSignerPort } from "../src/ports/SessionSigner.js"

/** Port shape for the ADR-0018 session signer (C5.1). */

describe("SessionSignerPort (ADR-0018)", () => {
  it("tag is namespaced by the declaring package", () => {
    expect(SessionSignerPort.key).toBe("@cambio/application/SessionSignerPort")
  })

  it("SessionInvalid is tagged and field-less", () => {
    const invalid = new SessionInvalid()
    expect(invalid._tag).toBe("SessionInvalid")
  })

  it("SessionPayload decodes a valid payload and keeps brands", () => {
    const decode = Schema.decodeUnknownEither(SessionPayload)
    const result = decode({
      userId: "00000000-0000-4000-8000-000000000001",
      expiresAt: 1_700_000_000_000,
    })
    expect(Either.isRight(result)).toBe(true)
  })

  it("SessionPayload rejects a non-UUID userId and a fractional expiresAt", () => {
    const decode = Schema.decodeUnknownEither(SessionPayload)
    expect(Either.isLeft(decode({ userId: "not-a-uuid", expiresAt: 1_700_000_000_000 }))).toBe(true)
    expect(
      Either.isLeft(decode({ userId: "00000000-0000-4000-8000-000000000001", expiresAt: 1.5 })),
    ).toBe(true)
  })
})
