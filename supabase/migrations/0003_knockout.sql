-- ============================================================
-- 0003_knockout.sql  – Knockout competition tables
-- ============================================================

-- ── Knockout Entries ─────────────────────────────────────────
-- Tracks each participant in a knockout competition
CREATE TABLE knockout_entries (
  id                  SERIAL PRIMARY KEY,
  competition_id      INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  eliminated_round    INTEGER,
  got_my_back_used    BOOLEAN NOT NULL DEFAULT FALSE,
  free_pass_used      BOOLEAN NOT NULL DEFAULT FALSE,
  free_pass_available BOOLEAN NOT NULL DEFAULT FALSE,
  total_paid          NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (competition_id, user_id)
);

-- ── Knockout Round Config ─────────────────────────────────────
-- Admin sets top/bottom of ladder team for each round
CREATE TABLE knockout_round_config (
  id             SERIAL PRIMARY KEY,
  round_id       INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE UNIQUE,
  top_team_id    INTEGER REFERENCES teams(id),
  bottom_team_id INTEGER REFERENCES teams(id),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── Knockout Tips ─────────────────────────────────────────────
-- One row per entrant per round
CREATE TABLE knockout_tips (
  id                    SERIAL PRIMARY KEY,
  entry_id              INTEGER NOT NULL REFERENCES knockout_entries(id) ON DELETE CASCADE,
  round_id              INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  team_id               INTEGER NOT NULL REFERENCES teams(id),
  got_my_back_team_id   INTEGER REFERENCES teams(id),
  got_my_back_activated BOOLEAN NOT NULL DEFAULT FALSE,
  free_pass_used        BOOLEAN NOT NULL DEFAULT FALSE,
  result                VARCHAR(10),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (entry_id, round_id)
);

CREATE TRIGGER trg_knockout_tips_updated_at
BEFORE UPDATE ON knockout_tips
FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE knockout_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE knockout_round_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE knockout_tips         ENABLE ROW LEVEL SECURITY;

-- knockout_entries: users can read their own row; admin can read/write all
CREATE POLICY "knockout_entries: own read"
  ON knockout_entries FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "knockout_entries: admin write"
  ON knockout_entries FOR ALL
  USING (is_admin());

-- knockout_round_config: all authenticated users can read; admin can write
CREATE POLICY "knockout_round_config: read"
  ON knockout_round_config FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "knockout_round_config: admin write"
  ON knockout_round_config FOR ALL
  USING (is_admin());

-- knockout_tips: users can read/write their own tips; admin can read all
CREATE POLICY "knockout_tips: own read"
  ON knockout_tips FOR SELECT
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM knockout_entries ke
      WHERE ke.id = knockout_tips.entry_id AND ke.user_id = auth.uid()
    )
  );

CREATE POLICY "knockout_tips: own insert (round unlocked)"
  ON knockout_tips FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM knockout_entries ke
      JOIN rounds r ON r.id = knockout_tips.round_id
      WHERE ke.id = knockout_tips.entry_id
        AND ke.user_id = auth.uid()
        AND r.locked = FALSE
    )
  );

CREATE POLICY "knockout_tips: own update (round unlocked)"
  ON knockout_tips FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM knockout_entries ke
      JOIN rounds r ON r.id = knockout_tips.round_id
      WHERE ke.id = knockout_tips.entry_id
        AND ke.user_id = auth.uid()
        AND r.locked = FALSE
    )
  );

CREATE POLICY "knockout_tips: admin write"
  ON knockout_tips FOR ALL
  USING (is_admin());
