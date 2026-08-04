import { Schema } from "effect"

/** Response body of `GET /health`. */
export const HealthResponse = Schema.Struct({
  ok: Schema.Literal(true),
})
export type HealthResponse = typeof HealthResponse.Type

export const decodeHealthResponse = Schema.decodeUnknownSync(HealthResponse)
export const encodeHealthResponse = Schema.encodeSync(HealthResponse)
