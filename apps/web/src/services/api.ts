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

// Ad-hoc tunnel support (ngrok or similar), opt-in only, mirrors
// `VITE_TUNNEL_HOST` in vite.config.ts: when set, requests go same-origin
// (relative path) so vite.config.ts's dev proxy carries them to the API —
// required because two independent tunnel subdomains are cross-SITE under
// the public suffix list, so the session cookie (SameSite=Lax) would never
// survive a direct cross-tunnel fetch. Unset (the default): byte-identical
// to before, a plain cross-origin call to VITE_API_URL.
const TUNNEL_MODE: boolean = Boolean(import.meta.env.VITE_TUNNEL_HOST?.trim())
const API_URL: string = TUNNEL_MODE ? "" : (import.meta.env.VITE_API_URL ?? "http://localhost:3001")

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
    headers: {
      // Skips ngrok's free-tier browser-warning interstitial (which
      // otherwise intercepts real-browser requests, even XHR/fetch, and
      // returns HTML instead of JSON). Gated behind TUNNEL_MODE so a
      // normal (non-tunnel) request never carries a non-safelisted header
      // that would turn an otherwise-simple cross-origin request into a
      // preflighted one for no reason.
      ...(TUNNEL_MODE ? { "ngrok-skip-browser-warning": "true" } : {}),
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
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
