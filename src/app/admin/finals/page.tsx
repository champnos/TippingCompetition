import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type FinalsEntry = {
  id: number
  competition_id: number
  user_id: string
  total_paid: number
  is_active: boolean
  eliminated_week: number | null
  created_at: string
  profiles: { full_name: string | null } | null
}

type FinalsWeek = {
  finals_week: number
  locked: boolean
}

type FinalsGame = {
  id: number
  match_time: string | null
  venue: string | null
  home_score: number | null
  away_score: number | null
  home_team: { id: number; name: string; short_name: string | null } | null
  away_team: { id: number; name: string; short_name: string | null } | null
  rounds: { round_number: number } | null
}

const WEEK_NAMES: Record<number, string> = {
  1: 'Week 1 — Qualifying/Elimination Finals',
  2: 'Week 2 — Semi Finals',
  3: 'Week 3 — Prelim Finals',
  4: 'Week 4 — Grand Final',
}

export default async function AdminFinalsPage({
  searchParams,
}: {
  searchParams: {
    error?: string
    processed?: string
    locked?: string
    info?: string
    game_added?: string
    score_saved?: string
  }
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

  // Find active finals competition
  const { data: competition } = await supabase
    .from('competitions')
    .select('id, name, season_id, entry_fee')
    .eq('is_active', true)
    .ilike('name', '%finals%')
    .single()

  const allUsers = await supabase
    .from('profiles')
    .select('id, full_name')
    .order('full_name')
    .then(({ data }) => data ?? [])

  const allTeams = await supabase
    .from('teams')
    .select('id, name, short_name')
    .order('name')
    .then(({ data }) => data ?? [])

  let entries: FinalsEntry[] = []
  let weekLocks: FinalsWeek[] = []
  let finalsGames: FinalsGame[] = []

  if (competition) {
    const [{ data: entriesData }, { data: weeksData }, { data: gamesData }] = await Promise.all([
      supabase
        .from('finals_entries')
        .select(`
          id, competition_id, user_id, total_paid, is_active, eliminated_week, created_at,
          profiles(full_name)
        `)
        .eq('competition_id', competition.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('finals_weeks')
        .select('finals_week, locked')
        .eq('competition_id', competition.id),
      supabase
        .from('games')
        .select(`
          id, match_time, venue, home_score, away_score,
          home_team:teams!games_home_team_id_fkey(id, name, short_name),
          away_team:teams!games_away_team_id_fkey(id, name, short_name),
          rounds!inner(round_number, season_id)
        `)
        .eq('is_final', true)
        .eq('rounds.season_id', competition.season_id)
        .in('rounds.round_number', [100, 101, 102, 103])
        .order('match_time', { ascending: true }),
    ])

    entries = (entriesData ?? []) as unknown as FinalsEntry[]
    weekLocks = (weeksData ?? []) as FinalsWeek[]
    finalsGames = (gamesData ?? []) as unknown as FinalsGame[]
  }

  const lockedWeeks = new Set(weekLocks.filter((w) => w.locked).map((w) => w.finals_week))

  const entryFee = Number(competition?.entry_fee ?? 30)
  const prizePool = entries.reduce((s, e) => s + Number(e.total_paid), 0)
  const activeCount = entries.filter((e) => e.is_active).length
  const eliminatedCount = entries.filter((e) => !e.is_active).length

  // After GF, winner(s) remain active=true. Only losers get eliminated.
  // So winners = entries still active.
  const winners = entries.filter((e) => e.is_active)
  const prizePerWinner = winners.length > 0 ? prizePool / winners.length : 0

  const errorMsg = searchParams.error
    ? searchParams.error === 'missing_fields' ? 'Please fill in all required fields.'
    : searchParams.error === 'entry_save_failed' ? 'Failed to add entrant. They may already be enrolled.'
    : searchParams.error === 'lock_failed' ? 'Failed to lock the week. Please try again.'
    : searchParams.error === 'game_failed' ? 'Failed to add game. Please try again.'
    : searchParams.error === 'score_failed' ? 'Failed to save score. Please try again.'
    : `Error: ${searchParams.error}`
    : null

  const processedMsg = searchParams.processed ? 'Week results processed successfully.' : null
  const lockedMsg = searchParams.locked ? 'Finals week locked successfully.' : null
  const gameAddedMsg = searchParams.game_added ? 'Game added successfully.' : null
  const scoreSavedMsg = searchParams.score_saved ? 'Score saved successfully.' : null
  const infoMsg = searchParams.info === 'no_active_entries'
    ? 'No active entries found for this competition.'
    : null

  return (
    <main className="page-container-wide">
      <div className="page-header">
        <h1>🏆 Admin — Finals Tipping</h1>
        <a href="/admin" className="btn btn-primary btn-sm">← Admin Panel</a>
      </div>

      {errorMsg && <div className="alert-error">{errorMsg}</div>}
      {processedMsg && (
        <div style={{ background: '#f0fff4', border: '1px solid #bbf7d0', color: 'var(--success)', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
          {processedMsg}
        </div>
      )}
      {lockedMsg && (
        <div style={{ background: '#f0fff4', border: '1px solid #bbf7d0', color: 'var(--success)', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
          {lockedMsg}
        </div>
      )}
      {gameAddedMsg && (
        <div style={{ background: '#f0fff4', border: '1px solid #bbf7d0', color: 'var(--success)', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
          {gameAddedMsg}
        </div>
      )}
      {scoreSavedMsg && (
        <div style={{ background: '#f0fff4', border: '1px solid #bbf7d0', color: 'var(--success)', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
          {scoreSavedMsg}
        </div>
      )}
      {infoMsg && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
          {infoMsg}
        </div>
      )}

      {!competition && (
        <div className="section-card">
          <p>No active Finals competition found. Create a competition with &ldquo;Finals&rdquo; (case-insensitive) in its name and set it as active.</p>
        </div>
      )}

      {/* ── Finals Fixtures ── */}
      {competition && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Finals Fixtures</h2>
          </div>

          {finalsGames.length > 0 ? (
            <div className="table-wrap" style={{ marginBottom: 20 }}>
              <table className="afl-table">
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>Home Team</th>
                    <th>Away Team</th>
                    <th>Date</th>
                    <th>Venue</th>
                    <th className="center">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {finalsGames.map((g) => {
                    const week = g.rounds ? g.rounds.round_number - 99 : null
                    const result =
                      g.home_score !== null && g.away_score !== null
                        ? `${g.home_score} – ${g.away_score}`
                        : 'TBC'
                    return (
                      <tr key={g.id}>
                        <td>{week ? WEEK_NAMES[week] : '—'}</td>
                        <td>{g.home_team?.name ?? '—'}</td>
                        <td>{g.away_team?.name ?? '—'}</td>
                        <td>{g.match_time ? new Date(g.match_time).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                        <td>{g.venue ?? '—'}</td>
                        <td className="center">{result}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ marginBottom: 16 }}>No finals games added yet.</p>
          )}

          <h3 style={{ marginBottom: 14 }}>Add Finals Game</h3>
          <form action="/api/admin/finals/game" method="POST">
            <input type="hidden" name="competition_id" value={competition.id} />
            <div className="form-grid">
              <div className="form-field">
                <label className="form-label">Finals Week</label>
                <select name="finals_week" required className="form-select">
                  <option value="">Select week…</option>
                  {[1, 2, 3, 4].map((w) => (
                    <option key={w} value={w}>{WEEK_NAMES[w]}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Home Team</label>
                <select name="home_team_id" required className="form-select">
                  <option value="">Select team…</option>
                  {allTeams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Away Team</label>
                <select name="away_team_id" required className="form-select">
                  <option value="">Select team…</option>
                  {allTeams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Match Date/Time</label>
                <input type="datetime-local" name="match_time" required className="form-input" />
              </div>
              <div className="form-field">
                <label className="form-label">Venue (optional)</label>
                <input type="text" name="venue" placeholder="e.g. MCG" className="form-input" />
              </div>
              <div className="form-field" style={{ justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary">Add Game</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ── Enter Scores ── */}
      {competition && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Enter Scores</h2>
          </div>
          {finalsGames.filter((g) => g.home_score === null).length === 0 ? (
            <p>All games have been scored.</p>
          ) : (
            finalsGames
              .filter((g) => g.home_score === null)
              .map((g) => {
                const week = g.rounds ? g.rounds.round_number - 99 : null
                return (
                  <div key={g.id} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
                    <p style={{ fontWeight: 600, marginBottom: 10 }}>
                      {week ? WEEK_NAMES[week] : '—'} — {g.home_team?.name ?? '?'} vs {g.away_team?.name ?? '?'}
                    </p>
                    <form action="/api/admin/finals/score" method="POST">
                      <input type="hidden" name="game_id" value={g.id} />
                      <input type="hidden" name="home_team_id" value={g.home_team?.id ?? ''} />
                      <input type="hidden" name="away_team_id" value={g.away_team?.id ?? ''} />
                      <div className="form-grid">
                        <div className="form-field">
                          <label htmlFor={`home_score_${g.id}`} className="form-label">{g.home_team?.name ?? 'Home'} Score</label>
                          <input id={`home_score_${g.id}`} type="number" name="home_score" required min={0} className="form-input" />
                        </div>
                        <div className="form-field">
                          <label htmlFor={`away_score_${g.id}`} className="form-label">{g.away_team?.name ?? 'Away'} Score</label>
                          <input id={`away_score_${g.id}`} type="number" name="away_score" required min={0} className="form-input" />
                        </div>
                        <div className="form-field" style={{ justifyContent: 'flex-end' }}>
                          <button type="submit" className="btn btn-gold btn-sm">Save Score</button>
                        </div>
                      </div>
                    </form>
                  </div>
                )
              })
          )}
        </div>
      )}

      {/* ── Process Week Results ── */}
      {competition && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Process Week Results</h2>
          </div>
          <p style={{ marginBottom: 16 }}>
            Enter the winning team and actual margin for a finals week to calculate errors and eliminate entrants.
            Elimination fractions: Week 1 → bottom ¼, Week 2 → bottom ⅓, Week 3 → bottom ½, Week 4 → all except winner.
            Ties at the boundary are all eliminated. Grand Final ties split the pot.
          </p>
          <form action="/api/admin/finals/result" method="POST">
            <input type="hidden" name="competition_id" value={competition.id} />
            <div className="form-grid">
              <div className="form-field">
                <label className="form-label">Finals Week</label>
                <select name="finals_week" required className="form-select">
                  <option value="">Select week…</option>
                  {[1, 2, 3, 4].map((w) => (
                    <option key={w} value={w}>
                      {WEEK_NAMES[w]}{lockedWeeks.has(w) ? ' 🔒' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Winning Team</label>
                <select name="winner_team_id" required className="form-select">
                  <option value="">Select team…</option>
                  {allTeams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Actual Winning Margin (pts)</label>
                <input
                  type="number"
                  name="actual_margin"
                  required
                  min={0}
                  placeholder="e.g. 24"
                  className="form-input"
                />
              </div>
              <div className="form-field" style={{ justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-gold">Process Results</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ── Lock Week ── */}
      {competition && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Lock Finals Week</h2>
          </div>
          <p style={{ marginBottom: 16 }}>
            Lock a week to prevent further tip submissions. Weeks are also locked automatically when results are processed.
          </p>
          <form action="/api/admin/finals/lock" method="POST">
            <input type="hidden" name="competition_id" value={competition.id} />
            <div className="form-grid">
              <div className="form-field">
                <label className="form-label">Finals Week</label>
                <select name="finals_week" required className="form-select">
                  <option value="">Select week…</option>
                  {[1, 2, 3, 4].map((w) => (
                    <option key={w} value={w} disabled={lockedWeeks.has(w)}>
                      {WEEK_NAMES[w]}{lockedWeeks.has(w) ? ' 🔒 (already locked)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field" style={{ justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary">Lock Week</button>
              </div>
            </div>
          </form>
          <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[1, 2, 3, 4].map((w) => (
              <span
                key={w}
                style={{
                  padding: '3px 10px',
                  borderRadius: 4,
                  fontSize: '0.88rem',
                  background: lockedWeeks.has(w) ? '#fef3c7' : '#f1f5f9',
                  border: `1px solid ${lockedWeeks.has(w) ? '#fde68a' : '#e2e8f0'}`,
                  color: lockedWeeks.has(w) ? '#92400e' : 'var(--text-muted)',
                }}
              >
                Wk {w}: {lockedWeeks.has(w) ? '🔒 Locked' : '🔓 Open'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Prize Pool ── */}
      {competition && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Prize Pool</h2>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--gold-dark)' }}>
            ${prizePool.toFixed(2)}
          </div>
          <p style={{ marginTop: 8 }}>
            Total collected from {entries.length} entrant{entries.length !== 1 ? 's' : ''} @ ${entryFee.toFixed(0)}/entry
          </p>
          <div style={{ marginTop: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div className="form-label">Still In</div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--success)' }}>{activeCount}</div>
            </div>
            <div>
              <div className="form-label">Eliminated</div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--danger)' }}>{eliminatedCount}</div>
            </div>
          </div>
          {winners.length > 0 && prizePool > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="form-label" style={{ marginBottom: 6 }}>
                {lockedWeeks.has(4)
                  ? `Winner${winners.length > 1 ? 's' : ''} (split pot equally)`
                  : 'Still Active (will split pot if tied in GF)'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {winners.map((w) => (
                  <span key={w.id} style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 4, padding: '2px 8px', fontSize: '0.9rem' }}>
                    {w.profiles?.full_name ?? w.user_id}
                  </span>
                ))}
              </div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--gold-dark)' }}>
                ${prizePerWinner.toFixed(2)} per winner
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Current Standings ── */}
      {competition && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Current Standings</h2>
          </div>

          {entries.length > 0 ? (
            <div className="table-wrap" style={{ marginBottom: 20 }}>
              <table className="afl-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className="center">Status</th>
                    <th className="center">Eliminated Week</th>
                    <th className="center">Total Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {entries
                    .slice()
                    .sort((a, b) => {
                      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
                      return (b.eliminated_week ?? 0) - (a.eliminated_week ?? 0)
                    })
                    .map((e) => (
                      <tr key={e.id}>
                        <td>{e.profiles?.full_name ?? e.user_id}</td>
                        <td className="center">
                          {e.is_active
                            ? <span style={{ color: 'var(--success)', fontWeight: 700 }}>✅ Still In</span>
                            : <span style={{ color: 'var(--danger)' }}>❌ Eliminated</span>
                          }
                        </td>
                        <td className="center">{e.eliminated_week ? `Week ${e.eliminated_week}` : '—'}</td>
                        <td className="center">${Number(e.total_paid).toFixed(2)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ marginBottom: 16 }}>No entries yet.</p>
          )}

          <h3 style={{ marginBottom: 14 }}>Add Entrant</h3>
          <form action="/api/admin/finals/entry" method="POST">
            <input type="hidden" name="competition_id" value={competition?.id ?? ''} />
            <div className="form-grid">
              <div className="form-field">
                <label className="form-label">User</label>
                <select name="user_id" required className="form-select">
                  <option value="">Select user…</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name ?? u.id}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Payment Amount ($)</label>
                <input
                  type="number"
                  name="payment_amount"
                  min={0}
                  step="0.01"
                  placeholder={`e.g. ${entryFee.toFixed(0)}`}
                  className="form-input"
                />
              </div>
              <div className="form-field" style={{ justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary">Add Entrant</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </main>
  )
}
