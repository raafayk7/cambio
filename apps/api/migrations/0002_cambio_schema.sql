-- 0002_cambio_schema
--
-- The persisted model (HANDOFF §4.3, CAM-3): seven tables materializing the
-- domain's GameState plus the append-only event log that is the source of
-- truth for reconstruction (§6). Design rules in force:
--
--   * Store nothing derivable: no turn (lives in phase), no face_up_card
--     (discard_pile[1] — SQL arrays are 1-based), no deck size, no winner,
--     no called_cambio_by (CallCambio ends the game immediately, so it is
--     always phase->calledBy when Ended), no card score anywhere.
--   * games.phase / prng / config are jsonb through the domain Schema codecs
--     (Phase.ts — the current 6-variant union, not the stale §4.2 sketch).
--   * Slot indices in user_cards are stable positions; holes never compact.
--   * EVERY unique constraint is partial on `deleted_at IS NULL` (§7 gotcha
--     1) — which forces surrogate identity PKs on user_cards, card_peeks,
--     and game_events, because a composite PRIMARY KEY cannot be partial and
--     would start rejecting re-inserts once soft-deleted rows accumulate.
--   * The `deleted_at IS NULL` filter lives in the repository layer only;
--     the domain never sees soft delete (§7 gotcha 2).
--   * game_events.at is the domain Timestamp (epoch ms, bigint); the
--     created_at/updated_at/deleted_at bookkeeping columns are timestamptz.
--   * status is a CHECK-constrained text, not a PG enum, so a future status
--     is one small migration altering one constraint.
--   * Card columns are text: CardSlug is validated at the codec boundary.

CREATE TABLE users (
  user_id     uuid PRIMARY KEY,
  user_name   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE TABLE games (
  game_id      uuid PRIMARY KEY,
  status       text NOT NULL CHECK (status IN ('lobby', 'in_progress', 'completed', 'abandoned')),
  phase        jsonb NOT NULL,
  discard_pile text[] NOT NULL,   -- element 1 = top of pile
  prng         jsonb NOT NULL,    -- encoded PrngState
  config       jsonb NOT NULL,    -- encoded GameConfig
  version      int NOT NULL CHECK (version >= 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE TABLE game_players (
  game_id      uuid NOT NULL REFERENCES games (game_id),
  user_id      uuid NOT NULL REFERENCES users (user_id),
  seat_index   int NOT NULL CHECK (seat_index >= 0),
  final_score  int,               -- null until GameEnded materializes it
  is_connected boolean NOT NULL DEFAULT true,
  is_bot       boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  PRIMARY KEY (game_id, user_id)
);

CREATE UNIQUE INDEX game_players_seat_key
  ON game_players (game_id, seat_index) WHERE deleted_at IS NULL;

CREATE TABLE decks (
  -- One deck per game (§4.1 locks the game to a single 52-card deck), so the
  -- game id IS the deck identity; no surrogate deck_id.
  game_id    uuid PRIMARY KEY REFERENCES games (game_id),
  cards      text[] NOT NULL,     -- element 1 = next to draw; no size column
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE user_cards (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id    uuid NOT NULL REFERENCES games (game_id),
  user_id    uuid NOT NULL REFERENCES users (user_id),
  "index"    int NOT NULL CHECK ("index" >= 0),
  card       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX user_cards_slot_key
  ON user_cards (game_id, user_id, "index") WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX user_cards_card_key
  ON user_cards (game_id, card) WHERE deleted_at IS NULL;

CREATE TABLE card_peeks (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id    uuid NOT NULL REFERENCES games (game_id),
  seq        int NOT NULL CHECK (seq >= 0),  -- the CardPeeked event's seq
  viewer_id  uuid NOT NULL REFERENCES users (user_id),
  card       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX card_peeks_seq_key
  ON card_peeks (game_id, seq) WHERE deleted_at IS NULL;

CREATE TABLE game_events (
  -- Append-only (§6): no code path updates or deletes a row; the pg_cron
  -- lifecycle (CAM-8) is the only thing that ever will.
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id    uuid NOT NULL REFERENCES games (game_id),
  seq        int NOT NULL CHECK (seq >= 0),
  type       text NOT NULL,       -- the event _tag
  payload    jsonb NOT NULL,      -- encoded GameEvent: full truth, server-only
  actor_id   uuid,                -- null for SlamWindowClosed / DeckReshuffled
  at         bigint NOT NULL,     -- domain Timestamp, epoch ms
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX game_events_seq_key
  ON game_events (game_id, seq) WHERE deleted_at IS NULL;
