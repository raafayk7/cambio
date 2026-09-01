import { Schema } from "effect"
import { ChannelGrants } from "./Channel.js"
import { GameVersion } from "./GamePrimitives.js"
import { LobbyView, PlayerGameView } from "./GameView.js"

/**
 * Reply envelopes (CAM-6, root plan C1/C6). Game replies are `{view,
 * version}` and nothing else: no raw state, no raw events — private values
 * travel exclusively on the per-player channel (root Decision Log). The
 * version rides beside the view for client staleness checks (C2.6).
 */

/** `POST /lobbies` (201) and `POST /lobbies/:gameId/join`: the caller gets their grants. */
export const LobbyResponse = Schema.Struct({
  lobby: LobbyView,
  version: GameVersion,
  grants: ChannelGrants,
})
export type LobbyResponse = typeof LobbyResponse.Type

/** `POST /lobbies/:gameId/leave`: no grants — the caller just gave theirs up. */
export const LeaveLobbyResponse = Schema.Struct({
  lobby: LobbyView,
  version: GameVersion,
})
export type LeaveLobbyResponse = typeof LeaveLobbyResponse.Type

/** `POST /lobbies/:gameId/start` and `POST /games/:gameId/commands`. */
export const GameReply = Schema.Struct({
  view: PlayerGameView,
  version: GameVersion,
})
export type GameReply = typeof GameReply.Type

/** `GET /games/:gameId/view`: the snapshot plus the caller's grants (reconnect bootstrap). */
export const ViewResponse = Schema.Struct({
  view: PlayerGameView,
  version: GameVersion,
  grants: ChannelGrants,
})
export type ViewResponse = typeof ViewResponse.Type

export const decodeLobbyResponse = Schema.decodeUnknownSync(LobbyResponse)
export const encodeLobbyResponse = Schema.encodeSync(LobbyResponse)
export const decodeLeaveLobbyResponse = Schema.decodeUnknownSync(LeaveLobbyResponse)
export const encodeLeaveLobbyResponse = Schema.encodeSync(LeaveLobbyResponse)
export const decodeGameReply = Schema.decodeUnknownSync(GameReply)
export const encodeGameReply = Schema.encodeSync(GameReply)
export const decodeViewResponse = Schema.decodeUnknownSync(ViewResponse)
export const encodeViewResponse = Schema.encodeSync(ViewResponse)
