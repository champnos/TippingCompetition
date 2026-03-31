-- ============================================================
-- 0009_finals.sql  – Finals tipping competition tables
-- ============================================================

-- ── Finals Entries ────────────────────────────────────────────
-- One row per entrant per competition.
CREATE TABLE finals_entries (
  id             SERIAL PRIMARY KEY,
  competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_paid     NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  eliminated_week INTEGER,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (competition_id, user_id)
);

-- ── Finals Tips ───────────────────────────────────────────────
-- One row per entrant per finals week (1–4).
CREATE TABLE finals_tips (
  id            SERIAL PRIMARY KEY,
  entry_id      INTEGER NOT NULL REFERENCES finals_entries(id) ON DELETE CASCADE,
  finals_week   INTEGER NOT NULL CHECK (finals_week BETWEEN 1 AND 4),
  team_id       INTEGER REFERENCES teams(id),
  margin        INTEGER,
  actual_margin INTEGER,
  correct_team  BOOLEAN,
  error_score   INTEGER,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (entry_id, finals_week)
);

CREATE TRIGGER trg_finals_tips_updated_at
BEFORE UPDATE ON finals_tips
FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- ── Finals Week Lock ──────────────────────────────────────────
-- Track which finals weeks are locked.
CREATE TABLE finals_weeks (
  id             SERIAL PRIMARY KEY,
  competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  finals_week    INTEGER NOT NULL CHECK (finals_week BETWEEN 1 AND 4),
  locked         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (competition_id, finals_week)
);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE finals_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE finals_tips    ENABLE ROW LEVEL SECURITY;
ALTER TABLE finals_weeks   ENABLE ROW LEVEL SECURITY;

-- finals_entries: users read own rows; admin full access
CREATE POLICY "finals_entries: own read"
  ON finals_entries FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "finals_entries: own insert"
  ON finals_entries FOR INSERT
  WITH CHECK (user_id = auth.uid() OR is_admin());

CREATE POLICY "finals_entries: own update"
  ON finals_entries FOR UPDATE
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "finals_entries: admin all"
  ON finals_entries FOR ALL
  USING (is_admin());

-- finals_tips: users read/write own tips; admin full access
CREATE POLICY "finals_tips: own read"
  ON finals_tips FOR SELECT
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM finals_entries fe
      WHERE fe.id = finals_tips.entry_id AND fe.user_id = auth.uid()
    )
  );

CREATE POLICY "finals_tips: own insert"
  ON finals_tips FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM finals_entries fe
      WHERE fe.id = finals_tips.entry_id AND fe.user_id = auth.uid()
    )
  );

CREATE POLICY "finals_tips: own update"
  ON finals_tips FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM finals_entries fe
      WHERE fe.id = finals_tips.entry_id AND fe.user_id = auth.uid()
    )
  );

CREATE POLICY "finals_tips: admin all"
  ON finals_tips FOR ALL
  USING (is_admin());

-- finals_weeks: everyone can read (to know if week is locked); admin write
CREATE POLICY "finals_weeks: all read"
  ON finals_weeks FOR SELECT
  USING (TRUE);

CREATE POLICY "finals_weeks: admin all"
  ON finals_weeks FOR ALL
  USING (is_admin());
