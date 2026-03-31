-- ============================================================
-- 0006_margin.sql  – Margin tipping competition tables
-- ============================================================

-- ── Margin Entries ────────────────────────────────────────────
-- One row per entrant per competition.
CREATE TABLE margin_entries (
  id             SERIAL PRIMARY KEY,
  competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_paid     NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_score    NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (competition_id, user_id)
);

-- ── Margin Tips ───────────────────────────────────────────────
-- One row per entrant per game.
-- team_id is NULL when no tip was submitted (result = 'no_tip').
CREATE TABLE margin_tips (
  id           SERIAL PRIMARY KEY,
  entry_id     INTEGER NOT NULL REFERENCES margin_entries(id) ON DELETE CASCADE,
  game_id      INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_id     INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  team_id      INTEGER REFERENCES teams(id),
  raw_score    NUMERIC(10,2),
  multiplier   NUMERIC(4,2),
  final_score  NUMERIC(10,2),
  result       VARCHAR(10),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (entry_id, game_id)
);

CREATE TRIGGER trg_margin_tips_updated_at
BEFORE UPDATE ON margin_tips
FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE margin_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE margin_tips    ENABLE ROW LEVEL SECURITY;

-- margin_entries: users can read/write own rows; admin full access
CREATE POLICY "margin_entries: own read"
  ON margin_entries FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "margin_entries: own insert"
  ON margin_entries FOR INSERT
  WITH CHECK (user_id = auth.uid() OR is_admin());

CREATE POLICY "margin_entries: own update"
  ON margin_entries FOR UPDATE
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "margin_entries: admin all"
  ON margin_entries FOR ALL
  USING (is_admin());

-- margin_tips: users can read/write own tips; admin full access
CREATE POLICY "margin_tips: own read"
  ON margin_tips FOR SELECT
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM margin_entries me
      WHERE me.id = margin_tips.entry_id AND me.user_id = auth.uid()
    )
  );

CREATE POLICY "margin_tips: own insert (round unlocked)"
  ON margin_tips FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM margin_entries me
      JOIN rounds r ON r.id = margin_tips.round_id
      WHERE me.id = margin_tips.entry_id
        AND me.user_id = auth.uid()
        AND r.locked = FALSE
    )
  );

CREATE POLICY "margin_tips: own update (round unlocked)"
  ON margin_tips FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM margin_entries me
      JOIN rounds r ON r.id = margin_tips.round_id
      WHERE me.id = margin_tips.entry_id
        AND me.user_id = auth.uid()
        AND r.locked = FALSE
    )
  );

CREATE POLICY "margin_tips: own delete (round unlocked)"
  ON margin_tips FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM margin_entries me
      JOIN rounds r ON r.id = margin_tips.round_id
      WHERE me.id = margin_tips.entry_id
        AND me.user_id = auth.uid()
        AND r.locked = FALSE
    )
  );

CREATE POLICY "margin_tips: admin all"
  ON margin_tips FOR ALL
  USING (is_admin());
