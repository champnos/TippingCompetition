-- ============================================================
-- 0004_closest_to_pin.sql  – Closest to Pin competition tables
-- ============================================================

-- Accuracy factor helper: returns multiplier based on round_number
-- Rounds 1-4 → 1, 5-9 → 2, 10-14 → 3, 15-19 → 4, 20-24 → 5
CREATE OR REPLACE FUNCTION closest_to_pin_accuracy_factor(p_round_number INTEGER)
RETURNS INTEGER AS $$
BEGIN
  IF p_round_number <= 4 THEN RETURN 1;
  ELSIF p_round_number <= 9 THEN RETURN 2;
  ELSIF p_round_number <= 14 THEN RETURN 3;
  ELSIF p_round_number <= 19 THEN RETURN 4;
  ELSE RETURN 5;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── Closest to Pin Entries ────────────────────────────────────
-- Tracks each participant in a closest-to-pin competition
CREATE TABLE closest_to_pin_entries (
  id             SERIAL PRIMARY KEY,
  competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_paid     NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (competition_id, user_id)
);

-- ── Closest to Pin Tips ───────────────────────────────────────
-- One row per entrant per round
CREATE TABLE closest_to_pin_tips (
  id               SERIAL PRIMARY KEY,
  entry_id         INTEGER NOT NULL REFERENCES closest_to_pin_entries(id) ON DELETE CASCADE,
  round_id         INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  team_id          INTEGER NOT NULL REFERENCES teams(id),
  margin           INTEGER NOT NULL CHECK (margin > 0),
  actual_margin    INTEGER,
  correct_team     BOOLEAN,
  raw_score        NUMERIC(10,2),
  round_score      NUMERIC(10,2),
  accuracy_factor  INTEGER,
  result           VARCHAR(10),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (entry_id, round_id)
);

CREATE TRIGGER trg_closest_to_pin_tips_updated_at
BEFORE UPDATE ON closest_to_pin_tips
FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE closest_to_pin_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE closest_to_pin_tips    ENABLE ROW LEVEL SECURITY;

-- closest_to_pin_entries: users can read their own row; admin can read/write all
CREATE POLICY "ctp_entries: own read"
  ON closest_to_pin_entries FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "ctp_entries: own insert"
  ON closest_to_pin_entries FOR INSERT
  WITH CHECK (user_id = auth.uid() OR is_admin());

CREATE POLICY "ctp_entries: admin write"
  ON closest_to_pin_entries FOR ALL
  USING (is_admin());

-- closest_to_pin_tips: users can read/write their own tips; admin can read/write all
CREATE POLICY "ctp_tips: own read"
  ON closest_to_pin_tips FOR SELECT
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM closest_to_pin_entries ce
      WHERE ce.id = closest_to_pin_tips.entry_id AND ce.user_id = auth.uid()
    )
  );

CREATE POLICY "ctp_tips: own insert (round unlocked)"
  ON closest_to_pin_tips FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM closest_to_pin_entries ce
      JOIN rounds r ON r.id = closest_to_pin_tips.round_id
      WHERE ce.id = closest_to_pin_tips.entry_id
        AND ce.user_id = auth.uid()
        AND r.locked = FALSE
    )
  );

CREATE POLICY "ctp_tips: own update (round unlocked)"
  ON closest_to_pin_tips FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM closest_to_pin_entries ce
      JOIN rounds r ON r.id = closest_to_pin_tips.round_id
      WHERE ce.id = closest_to_pin_tips.entry_id
        AND ce.user_id = auth.uid()
        AND r.locked = FALSE
    )
  );

CREATE POLICY "ctp_tips: admin write"
  ON closest_to_pin_tips FOR ALL
  USING (is_admin());
