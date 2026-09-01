import { Context, type Effect } from "effect"
import { type GameEvent, type GameId, type GameState, type Lobby } from "@cambio/domain"

/**
 * Realtime publisher port.
 *
 * Use cases sequence load → decide → persist → **publish** (§6); this port is
 * the publish step. It receives the post-command state alongside the event
 * batch so the adapter can build per-player projections without reloading.
 *
 * **Hidden-information warning (§5):** everything passed here is full truth —
 * hands, the deck, the shuffled future of the game. The CAM-6 adapter MUST
 * apply the `viewFor` projection before anything leaves the server; this port
 * is server-side plumbing only and nothing crossing it may reach a client
 * unprojected.
 *
 * No error channel by design: a persisted command must never fail because
 * realtime hiccupped — delivery failures are the adapter's concern.
 *
 * Implementations live in `apps/api/src/infra` (arriving with CAM-6).
 */
export class RealtimePublisherPort extends Context.Tag("@cambio/application/RealtimePublisherPort")<
  RealtimePublisherPort,
  {
    readonly publishGame: (
      gameId: GameId,
      state: GameState,
      events: ReadonlyArray<GameEvent>,
    ) => Effect.Effect<void>
    readonly publishLobby: (gameId: GameId, lobby: Lobby) => Effect.Effect<void>
  }
>() {}
