import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

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

export default async function ResultsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: competition } = await supabase
    .from('competitions')
    .select('id, name, season_id')
    .eq('is_active', true)
    .single()

  if (!competition) {
    return (
      <main className="page-container">
        <div className="page-header">
          <h1>📋 Weekly Results</h1>
          <a href="/dashboard" className="btn btn-primary btn-sm">← Dashboard</a>
        </div>
        <p>No active competition found.</p>
      </main>
    )
  }

  const { data: gamesData } = await supabase
    .from('games')
    .select(`
      id, match_time, venue, home_score, away_score, winner_team_id,
      round_id,
      rounds!inner(season_id, round_number),
      home_team:teams!games_home_team_id_fkey(id, name, short_name),
      away_team:teams!games_away_team_id_fkey(id, name, short_name)
    `)
    .eq('rounds.season_id', competition.season_id)
    .order('match_time', { ascending: true })

  const games = (gamesData ?? []) as unknown as Game[]

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
    <main className="page-container">
      <div className="page-header">
        <h1>📋 Weekly Results</h1>
        <a href="/dashboard" className="btn btn-primary btn-sm">← Dashboard</a>
      </div>
      <p style={{ marginBottom: 28, color: 'var(--text-muted)' }}>{competition.name}</p>

      {resultRounds.length === 0 && (
        <div className="card"><p>No fixtures loaded yet — check back soon!</p></div>
      )}

      {resultRounds.map(({ round_id, round_number, games: roundGames }) => (
        <div key={round_id} className="section-card" style={{ marginBottom: 24 }}>
          <div className="section-card-header">
            <h2>Round {round_number}</h2>
          </div>
          <div className="table-wrap">
            <table className="afl-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Venue</th>
                  <th className="center">Home</th>
                  <th className="center">Score</th>
                  <th className="center"></th>
                  <th className="center">Score</th>
                  <th className="center">Away</th>
                  <th className="center">Margin</th>
                </tr>
              </thead>
              <tbody>
                {roundGames.map((game) => {
                  const hasResult = game.home_score !== null && game.away_score !== null
                  const matchDate = new Date(game.match_time).toLocaleString('en-AU', {
                    weekday: 'short', day: 'numeric', month: 'short',
                    hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Melbourne',
                  })

                  const isDraw = hasResult && game.home_score === game.away_score
                  const homeWon = hasResult && !isDraw && game.home_score! > game.away_score!
                  const awayWon = hasResult && !isDraw && game.away_score! > game.home_score!
                  const margin = hasResult ? Math.abs(game.home_score! - game.away_score!) : null

                  const winnerStyle: React.CSSProperties = {
                    fontWeight: 700,
                    color: 'var(--gold-dark)',
                  }

                  return (
                    <tr key={game.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{matchDate}</td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{game.venue ?? '—'}</td>
                      <td className="center" style={homeWon ? winnerStyle : undefined}>
                        {game.home_team.name}
                      </td>
                      <td className="center" style={homeWon ? winnerStyle : undefined}>
                        {hasResult ? game.home_score : '—'}
                      </td>
                      <td className="center" style={{ color: 'var(--text-muted)', fontWeight: 600 }}>vs</td>
                      <td className="center" style={awayWon ? winnerStyle : undefined}>
                        {hasResult ? game.away_score : '—'}
                      </td>
                      <td className="center" style={awayWon ? winnerStyle : undefined}>
                        {game.away_team.name}
                      </td>
                      <td className="center" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {!hasResult && 'Pending'}
                        {isDraw && 'Draw'}
                        {margin !== null && !isDraw && `by ${margin} pts`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </main>
  )
}
