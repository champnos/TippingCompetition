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
  correct_tips_count: number
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
  tips_save_failed: 'Failed to save tip. Please try again.',
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
    .select('id, total_paid, total_score, correct_tips_count')
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

  // Get existing tips for the current round (one per game)
  const existingTipsByGame = new Map<number, number>() // game_id -> team_id
  if (entry && currentRound) {
    const { data: currentTipsData } = await supabase
      .from('margin_tips')
      .select('game_id, team_id')
      .eq('entry_id', entry.id)
      .eq('round_id', currentRound.round_id)

    for (const t of currentTipsData ?? []) {
      if (t.team_id) existingTipsByGame.set(t.game_id, t.team_id)
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
  const savedMsg = searchParams.saved ? 'Tip saved successfully!' : null

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
            Tip the winner for <strong>every game</strong> this round. Win = +margin, Loss = −margin.
            Miss the whole round and you get <strong>−50 points</strong>.
          </p>

          {existingTipsByGame.size > 0 && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: '0.9rem' }}>
              ✅ You have {existingTipsByGame.size} of {currentRound.games.length} game{currentRound.games.length !== 1 ? 's' : ''} tipped this round.
            </div>
          )}

          {currentRound.games.map((game) => {
            const matchDate = new Date(game.match_time).toLocaleString('en-AU', {
              weekday: 'short', day: 'numeric', month: 'short',
              hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Melbourne',
            })
            const tippedTeamId = existingTipsByGame.get(game.id) ?? null
            return (
              <div key={game.id} className="game-card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>
                    {game.home_team.short_name ?? game.home_team.name} vs {game.away_team.short_name ?? game.away_team.name}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {matchDate}{game.venue ? ` @ ${game.venue}` : ''}
                  </span>
                  {tippedTeamId && <span className="badge-tipped">✓ Tipped</span>}
                </div>

                <form action="/api/margin/tip" method="POST">
                  <input type="hidden" name="competition_id" value={competition.id} />
                  <input type="hidden" name="round_id" value={currentRound.round_id} />
                  <input type="hidden" name="game_id" value={game.id} />

                  <div className="form-grid" style={{ alignItems: 'flex-end' }}>
                    <div className="form-field">
                      <label className="form-label">Pick a team</label>
                      <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="team_id"
                            value={game.home_team_id}
                            defaultChecked={tippedTeamId === game.home_team_id}
                            required
                          />
                          {game.home_team.short_name ?? game.home_team.name}
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="team_id"
                            value={game.away_team_id}
                            defaultChecked={tippedTeamId === game.away_team_id}
                          />
                          {game.away_team.short_name ?? game.away_team.name}
                        </label>
                      </div>
                    </div>

                    <div className="form-field" style={{ justifyContent: 'flex-end' }}>
                      <button type="submit" className="btn btn-gold btn-sm">
                        {tippedTeamId ? '🔄 Update Tip' : '💾 Tip This Game'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )
          })}
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
            const multiplier = roundTips[0]?.multiplier ?? null
            // Compute round total from final_score values (works for both normal and no_tip)
            const roundTotal = roundTips.reduce((sum, t) => sum + Number(t.final_score ?? 0), 0)
            const isNoTipRound = roundTips.length === 1 && roundTips[0].result === 'no_tip'

            return (
              <div key={rn} className="section-card">
                <div className="section-card-header">
                  <h2>Round {rn}</h2>
                  {multiplier !== null && !isNoTipRound && (
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Round multiplier ×{multiplier}
                    </span>
                  )}
                </div>

                {isNoTipRound ? (
                  <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: 'var(--danger)' }}>
                    ❌ No tips submitted — Round score: <strong>−50</strong>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table className="afl-table">
                      <thead>
                        <tr>
                          <th>Game</th>
                          <th>Team Picked</th>
                          <th className="center">Score</th>
                          <th className="center">×</th>
                          <th className="center">Weighted</th>
                          <th className="center">Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {roundTips.map((t) => {
                          const rawScore = t.raw_score != null ? Number(t.raw_score) : null
                          return (
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
                                  : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                              </td>
                              <td className="center" style={{ color: rawScore != null ? (rawScore >= 0 ? 'var(--success)' : 'var(--danger)') : undefined }}>
                                {rawScore != null
                                  ? (rawScore >= 0 ? `+${rawScore.toFixed(0)}` : rawScore.toFixed(0))
                                  : '—'}
                              </td>
                              <td className="center">
                                {t.multiplier != null ? `×${t.multiplier}` : '—'}
                              </td>
                              <td className="center" style={{ fontWeight: 600 }}>
                                {t.final_score != null ? Number(t.final_score).toFixed(0) : '—'}
                              </td>
                              <td className="center">
                                {t.result === 'win' && <span style={{ color: 'var(--success)' }}>✅ Win</span>}
                                {t.result === 'loss' && <span style={{ color: 'var(--danger)' }}>❌ Loss</span>}
                                {t.result === 'draw' && <span style={{ color: 'var(--text-muted)' }}>🤝 Draw</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                          <td colSpan={4} style={{ textAlign: 'right', paddingRight: 8 }}>Round Total</td>
                          <td className="center" style={{ color: roundTotal >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                            {roundTotal >= 0 ? `+${roundTotal.toFixed(0)}` : roundTotal.toFixed(0)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
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
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Higher total = better</span>
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
                      row.user_id === user?.id ? 'current-user' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <td className="center">{idx + 1}</td>
                    <td>{row.full_name ?? row.user_id}</td>
                    <td className="center" style={{ fontWeight: 700 }}>{row.total_score.toFixed(0)}</td>
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
