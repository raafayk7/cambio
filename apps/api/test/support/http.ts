import {
  RealtimePublisherPort,
  RoomRegistryLive,
  SeedPort,
  SessionSignerPort,
} from "@cambio/application"
import type { GameEvent, GameId, GameState, Lobby } from "@cambio/domain"
import { Effect, Layer, ManagedRuntime, Redacted } from "effect"
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

/**
 * Fixed seed (decision 15): the e2e suite replays `dealGame` in-test — the
 * domain is pure — to know full truth and pick legal commands, while
 * asserting the HTTP replies reveal none of it.
 */
export const TEST_SEED = 424_242

export type PublishedEntry =
  | { readonly _tag: "game"; readonly gameId: GameId; readonly state: GameState; readonly events: ReadonlyArray<GameEvent> }
  | { readonly _tag: "lobby"; readonly gameId: GameId; readonly lobby: Lobby }

/**
 * Recording publisher journal — shared across suites (fileParallelism is
 * off); clear it before assertions that count entries.
 */
export const publisherJournal: Array<PublishedEntry> = []
export const clearPublisherJournal = () => {
  publisherJournal.length = 0
}

const recordingPublisher = Layer.succeed(RealtimePublisherPort, {
  publishGame: (gameId, state, events) =>
    Effect.sync(() => {
      publisherJournal.push({ _tag: "game", gameId, state, events })
    }),
  publishLobby: (gameId, lobby) =>
    Effect.sync(() => {
      publisherJournal.push({ _tag: "lobby", gameId, lobby })
    }),
})

const PortsLayer = Layer.mergeAll(
  ClockLive,
  IdGeneratorLive,
  Layer.succeed(SessionSignerPort, testSigner),
  Layer.succeed(SeedPort, { nextSeed: Effect.succeed(TEST_SEED) }),
  recordingPublisher,
  GameRepositoryLive,
  UserRepositoryLive,
)

/** Everything `AppServices` needs, over the test database. */
export const TestAppLayer = Layer.mergeAll(
  PortsLayer,
  RoomRegistryLive.pipe(Layer.provide(PortsLayer)),
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
