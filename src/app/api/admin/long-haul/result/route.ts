import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

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
  const round_id = Number(formData.get('round_id'))
  const competition_id = Number(formData.get('competition_id'))

  if (!round_id || !competition_id) {
    return NextResponse.redirect(new URL('/admin/long-haul?error=missing_fields', req.url))
  }

  // Get round details (to retrieve round_number)
  const { data: round } = await supabase
    .from('rounds')
    .select('id, round_number')
    .eq('id', round_id)
    .single()

  if (!round) {
    return NextResponse.redirect(new URL('/admin/long-haul?error=round_not_found', req.url))
  }

  // Get all games in this round with results
  const { data: games } = await supabase
    .from('games')
    .select('id, home_team_id, away_team_id, winner_team_id, home_score, away_score')
    .eq('round_id', round_id)

  if (!games || games.length === 0) {
    return NextResponse.redirect(new URL('/admin/long-haul?error=no_games', req.url))
  }

  // Get all long_haul_tips for this round in this competition
  const { data: tips } = await supabase
    .from('long_haul_tips')
    .select(`
      id, entry_id, game_id, team_id,
      long_haul_entries!inner(id, competition_id)
    `)
    .eq('round_id', round_id)

  if (!tips || tips.length === 0) {
    return NextResponse.redirect(new URL('/admin/long-haul?info=no_tips', req.url))
  }

  type TipWithEntry = {
    id: number
    entry_id: number
    game_id: number
    team_id: number
    long_haul_entries: { id: number; competition_id: number }
  }

  const typedTips = tips as unknown as TipWithEntry[]
  const compTips = typedTips.filter((t) => t.long_haul_entries.competition_id === competition_id)

  if (compTips.length === 0) {
    return NextResponse.redirect(new URL('/admin/long-haul?info=no_tips', req.url))
  }

  // Process each tip: raw points are 0 or 1 (joker multiplier applied at query time)
  for (const tip of compTips) {
    const game = games.find((g) => g.id === tip.game_id)
    if (!game) continue
    // Skip games without results yet
    if (game.home_score === null || game.away_score === null) continue

    const isDraw = game.home_score === game.away_score
    const isCorrect = !isDraw && game.winner_team_id === tip.team_id
    const pointsAwarded = isCorrect ? 1 : 0

    await supabase
      .from('long_haul_tips')
      .update({
        is_correct: isDraw ? false : isCorrect,
        points_awarded: pointsAwarded,
      })
      .eq('id', tip.id)
  }

  return NextResponse.redirect(new URL('/admin/long-haul?processed=1', req.url))
}
