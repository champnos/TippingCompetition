import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function LeaderboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) { redirect('/login') }

  const { data: competition } = await supabase
    .from('competitions')
    .select('id, name, season_id')
    .eq('is_active', true)
    .single()

  if (!competition) {
    return (
      <main className="page-container">
        <h1>🏆 Leaderboard</h1>
        <p>No active competition found.</p>
        <p><a href="/dashboard">Back to dashboard</a></p>
      </main>
    )
  }

  const { data: entries } = await supabase
    .from('entries')
    .select('profile_id, profiles(full_name, short_name)')
    .eq('competition_id', competition.id)

  const { data: tips } = await supabase
    .from('tips')
    .select('profile_id, is_correct, points_awarded')
    .eq('competition_id', competition.id)
    .not('is_correct', 'is', null)

  type Row = { profile_id: string; name: string; correct: number; total: number; points: number }
  const scoreMap: Record<string, Row> = {}

  if (entries) {
    for (const entry of entries) {
      const profile = (entry.profiles as unknown) as { full_name: string | null; short_name: string | null } | null
      scoreMap[entry.profile_id] = {
        profile_id: entry.profile_id,
        name: profile?.short_name || profile?.full_name || 'Unknown',
        correct: 0, total: 0, points: 0,
      }
    }
  }

  if (tips) {
    for (const tip of tips) {
      if (scoreMap[tip.profile_id]) {
        scoreMap[tip.profile_id].total += 1
        if (tip.is_correct) scoreMap[tip.profile_id].correct += 1
        scoreMap[tip.profile_id].points += tip.points_awarded || 0
      }
    }
  }

  const rows = Object.values(scoreMap).sort((a, b) => b.correct - a.correct || b.points - a.points)

  const medals = ['🥇', '🥈', '🥉']

  return (
    <main className="page-container">
      <div className="page-header">
        <h1>🏆 Leaderboard</h1>
        <a href="/dashboard" className="btn btn-primary btn-sm">← Dashboard</a>
      </div>
      <p style={{ marginBottom: 20, color: 'var(--text-muted)' }}>{competition.name}</p>

      {rows.length === 0 ? (
        <div className="card"><p>No results yet — check back after Round 1!</p></div>
      ) : (
        <div className="section-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table className="afl-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th className="center">Correct</th>
                  <th className="center">Tipped</th>
                  <th className="center">%</th>
                  <th className="center">Pts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const rankClass = i < 3 ? `rank-${i + 1}` : ''
                  const isMe = row.profile_id === user.id
                  const rowClass = [rankClass, isMe ? 'current-user' : ''].filter(Boolean).join(' ')
                  return (
                    <tr key={row.profile_id} className={rowClass}>
                      <td>{medals[i] ?? (i + 1)}</td>
                      <td>{row.name}{isMe ? ' (you)' : ''}</td>
                      <td className="center">{row.correct}</td>
                      <td className="center">{row.total}</td>
                      <td className="center">{row.total > 0 ? Math.round((row.correct / row.total) * 100) + '%' : '—'}</td>
                      <td className="center">{row.points}</td>
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