-- 0004_data_lifecycle
--
-- The §7 retention lifecycle (ADR-0025, CAM-8): three SQL functions hold
-- all sweep logic so Docker Postgres can test them directly; the guarded
-- DO block at the bottom registers them as pg_cron jobs only where the
-- extension is available (Supabase). Cutoff parameters exist for the
-- tests; their defaults are the production retention policy:
--
--   * lifecycle_expire_lobbies — lobbies idle 24h become 'abandoned'
--     (hourly). Bumps games.version so a stale saveLobby surfaces the
--     typed VersionConflict instead of resurrecting the lobby, and scopes
--     status = 'lobby' explicitly because games_dealt_columns_present
--     exempts 'abandoned' and would accept a flipped dealt game.
--   * lifecycle_soft_delete — ended games idle 30d are tombstoned with
--     every dependent row at one shared timestamp; users created 30d+ ago
--     with no live game_players reference are tombstoned (weekly).
--     users.updated_at is dead by design (INSERT-only), so the reference
--     check is the load-bearing half of the user criterion.
--   * lifecycle_hard_delete — rows tombstoned 7d+ ago are physically
--     deleted, children before parents (daily). Row-level per table, NOT
--     game-scoped: reaping the user_cards tombstones that live games
--     accumulate on every save is the point (CAM-3 retrospective).
--
-- This is the code 0002's game_events header promised: the append-only
-- rule's one carve-out. No other code path may update or delete an event
-- row.

-- Sweep-predicate and FK-check indexes. Names end _idx, never _key (the
-- Migrations suite sweeps %_key for the partial uniques). The user-side
-- indexes serve both the users NOT EXISTS gates and the FK triggers on
-- users deletes; the game_id indexes serve the dependent sweeps and the
-- FK triggers on games deletes (the existing partial uniques lead on
-- game_id but exclude tombstones, so FK checks cannot use them).
-- game_players and decks already lead on game_id via their primary keys.

CREATE INDEX games_lifecycle_sweep_idx
  ON games (status, updated_at) WHERE deleted_at IS NULL;
