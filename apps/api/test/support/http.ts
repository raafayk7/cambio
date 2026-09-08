import {
  ClockPort,
  RealtimePublisherPort,
  RoomRegistryLive,
  SeedPort,
  SessionSignerPort,
} from "@cambio/application"
import type { GameEvent, GameId, GameState, GameVersion, Lobby } from "@cambio/domain"
import { Timestamp } from "@cambio/domain"
import { Effect, Layer, ManagedRuntime, Option, Redacted, Ref } from "effect"
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
 * asserting the HTTP replies reveal none of it. Re-surveyed under CAM-31's
 * empty-discard deal (ADR-0039), which shifted the deck cut by one card and
 * invalidated the old value's offline seed survey (SlamWindow.test.ts:
 * "TEST_SEED's FIRST window has a rank-matching card in Bob's hand") —
 * 424_243 restores that property.
 */
export const TEST_SEED = 424_243

export type PublishedEntry =
  | {
      readonly _tag: "game"
      readonly gameId: GameId
      readonly state: GameState
      readonly events: ReadonlyArray<GameEvent>
    }
  | {
      readonly _tag: "lobby"
      readonly gameId: GameId
      readonly lobby: Lobby
      readonly version: GameVersion
    }

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
  publishLobby: (gameId, lobby, version) =>
    Effect.sync(() => {
      publisherJournal.push({ _tag: "lobby", gameId, lobby, version })
    }),
})

/**
 * Settable authority clock (CAM-7): a `Ref`-backed `ClockPort`, twin of the
 * one in `packages/application/test/support/stubs.ts`. Only the engine and
 * lateness checks read it — the actor's timer fiber sleeps on the runtime
 * clock (real time here; no TestClock in a ManagedRuntime), so suites that
 * must keep timers inert use a large `slamWindowMs` and move only this.
 */
export const makeSettableClock = (start: number) => {
  const ref = Effect.runSync(Ref.make<Timestamp>(Timestamp.make(start)))
  return {
    layer: Layer.succeed(ClockPort, { now: Ref.get(ref) }),
    set: (t: number): void => Effect.runSync(Ref.set(ref, Timestamp.make(t))),
  }
}

/** Port overrides for `makeTestApp` (CAM-7). Defaults match production-shape wiring. */
export interface TestPorts {
  readonly clock?: Layer.Layer<ClockPort>
  readonly seed?: number
}

/**
 * Ports assembled per app so an injected clock reaches `RoomRegistryLive`
 * at construction — a layer merged on top of a built `TestAppLayer` would
 * never be seen by the registry (root plan Surprise, milestone M1).
 */
const makePortsLayer = (ports?: TestPorts) =>
  Layer.mergeAll(
    ports?.clock ?? ClockLive,
    IdGeneratorLive,
    Layer.succeed(SessionSignerPort, testSigner),
    Layer.succeed(SeedPort, { nextSeed: Effect.succeed(ports?.seed ?? TEST_SEED) }),
    recordingPublisher,
    GameRepositoryLive,
    UserRepositoryLive,
  )

const makeAppLayer = (ports?: TestPorts) => {
  const portsLayer = makePortsLayer(ports)
  return Layer.mergeAll(portsLayer, RoomRegistryLive.pipe(Layer.provide(portsLayer))).pipe(
    Layer.provideMerge(TestDatabaseLive),
  )
}

/** Everything `AppServices` needs, over the test database (default ports). */
export const TestAppLayer = makeAppLayer()

const baseConfig: AppConfig = {
  // "test", not "production": the C12 guard must stay out of the way here —
  // cookie-attribute suites drive secure/sameSite via overrides, not NODE_ENV.
  nodeEnv: "test",
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
  realtimeSecretKey: Option.none(),
  topicSecret: Redacted.make(TEST_TOPIC_SECRET),
}

/**
 * One `{ app, runtime }` per suite file; `afterAll` must `app.close()` and
 * `runtime.dispose()`. Overrides let attribute/TTL tests pin that cookie
 * behavior follows config (C4.2); `ports` lets timing suites inject a
 * settable clock or a per-scenario seed (CAM-7 M1).
 */
export const makeTestApp = async (overrides?: Partial<AppConfig>, ports?: TestPorts) => {
  const config: AppConfig = { ...baseConfig, ...overrides }
  const runtime = ManagedRuntime.make(ports === undefined ? TestAppLayer : makeAppLayer(ports))
  const app = await buildServer({
    config,
    logger: pino({ level: "silent" }),
    runtime: await runtime.runtime(),
  })
  return { app, runtime, config }
}
