-- ============================================================
-- 0008_precision.sql  – Precision tipping competition tables
-- ============================================================

-- ── Precision Entries ─────────────────────────────────────────
-- One row per entrant per competition.
CREATE TABLE precision_entries (
  id             SERIAL PRIMARY KEY,
  competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_paid     NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  eliminated_round INTEGER,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (competition_id, user_id)
);

-- ── Precision Tips ────────────────────────────────────────────
-- One row per entrant per round.
-- Each team can only be used ONCE per entrant for the whole season.
CREATE TABLE precision_tips (
  id         SERIAL PRIMARY KEY,
  entry_id   INTEGER NOT NULL REFERENCES precision_entries(id) ON DELETE CASCADE,
  round_id   INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  team_id    INTEGER REFERENCES teams(id),
  result     VARCHAR(10),  -- 'win', 'loss', 'draw', 'no_tip', 'pending'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (entry_id, round_id)
);

CREATE TRIGGER trg_precision_tips_updated_at
BEFORE UPDATE ON precision_tips
FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE precision_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE precision_tips    ENABLE ROW LEVEL SECURITY;

-- precision_entries: users can read/write own rows; admin full access
CREATE POLICY "precision_entries: own read"
  ON precision_entries FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "precision_entries: own insert"
  ON precision_entries FOR INSERT
  WITH CHECK (user_id = auth.uid() OR is_admin());

CREATE POLICY "precision_entries: own update"
  ON precision_entries FOR UPDATE
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "precision_entries: admin all"
  ON precision_entries FOR ALL
  USING (is_admin());

-- precision_tips: users can read/write own tips; admin full access
CREATE POLICY "precision_tips: own read"
  ON precision_tips FOR SELECT
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM precision_entries pe
      WHERE pe.id = precision_tips.entry_id AND pe.user_id = auth.uid()
    )
  );

CREATE POLICY "precision_tips: own insert (round unlocked)"
  ON precision_tips FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM precision_entries pe
      JOIN rounds r ON r.id = precision_tips.round_id
      WHERE pe.id = precision_tips.entry_id
        AND pe.user_id = auth.uid()
        AND r.locked = FALSE
    )
  );

CREATE POLICY "precision_tips: own update (round unlocked)"
  ON precision_tips FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM precision_entries pe
      JOIN rounds r ON r.id = precision_tips.round_id
      WHERE pe.id = precision_tips.entry_id
        AND pe.user_id = auth.uid()
        AND r.locked = FALSE
    )
  );

CREATE POLICY "precision_tips: own delete (round unlocked)"
  ON precision_tips FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM precision_entries pe
      JOIN rounds r ON r.id = precision_tips.round_id
      WHERE pe.id = precision_tips.entry_id
        AND pe.user_id = auth.uid()
        AND r.locked = FALSE
    )
  );

CREATE POLICY "precision_tips: admin all"
  ON precision_tips FOR ALL
  USING (is_admin());
