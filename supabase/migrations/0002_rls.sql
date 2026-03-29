-- ============================================================
-- 0002_rls.sql  – Row Level Security policies
-- ============================================================

ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE games            ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds           ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons          ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips             ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_details     ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_types ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
    SELECT COALESCE(
        (SELECT is_admin FROM public.profiles WHERE id = auth.uid()),
        FALSE
    );
$$;

CREATE POLICY "profiles: own read" ON profiles FOR SELECT USING (id = auth.uid() OR is_admin());
CREATE POLICY "profiles: own update" ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profiles: admin insert" ON profiles FOR INSERT WITH CHECK (is_admin() OR id = auth.uid());

CREATE POLICY "competitions: read" ON competitions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "competitions: admin write" ON competitions FOR ALL USING (is_admin());

CREATE POLICY "seasons: read" ON seasons FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "rounds: read" ON rounds FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "rounds: admin write" ON rounds FOR ALL USING (is_admin());
CREATE POLICY "teams: read" ON teams FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "teams: admin write" ON teams FOR ALL USING (is_admin());
CREATE POLICY "games: read" ON games FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "games: admin write" ON games FOR ALL USING (is_admin());

CREATE POLICY "entries: own read" ON entries FOR SELECT USING (profile_id = auth.uid() OR is_admin());
CREATE POLICY "entries: own insert" ON entries FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "entries: admin write" ON entries FOR ALL USING (is_admin());

CREATE POLICY "tips: own read" ON tips FOR SELECT USING (profile_id = auth.uid() OR is_admin());
CREATE POLICY "tips: own insert (round unlocked)" ON tips FOR INSERT WITH CHECK (
    profile_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM games g
        JOIN rounds r ON r.id = g.round_id
        WHERE g.id = tips.game_id AND r.locked = FALSE
    )
);
CREATE POLICY "tips: own update (round unlocked)" ON tips FOR UPDATE USING (
    profile_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM games g
        JOIN rounds r ON r.id = g.round_id
        WHERE g.id = tips.game_id AND r.locked = FALSE
    )
);
CREATE POLICY "tips: admin write" ON tips FOR ALL USING (is_admin());

CREATE POLICY "transactions: own read" ON transactions FOR SELECT USING (profile_id = auth.uid() OR is_admin());
CREATE POLICY "transactions: admin write" ON transactions FOR ALL USING (is_admin());
CREATE POLICY "bank_details: own" ON bank_details FOR ALL USING (profile_id = auth.uid() OR is_admin());
CREATE POLICY "transaction_types: read" ON transaction_types FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "transaction_types: admin write" ON transaction_types FOR ALL USING (is_admin());
