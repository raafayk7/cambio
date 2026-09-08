import { Schema } from "effect"

/**
 * The error contract (CAM-6) — the curated body every non-2xx API response
 * carries. Widens CAM-4's `{error: string}` to a machine-readable shape:
 * `tag` is the typed error's `_tag` where one exists (`GameError` bodies
 * carry the specific variant, e.g. `"NotYourTurn"`) or a curated constant
 * (`"BadRequest"`, `"NotFound"`, `"Unauthorized"`, `"Internal"`); `message`
 * stays generic — server state is never interpolated into it.
 */
export const ErrorBody = Schema.Struct({
  error: Schema.Struct({
    tag: Schema.String,
    message: Schema.String,
  }),
})
export type ErrorBody = typeof ErrorBody.Type

export const decodeErrorBody = Schema.decodeUnknownSync(ErrorBody)
export const encodeErrorBody = Schema.encodeSync(ErrorBody)
export const decodeErrorBodyEither = Schema.decodeUnknownEither(ErrorBody)
