import { describe, expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, Either } from "effect"
import { AppConfig } from "../src/config.js"

/** C4.1 (secret required) and C4.2 (TTL + cookie attribute defaults). No DB. */

const load = (entries: ReadonlyArray<readonly [string, string]>) =>
  Effect.runSync(
    Effect.either(
      AppConfig.pipe(
        Effect.withConfigProvider(ConfigProvider.fromMap(new Map(entries))),
      ),
    ),
  )

const DB = ["DATABASE_URL", "postgres://unused"] as const

describe("AppConfig session entries (ADR-0018)", () => {
  it("missing SESSION_SECRET fails to load, naming the variable (C4.1)", () => {
    const result = load([DB])
    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) {
      expect(String(result.left)).toContain("SESSION_SECRET")
    }
  })

  it("with only the secret supplied, TTL and cookie attributes take the documented defaults (C4.2)", () => {
    const result = load([DB, ["SESSION_SECRET", "s3cret"]])
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
      ["SESSION_SECRET", "s3cret"],
      ["SESSION_COOKIE_SAMESITE", "sideways"],
    ])
    expect(Either.isLeft(result)).toBe(true)
  })
})
