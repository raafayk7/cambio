import { createHmac } from "node:crypto"

/**
 * Minimal HS256 JWT signer for Supabase Realtime (ADR-0024). Realtime
 * accepts any HS256 JWT signed with the tenant's `jwt_secret`
 * (= `API_JWT_SECRET` in the self-hosted container) carrying `role` and
 * `exp` claims — no GoTrue involved, so twenty lines of `node:crypto` beat a
 * JWT dependency. Used by the publisher's REST client, and exported for the
 * integration suite's subscriber `apikey`.
 */

const b64url = (value: object): string =>
  Buffer.from(JSON.stringify(value)).toString("base64url")

export const signRealtimeJwt = (
  secret: string,
  options?: {
    readonly role?: string
    /** Seconds from now; default one hour. */
    readonly expiresInSeconds?: number
  },
): string => {
  const header = b64url({ alg: "HS256", typ: "JWT" })
  const payload = b64url({
    role: options?.role ?? "anon",
    exp: Math.floor(Date.now() / 1000) + (options?.expiresInSeconds ?? 3600),
  })
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url")
  return `${header}.${payload}.${signature}`
}
