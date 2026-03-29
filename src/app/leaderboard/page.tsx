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
      <main style={{ maxWidth: 800, margin: '40px auto', padding: '0 16px' }}>
        <h1>Leaderboard</h1>
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
      const profile = entry.profiles as { full_name: string | null; short_name: string | null } | null
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

  return (
    <main style={{ maxWidth: 800, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Leaderboard</h1>
        <a href="/dashboard">← Dashboard</a>
      </div>
      <h2 style={{ color: '#555', fontWeight: 'normal' }}>{competition.name}</h2>
      {rows.length === 0 ? (
        <p>No results yet — check back after Round 1!</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ccc', textAlign: 'left' }}>
              <th style={{ padding: '8px 4px' }}>#</th>
              <th style={{ padding: '8px 4px' }}>Name</th>
              <th style={{ padding: '8px 4px', textAlign: 'center' }}>Correct</th>
              <th style={{ padding: '8px 4px', textAlign: 'center' }}>Tipped</th>
              <th style={{ padding: '8px 4px', textAlign: 'center' }}>%</th>
              <th style={{ padding: '8px 4px', textAlign: 'center' }}>Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.profile_id} style={{
                borderBottom: '1px solid #eee',
                background: row.profile_id === user.id ? '#fffbe6' : 'transparent',
                fontWeight: row.profile_id === user.id ? 'bold' : 'normal',
              }}>
                <td style={{ padding: '8px 4px' }}>{i + 1}</td>
                <td style={{ padding: '8px 4px' }}>{row.name}{row.profile_id === user.id ? ' (you)' : ''}</td>
                <td style={{ padding: '8px 4px', textAlign: 'center' }}>{row.correct}</td>
                <td style={{ padding: '8px 4px', textAlign: 'center' }}>{row.total}</td>
                <td style={{ padding: '8px 4px', textAlign: 'center' }}>{row.total > 0 ? Math.round((row.correct / row.total) * 100) + '%' : '-'}</td>
                <td style={{ padding: '8px 4px', textAlign: 'center' }}>{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
