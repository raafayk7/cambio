import { Config, Option, Redacted } from "effect"

/**
 * Every environment variable the API reads, in one place.
 *
 * Keep `.env.example` in sync — §10 requires it to cover every variable read
 * anywhere.
 */
export const AppConfig = Config.all({
  /**
   * Deployment environment (CAM-32). Render sets `production`; unset locally.
   * Drives the C12 cookie guard below — nothing else branches on it. A
   * literal union, not a string (review F2): a typo like `Production` must
   * fail boot, not silently bypass the guard it exists to arm.
   */
  nodeEnv: Config.literal(
    "development",
    "test",
    "production",
  )("NODE_ENV").pipe(Config.withDefault("development" as const)),
  /** Port the Fastify server listens on. Render injects PORT in deployed envs. */
  port: Config.integer("PORT").pipe(Config.withDefault(3001)),
  host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
  logLevel: Config.string("LOG_LEVEL").pipe(Config.withDefault("info")),
  /** Postgres connection string. Docker locally, Supabase in deployed envs. */
  databaseUrl: Config.redacted("DATABASE_URL"),
  /** Allowed browser origin for CORS — the web app. */
  webOrigin: Config.string("WEB_ORIGIN").pipe(Config.withDefault("http://localhost:3000")),
  /** Pretty-print logs instead of emitting JSON lines. */
  prettyLogs: Config.boolean("PRETTY_LOGS").pipe(Config.withDefault(false)),
  /**
   * HMAC secret for session cookies (ADR-0018). No default on purpose: a
   * missing secret fails boot, like DATABASE_URL. Rotating it invalidates
   * every live session — that is the only kill switch stateless sessions
   * have.
   */
  sessionSecret: Config.redacted("SESSION_SECRET"),
  /** Sliding session lifetime (C4.2). 604800 s = 7 days, per ADR-0018 §3. */
  sessionTtlSeconds: Config.integer("SESSION_TTL_SECONDS").pipe(Config.withDefault(604_800)),
  /** Cookie attributes (C4.2): config so deployment flips env vars, not code.
   *  httpOnly and Path=/ are invariants and live in the cookie helper. */
  sessionCookieSecure: Config.boolean("SESSION_COOKIE_SECURE").pipe(Config.withDefault(false)),
  sessionCookieSameSite: Config.literal(
    "lax",
    "strict",
    "none",
  )("SESSION_COOKIE_SAMESITE").pipe(Config.withDefault("lax" as const)),
  /**
   * Slam window duration fed into `GameConfig` at start (ADR-0011: config,
   * never a literal). 7500 (CAM-26 — the duration call lives in the root
   * plan's Decision Log, not ADR-0037) is a middle ground: CAM-23
   * raised the original 5000 to 10000 because the give-pick flow was
   * burning the window before a player could complete it, but CAM-23 also
   * shipped a pre-armed "Ready a give" flow that removes most of that
   * pressure, and CAM-26 adds layered recovery for a window that genuinely
   * strands — so the window can shrink back toward the original 5000
   * without reopening the give-pick problem. Games already in flight keep
   * the value they started with (`GameConfig` is captured at deal time).
   */
  slamWindowMs: Config.integer("SLAM_WINDOW_MS").pipe(Config.withDefault(7500)),
  /**
   * Supabase Realtime base URL (ADR-0024). The tenant is resolved from the
   * Host's first label, so locally this must be realtime-dev.localhost, not
   * bare localhost.
   */
  realtimeUrl: Config.string("REALTIME_URL").pipe(
    Config.withDefault("http://realtime-dev.localhost:4000"),
  ),
  /**
   * HS256 secret the publish/subscribe JWTs are signed with (ADR-0024). Must
   * equal the realtime container's API_JWT_SECRET. No default: like
   * SESSION_SECRET, a missing value fails boot.
   */
  realtimeJwtSecret: Config.redacted("REALTIME_JWT_SECRET"),
  /**
   * Supabase cloud Realtime secret key (`sb_secret_…`, ADR-0041). Optional —
   * its presence IS the cloud-mode switch: the broadcast transport sends it
   * as `apikey` + bearer and mints no JWT. Unset locally (self-signed JWTs
   * against the compose container, unchanged). Blank/whitespace counts as
   * unset (review F1): a stray `REALTIME_SECRET_KEY=` line in a copied .env
   * or dashboard must not flip the transport into cloud mode with an empty
   * key. Server-only credential: never VITE_-prefixed, never logged.
   */
  realtimeSecretKey: Config.option(Config.redacted("REALTIME_SECRET_KEY")).pipe(
    Config.map(Option.filter((key) => Redacted.value(key).trim().length > 0)),
  ),
  /**
   * HMAC secret channel-topic capabilities are derived from (ADR-0023).
   * Deterministic derivation keeps topics stable across restarts without
   * persistence; rotating this severs every live subscription.
   */
  topicSecret: Config.redacted("TOPIC_SECRET"),
}).pipe(
  // C12 (CAM-32): a forgotten Render env var must not silently issue
  // insecure cookies — production refuses to boot instead. index.ts resolves
  // AppConfig before binding a port, so this failure exits nonzero for free.
  Config.validate({
    message:
      "NODE_ENV=production requires SESSION_COOKIE_SECURE=true — set SESSION_COOKIE_SECURE=true in the deployed environment",
    validation: (config) => config.nodeEnv !== "production" || config.sessionCookieSecure,
  }),
)

export type AppConfig = typeof AppConfig extends Config.Config<infer A> ? A : never
