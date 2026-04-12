import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type Round = {
  id: number
  round_number: number
}

type Game = {
  id: number
  match_time: string
  venue: string | null
  round_id: number
  home_team_id: number
  away_team_id: number
  home_team: { id: number; name: string; short_name: string | null }
  away_team: { id: number; name: string; short_name: string | null }
  rounds: { round_number: number }
}

type LongHaulEntry = {
  id: number
  joker_round_1: number | null
  joker_round_2: number | null
  is_locked: boolean
  total_paid: number
}

type LongHaulTip = {
  id: number
  game_id: number
  round_id: number
  team_id: number
  is_correct: boolean | null
  points_awarded: number | null
  games: {
    home_team_id: number
    away_team_id: number
    home_team: { name: string; short_name: string | null }
    away_team: { name: string; short_name: string | null }
  }
  rounds: { round_number: number }
  team: { name: string; short_name: string | null }
}

type LeaderboardRow = {
  entry_id: number
  user_id: string
  full_name: string | null
  raw_score: number
  joker_bonus: number
  total_score: number
  mid_year_score: number
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'Please fill in all required fields.',
  joker_same_round: 'Your two joker rounds must be different.',
  invalid_joker_rounds: 'One or both joker rounds are not valid rounds in this competition.',
  competition_not_found: 'Competition not found.',
  entry_locked: 'Your entry is locked — tips can no longer be changed.',
  entry_save_failed: 'Failed to save entry. Please try again.',
  tips_save_failed: 'Failed to save tips. Please try again.',
  season_started: 'The season has already started — tips are now locked.',
}

const MID_YEAR_ROUND = 11

