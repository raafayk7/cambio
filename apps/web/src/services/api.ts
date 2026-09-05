import { decodeErrorBodyEither } from "@cambio/contracts"

/**
 * The API access layer (CAM-17 W1). One function, used by every hook:
 *
 *   - `credentials: "include"` on EVERY call — the httpOnly `cambio_session`
 *     cookie must cross the 3000→3001 origin boundary (the API's CORS is
 *     already `credentials: true`).
 *   - Responses are decoded through the contracts schemas at this edge; an
 *     undecodable 2xx throws (the sync decoders throw ParseError), so a
 *     wrong-shaped payload surfaces as a query/mutation error — never as
 *     silently-wrong state (projection-renderer discipline: the wire is
 *     never trusted).
 *   - Non-2xx bodies are decoded with `decodeErrorBodyEither` into a typed
 *     `ApiError` carrying `{status, tag, message}`; undecodable error bodies
 *     fall back to a generic ApiError so the status always survives.
 */

export class ApiError extends Error {
  readonly status: number
  readonly tag: string

  constructor(status: number, tag: string, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.tag = tag
  }
}

const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:3001"

export interface ApiRequestOptions<A> {
  method?: "GET" | "POST"
  /** JSON-encoded when present. */
  body?: unknown
  /** A contracts decoder (`decodeUnknownSync` shape) — throws on bad wire. */
  decode: (input: unknown) => A
}

export async function apiRequest<A>(path: string, options: ApiRequestOptions<A>): Promise<A> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    ...(options.body !== undefined
      ? {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(options.body),
        }
      : {}),
  })

  if (!response.ok) {
    // Fallback first: an empty or non-JSON error body still yields a typed
    // ApiError with the status — the tag just stays generic.
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new ApiError(response.status, "Unknown", `request failed (${response.status})`)
    }
    const decoded = decodeErrorBodyEither(payload)
    if (decoded._tag === "Right") {
      throw new ApiError(response.status, decoded.right.error.tag, decoded.right.error.message)
    }
    throw new ApiError(response.status, "Unknown", `request failed (${response.status})`)
  }

  return options.decode(await response.json())
}
