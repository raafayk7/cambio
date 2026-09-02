import { Cause, type Effect, Exit, Option, Runtime } from "effect"
import type { FastifyReply } from "fastify"

import type { AppServices } from "../runtime.js"
import { errorBody, typedErrorBody } from "./errors.js"

/**
 * Exit-folding route runner (root plan C1.10).
 *
 * `Effect.either` cannot see what a dying room actor produces: a caller
 * racing actor teardown gets a bare interrupt (or a defect) from its
 * Deferred, *outside* the declared error union (ADR-0020 residual). So
 * registry-backed routes run to `Exit` and fold all three cases — typed
 * failure → mapped status + contract body, interrupt/defect → logged 500 —
 * and the reply is always sent, never hung.
 */
export const runRoute =
  (runtime: Runtime.Runtime<AppServices>) =>
  async <A, E extends { readonly _tag: string }>(
    reply: FastifyReply,
    effect: Effect.Effect<A, E, AppServices>,
    options: {
      readonly statusOf: (error: E) => 401 | 404 | 409 | 422 | 500
      readonly onSuccess: (value: A) => unknown
    },
  ): Promise<unknown> => {
    const exit = await Runtime.runPromiseExit(runtime)(effect)
    if (Exit.isSuccess(exit)) {
      return options.onSuccess(exit.value)
    }
    const failure = Cause.failureOption(exit.cause)
    if (Option.isSome(failure)) {
      const status = options.statusOf(failure.value)
      return reply.code(status).send(typedErrorBody(status, failure.value))
    }
    reply.log.error({ cause: Cause.pretty(exit.cause) }, "route effect interrupted or died")
    return reply.code(500).send(errorBody(500))
  }
