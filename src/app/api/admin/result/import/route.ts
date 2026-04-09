import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const TEMPLATE_CSV = `round_id,home_team,away_team,home_score,away_score
1,Richmond Tigers,Collingwood,85,72
2,Carlton,Essendon,103,98
`

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

  return new NextResponse(TEMPLATE_CSV, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="results_template.csv"',
    },
  })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return NextResponse.redirect(new URL('/dashboard', req.url))

  const formData = await req.formData()
  const file = formData.get('csv_file') as File | null

  if (!file || file.size === 0) {
    return NextResponse.redirect(new URL('/admin?error=no_file', req.url))
  }

  const text = await file.text()
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  if (lines.length < 2) {
    return NextResponse.redirect(new URL('/admin?error=empty_csv', req.url))
  }

  // Skip header row
  const dataLines = lines.slice(1)

  // Fetch all teams for lookup
  const { data: teams } = await supabase.from('teams').select('id, name, short_name')
  const teamList = teams ?? []

  const skipReasons: string[] = []
  let imported = 0

  // Fetch active competition for grading tips
  const { data: activeComp } = await supabase
    .from('competitions')
    .select('id')
    .eq('is_active', true)
    .single()

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i]
    const parts = line.split(',')

    if (parts.length < 5) {
      skipReasons.push(`Row ${i + 2}: not enough columns (expected round_id,home_team,away_team,home_score,away_score)`)
      continue
    }

    const round_id = Number(parts[0].trim())
    const home_team_str = parts[1].trim()
    const away_team_str = parts[2].trim()
    const home_score = Number(parts[3].trim())
    const away_score = Number(parts[4].trim())

    if (!round_id || isNaN(round_id)) {
      skipReasons.push(`Row ${i + 2}: invalid round_id "${parts[0].trim()}"`)
      continue
    }

    if (isNaN(home_score) || isNaN(away_score)) {
      skipReasons.push(`Row ${i + 2}: invalid scores`)
      continue
    }

    const homeTeam = teamList.find(
      (t) =>
        t.name.toLowerCase() === home_team_str.toLowerCase() ||
        (t.short_name && t.short_name.toLowerCase() === home_team_str.toLowerCase()),
    )
    if (!homeTeam) {
      skipReasons.push(`Row ${i + 2}: home team "${home_team_str}" not found`)
      continue
    }

    const awayTeam = teamList.find(
      (t) =>
        t.name.toLowerCase() === away_team_str.toLowerCase() ||
        (t.short_name && t.short_name.toLowerCase() === away_team_str.toLowerCase()),
    )
    if (!awayTeam) {
      skipReasons.push(`Row ${i + 2}: away team "${away_team_str}" not found`)
      continue
    }

    // Find the game
    const { data: gameRow } = await supabase
      .from('games')
      .select('id')
      .eq('round_id', round_id)
      .eq('home_team_id', homeTeam.id)
      .eq('away_team_id', awayTeam.id)
      .single()

    if (!gameRow) {
      skipReasons.push(`Row ${i + 2}: game not found for round ${round_id}, ${home_team_str} vs ${away_team_str}`)
      continue
    }

    const margin = Math.abs(home_score - away_score)
    const winnerId = home_score > away_score ? homeTeam.id : home_score < away_score ? awayTeam.id : null

    const { error: gameError } = await supabase
      .from('games')
      .update({
        home_score,
        away_score,
        winner_team_id: winnerId,
      })
      .eq('id', gameRow.id)

    if (gameError) {
      skipReasons.push(`Row ${i + 2}: failed to update game — ${gameError.message}`)
      continue
    }

    // Grade tips if there's an active competition
    if (activeComp) {
      const { data: tips } = await supabase
        .from('tips')
        .select('id, picked_team_id')
        .eq('game_id', gameRow.id)
        .eq('competition_id', activeComp.id)

      if (tips && tips.length > 0) {
        for (const tip of tips) {
          let pointsAwarded = 0
          let isCorrect: boolean | null = null

          if (winnerId === null) {
            isCorrect = false
            pointsAwarded = 0
          } else if (tip.picked_team_id === winnerId) {
            isCorrect = true
            pointsAwarded = margin
          } else {
            isCorrect = false
            pointsAwarded = -margin
          }

          await supabase
            .from('tips')
            .update({ is_correct: isCorrect, points_awarded: pointsAwarded })
            .eq('id', tip.id)
        }
      }
    }

    imported++
  }

  const skipped = skipReasons.length
  const params = new URLSearchParams({
    result_imported: String(imported),
    result_skipped: String(skipped),
  })
  if (skipped > 0) {
    params.set('result_skip_reasons', skipReasons.join(' | '))
  }

  return NextResponse.redirect(new URL(`/admin?${params.toString()}`, req.url))
}
