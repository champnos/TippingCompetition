import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type TeamRow = { id: number; name: string; short_name: string | null }
type Game = {
  id: number
  home_score: number
  away_score: number
  home_team: TeamRow
  away_team: TeamRow
  rounds: { season_id: number; round_number: number }
}
type LadderEntry = {
  teamId: number
  name: string
  P: number; W: number; L: number; D: number
  PF: number; PA: number; Pts: number
}

export default async function LadderPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: activeComp } = await supabase
    .from('competitions')
    .select('id, name, season_id')
    .eq('is_active', true)
    .single()

  let ladder: LadderEntry[] = []

  const pct = (e: LadderEntry) => (e.PA === 0 ? Infinity : e.PF / e.PA)
  const pctDisplay = (e: LadderEntry) => (e.PA === 0 ? '—' : ((e.PF / e.PA) * 100).toFixed(1) + '%')

  if (activeComp) {
    const { data: gamesData } = await supabase
      .from('games')
      .select('id, home_score, away_score, rounds!inner(season_id, round_number), home_team:teams!games_home_team_id_fkey(id, name, short_name), away_team:teams!games_away_team_id_fkey(id, name, short_name)')
      .eq('rounds.season_id', activeComp.season_id)
      .not('home_score', 'is', null)
      .not('away_score', 'is', null)

    const games = (gamesData ?? []) as unknown as Game[]
    const map: Record<number, LadderEntry> = {}

    const ensureTeam = (team: TeamRow) => {
      if (!map[team.id]) {
        map[team.id] = { teamId: team.id, name: team.name, P: 0, W: 0, L: 0, D: 0, PF: 0, PA: 0, Pts: 0 }
      }
    }

    for (const game of games) {
      const { home_team, away_team, home_score, away_score } = game
      ensureTeam(home_team)
      ensureTeam(away_team)

      const h = map[home_team.id]
      const a = map[away_team.id]

      h.P += 1; a.P += 1
      h.PF += home_score; h.PA += away_score
      a.PF += away_score; a.PA += home_score

      if (home_score > away_score) {
        h.W += 1; h.Pts += 4
        a.L += 1
      } else if (away_score > home_score) {
        a.W += 1; a.Pts += 4
        h.L += 1
      } else {
        h.D += 1; h.Pts += 2
        a.D += 1; a.Pts += 2
      }
    }

    ladder = Object.values(map).sort((a, b) => {
      if (b.Pts !== a.Pts) return b.Pts - a.Pts
      return pct(b) - pct(a)
    })
  }

  return (
    <main className="page-container">
      <div className="page-header">
        <h1>📊 AFL Ladder</h1>
        <a href="/dashboard" className="btn btn-primary btn-sm">← Dashboard</a>
      </div>
      {activeComp && (
        <p style={{ marginBottom: 20, color: 'var(--text-muted)' }}>{activeComp.name}</p>
      )}

      {ladder.length === 0 ? (
        <div className="card"><p>No ladder data yet — results will appear once games have been scored.</p></div>
      ) : (
        <div className="section-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table className="afl-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team</th>
                  <th className="center">P</th>
                  <th className="center">W</th>
                  <th className="center">L</th>
                  <th className="center">D</th>
                  <th className="center">PF</th>
                  <th className="center">PA</th>
                  <th className="center">%</th>
                  <th className="center">Pts</th>
                </tr>
              </thead>
              <tbody>
                {ladder.map((entry, i) => {
                  const display = pctDisplay(entry)
                  return (
                    <tr key={entry.teamId}>
                      <td>{i + 1}</td>
                      <td>{entry.name}</td>
                      <td className="center">{entry.P}</td>
                      <td className="center">{entry.W}</td>
                      <td className="center">{entry.L}</td>
                      <td className="center">{entry.D}</td>
                      <td className="center">{entry.PF}</td>
                      <td className="center">{entry.PA}</td>
                      <td className="center">{display}</td>
                      <td className="center">{entry.Pts}</td>
                    </tr>
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
