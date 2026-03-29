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
      <main style={{ maxWidth: 800, margin: '40px auto', padding: '0 16px' }}>
        <h1>Submit Tips</h1>
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
  for (const g of (games ?? []) as Game[]) {
    if (!roundMap[g.round_id]) {
      roundMap[g.round_id] = { round_number: g.rounds.round_number, games: [] }
    }
    roundMap[g.round_id].games.push(g)
  }

  const rounds = Object.entries(roundMap)
    .map(([rid, val]) => ({ round_id: Number(rid), ...val }))
    .sort((a, b) => a.round_number - b.round_number)

  return (
    <main style={{ maxWidth: 800, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Submit Tips</h1>
        <a href="/dashboard">← Dashboard</a>
      </div>
      <h2 style={{ color: '#555', fontWeight: 'normal' }}>{competition.name}</h2>

      <form action="/api/tips/submit" method="POST">
        <input type="hidden" name="competition_id" value={competition.id} />

        {rounds.map(({ round_id, round_number, games: roundGames }) => (
          <section key={round_id} style={{ marginBottom: 40 }}>
            <h3 style={{ borderBottom: '2px solid #ddd', paddingBottom: 8 }}>
              Round {round_number}
            </h3>
            {roundGames.map((game) => {
              const locked = new Date(game.match_time) <= new Date(now)
              const existingPick = tipMap[game.id]
              const matchDate = new Date(game.match_time).toLocaleString('en-AU', {
                weekday: 'short', day: 'numeric', month: 'short',
                hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Melbourne'
              })

              return (
                <div key={game.id} style={{
                  border: '1px solid #eee',
                  borderRadius: 8,
                  padding: '12px 16px',
                  marginBottom: 12,
                  background: locked ? '#fafafa' : '#fff',
                  opacity: locked ? 0.75 : 1,
                }}>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
                    {matchDate}{game.venue ? ` · ${game.venue}` : ''}
                    {locked && <span style={{ marginLeft: 8, color: '#c00', fontWeight: 'bold' }}>LOCKED</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: locked ? 'default' : 'pointer' }}>
                      <input
                        type="radio"
                        name={`tip_${game.id}`}
                        value={game.home_team.id}
                        defaultChecked={existingPick === game.home_team.id}
                        disabled={locked}
                      />
                      <span style={{ fontWeight: 'bold' }}>
                        {game.home_team.short_name ?? game.home_team.name}
                      </span>
                    </label>
                    <span style={{ color: '#999' }}>vs</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: locked ? 'default' : 'pointer' }}>
                      <input
                        type="radio"
                        name={`tip_${game.id}`}
                        value={game.away_team.id}
                        defaultChecked={existingPick === game.away_team.id}
                        disabled={locked}
                      />
                      <span style={{ fontWeight: 'bold' }}>
                        {game.away_team.short_name ?? game.away_team.name}
                      </span>
                    </label>
                    {existingPick && (
                      <span style={{ marginLeft: 'auto', fontSize: 12, color: '#4a4' }}>✓ tipped</span>
                    )}
                  </div>
                </div>
              )
            })}
          </section>
        ))}

        {rounds.length === 0 && (
          <p>No fixtures loaded yet — check back soon!</p>
        )}

        <div style={{ marginTop: 24 }}>
          <button
            type="submit"
            style={{
              background: '#1a73e8', color: '#fff', border: 'none',
              padding: '12px 32px', borderRadius: 6, fontSize: 16, cursor: 'pointer'
            }}
          >
            Save Tips
          </button>
        </div>
      </form>
    </main>
  )
}