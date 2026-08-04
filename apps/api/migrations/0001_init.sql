-- 0001_init
--
-- Deliberately empty. Task 1 is scaffolding only: the tables sketched in §4.3
-- of docs/HANDOFF.md (users, games, game_players, decks, user_cards,
-- card_peeks, game_events) are built in the persistence task, after the pure
-- rules engine and its property tests have settled the remaining rule gaps.
--
-- Two things to remember when the real migrations arrive:
--
--   1. Soft-delete breaks unique constraints. `UNIQUE (game_id, card)` starts
--      rejecting inserts once soft-deleted rows accumulate, so use PARTIAL
--      indexes: `... WHERE deleted_at IS NULL` (§7).
--   2. The `deleted_at IS NULL` filter belongs in the repository layer. The
--      domain must never know soft-delete exists (§7).

SELECT 1;
