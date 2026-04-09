import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { imported?: string; skipped?: string; skip_reasons?: string; error?: string }
}) {
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

  return (
    <main className="page-container-wide">
      <div className="page-header">
        <h1>⚙️ Admin Panel</h1>
        <a href="/dashboard" className="btn btn-primary btn-sm">← Dashboard</a>
      </div>

      {/* ── Seasons ── */}
      <div className="section-card">
        <div className="section-card-header">
          <h2>Seasons</h2>
        </div>
        {(seasons ?? []).length > 0 ? (
          <div className="table-wrap">
            <table className="afl-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Year</th>
                </tr>
              </thead>
              <tbody>
                {(seasons ?? []).map((s) => (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    <td>{s.year}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No seasons yet.</p>
        )}
        <h3 style={{ marginBottom: 14, marginTop: 4 }}>Add Season</h3>
        <form action="/api/admin/season" method="POST">
          <div className="form-grid">
            <div className="form-field">
              <label className="form-label">Year</label>
              <input type="number" name="year" required placeholder="e.g. 2026" className="form-input" />
            </div>
            <div className="form-field" style={{ justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary">Add Season</button>
            </div>
          </div>
        </form>
      </div>

      {/* ── Teams ── */}
      <div className="section-card">
        <div className="section-card-header">
          <h2>Teams</h2>
        </div>
        {(teams ?? []).length > 0 ? (
          <div className="table-wrap">
            <table className="afl-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Short Name</th>
                </tr>
              </thead>
              <tbody>
                {(teams ?? []).map((t) => (
                  <tr key={t.id}>
                    <td>{t.id}</td>
                    <td>{t.name}</td>
                    <td>{t.short_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No teams yet.</p>
        )}
        <h3 style={{ marginBottom: 14, marginTop: 4 }}>Add Team</h3>
        <form action="/api/admin/team" method="POST">
          <div className="form-grid">
            <div className="form-field">
              <label className="form-label">Name</label>
              <input type="text" name="name" required placeholder="e.g. Richmond Tigers" className="form-input" />
            </div>
            <div className="form-field">
              <label className="form-label">Short Name</label>
              <input type="text" name="short_name" placeholder="e.g. RICH" className="form-input" />
            </div>
            <div className="form-field" style={{ justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary">Add Team</button>
            </div>
          </div>
        </form>
      </div>

      {/* ── Rounds ── */}
      <div className="section-card">
        <div className="section-card-header">
          <h2>Rounds</h2>
        </div>
        {(rounds ?? []).length > 0 ? (
          <div className="table-wrap">
            <table className="afl-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Season</th>
                  <th>Round #</th>
                  <th>Locked</th>
                </tr>
              </thead>
              <tbody>
                {(rounds ?? []).map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{(seasons ?? []).find((s) => s.id === r.season_id)?.year ?? r.season_id}</td>
                    <td>{r.round_number}</td>
                    <td>{r.locked ? '🔒 Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No rounds yet.</p>
        )}
        <h3 style={{ marginBottom: 14, marginTop: 4 }}>Add Round</h3>
        <form action="/api/admin/round" method="POST">
          <div className="form-grid">
            <div className="form-field">
              <label className="form-label">Season</label>
              <select name="season_id" required className="form-select">
                <option value="">Select season…</option>
                {(seasons ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.year}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Round Number</label>
              <input type="number" name="round_number" required placeholder="e.g. 1" min={1} className="form-input" />
            </div>
            <div className="form-field" style={{ justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary">Add Round</button>
            </div>
          </div>
        </form>
      </div>

      {/* ── Import Fixtures (CSV) ── */}
      <div className="section-card">
        <div className="section-card-header">
          <h2>Import Fixtures (CSV)</h2>
        </div>
        {searchParams.imported !== undefined && (
          <div style={{ background: '#f0fff4', border: '1px solid #bbf7d0', color: 'var(--success)', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
            ✅ {searchParams.imported} fixture(s) imported successfully.
          </div>
        )}
        {searchParams.skipped !== undefined && Number(searchParams.skipped) > 0 && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
            ⚠️ {searchParams.skipped} row(s) skipped{searchParams.skip_reasons ? `: ${searchParams.skip_reasons}` : ''}.
          </div>
        )}
        <p style={{ marginBottom: 12, fontSize: '0.9rem', color: '#555' }}>
          Upload a CSV file to bulk-import fixtures. Format: <code>round_id,home_team,away_team,match_time,venue</code>
          <br />
          Teams matched by name or short_name (case-insensitive). <code>match_time</code> in ISO format (e.g. <code>2026-04-12T14:35</code>). <code>venue</code> is optional.
        </p>
        <form action="/api/admin/game/import" method="POST" encType="multipart/form-data">
          <div className="form-grid">
            <div className="form-field">
              <label className="form-label">CSV File</label>
              <input type="file" name="csv_file" accept=".csv" required className="form-input" />
            </div>
            <div className="form-field" style={{ justifyContent: 'flex-end', gap: 10, display: 'flex', alignItems: 'flex-end' }}>
              <a href="/api/admin/game/import" download className="btn btn-sm btn-primary">Download CSV Template</a>
              <button type="submit" className="btn btn-gold">Import Fixtures</button>
            </div>
          </div>
        </form>
      </div>

      {/* ── Add Fixture ── */}
      <div className="section-card">
        <div className="section-card-header">
          <h2>Add Fixture</h2>
        </div>
        <form action="/api/admin/game" method="POST">
          <div className="form-grid">
            <div className="form-field">
              <label className="form-label">Round</label>
              <select name="round_id" required className="form-select">
                <option value="">Select round…</option>
                {(rounds ?? []).map((r) => {
                  const seasonYear = (seasons ?? []).find((s) => s.id === r.season_id)?.year ?? r.season_id
                  return (
                    <option key={r.id} value={r.id}>{seasonYear} — Round {r.round_number}</option>
                  )
                })}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Home Team</label>
              <select name="home_team_id" required className="form-select">
                <option value="">Select team…</option>
                {(teams ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Away Team</label>
              <select name="away_team_id" required className="form-select">
                <option value="">Select team…</option>
                {(teams ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Match Time</label>
              <input type="datetime-local" name="match_time" required className="form-input" />
            </div>
            <div className="form-field">
              <label className="form-label">Venue</label>
              <input type="text" name="venue" placeholder="e.g. MCG" className="form-input" />
            </div>
            <div className="form-field" style={{ justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary">Add Fixture</button>
            </div>
          </div>
        </form>
      </div>

      {/* ── Competitions ── */}
      <div className="section-card">
        <div className="section-card-header">
          <h2>Competitions</h2>
        </div>
        {(competitions ?? []).length > 0 ? (
          <div className="table-wrap">
            <table className="afl-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Season</th>
                  <th>Entry Fee</th>
                  <th>Active</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {(competitions ?? []).map((c) => (
                  <tr key={c.id}>
                    <td>{c.id}</td>
                    <td>{c.name}</td>
                    <td>{(seasons ?? []).find((s) => s.id === c.season_id)?.year ?? c.season_id}</td>
                    <td>{c.entry_fee != null ? `$${c.entry_fee}` : '—'}</td>
                    <td>{c.is_active ? '✅ Active' : 'No'}</td>
                    <td>
                      {!c.is_active && (
                        <form action="/api/admin/competition/activate" method="POST" style={{ display: 'inline' }}>
                          <input type="hidden" name="id" value={c.id} />
                          <button type="submit" className="btn btn-sm btn-gold">Set Active</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No competitions yet.</p>
        )}
        <h3 style={{ marginBottom: 14, marginTop: 4 }}>Add Competition</h3>
        <form action="/api/admin/competition" method="POST">
          <div className="form-grid">
            <div className="form-field">
              <label className="form-label">Name</label>
              <input type="text" name="name" required placeholder="e.g. 2026 AFL Tipping" className="form-input" />
            </div>
            <div className="form-field">
              <label className="form-label">Season</label>
              <select name="season_id" required className="form-select">
                <option value="">Select season…</option>
                {(seasons ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.year}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Entry Fee ($)</label>
              <input type="number" name="entry_fee" placeholder="e.g. 20" min={0} step="0.01" className="form-input" />
            </div>
            <div className="form-field">
              <label className="form-label">
                <input type="checkbox" name="is_active" value="true" style={{ marginRight: 6 }} />
                Set as Active Competition
              </label>
            </div>
            <div className="form-field" style={{ justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary">Add Competition</button>
            </div>
          </div>
        </form>
      </div>

      {/* ── Enter Results ── */}
      {activeComp && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Enter Results</h2>
          </div>
          <p style={{ marginBottom: 16 }}>
            <strong>{activeComp.name}</strong> — Enter scores below. Points are awarded as the actual winning margin.
          </p>

          {resultRounds.map(({ round_id, round_number, games: roundGames }) => (
            <section key={round_id} style={{ marginBottom: 28 }}>
              <div className="round-header" style={{ marginBottom: 12 }}>Round {round_number}</div>
              {roundGames.map((game) => {
                const hasResult = game.home_score !== null && game.away_score !== null
                const matchDate = new Date(game.match_time).toLocaleString('en-AU', {
                  weekday: 'short', day: 'numeric', month: 'short',
                  hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Melbourne',
                })

                return (
                  <div key={game.id} className="game-card" style={{ background: hasResult ? '#f0fff4' : '#fff' }}>
                    <div className="game-meta">
                      <span>{matchDate}{game.venue ? ` · ${game.venue}` : ''}</span>
                      {hasResult && <span className="badge-tipped">✓ Result entered</span>}
                    </div>
                    <form action="/api/admin/result" method="POST" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <input type="hidden" name="game_id" value={game.id} />
                      <input type="hidden" name="competition_id" value={activeComp.id} />
                      <input type="hidden" name="home_team_id" value={game.home_team.id} />
                      <input type="hidden" name="away_team_id" value={game.away_team.id} />
                      <span style={{ fontWeight: 700, minWidth: 80 }}>
                        {game.home_team.short_name ?? game.home_team.name}
                      </span>
                      <input
                        type="number"
                        name="home_score"
                        defaultValue={game.home_score ?? ''}
                        placeholder="Score"
                        min={0}
                        className="form-input"
                        style={{ width: 80 }}
                      />
                      <span className="vs-divider">vs</span>
                      <input
                        type="number"
                        name="away_score"
                        defaultValue={game.away_score ?? ''}
                        placeholder="Score"
                        min={0}
                        className="form-input"
                        style={{ width: 80 }}
                      />
                      <span style={{ fontWeight: 700, minWidth: 80 }}>
                        {game.away_team.short_name ?? game.away_team.name}
                      </span>
                      <button
                        type="submit"
                        className={`btn btn-sm ${hasResult ? 'btn-primary' : 'btn-gold'}`}
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
        </div>
      )}

      {/* ── Competition Admin Links ── */}
      <div className="section-card">
        <div className="section-card-header">
          <h2>Competition Admin</h2>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a href="/admin/closest-to-pin" className="btn btn-primary">🎯 Closest to Pin</a>
          <a href="/admin/knockout" className="btn btn-primary">⚡ Knockout</a>
          <a href="/admin/long-haul" className="btn btn-primary">🏁 Long Haul</a>
          <a href="/admin/margin" className="btn btn-primary">📐 Margin Tipping</a>
          <a href="/admin/precision" className="btn btn-primary">🎯 Precision</a>
          <a href="/admin/finals" className="btn btn-primary">🏆 Finals</a>
        </div>
      </div>

      {/* ── Team Management ── */}
      <div className="section-card">
        <div className="section-card-header">
          <h2>Team Management</h2>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a href="/admin/teams" className="btn btn-primary">🏈 Manage Teams</a>
        </div>
      </div>
    </main>
  )
}