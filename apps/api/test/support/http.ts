import { SessionSignerPort } from "@cambio/application"
import { Layer, ManagedRuntime, Redacted } from "effect"
import { pino } from "pino"

import type { AppConfig } from "../../src/config.js"
import { ClockLive } from "../../src/infra/clock.js"
import { GameRepositoryLive } from "../../src/infra/game-repository.js"
import { IdGeneratorLive } from "../../src/infra/ids.js"
import { makeSessionSigner } from "../../src/infra/session-signer.js"
import { UserRepositoryLive } from "../../src/infra/user-repository.js"
import { buildServer } from "../../src/presentation/server.js"
import { TestDatabaseLive } from "./db.js"

/**
 * The `app.inject()` harness (CAM-4 — the repo's first HTTP-level tests).
 *
 * Exported secret on purpose: suites forge authentic-but-hostile tokens
 * (expired, unknown user) with the same signer the server verifies with.
 * Vitest does not load `.env`, so this is a literal, like TEST_DATABASE_URL.
 */
export const TEST_SESSION_SECRET = "cam-4-test-session-secret"

/** Topic-derivation secret for route suites (ADR-0023) — literal, like the above. */
export const TEST_TOPIC_SECRET = "cam-6-test-topic-secret"

export const testSigner = makeSessionSigner(Redacted.make(TEST_SESSION_SECRET))

/** Everything `AppServices` needs, over the test database. */
export const TestAppLayer = Layer.mergeAll(
  ClockLive,
  IdGeneratorLive,
  Layer.succeed(SessionSignerPort, testSigner),
  GameRepositoryLive,
  UserRepositoryLive,
).pipe(Layer.provideMerge(TestDatabaseLive))

const baseConfig: AppConfig = {
  port: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  databaseUrl: Redacted.make("postgres://unused-buildServer-never-connects"),
  webOrigin: "http://localhost:3100",
  prettyLogs: false,
  sessionSecret: Redacted.make(TEST_SESSION_SECRET),
  sessionTtlSeconds: 3600,
  sessionCookieSecure: false,
  sessionCookieSameSite: "lax",
  slamWindowMs: 5000,
  // Route-layer tests never touch the realtime wire (the publisher is a
  // recording stub); literals keep the config total.
  realtimeUrl: "http://realtime-dev.localhost:4000",
  realtimeJwtSecret: Redacted.make("cam-6-test-realtime-jwt-secret-padding-to-32"),
  topicSecret: Redacted.make(TEST_TOPIC_SECRET),
}

/**
 * One `{ app, runtime }` per suite file; `afterAll` must `app.close()` and
 * `runtime.dispose()`. Overrides let attribute/TTL tests pin that cookie
 * behavior follows config (C4.2).
 */
export const makeTestApp = async (overrides?: Partial<AppConfig>) => {
  const config: AppConfig = { ...baseConfig, ...overrides }
  const runtime = ManagedRuntime.make(TestAppLayer)
  const app = await buildServer({
    config,
    logger: pino({ level: "silent" }),
    runtime: await runtime.runtime(),
  })
  return { app, runtime, config }
}
