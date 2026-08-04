import { pino, type Logger } from "pino"

/**
 * The Pino instance handed to Fastify as its `loggerInstance`, so application
 * logs and request logs land in the same stream.
 */
export const makeLogger = (options: { readonly level: string; readonly pretty: boolean }): Logger =>
  pino({
    level: options.level,
    ...(options.pretty
      ? { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss.l" } } }
      : {}),
    redact: {
      // Never let a connection string or auth header reach the log stream.
      paths: ["req.headers.authorization", "req.headers.cookie", "DATABASE_URL"],
      remove: true,
    },
  })
