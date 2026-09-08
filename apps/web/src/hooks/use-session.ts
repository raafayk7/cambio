import { decodeSessionUser, type SessionUser } from "@cambio/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { ApiError, apiRequest } from "../services/api.js"

/**
 * Identity (CAM-17 W2), shared by the lobby and room surfaces.
 *
 * The `["me"]` query resolves a 401 to `{state: "unauthenticated"}` DATA
 * rather than an error — so the query's error state means *broken* (network,
 * 5xx), never *new visitor*. The `POST /users` mutation writes the created
 * SessionUser straight into the `["me"]` cache: the app behaves
 * authenticated without a reload. No rename in v0 — the form only ever
 * shows while unauthenticated.
 */

export type Session =
  | { readonly state: "authenticated"; readonly user: SessionUser }
  | { readonly state: "unauthenticated" }

export function useSession() {
  const queryClient = useQueryClient()

  const session = useQuery({
    queryKey: ["me"],
    queryFn: async (): Promise<Session> => {
      try {
        const user = await apiRequest("/me", { decode: decodeSessionUser })
        return { state: "authenticated", user }
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          return { state: "unauthenticated" }
        }
        throw error
      }
    },
  })

  const createUser = useMutation({
    mutationFn: (name: string) =>
      apiRequest("/users", { method: "POST", body: { name }, decode: decodeSessionUser }),
    onSuccess: (user) => {
      const authenticated: Session = { state: "authenticated", user }
      queryClient.setQueryData<Session>(["me"], authenticated)
    },
  })

  return { session, createUser }
}

/**
 * Voice.md copy for a failed `POST /users` (what went wrong, then the fix).
 * A 400 is the only bad-request cause the endpoint has: the name rule.
 */
export function sessionErrorCopy(error: unknown): string | undefined {
  if (error === null || error === undefined) return undefined
  if (error instanceof ApiError && error.status === 400) {
    return "That name didn't work. Use 1 to 32 characters."
  }
  return "Couldn't save your name. Check your connection and try again."
}
