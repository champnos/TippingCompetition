import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AdminPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/dashboard')

  const { data: competition } = await supabase
    .from('competitions')
    .select('id, name, season_id')
    .eq('is_active', true)
    .single()

  if (!competition) {
    return (
      <main style={{ maxWidth: 900, margin: '40px auto', padding: '0 16px' }}>
        <h1>Admin Panel</h1>
        <p>No active competition found.</p>
        <p><a href="/dashboard">← Back to dashboard</a></p>
      </main>
    )
  }

  const { data: games } = await supabase
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
    <main style={{ maxWidth: 900, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Admin Panel</h1>
        <a href="/dashboard">← Dashboard</a>
      </div>
      <h2 style={{ color: '#555', fontWeight: 'normal' }}>{competition.name}</h2>
      <p style={{ color: '#888', fontSize: 14 }}>
        Enter scores below. Points are awarded as the actual winning margin — positive if the user tipped the winner, negative if they tipped the loser.
      </p>

      {rounds.map(({ round_id, round_number, games: roundGames }) => (
        <section key={round_id} style={{ marginBottom: 48 }}>
          <h3 style={{ borderBottom: '2px solid #ddd', paddingBottom: 8 }}>
            Round {round_number}
          </h3>
          {roundGames.map((game) => {
            const hasResult = game.home_score !== null && game.away_score !== null
            const matchDate = new Date(game.match_time).toLocaleString('en-AU', {
              weekday: 'short', day: 'numeric', month: 'short',
              hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Melbourne'
            })

            return (
              <div key={game.id} style={{
                border: '1px solid #ddd',
                borderRadius: 8,
                padding: '16px',
                marginBottom: 12,
                background: hasResult ? '#f0fff0' : '#fff',
              }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
                  {matchDate}{game.venue ? ` · ${game.venue}` : ''}
                  {hasResult && (
                    <span style={{ marginLeft: 8, color: '#4a4', fontWeight: 'bold' }}>
                      ✓ Result entered
                    </span>
                  )}
                </div>

                <form action="/api/admin/result" method="POST" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <input type="hidden" name="game_id" value={game.id} />
                  <input type="hidden" name="competition_id" value={competition.id} />
                  <input type="hidden" name="home_team_id" value={game.home_team.id} />
                  <input type="hidden" name="away_team_id" value={game.away_team.id} />

                  <span style={{ fontWeight: 'bold', minWidth: 80 }}>
                    {game.home_team.short_name ?? game.home_team.name}
                  </span>
                  <input
                    type="number"
                    name="home_score"
                    defaultValue={game.home_score ?? ''}
                    placeholder="Score"
                    min={0}
                    style={{ width: 70, padding: '6px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 14 }}
                  />
                  <span style={{ color: '#999' }}>vs</span>
                  <input
                    type="number"
                    name="away_score"
                    defaultValue={game.away_score ?? ''}
                    placeholder="Score"
                    min={0}
                    style={{ width: 70, padding: '6px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 14 }}
                  />
                  <span style={{ fontWeight: 'bold', minWidth: 80 }}>
                    {game.away_team.short_name ?? game.away_team.name}
                  </span>

                  <button
                    type="submit"
                    style={{
                      background: hasResult ? '#555' : '#1a73e8',
                      color: '#fff', border: 'none',
                      padding: '7px 18px', borderRadius: 4,
                      fontSize: 13, cursor: 'pointer'
                    }}
                  >
                    {hasResult ? 'Update & Regrade' : 'Save & Grade Tips'}
                  </button>
                </form>
              </div>
            )
          })}
        </section>
      ))}

      {rounds.length === 0 && <p>No fixtures loaded yet.</p>}
    </main>
  )
}