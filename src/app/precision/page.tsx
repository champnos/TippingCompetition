import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type Team = {
  id: number
  name: string
  short_name: string | null
  abbreviation: string | null
}

type PrecisionTip = {
  id: number
  round_id: number
  team_id: number | null
  result: string | null
  rounds: { round_number: number }
  team: { name: string; short_name: string | null } | null
}

type PrecisionEntry = {
  id: number
  is_active: boolean
  eliminated_round: number | null
  total_paid: number
}

type LeaderboardRow = {
  entry_id: number
  user_id: string
  full_name: string | null
  is_active: boolean
  eliminated_round: number | null
  rounds_survived: number
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'Please fill in all required fields.',
  no_entry: 'You are not enrolled in this competition. Please contact the administrator.',
  not_active: 'You have been eliminated from this competition.',
  round_not_found: 'Round not found.',
  round_locked: 'This round is locked — tips can no longer be changed.',
  team_already_used: 'You have already used that team this season. Choose a different team.',
  tip_save_failed: 'Failed to save your tip. Please try again.',
}

export default async function PrecisionPage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Find active precision competition
  const { data: competition } = await supabase
    .from('competitions')
    .select('id, name, season_id, entry_fee')
    .eq('is_active', true)
    .ilike('name', '%precision%')
    .single()

  if (!competition) {
    return (
      <main className="page-container">
        <div className="page-header">
          <h1>🎯 Precision</h1>
          <a href="/dashboard" className="btn btn-primary btn-sm">← Dashboard</a>
        </div>
        <div className="section-card">
          <p>No active Precision competition found.</p>
        </div>
      </main>
    )
  }

  // Get user's entry
  const { data: entryData } = await supabase
    .from('precision_entries')
    .select('id, is_active, eliminated_round, total_paid')
    .eq('competition_id', competition.id)
    .eq('user_id', user.id)
    .single()

  const entry = entryData as PrecisionEntry | null

  // Get current round (lowest unlocked round for this season)
  const { data: currentRound } = await supabase
    .from('rounds')
    .select('id, round_number, locked')
    .eq('season_id', competition.season_id)
    .eq('locked', false)
    .order('round_number', { ascending: true })
    .limit(1)
    .single()

  // Get all teams
  const { data: allTeamsData } = await supabase
    .from('teams')
    .select('id, name, short_name, abbreviation')
    .order('name')

  const allTeams = (allTeamsData ?? []) as Team[]

  // Get all of this entry's precision tips (history)
  let tipHistory: PrecisionTip[] = []
  let usedTeamIds = new Set<number>()

  if (entry) {
    const { data: tipsData } = await supabase
      .from('precision_tips')
      .select(`
        id, round_id, team_id, result,
        rounds(round_number),
        team:teams(name, short_name)
      `)
      .eq('entry_id', entry.id)
      .order('rounds(round_number)', { ascending: true })

    tipHistory = (tipsData ?? []) as unknown as PrecisionTip[]
    usedTeamIds = new Set(tipHistory.map((t) => t.team_id).filter((id): id is number => id !== null))
  }

  // Current round tip (if exists)
  const currentTip = currentRound
    ? tipHistory.find((t) => t.round_id === currentRound.id)
    : null

  // Available teams = all teams minus used teams (except the one used in this current round — allow update)
  const teamsUsedInPriorRounds = new Set(
    tipHistory
      .filter((t) => t.round_id !== currentRound?.id && t.team_id !== null)
      .map((t) => t.team_id as number)
  )
  const availableTeams = allTeams.filter((t) => !teamsUsedInPriorRounds.has(t.id))

  // Build leaderboard
  type EntryWithProfile = {
    id: number
    user_id: string
    is_active: boolean
    eliminated_round: number | null
    profiles: { full_name: string | null } | null
    precision_tips: { round_id: number }[]
  }

  const { data: allEntriesData } = await supabase
    .from('precision_entries')
    .select(`
      id, user_id, is_active, eliminated_round,
      profiles(full_name),
      precision_tips(round_id)
    `)
    .eq('competition_id', competition.id)

  const allEntries = (allEntriesData ?? []) as unknown as EntryWithProfile[]

  const leaderboard: LeaderboardRow[] = allEntries
    .map((e) => ({
      entry_id: e.id,
      user_id: e.user_id,
      full_name: e.profiles?.full_name ?? null,
      is_active: e.is_active,
      eliminated_round: e.eliminated_round,
      rounds_survived: e.precision_tips.length,
    }))
    .sort((a, b) => {
      // Active entries first, then by rounds survived descending, then eliminated_round desc
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
      if (b.rounds_survived !== a.rounds_survived) return b.rounds_survived - a.rounds_survived
      return (b.eliminated_round ?? 0) - (a.eliminated_round ?? 0)
    })

  const canTip = !!entry && !!currentRound && !currentRound.locked

  const errorMsg = searchParams.error ? ERROR_MESSAGES[searchParams.error] ?? searchParams.error : null
  const savedMsg = searchParams.saved ? 'Tip saved successfully!' : null

  return (
    <main className="page-container">
      <div className="page-header">
        <h1>🎯 Precision</h1>
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
                {entry.is_active ? '✅ Active' : `❌ Eliminated (Round ${entry.eliminated_round})`}
              </div>
            </div>
            <div>
              <div className="form-label">Teams Used</div>
              <div style={{ marginTop: 4, fontWeight: 600 }}>{usedTeamIds.size} / {allTeams.length}</div>
            </div>
            <div>
              <div className="form-label">Total Paid</div>
              <div style={{ marginTop: 4 }}>${Number(entry.total_paid).toFixed(2)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tip Form ── */}
      {canTip && currentRound && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Round {currentRound.round_number} — Submit Tip</h2>
            {currentTip && <span className="badge-tipped">✓ Tip submitted</span>}
          </div>

          {entry && !entry.is_active && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fff7ed', borderRadius: 6, border: '1px solid #fed7aa', color: '#92400e' }}>
              ⚠️ You have been eliminated but can still tip for the pride leaderboard.
            </div>
          )}

          <p style={{ marginBottom: 16, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Pick one team to win. Each team can only be used once per season.
            Win = survive. Loss or draw = eliminated. Max round: 18.
          </p>

          {currentTip && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: '#f0fff4', borderRadius: 6, border: '1px solid #bbf7d0' }}>
              <strong>Current tip:</strong>{' '}
              {currentTip.team?.short_name ?? currentTip.team?.name ?? '—'}
              {' '}— you can update until the round is locked.
            </div>
          )}

          {availableTeams.length === 0 ? (
            <div className="alert-error">
              All {allTeams.length} teams have been used — you have no available teams. You will be auto-eliminated.
            </div>
          ) : (
            <form action="/api/precision/tip" method="POST">
              <input type="hidden" name="competition_id" value={competition.id} />
              <input type="hidden" name="round_id" value={currentRound.id} />
              <div className="form-grid">
                <div className="form-field">
                  <label className="form-label">Pick Your Team</label>
                  <select name="team_id" required className="form-select" defaultValue={currentTip?.team_id ?? ''}>
                    <option value="">Select a team…</option>
                    {availableTeams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}{t.abbreviation ? ` (${t.abbreviation})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field" style={{ justifyContent: 'flex-end' }}>
                  <button type="submit" className="btn btn-gold">
                    {currentTip ? '🔄 Update Tip' : '💾 Submit Tip'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      )}

      {!canTip && entry?.is_active && currentRound?.locked && (
        <div className="section-card">
          <p>Round {currentRound.round_number} is locked. Check back when the next round opens.</p>
        </div>
      )}

      {!canTip && !currentRound && entry && (
        <div className="section-card">
          <p>No open round at the moment. Check back soon!</p>
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
                  <th>Round</th>
                  <th>Team Picked</th>
                  <th className="center">Result</th>
                </tr>
              </thead>
              <tbody>
                {[...tipHistory].reverse().map((tip) => (
                  <tr key={tip.id}>
                    <td>{tip.rounds?.round_number}</td>
                    <td>
                      {tip.team
                        ? (tip.team.short_name ?? tip.team.name)
                        : <span style={{ color: 'var(--text-muted)' }}>No tip</span>}
                    </td>
                    <td className="center">
                      {tip.result === 'win' && <span style={{ color: 'var(--success)', fontWeight: 700 }}>✅ Win</span>}
                      {tip.result === 'loss' && <span style={{ color: 'var(--danger)', fontWeight: 700 }}>❌ Loss</span>}
                      {tip.result === 'draw' && <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>🤝 Draw</span>}
                      {tip.result === 'no_tip' && <span style={{ color: 'var(--danger)', fontWeight: 700 }}>⚠️ No tip</span>}
                      {tip.result === 'pending' && <span style={{ color: 'var(--text-muted)' }}>⏳ Pending</span>}
                      {!tip.result && '—'}
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
                  <th className="center">Rounds Survived</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row, idx) => {
                  const prevRow = idx > 0 ? leaderboard[idx - 1] : null
                  const showDivider = prevRow?.is_active && !row.is_active
                  return (
                    <>
                      {showDivider && (
                        <tr key={`divider-${row.entry_id}`}>
                          <td colSpan={4} style={{ textAlign: 'center', padding: '8px', background: 'var(--surface-alt, #f3f4f6)', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.05em' }}>
                            — NO MONIES —
                          </td>
                        </tr>
                      )}
                      <tr
                        key={row.entry_id}
                        className={[
                          idx === 0 && row.is_active ? 'rank-1' : '',
                          row.user_id === user.id ? 'current-user' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        <td className="center">{idx + 1}</td>
                        <td>{row.full_name ?? row.user_id}</td>
                        <td className="center">
                          {row.is_active
                            ? <span style={{ color: 'var(--success)', fontWeight: 700 }}>✅ Active</span>
                            : <span style={{ color: 'var(--danger)' }}>❌ Rd {row.eliminated_round}</span>
                          }
                        </td>
                        <td className="center">{row.rounds_survived}</td>
                      </tr>
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  )
}
