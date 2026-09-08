-- 0003_lobby_rows
--
-- ADR-0019 (CAM-5): lobbies are games rows (status 'lobby'), so the four
-- columns that presume a dealt game become nullable — but ONLY for undealt
-- rows: the CHECK below keeps CAM-3's strictness for in_progress/completed
-- games. Lobby membership needs no DDL — it is live game_players rows with
-- seat_index = join order, compacted on leave.
--
-- Standing correction to 0002's game_events.actor_id comment (0002 is
-- applied and must not be edited): "null only for the clock-driven close"
-- undersells it — GameStarted (system-driven deal) and DeckReshuffled
-- (automatic) rows are also null-actor; see actorOf in
-- src/infra/game-repository.ts, which is exhaustive over all 22 event tags.

ALTER TABLE games
  ALTER COLUMN phase DROP NOT NULL,
  ALTER COLUMN discard_pile DROP NOT NULL,
  ALTER COLUMN prng DROP NOT NULL,
  ALTER COLUMN config DROP NOT NULL;

ALTER TABLE games ADD CONSTRAINT games_dealt_columns_present CHECK (
  status IN ('lobby', 'abandoned')
  OR (
    phase IS NOT NULL AND discard_pile IS NOT NULL
    AND prng IS NOT NULL AND config IS NOT NULL
  )
);
