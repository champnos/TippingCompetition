import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AdminPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/dashboard')

  const [
    { data: seasons },
    { data: teams },
    { data: rounds },
    { data: competitions },
  ] = await Promise.all([
    supabase.from('seasons').select('id, year').order('year', { ascending: false }),
    supabase.from('teams').select('id, name, short_name').order('name'),
    supabase.from('rounds').select('id, season_id, round_number, locked').order('round_number'),
    supabase.from('competitions').select('id, name, season_id, is_active, entry_fee').order('id', { ascending: false }),
  ])

  const { data: activeComp } = await supabase
    .from('competitions')
    .select('id, name, season_id')
    .eq('is_active', true)
    .single()

  type Game = {
    id: number
    match_time: string
    venue: string | null
    home_score: number | null
    away_score: number | null
    winner_team_id: number | null
    round_id: number
    rounds: { season_id: number; round_number: number }
    home_team: { id: number; name: string; short_name: string | null }
    away_team: { id: number; name: string; short_name: string | null }
  }

  let games: Game[] = []
  if (activeComp) {
    const { data: gamesData } = await supabase
      .from('games')
      .select(`
        id, match_time, venue, home_score, away_score, winner_team_id,
        round_id,
        rounds!inner(season_id, round_number),
        home_team:teams!games_home_team_id_fkey(id, name, short_name),
        away_team:teams!games_away_team_id_fkey(id, name, short_name)
      `)
      .eq('rounds.season_id', activeComp.season_id)
      .order('match_time', { ascending: true })
    games = (gamesData ?? []) as unknown as Game[]
  }

  const roundMap: Record<number, { round_number: number; games: Game[] }> = {}
  for (const g of games) {
    if (!roundMap[g.round_id]) {
      roundMap[g.round_id] = { round_number: g.rounds.round_number, games: [] }
    }
    roundMap[g.round_id].games.push(g)
  }

  const resultRounds = Object.entries(roundMap)
    .map(([rid, val]) => ({ round_id: Number(rid), ...val }))
    .sort((a, b) => a.round_number - b.round_number)

  const inputStyle = {
    padding: '6px 8px', borderRadius: 4, border: '1px solid #ccc',
    fontSize: 14, width: '100%', boxSizing: 'border-box' as const,
  }
  const selectStyle = {
    padding: '6px 8px', borderRadius: 4, border: '1px solid #ccc',
    fontSize: 14, width: '100%', boxSizing: 'border-box' as const,
  }
  const btnStyle = {
    background: '#1a73e8', color: '#fff', border: 'none',
    padding: '8px 20px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
  }
  const sectionStyle = { marginBottom: 48 }
  const tableStyle = { width: '100%', borderCollapse: 'collapse' as const, marginBottom: 20, fontSize: 14 }
  const thStyle = { textAlign: 'left' as const, borderBottom: '2px solid #ddd', padding: '6px 8px', color: '#555' }
  const tdStyle = { borderBottom: '1px solid #eee', padding: '6px 8px' }
  const formGridStyle = { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', alignItems: 'end' }

  return (
    <main style={{ maxWidth: 960, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Admin Panel</h1>
        <a href="/dashboard">← Dashboard</a>
      </div>

      {/* ── Seasons ── */}
      <section style={sectionStyle}>
        <h2 style={{ borderBottom: '2px solid #ddd', paddingBottom: 8 }}>Seasons</h2>
        {(seasons ?? []).length > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Year</th>
              </tr>
            </thead>
            <tbody>
              {(seasons ?? []).map((s) => (
                <tr key={s.id}>
                  <td style={tdStyle}>{s.id}</td>
                  <td style={tdStyle}>{s.year}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#888' }}>No seasons yet.</p>
        )}
        <h3>Add Season</h3>
        <form action="/api/admin/season" method="POST">
          <div style={formGridStyle}>
            <div>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Year</label>
              <input type="number" name="year" required placeholder="e.g. 2026" style={inputStyle} />
            </div>
            <div>
              <button type="submit" style={btnStyle}>Add Season</button>
            </div>
          </div>
        </form>
      </section>

      {/* ── Teams ── */}
      <section style={sectionStyle}>
        <h2 style={{ borderBottom: '2px solid #ddd', paddingBottom: 8 }}>Teams</h2>
        {(teams ?? []).length > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Short Name</th>
              </tr>
            </thead>
            <tbody>
              {(teams ?? []).map((t) => (
                <tr key={t.id}>
                  <td style={tdStyle}>{t.id}</td>
                  <td style={tdStyle}>{t.name}</td>
                  <td style={tdStyle}>{t.short_name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#888' }}>No teams yet.</p>
        )}
        <h3>Add Team</h3>
        <form action="/api/admin/team" method="POST">
          <div style={formGridStyle}>
            <div>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Name</label>
              <input type="text" name="name" required placeholder="e.g. Richmond Tigers" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Short Name</label>
              <input type="text" name="short_name" placeholder="e.g. RICH" style={inputStyle} />
            </div>
            <div>
              <button type="submit" style={btnStyle}>Add Team</button>
            </div>
          </div>
        </form>
      </section>

      {/* ── Rounds ── */}
      <section style={sectionStyle}>
        <h2 style={{ borderBottom: '2px solid #ddd', paddingBottom: 8 }}>Rounds</h2>
        {(rounds ?? []).length > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Season</th>
                <th style={thStyle}>Round #</th>
                <th style={thStyle}>Locked</th>
              </tr>
            </thead>
            <tbody>
              {(rounds ?? []).map((r) => (
                <tr key={r.id}>
                  <td style={tdStyle}>{r.id}</td>
                  <td style={tdStyle}>{(seasons ?? []).find((s) => s.id === r.season_id)?.year ?? r.season_id}</td>
                  <td style={tdStyle}>{r.round_number}</td>
                  <td style={tdStyle}>{r.locked ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#888' }}>No rounds yet.</p>
        )}
        <h3>Add Round</h3>
        <form action="/api/admin/round" method="POST">
          <div style={formGridStyle}>
            <div>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Season</label>
              <select name="season_id" required style={selectStyle}>
                <option value="">Select season…</option>
                {(seasons ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.year}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Round Number</label>
              <input type="number" name="round_number" required placeholder="e.g. 1" min={1} style={inputStyle} />
            </div>
            <div>
              <button type="submit" style={btnStyle}>Add Round</button>
            </div>
          </div>
        </form>
      </section>

      {/* ── Add Fixture ── */}
      <section style={sectionStyle}>
        <h2 style={{ borderBottom: '2px solid #ddd', paddingBottom: 8 }}>Add Fixture</h2>
        <form action="/api/admin/game" method="POST">
          <div style={formGridStyle}>
            <div>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Round</label>
              <select name="round_id" required style={selectStyle}>
                <option value="">Select round…</option>
                {(rounds ?? []).map((r) => {
                  const seasonYear = (seasons ?? []).find((s) => s.id === r.season_id)?.year ?? r.season_id
                  return (
                    <option key={r.id} value={r.id}>{seasonYear} — Round {r.round_number}</option>
                  )
                })}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Home Team</label>
              <select name="home_team_id" required style={selectStyle}>
                <option value="">Select team…</option>
                {(teams ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Away Team</label>
              <select name="away_team_id" required style={selectStyle}>
                <option value="">Select team…</option>
                {(teams ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Match Time</label>
              <input type="datetime-local" name="match_time" required style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Venue</label>
              <input type="text" name="venue" placeholder="e.g. MCG" style={inputStyle} />
            </div>
            <div>
              <button type="submit" style={btnStyle}>Add Fixture</button>
            </div>
          </div>
        </form>
      </section>

      {/* ── Competitions ── */}
      <section style={sectionStyle}>
        <h2 style={{ borderBottom: '2px solid #ddd', paddingBottom: 8 }}>Competitions</h2>
        {(competitions ?? []).length > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Season</th>
                <th style={thStyle}>Entry Fee</th>
                <th style={thStyle}>Active</th>
              </tr>
            </thead>
            <tbody>
              {(competitions ?? []).map((c) => (
                <tr key={c.id}>
                  <td style={tdStyle}>{c.id}</td>
                  <td style={tdStyle}>{c.name}</td>
                  <td style={tdStyle}>{(seasons ?? []).find((s) => s.id === c.season_id)?.year ?? c.season_id}</td>
                  <td style={tdStyle}>{c.entry_fee != null ? `$${c.entry_fee}` : '—'}</td>
                  <td style={tdStyle}>{c.is_active ? '✅ Active' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#888' }}>No competitions yet.</p>
        )}
        <h3>Add Competition</h3>
        <form action="/api/admin/competition" method="POST">
          <div style={formGridStyle}>
            <div>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Name</label>
              <input type="text" name="name" required placeholder="e.g. 2026 AFL Tipping" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Season</label>
              <select name="season_id" required style={selectStyle}>
                <option value="">Select season…</option>
                {(seasons ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.year}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Entry Fee ($)</label>
              <input type="number" name="entry_fee" placeholder="e.g. 20" min={0} step="0.01" style={inputStyle} />
            </div>
            <div>
              <button type="submit" style={btnStyle}>Add Competition</button>
            </div>
          </div>
        </form>
      </section>

      {/* ── Enter Results ── */}
      {activeComp && (
        <section style={sectionStyle}>
          <h2 style={{ borderBottom: '2px solid #ddd', paddingBottom: 8 }}>Enter Results</h2>
          <h3 style={{ color: '#555', fontWeight: 'normal', marginTop: 0 }}>{activeComp.name}</h3>
          <p style={{ color: '#888', fontSize: 14 }}>
            Enter scores below. Points are awarded as the actual winning margin — positive if the user tipped the winner, negative if they tipped the loser.
          </p>

          {resultRounds.map(({ round_id, round_number, games: roundGames }) => (
            <section key={round_id} style={{ marginBottom: 32 }}>
              <h3 style={{ borderBottom: '1px solid #ddd', paddingBottom: 6 }}>
                Round {round_number}
              </h3>
              {roundGames.map((game) => {
                const hasResult = game.home_score !== null && game.away_score !== null
                const matchDate = new Date(game.match_time).toLocaleString('en-AU', {
                  weekday: 'short', day: 'numeric', month: 'short',
                  hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Melbourne',
                })

                return (
                  <div key={game.id} style={{
                    border: '1px solid #ddd',
                    borderRadius: 8,
                    padding: '16px',
                    marginBottom: 12,
                    background: hasResult ? '#f0fff0' : '#fff',
                  }}>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
                      {matchDate}{game.venue ? ` · ${game.venue}` : ''}
                      {hasResult && (
                        <span style={{ marginLeft: 8, color: '#4a4', fontWeight: 'bold' }}>
                          ✓ Result entered
                        </span>
                      )}
                    </div>

                    <form action="/api/admin/result" method="POST" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <input type="hidden" name="game_id" value={game.id} />
                      <input type="hidden" name="competition_id" value={activeComp.id} />
                      <input type="hidden" name="home_team_id" value={game.home_team.id} />
                      <input type="hidden" name="away_team_id" value={game.away_team.id} />

                      <span style={{ fontWeight: 'bold', minWidth: 80 }}>
                        {game.home_team.short_name ?? game.home_team.name}
                      </span>
                      <input
                        type="number"
                        name="home_score"
                        defaultValue={game.home_score ?? ''}
                        placeholder="Score"
                        min={0}
                        style={{ width: 70, padding: '6px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 14 }}
                      />
                      <span style={{ color: '#999' }}>vs</span>
                      <input
                        type="number"
                        name="away_score"
                        defaultValue={game.away_score ?? ''}
                        placeholder="Score"
                        min={0}
                        style={{ width: 70, padding: '6px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 14 }}
                      />
                      <span style={{ fontWeight: 'bold', minWidth: 80 }}>
                        {game.away_team.short_name ?? game.away_team.name}
                      </span>

                      <button
                        type="submit"
                        style={{
                          background: hasResult ? '#555' : '#1a73e8',
                          color: '#fff', border: 'none',
                          padding: '7px 18px', borderRadius: 4,
                          fontSize: 13, cursor: 'pointer',
                        }}
                      >
                        {hasResult ? 'Update & Regrade' : 'Save & Grade Tips'}
                      </button>
                    </form>
                  </div>
                )
              })}
            </section>
          ))}

          {resultRounds.length === 0 && <p>No fixtures loaded for this competition&apos;s season yet.</p>}
        </section>
      )}
    </main>
  )
}