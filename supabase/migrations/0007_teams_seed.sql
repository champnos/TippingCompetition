-- ============================================================
-- 0007_teams_seed.sql  – Add abbreviation/state to teams, seed 18 AFL teams
-- ============================================================

-- ── Add new columns ──────────────────────────────────────────
ALTER TABLE teams ADD COLUMN IF NOT EXISTS abbreviation VARCHAR(5);
ALTER TABLE teams ADD COLUMN IF NOT EXISTS state        VARCHAR(50);

-- ── Seed 18 AFL teams (upsert by name so safe to re-run) ────
INSERT INTO teams (name, short_name, abbreviation, state) VALUES
  ('Adelaide Crows',        'Adelaide',  'ADE', 'SA'),
  ('Brisbane Lions',        'Brisbane',  'BRL', 'QLD'),
  ('Carlton Blues',         'Carlton',   'CAR', 'VIC'),
  ('Collingwood Magpies',   'Collingwood','COL','VIC'),
  ('Essendon Bombers',      'Essendon',  'ESS', 'VIC'),
  ('Fremantle Dockers',     'Fremantle', 'FRE', 'WA'),
  ('Geelong Cats',          'Geelong',   'GEE', 'VIC'),
  ('Gold Coast Suns',       'Gold Coast','GCS', 'QLD'),
  ('GWS Giants',            'GWS',       'GWS', 'NSW'),
  ('Hawthorn Hawks',        'Hawthorn',  'HAW', 'VIC'),
  ('Melbourne Demons',      'Melbourne', 'MEL', 'VIC'),
  ('North Melbourne Kangaroos','North Melbourne','NTH','VIC'),
  ('Port Adelaide Power',   'Port Adelaide','PTA','SA'),
  ('Richmond Tigers',       'Richmond',  'RIC', 'VIC'),
  ('St Kilda Saints',       'St Kilda',  'STK', 'VIC'),
  ('Sydney Swans',          'Sydney',    'SYD', 'NSW'),
  ('West Coast Eagles',     'West Coast','WCE', 'WA'),
  ('Western Bulldogs',      'Western Bulldogs','WBD','VIC')
ON CONFLICT (name) DO UPDATE SET
  short_name   = EXCLUDED.short_name,
  abbreviation = EXCLUDED.abbreviation,
  state        = EXCLUDED.state;
