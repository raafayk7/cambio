import { SqlClient } from "@effect/sql"
import { Effect, Layer, Schema } from "effect"

import {
  encodeGameEvent,
  encodeGameState,
  GameEvent,
  GameNotFound,
  GameRepository,
  GameState,
  GameVersion,
  Lobby,
  StorageError,
  VersionConflict,
  type GameId,
  type LobbyStatus,
  type UserId,
} from "@cambio/domain"

/**
 * `GameRepository` adapter (ADR-0015): the whole aggregate — `games`,
 * `game_players`, `decks`, `user_cards`, `card_peeks`, `game_events` — is
 * written in ONE transaction per `save`, guarded by `games.version`, so a
 * state row without its events cannot exist (§6). Rows cross the boundary
 * only through the domain Schema codecs; every read filters
 * `deleted_at IS NULL` (§7 — the domain never sees soft delete); SQL errors
 * surface as typed `StorageError` values, never throws.
 *
 * Everything in these tables is full truth (`decks.cards` is the shuffled
 * future of the game; event payloads include every hand). It is server-only
 * by construction — nothing here may ever reach a client without the later
 * `viewFor` projection (§5, `hidden-information` skill).
 */

/**
 * Persistence actor for an event (`game_events.actor_id`, root plan C3.8).
 * Exhaustive over all 22 tags: a new event variant fails this build. Null
 * for the actorless events — the system-driven deal, clock-driven close,
 * and automatic reshuffle.
 */
export const actorOf = (event: GameEvent): UserId | null => {
  switch (event._tag) {
    case "GameStarted":
    case "SlamWindowClosed":
    case "DeckReshuffled":
      return null
    case "CambioCalled":
    case "CardDrawn":
    case "DiscardTaken":
    case "HeldSwapped":
    case "HeldKept":
    case "HeldDiscarded":
    case "PowerFizzled":
    case "PowerDiscarded":
    case "PenaltyDrawn":
    case "DrawSkipped":
    case "TurnAdvanced":
      return event.playerId
    case "GameEnded":
      return event.calledBy
    case "CardPeeked":
      return event.viewerId
    case "CardsBlindSwapped":
      return event.by
    case "SlamWindowOpened":
      return event.turnPlayerId
    case "SlamSucceeded":
    case "SlamFailed":
    case "CardGivenFromHand":
    case "CardGivenFromDeck":
      return event.slammerId
    default:
      return event satisfies never
  }
}

const storage =
  (operation: string) =>
  (cause: unknown): StorageError =>
    new StorageError({ operation, cause })

