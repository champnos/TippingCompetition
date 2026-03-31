import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type Game = {
  id: number
  match_time: string
  venue: string | null
  round_id: number
  home_team_id: number
  away_team_id: number
  winner_team_id: number | null
  home_score: number | null
  away_score: number | null
  is_final: boolean
  home_team: { id: number; name: string; short_name: string | null }
  away_team: { id: number; name: string; short_name: string | null }
  rounds: { round_number: number; locked: boolean }
}

type MarginEntry = {
  id: number
  total_paid: number
  total_score: number
}

type MarginTip = {
  id: number
  game_id: number
  round_id: number
  team_id: number | null
  raw_score: number | null
  multiplier: number | null
  final_score: number | null
  result: string | null
  games: {
    home_team_id: number
    away_team_id: number
    home_score: number | null
    away_score: number | null
    home_team: { name: string; short_name: string | null }
    away_team: { name: string; short_name: string | null }
  }
  rounds: { round_number: number }
  team: { name: string; short_name: string | null } | null
}

type LeaderboardRow = {
  entry_id: number
  user_id: string
  full_name: string | null
  total_score: number
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'Please fill in all required fields.',
  competition_not_found: 'Competition not found.',
  no_entry: 'You are not enrolled in this competition. Please contact the administrator.',
  round_locked: 'This round is locked — tips can no longer be changed.',
  tips_save_failed: 'Failed to save tips. Please try again.',
}

