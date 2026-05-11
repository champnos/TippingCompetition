import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

type PendingGame = {
  round_id: number
  match_time: string
  rounds: { round_number: number }
  home_team: { name: string }
  away_team: { name: string }
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return NextResponse.redirect(new URL('/dashboard', req.url))

  const header = 'round_id,home_team,away_team,home_score,away_score'

  const { data: activeComp } = await supabase
    .from('competitions')
    .select('season_id')
    .eq('is_active', true)
    .single()

  if (!activeComp) {
    return new NextResponse(`${header}\n# No pending results found\n`, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="results_template.csv"',
      },
    })
  }

  const { data: games } = await supabase
    .from('games')
    .select(`
      round_id, match_time,
      rounds!inner(round_number),
      home_team:teams!games_home_team_id_fkey(name),
      away_team:teams!games_away_team_id_fkey(name)
    `)
    .eq('rounds.season_id', activeComp.season_id)
    .or('home_score.is.null,away_score.is.null')
    .order('round_number', { foreignTable: 'rounds', ascending: true })
    .order('match_time', { ascending: true })

  const pendingGames = (games ?? []) as unknown as PendingGame[]

  if (pendingGames.length === 0) {
    return new NextResponse(`${header}\n# No pending results found\n`, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="results_template.csv"',
      },
    })
  }

  const rows = pendingGames.map((game) => [
    String(game.round_id),
    escapeCsv(game.home_team.name),
    escapeCsv(game.away_team.name),
    '',
    '',
  ].join(','))

  return new NextResponse(`${header}\n${rows.join('\n')}\n`, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="results_template.csv"',
    },
  })
}