export const GameRepositoryLive = Layer.effect(
  GameRepository,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    // `${array}` in @effect/sql is an IN-list helper, not a PG array, so
    // text[] columns bind through string_to_array. Safe: CardSlug is a fixed
    // two-character token that can never contain the separator.
    const textArray = (items: ReadonlyArray<string>) =>
      sql`string_to_array(${items.join(",")}, ',')`

    // Not sql.json: node-postgres serializes a JS *array* parameter as a PG
    // array literal ({a,b}), which is invalid json — PrngState is a tuple.
    // Pre-stringifying makes every shape unambiguous.
    const jsonb = (value: unknown) => sql`${JSON.stringify(value)}::jsonb`

    const liveVersion = (gameId: GameId) =>
      sql<{ version: number }>`
        SELECT version FROM games WHERE game_id = ${gameId} AND deleted_at IS NULL
      `.pipe(
        Effect.map((rows) =>
          rows.length === 0 ? null : GameVersion.make(Number(rows[0]!.version)),
        ),
      )

    // A never-dealt row (NULL phase — a lobby, or an abandoned lobby) is not
    // a game: `load`/`getEvents` treat it as GameNotFound rather than letting
    // the NULL surface as a misleading decode StorageError (ADR-0019).
    const gameExists = (gameId: GameId) =>
      sql<{ ok: number }>`
        SELECT 1 AS ok FROM games
        WHERE game_id = ${gameId} AND deleted_at IS NULL AND phase IS NOT NULL
      `.pipe(Effect.map((rows) => rows.length > 0))

    const failConflict = (gameId: GameId, expected: GameVersion) =>
      liveVersion(gameId).pipe(
        Effect.flatMap((actual) => Effect.fail(new VersionConflict({ gameId, expected, actual }))),
      )

    return {
      save: (input) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              const encoded = yield* Effect.try({
                try: () => encodeGameState(input.state),
                catch: storage("games.encode"),
              })
              const status = input.state.phase._tag === "Ended" ? "completed" : "in_progress"
              const newVersion = GameVersion.make(input.expectedVersion + 1)

              // 1. games — the version guard; this row's lock serializes
              // every concurrent writer for the game.
              if (input.expectedVersion === 0) {
                const inserted = yield* sql`
                  INSERT INTO games (game_id, status, phase, discard_pile, prng, config, version)
                  VALUES (${input.gameId}, ${status}, ${jsonb(encoded.phase)},
                          ${textArray(encoded.discard)}, ${jsonb(encoded.prng)},
                          ${jsonb(encoded.config)}, ${newVersion})
                  ON CONFLICT (game_id) DO NOTHING
                  RETURNING game_id
                `
                if (inserted.length === 0) {
                  return yield* failConflict(input.gameId, input.expectedVersion)
                }
              } else {
                const updated = yield* sql`
                  UPDATE games
                  SET status = ${status}, phase = ${jsonb(encoded.phase)},
                      discard_pile = ${textArray(encoded.discard)},
                      prng = ${jsonb(encoded.prng)},
                      config = ${jsonb(encoded.config)},
                      version = ${newVersion}, updated_at = now()
                  WHERE game_id = ${input.gameId}
                    AND version = ${input.expectedVersion}
                    AND deleted_at IS NULL
                  RETURNING game_id
                `
                if (updated.length === 0) {
                  return yield* failConflict(input.gameId, input.expectedVersion)
                }
              }

              // 2. game_players — seat order materializes the players array;
              // final_score never reverts once written (COALESCE).
              const ended = input.newEvents.find((e) => e._tag === "GameEnded")
              const finalScores = new Map(
                ended?._tag === "GameEnded"
                  ? ended.scores.map((s) => [s.playerId as string, s.total])
                  : [],
              )
              for (const [seat, player] of input.state.players.entries()) {
                yield* sql`
                  INSERT INTO game_players (game_id, user_id, seat_index, final_score)
                  VALUES (${input.gameId}, ${player.id}, ${seat},
                          ${finalScores.get(player.id) ?? null})
                  ON CONFLICT (game_id, user_id) DO UPDATE
                  SET seat_index = EXCLUDED.seat_index,
                      final_score = COALESCE(EXCLUDED.final_score, game_players.final_score),
                      deleted_at = NULL,
                      updated_at = now()
                `
              }

              // 3. decks — one row per game, keyed by game_id.
              yield* sql`
                INSERT INTO decks (game_id, cards)
                VALUES (${input.gameId}, ${textArray(encoded.deck)})
                ON CONFLICT (game_id) DO UPDATE
                SET cards = EXCLUDED.cards, deleted_at = NULL, updated_at = now()
              `

              // 4. user_cards — rewrite as exactly the occupied slots, holes
              // preserved. Soft-delete-then-reinsert keeps "no code path
              // hard-deletes" uniform and exercises the partial uniques on
              // every save; CAM-8 sweeps the tombstones.
              yield* sql`
                UPDATE user_cards SET deleted_at = now(), updated_at = now()
                WHERE game_id = ${input.gameId} AND deleted_at IS NULL
              `
              for (const player of encoded.players) {
                for (const handSlot of player.hand) {
                  yield* sql`
                    INSERT INTO user_cards (game_id, user_id, "index", card)
                    VALUES (${input.gameId}, ${player.id}, ${handSlot.slotIndex}, ${handSlot.card})
                  `
                }
              }

              // 5 + 6. game_events append (contiguous seq from 0, safe under
              // the step-1 row lock) and card_peeks materialization.
              const nextRows = yield* sql<{ next: number }>`
                SELECT COALESCE(MAX(seq) + 1, 0) AS next FROM game_events
                WHERE game_id = ${input.gameId} AND deleted_at IS NULL
              `
              const next = Number(nextRows[0]!.next)
              for (const [offset, event] of input.newEvents.entries()) {
                const payload = yield* Effect.try({
                  try: () => encodeGameEvent(event),
                  catch: storage("game_events.encode"),
                })
                yield* sql`
                  INSERT INTO game_events (game_id, seq, type, payload, actor_id, at)
                  VALUES (${input.gameId}, ${next + offset}, ${event._tag},
                          ${jsonb(payload)}, ${actorOf(event)}, ${input.at})
                `
                if (event._tag === "CardPeeked") {
                  yield* sql`
                    INSERT INTO card_peeks (game_id, seq, viewer_id, card)
                    VALUES (${input.gameId}, ${next + offset}, ${event.viewerId}, ${event.card})
                  `
                }
              }

              return newVersion
            }),
          )
          .pipe(Effect.catchTag("SqlError", (e) => Effect.fail(storage("games.save")(e)))),

      load: (gameId) =>
        Effect.gen(function* () {
          const games = yield* sql<{
            phase: unknown
            discard_pile: ReadonlyArray<string>
            prng: unknown
            config: unknown
            version: number
          }>`
            SELECT phase, discard_pile, prng, config, version FROM games
            WHERE game_id = ${gameId} AND deleted_at IS NULL
          `
          const gameRow = games[0]
          if (gameRow === undefined || gameRow.phase === null) {
            // NULL phase = never dealt (lobby/abandoned lobby) — not a game.
            return yield* Effect.fail(new GameNotFound({ gameId }))
          }
          const players = yield* sql<{ user_id: string }>`
            SELECT user_id FROM game_players
            WHERE game_id = ${gameId} AND deleted_at IS NULL
            ORDER BY seat_index
          `
          const decks = yield* sql<{ cards: ReadonlyArray<string> }>`
            SELECT cards FROM decks WHERE game_id = ${gameId} AND deleted_at IS NULL
          `
          const handRows = yield* sql<{ user_id: string; index: number; card: string }>`
            SELECT user_id, "index", card FROM user_cards
            WHERE game_id = ${gameId} AND deleted_at IS NULL
            ORDER BY "index"
          `
          const hands = new Map<string, Array<{ slotIndex: number; card: string }>>()
          for (const row of handRows) {
            const hand = hands.get(row.user_id) ?? []
            hand.push({ slotIndex: Number(row.index), card: row.card })
            hands.set(row.user_id, hand)
          }
          const assembled = {
            players: players.map((p) => ({ id: p.user_id, hand: hands.get(p.user_id) ?? [] })),
            deck: decks[0]?.cards ?? [],
            discard: gameRow.discard_pile,
            prng: gameRow.prng,
            phase: gameRow.phase,
            config: gameRow.config,
          }
          const state = yield* Schema.decodeUnknown(GameState)(assembled).pipe(
            Effect.mapError(storage("games.load.decode")),
          )
          return { state, version: GameVersion.make(Number(gameRow.version)) }
        }).pipe(Effect.catchTag("SqlError", (e) => Effect.fail(storage("games.load")(e)))),

      getEvents: (gameId) =>
        Effect.gen(function* () {
          const exists = yield* gameExists(gameId)
          if (!exists) return yield* Effect.fail(new GameNotFound({ gameId }))
          const rows = yield* sql<{ payload: unknown }>`
            SELECT payload FROM game_events
            WHERE game_id = ${gameId} AND deleted_at IS NULL
            ORDER BY seq
          `
          return yield* Effect.forEach(rows, (row) =>
            Schema.decodeUnknown(GameEvent)(row.payload).pipe(
              Effect.mapError(storage("game_events.decode")),
            ),
          )
        }).pipe(Effect.catchTag("SqlError", (e) => Effect.fail(storage("games.getEvents")(e)))),

      saveLobby: (input) =>
        input.lobby.status === "started"
          ? Effect.die(
              "saveLobby cannot write status 'started' — that transition is save() with the GameStarted batch (ADR-0019)",
            )
          : sql
              .withTransaction(
                Effect.gen(function* () {
                  const status = input.lobby.status === "open" ? "lobby" : "abandoned"
                  const newVersion = GameVersion.make(input.expectedVersion + 1)

                  // 1. games — same version guard as save; lobby rows carry
                  // NULL in the four dealt-game columns (migration 0003).
                  if (input.expectedVersion === 0) {
                    const inserted = yield* sql`
                      INSERT INTO games (game_id, status, version)
                      VALUES (${input.gameId}, ${status}, ${newVersion})
                      ON CONFLICT (game_id) DO NOTHING
                      RETURNING game_id
                    `
                    if (inserted.length === 0) {
                      return yield* failConflict(input.gameId, input.expectedVersion)
                    }
                  } else {
                    // The status guard makes "saveLobby against a dealt
                    // game" structurally impossible — without it a
                    // correct-version call could silently downgrade an
                    // in_progress row to 'lobby' (review finding 4).
                    const updated = yield* sql`
                      UPDATE games
                      SET status = ${status}, version = ${newVersion}, updated_at = now()
                      WHERE game_id = ${input.gameId}
                        AND version = ${input.expectedVersion}
                        AND status IN ('lobby', 'abandoned')
                        AND deleted_at IS NULL
                      RETURNING game_id
                    `
                    if (updated.length === 0) {
                      // Distinguish the two zero-row causes: a version race
                      // is the typed VersionConflict; a version MATCH on a
                      // dealt row is a caller contract violation — a defect,
                      // like the status:"started" input above.
                      const live = yield* liveVersion(input.gameId)
                      if (live !== null && live === input.expectedVersion) {
                        return yield* Effect.die(
                          new Error(
                            "saveLobby against a dealt game — the lobby→game transition is one-way (ADR-0019)",
                          ),
                        )
                      }
                      return yield* Effect.fail(
                        new VersionConflict({
                          gameId: input.gameId,
                          expected: input.expectedVersion,
                          actual: live,
                        }),
                      )
                    }
                  }

                  // 2. game_players — mirror lobby.members (join order =
                  // seat_index, compacted). Why the ascending upsert never
                  // trips the partial unique (game_id, seat_index): the port
                  // contract requires each saveLobby to differ from the
                  // persisted membership by at most one order-preserving
                  // removal or one append-at-tail (the only shapes the domain
                  // transitions produce). Soft-deleting absentees FIRST frees
                  // their seats; surviving members then only compact DOWNWARD
                  // into just-vacated slots, and a joining/rejoining member
                  // is always assigned the tail seat, which is free once the
                  // survivors have moved. (A rejoiner's tombstone row —
                  // possibly holding a LOWER old seat — resurrects at the
                  // tail via the PK-conflict update, deleted_at back to
                  // NULL.) An input outside that contract could collide
                  // mid-loop and surface as a StorageError.
                  const live = yield* sql<{ user_id: string }>`
                    SELECT user_id FROM game_players
                    WHERE game_id = ${input.gameId} AND deleted_at IS NULL
                  `
                  // Ids only (CAM-17 C1): names live in `users` and re-join on
                  // load — storing them here would violate store-nothing-derivable.
                  const memberSet = new Set<string>(input.lobby.members.map((m) => m.id))
                  for (const row of live) {
                    if (!memberSet.has(row.user_id)) {
                      yield* sql`
                        UPDATE game_players SET deleted_at = now(), updated_at = now()
                        WHERE game_id = ${input.gameId} AND user_id = ${row.user_id}
                          AND deleted_at IS NULL
                      `
                    }
                  }
                  for (const [position, member] of input.lobby.members.entries()) {
                    yield* sql`
                      INSERT INTO game_players (game_id, user_id, seat_index)
                      VALUES (${input.gameId}, ${member.id}, ${position})
                      ON CONFLICT (game_id, user_id) DO UPDATE
                      SET seat_index = EXCLUDED.seat_index, deleted_at = NULL,
                          updated_at = now()
                    `
                  }

                  return newVersion
                }),
              )
              .pipe(Effect.catchTag("SqlError", (e) => Effect.fail(storage("games.saveLobby")(e)))),

      loadLobby: (gameId) =>
        Effect.gen(function* () {
          const games = yield* sql<{ status: string; version: number }>`
            SELECT status, version FROM games
            WHERE game_id = ${gameId} AND deleted_at IS NULL
          `
          const gameRow = games[0]
          if (gameRow === undefined) {
            return yield* Effect.fail(new GameNotFound({ gameId }))
          }
          // LEFT JOIN + COALESCE, deliberately (CAM-17 C1): a member row must
          // never vanish because its user was soft-deleted mid-lifecycle — the
          // usual filter-soft-deletes convention is applied to the JOINED
          // table by projecting the name as the loud-but-valid '—' (the
          // contracts DisplayName totality value), not by dropping the member.
          const members = yield* sql<{ user_id: string; user_name: string }>`
            SELECT gp.user_id, COALESCE(u.user_name, '—') AS user_name
            FROM game_players gp
            LEFT JOIN users u
              ON u.user_id = gp.user_id AND u.deleted_at IS NULL
            WHERE gp.game_id = ${gameId} AND gp.deleted_at IS NULL
            ORDER BY gp.seat_index
          `
          const status: LobbyStatus =
            gameRow.status === "lobby"
              ? "open"
              : gameRow.status === "abandoned"
                ? "abandoned"
                : "started"
          const lobby = yield* Schema.decodeUnknown(Lobby)({
            id: gameId,
            members: members.map((m) => ({ id: m.user_id, name: m.user_name })),
            status,
          }).pipe(Effect.mapError(storage("games.loadLobby.decode")))
          return { lobby, version: GameVersion.make(Number(gameRow.version)) }
        }).pipe(Effect.catchTag("SqlError", (e) => Effect.fail(storage("games.loadLobby")(e)))),
    }
  }),
)
