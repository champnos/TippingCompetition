import { createClient } from '@/lib/supabase/server'
import { ctpAccuracyFactor } from '@/lib/ctp'
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
    return NextResponse.redirect(new URL('/admin/closest-to-pin?error=missing_fields', req.url))
  }

  // Get the round details
  const { data: round } = await supabase
    .from('rounds')
    .select('id, round_number, season_id')
    .eq('id', round_id)
    .single()

  if (!round) {
    return NextResponse.redirect(new URL('/admin/closest-to-pin?error=round_not_found', req.url))
  }

  // Get all games in this round with results
  const { data: games } = await supabase
    .from('games')
    .select('id, home_team_id, away_team_id, winner_team_id, home_score, away_score')
    .eq('round_id', round_id)

  if (!games || games.length === 0) {
    return NextResponse.redirect(new URL('/admin/closest-to-pin?error=no_games', req.url))
  }

  // Get all pending tips for this round in this competition
  const { data: tips } = await supabase
    .from('closest_to_pin_tips')
    .select(`
      id, entry_id, team_id, margin, result,
      closest_to_pin_entries!inner(id, competition_id)
    `)
    .eq('round_id', round_id)
    .eq('result', 'pending')

  if (!tips || tips.length === 0) {
    return NextResponse.redirect(new URL('/admin/closest-to-pin?info=no_pending_tips', req.url))
  }

  type TipWithEntry = {
    id: number
    entry_id: number
    team_id: number
    margin: number
    result: string | null
    closest_to_pin_entries: {
      id: number
      competition_id: number
    }
  }

  const typedTips = tips as unknown as TipWithEntry[]
  const compTips = typedTips.filter((t) => t.closest_to_pin_entries.competition_id === competition_id)

  const factor = ctpAccuracyFactor(round.round_number)

  // Process each tip
  for (const tip of compTips) {
    const game = games.find(
      (g) => g.home_team_id === tip.team_id || g.away_team_id === tip.team_id
    )

    if (!game) continue

    // Skip if game result not yet entered
    if (game.home_score === null || game.away_score === null) continue

    const actualMargin = Math.abs(game.home_score - game.away_score)
    const isDraw = game.home_score === game.away_score
    // null for draws — distinguishes from a wrong-team pick
    const correctTeam = isDraw ? null : game.winner_team_id === tip.team_id

    let rawScore: number
    if (correctTeam === true) {
      rawScore = Math.abs(actualMargin - tip.margin)
    } else {
      // Wrong team or draw: actual_margin + margin
      rawScore = actualMargin + tip.margin
    }

    const roundScore = rawScore * factor
    const result = isDraw ? 'draw' : correctTeam ? 'correct' : 'wrong'

    await supabase
      .from('closest_to_pin_tips')
      .update({
        actual_margin: actualMargin,
        correct_team: correctTeam,
        raw_score: rawScore,
        round_score: roundScore,
        accuracy_factor: factor,
        result,
      })
      .eq('id', tip.id)
  }

  return NextResponse.redirect(new URL('/admin/closest-to-pin?processed=1', req.url))
}