export default async function LongHaulPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Find active long haul competition
  const { data: competition } = await supabase
    .from('competitions')
    .select('id, name, season_id')
    .eq('is_active', true)
    .ilike('name', '%long haul%')
    .single()

  if (!competition) {
    return (
      <main className="page-container">
        <div className="page-header">
          <h1>🏁 Long Haul</h1>
          <a href="/dashboard" className="btn btn-primary btn-sm">← Dashboard</a>
        </div>
        <div className="section-card">
          <p>No active Long Haul competition found.</p>
        </div>
      </main>
    )
  }

  // Get user's entry
  const { data: entryData } = await supabase
    .from('long_haul_entries')
    .select('id, joker_round_1, joker_round_2, is_locked, total_paid')
    .eq('competition_id', competition.id)
    .eq('user_id', user.id)
    .single()

  const entry = entryData as LongHaulEntry | null

  // Get all rounds for this season
  const { data: roundsData } = await supabase
    .from('rounds')
    .select('id, round_number')
    .eq('season_id', competition.season_id)
    .order('round_number', { ascending: true })

  const rounds = (roundsData ?? []) as Round[]

  // Get all H&A games (not finals) for this season
  const { data: gamesData } = await supabase
    .from('games')
    .select(`
      id, match_time, venue, round_id, home_team_id, away_team_id, is_final,
      home_team:teams!games_home_team_id_fkey(id, name, short_name),
      away_team:teams!games_away_team_id_fkey(id, name, short_name),
      rounds!inner(season_id, round_number)
    `)
    .eq('rounds.season_id', competition.season_id)
    .eq('is_final', false)
    .order('match_time', { ascending: true })

  const allGames = (gamesData ?? []) as unknown as Game[]

  // Group games by round
  const roundGameMap = new Map<number, Game[]>()
  for (const g of allGames) {
    if (!roundGameMap.has(g.round_id)) roundGameMap.set(g.round_id, [])
    roundGameMap.get(g.round_id)!.push(g)
  }

  // Get existing tips if entry exists
  let existingTips: LongHaulTip[] = []
  if (entry) {
    const { data: tipsData } = await supabase
      .from('long_haul_tips')
      .select(`
        id, game_id, round_id, team_id, is_correct, points_awarded,
        games!inner(home_team_id, away_team_id,
          home_team:teams!games_home_team_id_fkey(name, short_name),
          away_team:teams!games_away_team_id_fkey(name, short_name)
        ),
        rounds(round_number),
        team:teams!long_haul_tips_team_id_fkey(name, short_name)
      `)
      .eq('entry_id', entry.id)
    existingTips = (tipsData ?? []) as unknown as LongHaulTip[]
  }

  const tipMap = new Map<number, number>() // game_id → team_id
  for (const t of existingTips) {
    tipMap.set(t.game_id, t.team_id)
  }

  // Build leaderboard
  const { data: allEntriesData } = await supabase
    .from('long_haul_entries')
    .select(`
      id, user_id, joker_round_1, joker_round_2,
      profiles(full_name)
    `)
    .eq('competition_id', competition.id)

  type EntryWithProfile = {
    id: number
    user_id: string
    joker_round_1: number | null
    joker_round_2: number | null
    profiles: { full_name: string | null } | null
  }

  const allEntries = (allEntriesData ?? []) as unknown as EntryWithProfile[]
  const entryIds = allEntries.map((e) => e.id)

  let leaderboard: LeaderboardRow[] = []

  if (entryIds.length > 0) {
    // Get all scored tips with round_number info
    const { data: scoredTips } = await supabase
      .from('long_haul_tips')
      .select('entry_id, round_id, points_awarded, rounds(round_number)')
      .in('entry_id', entryIds)
      .not('points_awarded', 'is', null)

    type ScoredTip = {
      entry_id: number
      round_id: number
      points_awarded: number
      rounds: { round_number: number } | null
    }
    const typedScoredTips = (scoredTips ?? []) as unknown as ScoredTip[]

    // For each entry: aggregate raw scores and joker bonuses
    leaderboard = allEntries.map((e) => {
      const myTips = typedScoredTips.filter((t) => t.entry_id === e.id)

      // Sum per round
      const roundTotals = new Map<number, number>() // round_number → correct tips
      for (const t of myTips) {
        const rn = t.rounds?.round_number ?? 0
        roundTotals.set(rn, (roundTotals.get(rn) ?? 0) + t.points_awarded)
      }

      let rawScore = 0
      let jokerBonus = 0
      let midYearScore = 0

      for (const [rn, pts] of roundTotals) {
        rawScore += pts
        if (rn <= MID_YEAR_ROUND) {
          midYearScore += pts  // raw tips only — joker multipliers never apply to mid-year
        }
        if (rn === e.joker_round_1) {
          jokerBonus += pts * 1  // double = +1× extra (already in rawScore)
        } else if (rn === e.joker_round_2) {
          jokerBonus += pts * 2  // triple = +2× extra
        }
      }

      return {
        entry_id: e.id,
        user_id: e.user_id,
        full_name: e.profiles?.full_name ?? null,
        raw_score: rawScore,
        joker_bonus: jokerBonus,
        total_score: rawScore + jokerBonus,
        mid_year_score: midYearScore,
      }
    })
  }

  const fullLeaderboard = [...leaderboard].sort((a, b) => b.total_score - a.total_score)
  const midYearLeaderboard = [...leaderboard].sort((a, b) => b.mid_year_score - a.mid_year_score)

  const errorMsg = searchParams.error ? ERROR_MESSAGES[searchParams.error] ?? searchParams.error : null

  // Group tips by round for the locked read-only view
  const tipsByRound = new Map<number, LongHaulTip[]>()
  for (const t of existingTips) {
    const rn = t.rounds?.round_number ?? 0
    if (!tipsByRound.has(rn)) tipsByRound.set(rn, [])
    tipsByRound.get(rn)!.push(t)
  }
  const sortedRoundNumbers = [...tipsByRound.keys()].sort((a, b) => a - b)

  return (
    <main className="page-container-wide">
      <div className="page-header">
        <h1>🏁 Long Haul</h1>
        <a href="/dashboard" className="btn btn-primary btn-sm">← Dashboard</a>
      </div>
      <p style={{ marginBottom: 24, color: 'var(--text-muted)' }}>{competition.name}</p>

      {errorMsg && (
        <div className="alert-error" style={{ marginBottom: 20 }}>{errorMsg}</div>
      )}

      {/* ── Submission form (entry not locked) ── */}
      {(!entry || !entry.is_locked) && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Submit Your Tips</h2>
          </div>
          <p style={{ marginBottom: 16, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            All tips are locked once the season begins and cannot be changed after that point.
            Nominate your two joker rounds below — Joker 1 doubles your round score, Joker 2 triples it.
          </p>

          <form action="/api/long-haul/submit" method="POST">
            <input type="hidden" name="competition_id" value={competition.id} />

            {/* Joker round selectors */}
            <div className="form-grid" style={{ marginBottom: 24 }}>
              <div className="form-field">
                <label className="form-label">Joker Round 1 (Double ×2)</label>
                <select
                  name="joker_round_1"
                  required
                  className="form-select"
                  defaultValue={entry?.joker_round_1 ?? ''}
                >
                  <option value="">Select round…</option>
                  {rounds.map((r) => (
                    <option key={r.id} value={r.round_number}>Round {r.round_number}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Joker Round 2 (Triple ×3)</label>
                <select
                  name="joker_round_2"
                  required
                  className="form-select"
                  defaultValue={entry?.joker_round_2 ?? ''}
                >
                  <option value="">Select round…</option>
                  {rounds.map((r) => (
                    <option key={r.id} value={r.round_number}>Round {r.round_number}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Games grouped by round */}
            {rounds.map((round) => {
              const games = roundGameMap.get(round.id) ?? []
              if (games.length === 0) return null
              return (
                <div key={round.id} style={{ marginBottom: 28 }}>
                  <div className="round-header">Round {round.round_number}</div>
                  {games.map((game) => {
                    const matchDate = new Date(game.match_time).toLocaleString('en-AU', {
                      weekday: 'short', day: 'numeric', month: 'short',
                      hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Melbourne',
                    })
                    const currentPick = tipMap.get(game.id)
                    return (
                      <div key={game.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', minWidth: 160 }}>{matchDate}</span>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name={`tip_${game.id}`}
                            value={game.home_team_id}
                            defaultChecked={currentPick === game.home_team_id}
                            required
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
                </div>
              )
            })}

            <div style={{ marginTop: 24 }}>
              <button type="submit" className="btn btn-gold">
                {entry ? '🔄 Update Tips' : '💾 Submit All Tips'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Locked read-only view ── */}
      {entry?.is_locked && (
        <>
          <div className="section-card">
            <div className="section-card-header">
              <h2>Your Entry</h2>
            </div>
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 8 }}>
              <div>
                <div className="form-label">Joker Round 1 (Double)</div>
                <div style={{ marginTop: 4, fontWeight: 700 }}>
                  {entry.joker_round_1 != null ? `Round ${entry.joker_round_1}` : '—'}
                </div>
              </div>
              <div>
                <div className="form-label">Joker Round 2 (Triple)</div>
                <div style={{ marginTop: 4, fontWeight: 700 }}>
                  {entry.joker_round_2 != null ? `Round ${entry.joker_round_2}` : '—'}
                </div>
              </div>
              <div>
                <div className="form-label">Total Paid</div>
                <div style={{ marginTop: 4 }}>${Number(entry.total_paid).toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* Tip history grouped by round */}
          {sortedRoundNumbers.map((rn) => {
            const roundTips = tipsByRound.get(rn) ?? []
            const roundRaw = roundTips.reduce((s, t) => s + (t.points_awarded ?? 0), 0)
            const isJoker1 = entry.joker_round_1 === rn
            const isJoker2 = entry.joker_round_2 === rn
            const jokerMultiplier = isJoker2 ? 3 : isJoker1 ? 2 : 1
            const roundTotal = roundTips.some((t) => t.points_awarded !== null)
              ? roundRaw * jokerMultiplier
              : null

            return (
              <div key={rn} className="section-card">
                <div className="section-card-header">
                  <h2>
                    Round {rn}
                    {isJoker1 && <span style={{ marginLeft: 8, color: 'var(--gold-dark)', fontWeight: 700 }}>🃏 Joker ×2</span>}
                    {isJoker2 && <span style={{ marginLeft: 8, color: 'var(--gold-dark)', fontWeight: 700 }}>🃏 Joker ×3</span>}
                  </h2>
                  {roundTotal !== null && (
                    <span style={{ fontWeight: 700 }}>
                      {roundRaw} pts{jokerMultiplier > 1 ? ` ×${jokerMultiplier} = ${roundTotal}` : ''}
                    </span>
                  )}
                </div>
                <div className="table-wrap">
                  <table className="afl-table">
                    <thead>
                      <tr>
                        <th>Game</th>
                        <th>Your Pick</th>
                        <th className="center">Result</th>
                        <th className="center">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roundTips.map((t) => (
                        <tr key={t.id}>
                          <td style={{ fontSize: '0.85rem' }}>
                            {t.games.home_team.short_name ?? t.games.home_team.name} vs{' '}
                            {t.games.away_team.short_name ?? t.games.away_team.name}
                          </td>
                          <td>{t.team.short_name ?? t.team.name}</td>
                          <td className="center">
                            {t.is_correct === true && <span style={{ color: 'var(--success)' }}>✅</span>}
                            {t.is_correct === false && <span style={{ color: 'var(--danger)' }}>❌</span>}
                            {t.is_correct === null && <span style={{ color: 'var(--text-muted)' }}>⏳</span>}
                          </td>
                          <td className="center">
                            {t.points_awarded !== null ? t.points_awarded : '—'}
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
        <>
          <div className="section-card">
            <div className="section-card-header">
              <h2>Mid-Year Standings (after Round {MID_YEAR_ROUND}, jokers excluded)</h2>
            </div>
            <div className="table-wrap">
              <table className="afl-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th className="center">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {midYearLeaderboard.map((row, idx) => (
                    <tr
                      key={row.entry_id}
                      className={[
                        idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : '',
                        row.user_id === user.id ? 'current-user' : '',
                      ].filter(Boolean).join(' ')}
                    >
                      <td className="center">{idx + 1}</td>
                      <td>{row.full_name ?? row.user_id}</td>
                      <td className="center">{row.mid_year_score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="section-card">
            <div className="section-card-header">
              <h2>Full Season Standings</h2>
            </div>
            <div className="table-wrap">
              <table className="afl-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th className="center">Raw Score</th>
                    <th className="center">Joker Bonus</th>
                    <th className="center">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {fullLeaderboard.map((row, idx) => (
                    <tr
                      key={row.entry_id}
                      className={[
                        idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : '',
                        row.user_id === user.id ? 'current-user' : '',
                      ].filter(Boolean).join(' ')}
                    >
                      <td className="center">{idx + 1}</td>
                      <td>{row.full_name ?? row.user_id}</td>
                      <td className="center">{row.raw_score}</td>
                      <td className="center">+{row.joker_bonus}</td>
                      <td className="center" style={{ fontWeight: 700 }}>{row.total_score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </main>
  )
}
