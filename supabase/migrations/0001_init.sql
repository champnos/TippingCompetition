-- ============================================================
-- 0001_init.sql  – Initial schema for Tipping Competition
-- Shared-fixture model: teams/rounds/games are global,
-- competitions reference those games.
-- Auth: Supabase auth.users is the source of truth for logins.
-- ============================================================

-- ── Seasons ──────────────────────────────────────────────────
CREATE TABLE seasons (
    id          SERIAL PRIMARY KEY,
    year        INTEGER NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Rounds ───────────────────────────────────────────────────
CREATE TABLE rounds (
    id          SERIAL PRIMARY KEY,
    season_id   INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    locked      BOOLEAN NOT NULL DEFAULT FALSE,
    lock_time   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (season_id, round_number)
);

-- ── Teams ────────────────────────────────────────────────────
CREATE TABLE teams (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    short_name  VARCHAR(10),
    logo_url    TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Games (fixtures) ─────────────────────────────────────────
CREATE TABLE games (
    id              SERIAL PRIMARY KEY,
    round_id        INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    home_team_id    INTEGER NOT NULL REFERENCES teams(id),
    away_team_id    INTEGER NOT NULL REFERENCES teams(id),
    match_time      TIMESTAMPTZ NOT NULL,
    venue           VARCHAR(100),
    home_score      INTEGER,
    away_score      INTEGER,
    winner_team_id  INTEGER REFERENCES teams(id),
    is_final        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT different_teams CHECK (home_team_id <> away_team_id)
);

-- ── Profiles (extends auth.users) ────────────────────────────
CREATE TABLE profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name   VARCHAR(255),
    short_name  VARCHAR(100),
    phone       VARCHAR(50),
    connection  TEXT,
    notes       TEXT,
    is_admin    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- ── Competitions ──────────────────────────────────────────────
CREATE TABLE competitions (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    season_id   INTEGER NOT NULL REFERENCES seasons(id),
    entry_fee   NUMERIC(10,2) DEFAULT 0,
    prize_pool  NUMERIC(10,2) DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (name, season_id)
);

-- ── Entries ───────────────────────────────────────────────────
CREATE TABLE entries (
    id              SERIAL PRIMARY KEY,
    profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    competition_id  INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    joined_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (profile_id, competition_id)
);

-- ── Tips ──────────────────────────────────────────────────────
CREATE TABLE tips (
    id              SERIAL PRIMARY KEY,
    profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    competition_id  INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    game_id         INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    picked_team_id  INTEGER NOT NULL REFERENCES teams(id),
    margin_tip      INTEGER,
    score_tip_home  INTEGER,
    score_tip_away  INTEGER,
    is_correct      BOOLEAN,
    points_awarded  INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (profile_id, competition_id, game_id)
);

CREATE TRIGGER trg_tips_updated_at
BEFORE UPDATE ON tips
FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- ── Transaction Types ─────────────────────────────────────────
CREATE TABLE transaction_types (
    id      SERIAL PRIMARY KEY,
    name    VARCHAR(100) NOT NULL UNIQUE
);

INSERT INTO transaction_types (name) VALUES
    ('Entry Fee'),
    ('Prize Payout'),
    ('Adjustment'),
    ('Refund');

-- ── Transactions ──────────────────────────────────────────────
CREATE TABLE transactions (
    id              SERIAL PRIMARY KEY,
    profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    competition_id  INTEGER REFERENCES competitions(id),
    type_id         INTEGER NOT NULL REFERENCES transaction_types(id),
    amount          NUMERIC(10,2) NOT NULL,
    notes           TEXT,
    created_by      UUID REFERENCES profiles(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Bank Details ──────────────────────────────────────────────
CREATE TABLE bank_details (
    id             SERIAL PRIMARY KEY,
    profile_id     UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
    bsb            VARCHAR(10),
    account_number VARCHAR(20),
    account_name   VARCHAR(255),
    notes          TEXT,
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_bank_updated_at
BEFORE UPDATE ON bank_details
FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
