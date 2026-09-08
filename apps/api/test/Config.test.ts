import { describe, expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, Either, Option, Redacted } from "effect"
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
      expect(result.right.slamWindowMs).toBe(7500)
      expect(result.right.realtimeUrl).toBe("http://realtime-dev.localhost:4000")
    }
  })
})

describe("AppConfig cloud realtime key (CAM-32, C9)", () => {
  it("absent REALTIME_SECRET_KEY loads as none — local mode, everything else unchanged", () => {
    const result = load([DB, REALTIME, TOPIC, ["SESSION_SECRET", "s3cret"]])
    expect(Either.isRight(result)).toBe(true)
    if (Either.isRight(result)) {
      expect(Option.isNone(result.right.realtimeSecretKey)).toBe(true)
      // The local-mode invariants stay untouched by the new optional entry.
      expect(result.right.realtimeUrl).toBe("http://realtime-dev.localhost:4000")
      expect(Redacted.value(result.right.realtimeJwtSecret)).toBe("test-realtime-secret")
    }
  })

  it("present REALTIME_SECRET_KEY loads as a redacted some", () => {
    const result = load([
      DB,
      REALTIME,
      TOPIC,
      ["SESSION_SECRET", "s3cret"],
      ["REALTIME_SECRET_KEY", "sb_secret_test-value"],
    ])
    expect(Either.isRight(result)).toBe(true)
    if (Either.isRight(result)) {
      const key = result.right.realtimeSecretKey
      expect(Option.isSome(key)).toBe(true)
      if (Option.isSome(key)) {
        expect(Redacted.value(key.value)).toBe("sb_secret_test-value")
      }
    }
  })

  it("blank or whitespace REALTIME_SECRET_KEY loads as none — a stray empty .env line must not flip cloud mode (review F1)", () => {
    // `cp .env.example .env` with a blank assignment yields "" in process.env;
    // without the blank-as-absent filter that is Some("") and the transport
    // sends `apikey: ""` at the local container, dying silently.
    for (const blank of ["", "   "]) {
      const result = load([
        DB,
        REALTIME,
        TOPIC,
        ["SESSION_SECRET", "s3cret"],
        ["REALTIME_SECRET_KEY", blank],
      ])
      expect(Either.isRight(result)).toBe(true)
      if (Either.isRight(result)) {
        expect(Option.isNone(result.right.realtimeSecretKey)).toBe(true)
      }
    }
  })
})

describe("AppConfig production cookie guard (CAM-32, C12)", () => {
  const base = [DB, REALTIME, TOPIC, ["SESSION_SECRET", "s3cret"] as const]

  it("NODE_ENV=production without SESSION_COOKIE_SECURE=true fails to load, naming the variable", () => {
    const result = load([...base, ["NODE_ENV", "production"]])
    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) {
      expect(String(result.left)).toContain("SESSION_COOKIE_SECURE")
    }
  })

  it("NODE_ENV=production with SESSION_COOKIE_SECURE=true loads", () => {
    const result = load([...base, ["NODE_ENV", "production"], ["SESSION_COOKIE_SECURE", "true"]])
    expect(Either.isRight(result)).toBe(true)
    if (Either.isRight(result)) {
      expect(result.right.nodeEnv).toBe("production")
      expect(result.right.sessionCookieSecure).toBe(true)
    }
  })

  it("a NODE_ENV typo fails config load naming NODE_ENV — the guard must fail closed, not open (review F2)", () => {
    // With nodeEnv as a bare string, `Production` (capital P) would compare
    // unequal to "production" and skip the guard vacuously — booting with
    // insecure cookies. The literal union turns the typo into a boot failure.
    const result = load([...base, ["NODE_ENV", "Production"]])
    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) {
      expect(String(result.left)).toContain("NODE_ENV")
    }
  })

  it("no NODE_ENV defaults to development — secure-unset still loads (local dev regression pin)", () => {
    const result = load(base)
    expect(Either.isRight(result)).toBe(true)
    if (Either.isRight(result)) {
      expect(result.right.nodeEnv).toBe("development")
      expect(result.right.sessionCookieSecure).toBe(false)
    }
  })
})
