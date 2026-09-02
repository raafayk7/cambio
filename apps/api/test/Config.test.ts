import { describe, expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, Either } from "effect"
import { AppConfig } from "../src/config.js"

/** C4.1 (secret required) and C4.2 (TTL + cookie attribute defaults). No DB. */

const load = (entries: ReadonlyArray<readonly [string, string]>) =>
  Effect.runSync(
    Effect.either(
      AppConfig.pipe(Effect.withConfigProvider(ConfigProvider.fromMap(new Map(entries)))),
    ),
  )

const DB = ["DATABASE_URL", "postgres://unused"] as const
// CAM-6's required secrets (root C5.2): present in every load that expects
// success, like SESSION_SECRET before them.
const REALTIME = ["REALTIME_JWT_SECRET", "test-realtime-secret"] as const
const TOPIC = ["TOPIC_SECRET", "test-topic-secret"] as const

describe("AppConfig session entries (ADR-0018)", () => {
  it("missing SESSION_SECRET fails to load, naming the variable (C4.1)", () => {
    const result = load([DB, REALTIME, TOPIC])
    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) {
      expect(String(result.left)).toContain("SESSION_SECRET")
    }
  })

  it("with only the secret supplied, TTL and cookie attributes take the documented defaults (C4.2)", () => {
    const result = load([DB, REALTIME, TOPIC, ["SESSION_SECRET", "s3cret"]])
    expect(Either.isRight(result)).toBe(true)
    if (Either.isRight(result)) {
      expect(result.right.sessionTtlSeconds).toBe(604_800)
      expect(result.right.sessionCookieSecure).toBe(false)
      expect(result.right.sessionCookieSameSite).toBe("lax")
    }
  })

  it("cookie attributes and TTL follow the environment when set (C4.2)", () => {
    const result = load([
      DB,
      REALTIME,
      TOPIC,
      ["SESSION_SECRET", "s3cret"],
      ["SESSION_TTL_SECONDS", "3600"],
      ["SESSION_COOKIE_SECURE", "true"],
      ["SESSION_COOKIE_SAMESITE", "none"],
    ])
    expect(Either.isRight(result)).toBe(true)
    if (Either.isRight(result)) {
      expect(result.right.sessionTtlSeconds).toBe(3600)
      expect(result.right.sessionCookieSecure).toBe(true)
      expect(result.right.sessionCookieSameSite).toBe("none")
    }
  })

  it("an unknown SameSite value is rejected, not passed through", () => {
    const result = load([
      DB,
      REALTIME,
      TOPIC,
      ["SESSION_SECRET", "s3cret"],
      ["SESSION_COOKIE_SAMESITE", "sideways"],
    ])
    expect(Either.isLeft(result)).toBe(true)
  })
})

describe("AppConfig realtime entries (CAM-6, C5.2)", () => {
  it("missing REALTIME_JWT_SECRET fails to load, naming the variable", () => {
    const result = load([DB, TOPIC, ["SESSION_SECRET", "s3cret"]])
    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) {
      expect(String(result.left)).toContain("REALTIME_JWT_SECRET")
    }
  })

  it("missing TOPIC_SECRET fails to load, naming the variable", () => {
    const result = load([DB, REALTIME, ["SESSION_SECRET", "s3cret"]])
    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) {
      expect(String(result.left)).toContain("TOPIC_SECRET")
    }
  })

  it("slam window and realtime URL take the documented defaults", () => {
    const result = load([DB, REALTIME, TOPIC, ["SESSION_SECRET", "s3cret"]])
    expect(Either.isRight(result)).toBe(true)
    if (Either.isRight(result)) {
      expect(result.right.slamWindowMs).toBe(5000)
      expect(result.right.realtimeUrl).toBe("http://realtime-dev.localhost:4000")
    }
  })
})
