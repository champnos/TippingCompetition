-- ============================================================
-- 0005_long_haul.sql  – Long Haul competition tables
-- ============================================================

-- ── Long Haul Entries ─────────────────────────────────────────
-- One row per entrant per competition.
-- joker_round_1 / joker_round_2 store round_number (not round id).
CREATE TABLE long_haul_entries (
  id               SERIAL PRIMARY KEY,
  competition_id   INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joker_round_1    INTEGER,  -- round_number (not round_id)
  joker_round_2    INTEGER,  -- round_number (not round_id), must differ from joker_round_1
  is_locked        BOOLEAN NOT NULL DEFAULT FALSE,  -- set true when season starts
  total_paid       NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (competition_id, user_id)
);

-- ── Long Haul Tips ────────────────────────────────────────────
-- One row per entrant per game.
CREATE TABLE long_haul_tips (
  id               SERIAL PRIMARY KEY,
  entry_id         INTEGER NOT NULL REFERENCES long_haul_entries(id) ON DELETE CASCADE,
  game_id          INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_id         INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  team_id          INTEGER NOT NULL REFERENCES teams(id),  -- team picked to win
  is_correct       BOOLEAN,        -- null until result processed
  points_awarded   INTEGER,        -- 0 or 1 (raw, before joker); null until result
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (entry_id, game_id)
);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE long_haul_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE long_haul_tips    ENABLE ROW LEVEL SECURITY;

-- long_haul_entries: users can read/write own rows; admin full access
CREATE POLICY "lh_entries: own read"
  ON long_haul_entries FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "lh_entries: own insert"
  ON long_haul_entries FOR INSERT
  WITH CHECK (user_id = auth.uid() OR is_admin());

CREATE POLICY "lh_entries: own update (not locked)"
  ON long_haul_entries FOR UPDATE
  USING (
    (user_id = auth.uid() AND is_locked = FALSE)
    OR is_admin()
  );

CREATE POLICY "lh_entries: admin all"
  ON long_haul_entries FOR ALL
  USING (is_admin());

-- long_haul_tips: users can read/write own tips only when entry not locked; admin full access
CREATE POLICY "lh_tips: own read"
  ON long_haul_tips FOR SELECT
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM long_haul_entries lhe
      WHERE lhe.id = long_haul_tips.entry_id AND lhe.user_id = auth.uid()
    )
  );

CREATE POLICY "lh_tips: own insert (entry not locked)"
  ON long_haul_tips FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM long_haul_entries lhe
      WHERE lhe.id = long_haul_tips.entry_id
        AND lhe.user_id = auth.uid()
        AND lhe.is_locked = FALSE
    )
  );

CREATE POLICY "lh_tips: own update (entry not locked)"
  ON long_haul_tips FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM long_haul_entries lhe
      WHERE lhe.id = long_haul_tips.entry_id
        AND lhe.user_id = auth.uid()
        AND lhe.is_locked = FALSE
    )
  );

CREATE POLICY "lh_tips: own delete (entry not locked)"
  ON long_haul_tips FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM long_haul_entries lhe
      WHERE lhe.id = long_haul_tips.entry_id
        AND lhe.user_id = auth.uid()
        AND lhe.is_locked = FALSE
    )
  );

CREATE POLICY "lh_tips: admin all"
  ON long_haul_tips FOR ALL
  USING (is_admin());
