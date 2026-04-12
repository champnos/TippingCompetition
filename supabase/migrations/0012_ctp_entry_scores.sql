-- ============================================================
-- 0012_ctp_entry_scores.sql
-- Add total_score and correct_tips_count to closest_to_pin_entries
-- ============================================================

ALTER TABLE closest_to_pin_entries
  ADD COLUMN IF NOT EXISTS total_score        NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS correct_tips_count INTEGER        NOT NULL DEFAULT 0;
