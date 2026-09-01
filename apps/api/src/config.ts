import { Config } from "effect"

/**
 * Every environment variable the API reads, in one place.
 *
 * Keep `.env.example` in sync — §10 requires it to cover every variable read
 * anywhere.
 */
export const AppConfig = Config.all({
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
})

export type AppConfig = typeof AppConfig extends Config.Config<infer A> ? A : never
