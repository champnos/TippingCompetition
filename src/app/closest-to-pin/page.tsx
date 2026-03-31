import { createClient } from '@/lib/supabase/server'
import { ctpAccuracyFactor } from '@/lib/ctp'
import { redirect } from 'next/navigation'

type Game = {
  id: number
  match_time: string
  venue: string | null
  home_team_id: number
  away_team_id: number
  home_team: { id: number; name: string; short_name: string | null }
  away_team: { id: number; name: string; short_name: string | null }
}

type CtpTip = {
  id: number
  entry_id: number
  round_id: number
  team_id: number
  margin: number
  actual_margin: number | null
  correct_team: boolean | null
  raw_score: number | null
  round_score: number | null
  accuracy_factor: number | null
  result: string | null
  rounds: { round_number: number }
  team: { name: string; short_name: string | null }
}

type LeaderboardEntry = {
  entry_id: number
  user_id: string
  full_name: string | null
  avg_score: number | null
  rounds_played: number
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'Please fill in all required fields.',
  invalid_margin: 'Margin must be a positive whole number.',
  not_owner: 'You do not own this entry.',
  round_locked: 'This round is locked.',
  no_games: 'No games found for this round.',
  team_not_playing: 'Selected team is not playing this round.',
  tip_save_failed: 'Failed to save your tip. Please try again.',
}

