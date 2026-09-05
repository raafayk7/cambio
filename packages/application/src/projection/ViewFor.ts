import type * as Contracts from "@cambio/contracts"
import {
  gameScores,
  type GameState,
  type Lobby,
  type Phase,
  type StorageError,
  type UserId,
  type UserRepository,
  winnersOf,
} from "@cambio/domain"
import { Effect } from "effect"
import { playerNames } from "./PlayerNames.js"

/**
 * The single server-side projection (§5, ADR-0021): everything one player may
 * see of a game, and nothing else. Every payload that leaves the server for a
 * client goes through this function (snapshots) or `EventProjection.ts`
 * (realtime events) — there is no other path.
 *
 * Structural truth only: hands (the viewer's own included) are occupied slot
 * indices without values; the deck is a count; the PRNG state does not exist
 * here. Private card values are delivered once, at event time, on the
 * per-player channel and never re-sent by this snapshot — remembering is the
 * game (§5.1).
 *
 * Entitlement is decidable from `(playerId, state)` alone (ADR-0021):
 *   - a card-carrying phase shows its value to the holder, always;
 *   - `HoldingCard` with `source === "discard"` shows it to everyone — the
 *     card came off the public pile;
 *   - at `Ended`, all hands and scores are revealed (§1.8).
 */

const projectPhase = (viewerId: UserId, phase: Phase): Contracts.ViewPhase => {
  switch (phase._tag) {
    case "AwaitingDraw":
      return { _tag: "AwaitingDraw", playerId: phase.playerId }
    case "HoldingCard": {
      const entitled = phase.playerId === viewerId || phase.source === "discard"
      return {
        _tag: "HoldingCard",
        playerId: phase.playerId,
        source: phase.source,
        ...(entitled ? { card: phase.card } : {}),
      }
    }
    case "ResolvingPower":
      return {
        _tag: "ResolvingPower",
        playerId: phase.playerId,
        ...(phase.playerId === viewerId ? { card: phase.card } : {}),
      }
    case "ResolvingQueenSwap":
      return {
        _tag: "ResolvingQueenSwap",
        playerId: phase.playerId,
        ...(phase.playerId === viewerId ? { card: phase.card } : {}),
      }
    case "SlamWindow":
      return {
        _tag: "SlamWindow",
        turnPlayerId: phase.turnPlayerId,
        closesAt: phase.closesAt,
        rank: phase.rank,
      }
    case "Ended":
      return { _tag: "Ended", calledBy: phase.calledBy }
    default:
      return phase satisfies never
  }
}

/** The §1.8 endgame reveal — public by rule, identical for every viewer. */
const revealOf = (state: GameState): Contracts.Reveal => {
  const scores = gameScores(state)
  return {
    hands: state.players.map((p) => ({
      playerId: p.id,
      cards: p.hand.map((s) => ({ slotIndex: s.slotIndex, card: s.card })),
    })),
    scores: scores.map((s) => ({ playerId: s.playerId, total: s.total })),
    winners: winnersOf(scores),
  }
}

/**
 * The pure projection, kept exported as the test seam (routes compose it via
 * `viewForEffect`). `names` (CAM-17 C2): the players' public display names —
 * they live in the `users` table, never in the fold-rebuilt `GameState`. The
 * `?? "—"` arm is FK-unreachable (`game_players` FKs to `users` in every
 * reachable game); `"—"` is the loud-but-valid totality value — it decodes
 * under the contracts `DisplayName` schema where `""` would not. Names are
 * public labels, identical for every viewer.
 */
export const viewFor = (
  viewerId: UserId,
  state: GameState,
  names: ReadonlyMap<UserId, string>,
): Contracts.PlayerGameView => ({
  players: state.players.map((p) => ({
    id: p.id,
    name: names.get(p.id) ?? "—",
    hand: p.hand.map((s) => s.slotIndex),
  })),
  deckCount: state.deck.length,
  discard: [...state.discard],
  phase: projectPhase(viewerId, state.phase),
  // The started-with config (C4): definitionally the value the game runs on —
  // `GameState.config` is persisted and round-tripped, never re-read from env.
  config: { slamWindowMs: state.config.slamWindowMs },
  ...(state.phase._tag === "Ended" ? { reveal: revealOf(state) } : {}),
})

/**
 * THE projection every route uses (CAM-17 F5): one self-contained Effect —
 * fetch the players' names via `playerNames`, then run the pure `viewFor`.
 * Routes never assemble the names map themselves; per-handler assembly is
 * exactly the scattered-redaction shape hidden-information §viewFor exists
 * to prevent. The pure 3-arg `viewFor` above stays exported as the test seam.
 */
export const viewForEffect = (
  viewerId: UserId,
  state: GameState,
): Effect.Effect<Contracts.PlayerGameView, StorageError, UserRepository> =>
  Effect.map(playerNames(state), (names) => viewFor(viewerId, state, names))

/** The lobby is fully public (ADR-0019) — one shape for every viewer. */
export const lobbyView = (lobby: Lobby): Contracts.LobbyView => ({
  id: lobby.id,
  // Names are public labels (CAM-17 C1) — every recipient may see them.
  members: lobby.members.map((m) => ({ id: m.id, name: m.name })),
  status: lobby.status,
})
