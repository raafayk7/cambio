import { Effect } from "effect"
import { type GameState, type StorageError, type UserId, UserRepository } from "@cambio/domain"

/**
 * The names companion to `viewFor` (CAM-17 C2): one batch lookup turning a
 * `GameState` into the `names` map the projection embeds. Composed with the
 * pure `viewFor` by `viewForEffect` — the one projection every route uses —
 * because names live in the `users` table, never in the fold-rebuilt state,
 * so the snapshot path fetches them per request (one `IN` query for ≤5 rows,
 * accepted v0).
 *
 * Missing ids are simply absent from the map — `viewFor`'s `?? "—"` arm
 * handles the (unreachable-by-FK) soft-deleted edge.
 */
export const playerNames = (
  state: GameState,
): Effect.Effect<ReadonlyMap<UserId, string>, StorageError, UserRepository> =>
  Effect.gen(function* () {
    const users = yield* UserRepository
    const found = yield* users.findManyById(state.players.map((p) => p.id))
    return new Map(found.map((u) => [u.id, u.name]))
  })
