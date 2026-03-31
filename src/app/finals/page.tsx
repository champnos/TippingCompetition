import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type Team = {
  id: number
  name: string
  short_name: string | null
}

type FinalsEntry = {
  id: number
  is_active: boolean
  eliminated_week: number | null
  total_paid: number
}

type FinalsTip = {
  id: number
  finals_week: number
  team_id: number | null
  margin: number | null
  actual_margin: number | null
  correct_team: boolean | null
  error_score: number | null
  team: { name: string; short_name: string | null } | null
}

type FinalsWeek = {
  finals_week: number
  locked: boolean
}

const WEEK_NAMES: Record<number, string> = {
  1: 'Week 1 — Qualifying/Elimination Finals',
  2: 'Week 2 — Semi Finals',
  3: 'Week 3 — Prelim Finals',
  4: 'Week 4 — Grand Final',
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'Please fill in all required fields (team and a non-negative margin).',
  no_entry: 'You are not enrolled in this competition. Please contact the administrator.',
  not_active: 'You have been eliminated from this competition.',
  week_locked: 'This finals week is locked — tips can no longer be changed.',
  tip_save_failed: 'Failed to save your tip. Please try again.',
}

export default async function FinalsPage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Find active finals competition
  const { data: competition } = await supabase
    .from('competitions')
    .select('id, name, season_id, entry_fee')
    .eq('is_active', true)
    .ilike('name', '%finals%')
    .single()

  if (!competition) {
    return (
      <main className="page-container">
        <div className="page-header">
          <h1>🏆 Finals Tipping</h1>
          <a href="/dashboard" className="btn btn-primary btn-sm">← Dashboard</a>
        </div>
        <div className="section-card">
          <p>No active Finals competition found.</p>
        </div>
      </main>
    )
  }

  // Get user's entry
  const { data: entryData } = await supabase
    .from('finals_entries')
    .select('id, is_active, eliminated_week, total_paid')
    .eq('competition_id', competition.id)
    .eq('user_id', user.id)
    .single()

  const entry = entryData as FinalsEntry | null

  // Get all teams
  const { data: allTeamsData } = await supabase
    .from('teams')
    .select('id, name, short_name')
    .order('name')

  const allTeams = (allTeamsData ?? []) as Team[]

  // Get week lock status
  const { data: weeksData } = await supabase
    .from('finals_weeks')
    .select('finals_week, locked')
    .eq('competition_id', competition.id)

  const weekLocks = (weeksData ?? []) as FinalsWeek[]
  const lockedWeeks = new Set(weekLocks.filter((w) => w.locked).map((w) => w.finals_week))

  // Determine current finals week (lowest week 1–4 that is not locked AND results not yet processed)
  // "Current week" = first week where tips haven't been processed (no error_score set for active entries)
  // Simpler: first unlocked week from 1–4
  let currentWeek: number | null = null
  for (let w = 1; w <= 4; w++) {
    if (!lockedWeeks.has(w)) {
      currentWeek = w
      break
    }
  }

  // Get tip history for this entry
  let tipHistory: FinalsTip[] = []

  if (entry) {
    const { data: tipsData } = await supabase
      .from('finals_tips')
      .select(`
        id, finals_week, team_id, margin, actual_margin, correct_team, error_score,
        team:teams(name, short_name)
      `)
      .eq('entry_id', entry.id)
      .order('finals_week', { ascending: true })

    tipHistory = (tipsData ?? []) as unknown as FinalsTip[]
  }

  // Current week tip (if exists)
  const currentTip = currentWeek
    ? tipHistory.find((t) => t.finals_week === currentWeek)
    : null

  const canTip = !!entry && entry.is_active && currentWeek !== null && !lockedWeeks.has(currentWeek)

  // Build leaderboard
  type EntryWithProfile = {
    id: number
    user_id: string
    is_active: boolean
    eliminated_week: number | null
    total_paid: number
    profiles: { full_name: string | null } | null
  }

  const { data: allEntriesData } = await supabase
    .from('finals_entries')
    .select(`
      id, user_id, is_active, eliminated_week, total_paid,
      profiles(full_name)
    `)
    .eq('competition_id', competition.id)

  const allEntries = (allEntriesData ?? []) as unknown as EntryWithProfile[]

  // Sort: active first, then by eliminated_week descending (survived longest first)
  const leaderboard = [...allEntries].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
    return (b.eliminated_week ?? 0) - (a.eliminated_week ?? 0)
  })

  const prizePool = allEntries.reduce((s, e) => s + Number(e.total_paid), 0)
  const entryFee = Number(competition.entry_fee ?? 30)
  const activeCount = allEntries.filter((e) => e.is_active).length

  const errorMsg = searchParams.error ? ERROR_MESSAGES[searchParams.error] ?? searchParams.error : null
  const savedMsg = searchParams.saved ? 'Tip saved successfully!' : null

  return (
    <main className="page-container">
      <div className="page-header">
        <h1>🏆 Finals Tipping</h1>
        <a href="/dashboard" className="btn btn-primary btn-sm">← Dashboard</a>
      </div>
      <p style={{ marginBottom: 24, color: 'var(--text-muted)' }}>{competition.name}</p>

      {errorMsg && (
        <div className="alert-error" style={{ marginBottom: 20 }}>{errorMsg}</div>
      )}
      {savedMsg && (
        <div style={{ background: '#f0fff4', border: '1px solid #bbf7d0', color: 'var(--success)', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
          {savedMsg}
        </div>
      )}

      {!entry && (
        <div className="section-card">
          <p>You are not enrolled in this competition. Please contact the administrator to be added.</p>
        </div>
      )}

      {/* ── Entry Status ── */}
      {entry && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Your Status</h2>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div className="form-label">Status</div>
              <div style={{ marginTop: 4, fontSize: '1.1rem', fontWeight: 700, color: entry.is_active ? 'var(--success)' : 'var(--danger)' }}>
                {entry.is_active
                  ? '✅ Still In'
                  : `❌ Eliminated (Week ${entry.eliminated_week})`}
              </div>
            </div>
            <div>
              <div className="form-label">Prize Pool</div>
              <div style={{ marginTop: 4, fontWeight: 600, color: 'var(--gold-dark)' }}>${prizePool.toFixed(2)}</div>
            </div>
            <div>
              <div className="form-label">Still In</div>
              <div style={{ marginTop: 4, fontWeight: 600 }}>{activeCount} / {allEntries.length}</div>
            </div>
            <div>
              <div className="form-label">Total Paid</div>
              <div style={{ marginTop: 4 }}>${Number(entry.total_paid).toFixed(2)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tip Form ── */}
      {canTip && currentWeek !== null && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>{WEEK_NAMES[currentWeek]} — Submit Tip</h2>
            {currentTip && <span className="badge-tipped">✓ Tip submitted</span>}
          </div>
          <p style={{ marginBottom: 16, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Pick one team and a winning margin. Closest to the pin survives!
            Correct team: error = |actual − your margin|. Wrong team: error = actual + your margin.
          </p>

          {currentTip && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: '#f0fff4', borderRadius: 6, border: '1px solid #bbf7d0' }}>
              <strong>Current tip:</strong>{' '}
              {currentTip.team?.short_name ?? currentTip.team?.name ?? '—'} by {currentTip.margin} pts
              {' '}— you can update until the week is locked.
            </div>
          )}

          <form action="/api/finals/tip" method="POST">
            <input type="hidden" name="competition_id" value={competition.id} />
            <input type="hidden" name="finals_week" value={currentWeek} />
            <div className="form-grid">
              <div className="form-field">
                <label className="form-label">Pick Your Team</label>
                <select name="team_id" required className="form-select" defaultValue={currentTip?.team_id ?? ''}>
                  <option value="">Select a team…</option>
                  {allTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.short_name ? ` (${t.short_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Winning Margin (pts)</label>
                <input
                  type="number"
                  name="margin"
                  required
                  min={0}
                  placeholder="e.g. 15"
                  defaultValue={currentTip?.margin ?? ''}
                  className="form-input"
                />
              </div>
              <div className="form-field" style={{ justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-gold">
                  {currentTip ? '🔄 Update Tip' : '💾 Submit Tip'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {!canTip && entry?.is_active && currentWeek !== null && lockedWeeks.has(currentWeek) && (
        <div className="section-card">
          <p>Week {currentWeek} is locked. Check back when the next finals week opens.</p>
        </div>
      )}

      {!canTip && entry?.is_active && currentWeek === null && (
        <div className="section-card">
          <p>The finals series is complete.</p>
        </div>
      )}

      {entry && !entry.is_active && (
        <div className="section-card">
          <p>You were eliminated in Week {entry.eliminated_week}. Better luck next year!</p>
        </div>
      )}

      {/* ── Tip History ── */}
      {entry && tipHistory.length > 0 && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Tip History</h2>
          </div>
          <div className="table-wrap">
            <table className="afl-table">
              <thead>
                <tr>
                  <th>Week</th>
                  <th>Team Picked</th>
                  <th className="center">Your Margin</th>
                  <th className="center">Actual Margin</th>
                  <th className="center">Correct Team?</th>
                  <th className="center">Error Score</th>
                </tr>
              </thead>
              <tbody>
                {tipHistory.map((tip) => (
                  <tr key={tip.id}>
                    <td>{WEEK_NAMES[tip.finals_week] ?? `Week ${tip.finals_week}`}</td>
                    <td>
                      {tip.team
                        ? (tip.team.short_name ?? tip.team.name)
                        : <span style={{ color: 'var(--text-muted)' }}>No tip</span>}
                    </td>
                    <td className="center">{tip.margin ?? '—'}</td>
                    <td className="center">{tip.actual_margin ?? '—'}</td>
                    <td className="center">
                      {tip.correct_team === true && <span style={{ color: 'var(--success)', fontWeight: 700 }}>✅ Yes</span>}
                      {tip.correct_team === false && <span style={{ color: 'var(--danger)', fontWeight: 700 }}>❌ No</span>}
                      {tip.correct_team === null && '—'}
                    </td>
                    <td className="center">
                      {tip.error_score !== null
                        ? <span style={{ fontWeight: 700, color: tip.error_score === 9999 ? 'var(--danger)' : 'inherit' }}>
                            {tip.error_score === 9999 ? '⚠️ No tip' : tip.error_score}
                          </span>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Leaderboard ── */}
      {leaderboard.length > 0 && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Leaderboard</h2>
          </div>
          <div className="table-wrap">
            <table className="afl-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th className="center">Status</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row, idx) => (
                  <tr
                    key={row.id}
                    className={[
                      idx === 0 && row.is_active ? 'rank-1' : '',
                      row.user_id === user.id ? 'current-user' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <td className="center">{idx + 1}</td>
                    <td>{row.profiles?.full_name ?? row.user_id}</td>
                    <td className="center">
                      {row.is_active
                        ? <span style={{ color: 'var(--success)', fontWeight: 700 }}>✅ Still In</span>
                        : <span style={{ color: 'var(--danger)' }}>❌ Out Wk {row.eliminated_week}</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {allEntries.length > 0 && (
            <p style={{ marginTop: 12, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Prize pool: <strong style={{ color: 'var(--gold-dark)' }}>${prizePool.toFixed(2)}</strong>
              {' '}({allEntries.length} entrant{allEntries.length !== 1 ? 's' : ''} @ ${entryFee.toFixed(0)}/entry)
            </p>
          )}
        </div>
      )}
    </main>
  )
}