CREATE INDEX user_cards_tombstone_idx
  ON user_cards (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX game_players_user_idx ON game_players (user_id);
CREATE INDEX user_cards_user_idx ON user_cards (user_id);
CREATE INDEX card_peeks_viewer_idx ON card_peeks (viewer_id);
CREATE INDEX user_cards_game_idx ON user_cards (game_id);
CREATE INDEX card_peeks_game_idx ON card_peeks (game_id);
CREATE INDEX game_events_game_idx ON game_events (game_id);

CREATE FUNCTION lifecycle_expire_lobbies(
  cutoff timestamptz DEFAULT now() - interval '24 hours'
) RETURNS integer
LANGUAGE sql
AS $fn$
  WITH expired AS (
    UPDATE games
    SET status = 'abandoned',
        version = version + 1,  -- load-bearing for C2: stale saveLobby -> VersionConflict
        updated_at = now()
    WHERE status = 'lobby'
      AND deleted_at IS NULL
      AND updated_at < cutoff
    RETURNING 1
  )
  SELECT count(*)::integer FROM expired;
$fn$;

CREATE FUNCTION lifecycle_soft_delete(
  game_cutoff timestamptz DEFAULT now() - interval '30 days',
  user_cutoff timestamptz DEFAULT now() - interval '30 days',
  OUT swept_games integer,
  OUT swept_users integer
)
LANGUAGE plpgsql
AS $fn$
DECLARE
  ts timestamptz := now();
  game_ids uuid[];
BEGIN
  -- Games first (root plan decision log): a user whose last live game is
  -- swept this run becomes eligible in the same run.
  WITH swept AS (
    UPDATE games
    SET deleted_at = ts, updated_at = ts
    WHERE status IN ('completed', 'abandoned')
      AND deleted_at IS NULL
      AND updated_at < game_cutoff
    RETURNING game_id
  )
  SELECT coalesce(array_agg(game_id), '{}') INTO game_ids FROM swept;

  swept_games := coalesce(array_length(game_ids, 1), 0);

  UPDATE game_players SET deleted_at = ts, updated_at = ts
    WHERE game_id = ANY (game_ids) AND deleted_at IS NULL;
  UPDATE decks SET deleted_at = ts, updated_at = ts
    WHERE game_id = ANY (game_ids) AND deleted_at IS NULL;
  UPDATE user_cards SET deleted_at = ts, updated_at = ts
    WHERE game_id = ANY (game_ids) AND deleted_at IS NULL;
  UPDATE card_peeks SET deleted_at = ts, updated_at = ts
    WHERE game_id = ANY (game_ids) AND deleted_at IS NULL;
  UPDATE game_events SET deleted_at = ts, updated_at = ts
    WHERE game_id = ANY (game_ids) AND deleted_at IS NULL;

  WITH swept AS (
    UPDATE users
    SET deleted_at = ts, updated_at = ts
    WHERE deleted_at IS NULL
      AND created_at < user_cutoff
      AND NOT EXISTS (
        SELECT 1 FROM game_players gp
        WHERE gp.user_id = users.user_id AND gp.deleted_at IS NULL
      )
    RETURNING 1
  )
  SELECT count(*)::integer INTO swept_users FROM swept;
END
$fn$;

CREATE FUNCTION lifecycle_hard_delete(
  cutoff timestamptz DEFAULT now() - interval '7 days'
) RETURNS integer
LANGUAGE plpgsql
AS $fn$
DECLARE
  total integer := 0;
  n integer;
BEGIN
  -- Children before parents; NULL deleted_at never qualifies (NULL < x is
  -- not true). The games/users NOT EXISTS gates are belt-and-braces: under
  -- the shared-tombstone invariant a qualifying parent's children qualify
  -- too and were deleted just above, but the gates make the function safe
  -- standalone (C6: no FK violation, ever). The users gates deliberately
  -- have NO deleted_at filter — even a tombstoned child row still holds
  -- its FK. game_events.actor_id has no FK and does not gate.
  DELETE FROM user_cards WHERE deleted_at < cutoff;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM card_peeks WHERE deleted_at < cutoff;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM game_events WHERE deleted_at < cutoff;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM game_players WHERE deleted_at < cutoff;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM decks WHERE deleted_at < cutoff;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;

  DELETE FROM games g
  WHERE g.deleted_at < cutoff
    AND NOT EXISTS (SELECT 1 FROM game_players gp WHERE gp.game_id = g.game_id)
    AND NOT EXISTS (SELECT 1 FROM decks d WHERE d.game_id = g.game_id)
    AND NOT EXISTS (SELECT 1 FROM user_cards uc WHERE uc.game_id = g.game_id)
    AND NOT EXISTS (SELECT 1 FROM card_peeks cp WHERE cp.game_id = g.game_id)
    AND NOT EXISTS (SELECT 1 FROM game_events ge WHERE ge.game_id = g.game_id);
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;

  DELETE FROM users u
  WHERE u.deleted_at < cutoff
    AND NOT EXISTS (SELECT 1 FROM game_players gp WHERE gp.user_id = u.user_id)
    AND NOT EXISTS (SELECT 1 FROM user_cards uc WHERE uc.user_id = u.user_id)
    AND NOT EXISTS (SELECT 1 FROM card_peeks cp WHERE cp.viewer_id = u.user_id);
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;

  RETURN total;
END
$fn$;

-- Guarded scheduling: only where pg_cron is installable (Supabase's
-- postgres database — exactly what DATABASE_URL points at there). On
-- Docker Postgres the branch is skipped and the migration still applies
-- (C10). PL/pgSQL resolves statement names at first execution, so the
-- cron.schedule calls in the untaken branch never resolve locally.
-- cron.schedule upserts by job name, so re-registration is idempotent.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.schedule(
      'cambio-expire-lobbies', '17 * * * *', 'SELECT lifecycle_expire_lobbies()');
    PERFORM cron.schedule(
      'cambio-soft-delete', '0 4 * * 1', 'SELECT lifecycle_soft_delete()');
    PERFORM cron.schedule(
      'cambio-hard-delete', '30 4 * * *', 'SELECT lifecycle_hard_delete()');
  END IF;
END
$do$;