export default async function MarginPage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Find active margin competition
  const { data: competition } = await supabase
    .from('competitions')
    .select('id, name, season_id')
    .eq('is_active', true)
    .ilike('name', '%margin%')
    .single()

  if (!competition) {
    return (
      <main className="page-container">
        <div className="page-header">
          <h1>📐 Margin Tipping</h1>
          <a href="/dashboard" className="btn btn-primary btn-sm">← Dashboard</a>
        </div>
        <div className="section-card">
          <p>No active Margin competition found.</p>
        </div>
      </main>
    )
  }

  // Get user's entry
  const { data: entryData } = await supabase
    .from('margin_entries')
    .select('id, total_paid, total_score')
    .eq('competition_id', competition.id)
    .eq('user_id', user.id)
    .single()

  const entry = entryData as MarginEntry | null

  // Get all games for this season (H&A only)
  const { data: gamesData } = await supabase
    .from('games')
    .select(`
      id, match_time, venue, round_id, home_team_id, away_team_id,
      winner_team_id, home_score, away_score, is_final,
      home_team:teams!games_home_team_id_fkey(id, name, short_name),
      away_team:teams!games_away_team_id_fkey(id, name, short_name),
      rounds!inner(season_id, round_number, locked)
    `)
    .eq('rounds.season_id', competition.season_id)
    .eq('is_final', false)
    .order('match_time', { ascending: true })

  const allGames = (gamesData ?? []) as unknown as Game[]

  // Find the current tippable round: first unlocked round
  const roundMap = new Map<number, { round_id: number; round_number: number; locked: boolean; games: Game[] }>()
  for (const g of allGames) {
    if (!roundMap.has(g.round_id)) {
      roundMap.set(g.round_id, {
        round_id: g.round_id,
        round_number: g.rounds.round_number,
        locked: g.rounds.locked,
        games: [],
      })
    }
    roundMap.get(g.round_id)!.games.push(g)
  }

  const sortedRounds = [...roundMap.values()].sort((a, b) => a.round_number - b.round_number)
  const currentRound = sortedRounds.find((r) => !r.locked) ?? null

  // Get existing tips for the current round (if entry exists)
  const currentTipMap = new Map<number, number>() // game_id → team_id
  if (entry && currentRound) {
    const { data: currentTipsData } = await supabase
      .from('margin_tips')
      .select('game_id, team_id')
      .eq('entry_id', entry.id)
      .eq('round_id', currentRound.round_id)

    for (const t of currentTipsData ?? []) {
      if (t.team_id) currentTipMap.set(t.game_id, t.team_id)
    }
  }

  // Get all scored tips for history display
  let scoredTips: MarginTip[] = []
  if (entry) {
    const { data: tipsData } = await supabase
      .from('margin_tips')
      .select(`
        id, game_id, round_id, team_id, raw_score, multiplier, final_score, result,
        games!inner(
          home_team_id, away_team_id, home_score, away_score,
          home_team:teams!games_home_team_id_fkey(name, short_name),
          away_team:teams!games_away_team_id_fkey(name, short_name)
        ),
        rounds(round_number),
        team:teams!margin_tips_team_id_fkey(name, short_name)
      `)
      .eq('entry_id', entry.id)
      .not('result', 'is', null)
      .neq('result', 'pending')
      .order('round_id', { ascending: true })

    scoredTips = (tipsData ?? []) as unknown as MarginTip[]
  }

  // Group scored tips by round
  const tipsByRound = new Map<number, MarginTip[]>()
  for (const t of scoredTips) {
    const rn = t.rounds?.round_number ?? 0
    if (!tipsByRound.has(rn)) tipsByRound.set(rn, [])
    tipsByRound.get(rn)!.push(t)
  }
  const sortedScoredRoundNumbers = [...tipsByRound.keys()].sort((a, b) => a - b)

  // Build leaderboard from all entries
  const { data: allEntriesData } = await supabase
    .from('margin_entries')
    .select('id, user_id, total_score, profiles(full_name)')
    .eq('competition_id', competition.id)

  type EntryWithProfile = {
    id: number
    user_id: string
    total_score: number
    profiles: { full_name: string | null } | null
  }

  const allEntries = (allEntriesData ?? []) as unknown as EntryWithProfile[]
  const leaderboard: LeaderboardRow[] = allEntries
    .map((e) => ({
      entry_id: e.id,
      user_id: e.user_id,
      full_name: e.profiles?.full_name ?? null,
      total_score: Number(e.total_score),
    }))
    .sort((a, b) => b.total_score - a.total_score)

  const errorMsg = searchParams.error ? ERROR_MESSAGES[searchParams.error] ?? searchParams.error : null
  const savedMsg = searchParams.saved ? 'Tips saved successfully!' : null

  return (
    <main className="page-container-wide">
      <div className="page-header">
        <h1>📐 Margin Tipping</h1>
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

      {/* ── Current Round Tip Form ── */}
      {entry && currentRound && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Round {currentRound.round_number} — Submit Tips</h2>
          </div>
          <p style={{ marginBottom: 16, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Pick the winner of each game. Win: +margin pts × round multiplier. Loss: −margin pts × multiplier. Draw: 0. No tip: −50 (flat).
          </p>

          <form action="/api/margin/tip" method="POST">
            <input type="hidden" name="competition_id" value={competition.id} />
            <input type="hidden" name="round_id" value={currentRound.round_id} />

            {currentRound.games.map((game) => {
              const matchDate = new Date(game.match_time).toLocaleString('en-AU', {
                weekday: 'short', day: 'numeric', month: 'short',
                hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Melbourne',
              })
              const currentPick = currentTipMap.get(game.id)
              return (
                <div key={game.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', minWidth: 160 }}>{matchDate}</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name={`tip_${game.id}`}
                      value={game.home_team_id}
                      defaultChecked={currentPick === game.home_team_id}
                    />
                    {game.home_team.short_name ?? game.home_team.name}
                  </label>
                  <span style={{ color: 'var(--text-muted)' }}>vs</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name={`tip_${game.id}`}
                      value={game.away_team_id}
                      defaultChecked={currentPick === game.away_team_id}
                    />
                    {game.away_team.short_name ?? game.away_team.name}
                  </label>
                  {game.venue && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>@ {game.venue}</span>}
                </div>
              )
            })}

            <div style={{ marginTop: 20 }}>
              <button type="submit" className="btn btn-gold">
                {currentTipMap.size > 0 ? '🔄 Update Tips' : '💾 Submit Tips'}
              </button>
            </div>
          </form>
        </div>
      )}

      {entry && !currentRound && (
        <div className="section-card">
          <p>All rounds are currently locked. Check back when the next round opens.</p>
        </div>
      )}

      {/* ── Tip History ── */}
      {entry && sortedScoredRoundNumbers.length > 0 && (
        <>
          {sortedScoredRoundNumbers.map((rn) => {
            const roundTips = tipsByRound.get(rn) ?? []
            const roundTotal = roundTips.reduce((s, t) => s + Number(t.final_score ?? 0), 0)
            const multiplier = roundTips[0]?.multiplier ?? null

            return (
              <div key={rn} className="section-card">
                <div className="section-card-header">
                  <h2>Round {rn}</h2>
                  <span style={{ fontWeight: 700 }}>
                    {multiplier !== null && multiplier !== 1 && (
                      <span style={{ marginRight: 8, color: 'var(--text-muted)', fontSize: '0.85rem' }}>×{multiplier} multiplier</span>
                    )}
                    {roundTotal >= 0 ? '+' : ''}{roundTotal.toFixed(1)} pts
                  </span>
                </div>
                <div className="table-wrap">
                  <table className="afl-table">
                    <thead>
                      <tr>
                        <th>Game</th>
                        <th>Your Pick</th>
                        <th className="center">Result</th>
                        <th className="center">Raw</th>
                        <th className="center">Final</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roundTips.map((t) => (
                        <tr key={t.id}>
                          <td style={{ fontSize: '0.85rem' }}>
                            {t.games.home_team.short_name ?? t.games.home_team.name} vs{' '}
                            {t.games.away_team.short_name ?? t.games.away_team.name}
                            {t.games.home_score !== null && t.games.away_score !== null && (
                              <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                                ({t.games.home_score}–{t.games.away_score})
                              </span>
                            )}
                          </td>
                          <td>
                            {t.team
                              ? (t.team.short_name ?? t.team.name)
                              : <span style={{ color: 'var(--text-muted)' }}>No tip</span>}
                          </td>
                          <td className="center">
                            {t.result === 'win' && <span style={{ color: 'var(--success)' }}>✅ Win</span>}
                            {t.result === 'loss' && <span style={{ color: 'var(--danger)' }}>❌ Loss</span>}
                            {t.result === 'draw' && <span style={{ color: 'var(--text-muted)' }}>🤝 Draw</span>}
                            {t.result === 'no_tip' && <span style={{ color: 'var(--danger)' }}>⚠️ No tip</span>}
                          </td>
                          <td className="center">
                            {t.raw_score !== null ? (Number(t.raw_score) >= 0 ? '+' : '') + Number(t.raw_score).toFixed(0) : '—'}
                          </td>
                          <td className="center" style={{ fontWeight: 600 }}>
                            {t.final_score !== null ? (Number(t.final_score) >= 0 ? '+' : '') + Number(t.final_score).toFixed(1) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </>
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
                  <th className="center">Total Score</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row, idx) => (
                  <tr
                    key={row.entry_id}
                    className={[
                      idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : '',
                      row.user_id === user.id ? 'current-user' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <td className="center">{idx + 1}</td>
                    <td>{row.full_name ?? row.user_id}</td>
                    <td className="center" style={{ fontWeight: 700 }}>
                      {Number(row.total_score) >= 0 ? '+' : ''}{Number(row.total_score).toFixed(1)}
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
