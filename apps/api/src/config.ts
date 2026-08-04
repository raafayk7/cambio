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
})

export type AppConfig = typeof AppConfig extends Config.Config<infer A> ? A : never
