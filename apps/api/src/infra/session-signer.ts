import { createHmac, timingSafeEqual } from "node:crypto"

import {
  SessionInvalid,
  SessionPayload,
  SessionSignerPort,
} from "@cambio/application"
import { Effect, Either, Layer, Redacted, Schema } from "effect"

import { AppConfig } from "../config.js"

/**
 * HMAC session signer (ADR-0018). Token format is adapter-private:
 * `base64url(JSON payload) + "." + hex(HMAC-SHA256(secret, base64url part))`.
 *
 * Verification order matters: MAC first (length-guarded `timingSafeEqual`),
 * and only then are the untrusted bytes JSON-parsed and schema-decoded — a
 * forged token never reaches a parser. Expiry is deliberately not checked
 * here; the verify-session use case owns it (see the port's doc).
 */

const mac = (key: string, payloadPart: string) =>
  createHmac("sha256", key).update(payloadPart).digest()

export const makeSessionSigner = (
  secret: Redacted.Redacted<string>,
): typeof SessionSignerPort.Service => {
  const key = Redacted.value(secret)
  const decodePayload = Schema.decodeUnknownEither(SessionPayload)
  const encodePayload = Schema.encodeSync(SessionPayload)
  return {
    sign: (payload) =>
      Effect.sync(() => {
        const part = Buffer.from(JSON.stringify(encodePayload(payload))).toString(
          "base64url",
        )
        return `${part}.${mac(key, part).toString("hex")}`
      }),
    verify: (token) =>
      Effect.suspend(() => {
        const parts = token.split(".")
        if (parts.length !== 2) return new SessionInvalid()
        const [payloadPart, givenHex] = parts as [string, string]

        const expected = mac(key, payloadPart)
        const given = Buffer.from(givenHex, "hex")
        // timingSafeEqual throws on length mismatch; unequal lengths are
        // already shape-invalid, so guard first — constant time is only
        // required between equal-length candidates.
        if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
          return new SessionInvalid()
        }

        let parsed: unknown
        try {
          parsed = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"))
        } catch {
          return new SessionInvalid()
        }
        const payload = decodePayload(parsed)
        return Either.isRight(payload)
          ? Effect.succeed(payload.right)
          : new SessionInvalid()
      }),
  }
}

export const SessionSignerLive = Layer.effect(
  SessionSignerPort,
  Effect.map(AppConfig, (config) => makeSessionSigner(config.sessionSecret)),
)
