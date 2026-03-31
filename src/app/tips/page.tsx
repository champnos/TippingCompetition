import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function TipsPage() {
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
        <h1>🏉 Submit Tips</h1>
        <p>No active competition found.</p>
        <p><a href="/dashboard">← Back to dashboard</a></p>
      </main>
    )
  }

  const now = new Date().toISOString()

  const { data: games } = await supabase
    .from('games')
    .select(`
      id, match_time, venue, is_final,
      round_id,
      rounds!inner(season_id, round_number, locked),
      home_team:teams!games_home_team_id_fkey(id, name, short_name),
      away_team:teams!games_away_team_id_fkey(id, name, short_name)
    `)
    .eq('rounds.season_id', competition.season_id)
    .order('match_time', { ascending: true })

  const { data: existingTips } = await supabase
    .from('tips')
    .select('game_id, picked_team_id')
    .eq('competition_id', competition.id)
    .eq('profile_id', user.id)

  const tipMap: Record<number, number> = {}
  for (const t of existingTips ?? []) {
    tipMap[t.game_id] = t.picked_team_id
  }

  type Game = {
    id: number
    match_time: string
    venue: string | null
    is_final: boolean
    round_id: number
    rounds: { season_id: number; round_number: number; locked: boolean }
    home_team: { id: number; name: string; short_name: string | null }
    away_team: { id: number; name: string; short_name: string | null }
  }

  const roundMap: Record<number, { round_number: number; games: Game[] }> = {}
  for (const g of (games ?? []) as unknown as Game[]) {
    if (!roundMap[g.round_id]) {
      roundMap[g.round_id] = { round_number: g.rounds.round_number, games: [] }
    }
    roundMap[g.round_id].games.push(g)
  }

  const rounds = Object.entries(roundMap)
    .map(([rid, val]) => ({ round_id: Number(rid), ...val }))
    .sort((a, b) => a.round_number - b.round_number)

  return (
    <main className="page-container">
      <div className="page-header">
        <h1>🏉 Submit Tips</h1>
        <a href="/dashboard" className="btn btn-primary btn-sm">← Dashboard</a>
      </div>
      <p style={{ marginBottom: 28, color: 'var(--text-muted)' }}>{competition.name}</p>

      <form action="/api/tips/submit" method="POST">
        <input type="hidden" name="competition_id" value={competition.id} />

        {rounds.map(({ round_id, round_number, games: roundGames }) => (
          <section key={round_id} style={{ marginBottom: 36 }}>
            <div className="round-header">
              <span>Round {round_number}</span>
            </div>
            {roundGames.map((game) => {
              const locked = new Date(game.match_time) <= new Date(now)
              const existingPick = tipMap[game.id]
              const matchDate = new Date(game.match_time).toLocaleString('en-AU', {
                weekday: 'short', day: 'numeric', month: 'short',
                hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Melbourne'
              })

              return (
                <div key={game.id} className={`game-card${locked ? ' locked' : ''}`}>
                  <div className="game-meta">
                    <span>{matchDate}{game.venue ? ` · ${game.venue}` : ''}</span>
                    {locked && <span className="badge-locked">LOCKED</span>}
                    {existingPick && !locked && <span className="badge-tipped">✓ tipped</span>}
                  </div>
                  <div className="team-selector">
                    <div className="team-btn">
                      <input
                        type="radio"
                        id={`game_${game.id}_home`}
                        name={`tip_${game.id}`}
                        value={game.home_team.id}
                        defaultChecked={existingPick === game.home_team.id}
                        disabled={locked}
                      />
                      <label htmlFor={`game_${game.id}_home`}>
                        {game.home_team.short_name ?? game.home_team.name}
                      </label>
                    </div>
                    <span className="vs-divider">vs</span>
                    <div className="team-btn">
                      <input
                        type="radio"
                        id={`game_${game.id}_away`}
                        name={`tip_${game.id}`}
                        value={game.away_team.id}
                        defaultChecked={existingPick === game.away_team.id}
                        disabled={locked}
                      />
                      <label htmlFor={`game_${game.id}_away`}>
                        {game.away_team.short_name ?? game.away_team.name}
                      </label>
                    </div>
                  </div>
                </div>
              )
            })}
          </section>
        ))}

        {rounds.length === 0 && (
          <div className="card"><p>No fixtures loaded yet — check back soon!</p></div>
        )}

        <div style={{ marginTop: 28 }}>
          <button type="submit" className="btn btn-gold" style={{ padding: '12px 40px', fontSize: '1rem' }}>
            💾 Save Tips
          </button>
        </div>
      </form>
    </main>
  )
}