export default async function ClosestToPinPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Find active closest-to-pin competition
  const { data: competition } = await supabase
    .from('competitions')
    .select('id, name, season_id')
    .eq('is_active', true)
    .ilike('name', '%closest%')
    .single()

  if (!competition) {
    return (
      <main className="page-container">
        <div className="page-header">
          <h1>🎯 Closest to Pin</h1>
          <a href="/dashboard" className="btn btn-primary btn-sm">← Dashboard</a>
        </div>
        <div className="section-card">
          <p>No active Closest to Pin competition found.</p>
        </div>
      </main>
    )
  }

  // Get user's entry
  const { data: entry } = await supabase
    .from('closest_to_pin_entries')
    .select('id, total_paid')
    .eq('competition_id', competition.id)
    .eq('user_id', user.id)
    .single()

  // Get current round (lowest round_number where locked = false)
  const { data: currentRound } = await supabase
    .from('rounds')
    .select('id, round_number, locked')
    .eq('season_id', competition.season_id)
    .eq('locked', false)
    .order('round_number', { ascending: true })
    .limit(1)
    .single()

  // Get games for current round
  let currentGames: Game[] = []
  if (currentRound) {
    const { data: gamesData } = await supabase
      .from('games')
      .select(`
        id, match_time, venue, home_team_id, away_team_id,
        home_team:teams!games_home_team_id_fkey(id, name, short_name),
        away_team:teams!games_away_team_id_fkey(id, name, short_name)
      `)
      .eq('round_id', currentRound.id)
      .order('match_time', { ascending: true })
    currentGames = (gamesData ?? []) as unknown as Game[]
  }

  // Get tip history for this entry
  let tipHistory: CtpTip[] = []
  if (entry) {
    const { data: tipsData } = await supabase
      .from('closest_to_pin_tips')
      .select(`
        id, entry_id, round_id, team_id, margin, actual_margin,
        correct_team, raw_score, round_score, accuracy_factor, result,
        rounds(round_number),
        team:teams!closest_to_pin_tips_team_id_fkey(name, short_name)
      `)
      .eq('entry_id', entry.id)
      .order('rounds(round_number)', { ascending: false })
    tipHistory = (tipsData ?? []) as unknown as CtpTip[]
  }

  // Build leaderboard from all entries + tips for this competition
  const { data: allEntries } = await supabase
    .from('closest_to_pin_entries')
    .select(`
      id, user_id,
      profiles(full_name)
    `)
    .eq('competition_id', competition.id)

  type EntryWithProfile = {
    id: number
    user_id: string
    profiles: { full_name: string | null } | null
  }

  const typedEntries = (allEntries ?? []) as unknown as EntryWithProfile[]

  // Get all scored tips for this competition
  const entryIds = typedEntries.map((e) => e.id)
  let leaderboard: LeaderboardEntry[] = []

  if (entryIds.length > 0) {
    const { data: scoredTips } = await supabase
      .from('closest_to_pin_tips')
      .select('entry_id, round_score, result')
      .in('entry_id', entryIds)
      .neq('result', 'pending')

    // Aggregate per entry
    const scoreMap = new Map<number, { total: number; count: number }>()
    for (const tip of scoredTips ?? []) {
      if (tip.round_score === null) continue
      const curr = scoreMap.get(tip.entry_id) ?? { total: 0, count: 0 }
      scoreMap.set(tip.entry_id, { total: curr.total + Number(tip.round_score), count: curr.count + 1 })
    }

    leaderboard = typedEntries.map((e) => {
      const stats = scoreMap.get(e.id)
      return {
        entry_id: e.id,
        user_id: e.user_id,
        full_name: e.profiles?.full_name ?? null,
        avg_score: stats && stats.count > 0 ? stats.total / stats.count : null,
        rounds_played: stats?.count ?? 0,
      }
    })

    // Sort: entries with scores first (ascending), then no-score entries
    leaderboard.sort((a, b) => {
      if (a.avg_score === null && b.avg_score === null) return 0
      if (a.avg_score === null) return 1
      if (b.avg_score === null) return -1
      return a.avg_score - b.avg_score
    })
  }

  const currentTip = currentRound
    ? tipHistory.find((t) => t.round_id === currentRound.id)
    : null

  const now = new Date()
  const availableGames = currentRound
    ? currentGames.filter((g) => new Date(g.match_time) > now)
    : []

  const canTip = !!entry && !!currentRound && !currentRound.locked

  const errorMsg = searchParams.error ? ERROR_MESSAGES[searchParams.error] ?? searchParams.error : null

  return (
    <main className="page-container">
      <div className="page-header">
        <h1>🎯 Closest to Pin</h1>
        <a href="/dashboard" className="btn btn-primary btn-sm">← Dashboard</a>
      </div>
      <p style={{ marginBottom: 24, color: 'var(--text-muted)' }}>{competition.name}</p>

      {errorMsg && (
        <div className="alert-error" style={{ marginBottom: 20 }}>{errorMsg}</div>
      )}

      {/* Entry Status */}
      {entry ? (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Your Entry</h2>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div className="form-label">Total Paid</div>
              <div style={{ marginTop: 4 }}>${Number(entry.total_paid).toFixed(2)}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="section-card">
          <p>You are not entered in this competition. Please contact the admin.</p>
        </div>
      )}

      {/* Tip Submission */}
      {canTip && currentRound && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Round {currentRound.round_number} Tip</h2>
            {currentTip && <span className="badge-tipped">✓ Tip submitted</span>}
          </div>

          {currentTip && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: '#f0fff4', borderRadius: 6, border: '1px solid #bbf7d0' }}>
              <strong>Current tip:</strong>{' '}
              {currentTip.team.short_name ?? currentTip.team.name} by {currentTip.margin} points
              {' '}— you can update until the game starts.
            </div>
          )}

          {availableGames.length === 0 ? (
            <p>No games available to tip (all games have started).</p>
          ) : (
            <form action="/api/closest-to-pin/tip" method="POST">
              <input type="hidden" name="entry_id" value={entry!.id} />
              <input type="hidden" name="round_id" value={currentRound.id} />

              <div className="form-grid">
                <div className="form-field">
                  <label className="form-label">Pick Your Team</label>
                  <select name="team_id" required className="form-select" defaultValue={currentTip?.team_id ?? ''}>
                    <option value="">Select a team…</option>
                    {availableGames.map((game) => {
                      const matchDate = new Date(game.match_time).toLocaleString('en-AU', {
                        weekday: 'short', day: 'numeric', month: 'short',
                        hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Melbourne',
                      })
                      return (
                        <optgroup key={game.id} label={`${matchDate}${game.venue ? ` · ${game.venue}` : ''}`}>
                          <option value={game.home_team_id}>{game.home_team.name}</option>
                          <option value={game.away_team_id}>{game.away_team.name}</option>
                        </optgroup>
                      )
                    })}
                  </select>
                </div>

                <div className="form-field">
                  <label className="form-label">Winning Margin (points)</label>
                  <input
                    type="number"
                    name="margin"
                    min={1}
                    step={1}
                    required
                    placeholder="e.g. 22"
                    className="form-input"
                    defaultValue={currentTip?.margin ?? ''}
                  />
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    Accuracy factor for Round {currentRound.round_number}:{' '}
                    ×{ctpAccuracyFactor(currentRound.round_number)}
                  </small>
                </div>
              </div>

              <div style={{ marginTop: 20 }}>
                <button type="submit" className="btn btn-gold">
                  {currentTip ? '🔄 Update Tip' : '💾 Submit Tip'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {!canTip && !entry && (
        <div className="section-card">
          <p>You are not entered in this competition.</p>
        </div>
      )}

      {!canTip && currentRound?.locked && entry && (
        <div className="section-card">
          <p>Round {currentRound.round_number} is locked. Tips can no longer be changed.</p>
        </div>
      )}

      {/* Leaderboard */}
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
                  <th className="center">Rounds Played</th>
                  <th className="center">Avg Score (lower is better)</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row, idx) => {
                  const rankClass = idx === 0 && row.avg_score !== null ? 'rank-1' : idx === 1 && row.avg_score !== null ? 'rank-2' : idx === 2 && row.avg_score !== null ? 'rank-3' : ''
                  const isCurrentUser = row.user_id === user.id
                  return (
                    <tr key={row.entry_id} className={[rankClass, isCurrentUser ? 'current-user' : ''].filter(Boolean).join(' ')}>
                      <td className="center">{row.avg_score !== null ? idx + 1 : '—'}</td>
                      <td>{row.full_name ?? row.user_id}</td>
                      <td className="center">{row.rounds_played}</td>
                      <td className="center">
                        {row.avg_score !== null ? row.avg_score.toFixed(2) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tip History */}
      {tipHistory.length > 0 && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Your Tip History</h2>
          </div>
          <div className="table-wrap">
            <table className="afl-table">
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Team Picked</th>
                  <th className="center">Your Margin</th>
                  <th className="center">Actual Margin</th>
                  <th className="center">Correct Team?</th>
                  <th className="center">Raw Score</th>
                  <th className="center">Factor</th>
                  <th className="center">Round Score</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {tipHistory.map((tip) => (
                  <tr key={tip.id}>
                    <td>{tip.rounds.round_number}</td>
                    <td>{tip.team.short_name ?? tip.team.name}</td>
                    <td className="center">{tip.margin}</td>
                    <td className="center">{tip.actual_margin ?? '—'}</td>
                    <td className="center">
                      {tip.correct_team === true && <span style={{ color: 'var(--success)' }}>✅ Yes</span>}
                      {tip.correct_team === false && <span style={{ color: 'var(--danger)' }}>❌ No</span>}
                      {tip.correct_team === null && '—'}
                    </td>
                    <td className="center">{tip.raw_score ?? '—'}</td>
                    <td className="center">×{tip.accuracy_factor ?? '—'}</td>
                    <td className="center">{tip.round_score ?? '—'}</td>
                    <td>
                      {tip.result === 'correct' && <span style={{ color: 'var(--success)', fontWeight: 700 }}>✅ Correct</span>}
                      {tip.result === 'wrong' && <span style={{ color: 'var(--danger)', fontWeight: 700 }}>❌ Wrong</span>}
                      {tip.result === 'draw' && <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>— Draw</span>}
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
    </main>
  )
}
