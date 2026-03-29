import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  // Check admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return NextResponse.redirect(new URL('/dashboard', req.url))

  const formData = await req.formData()
  const gameId = Number(formData.get('game_id'))
  const competitionId = Number(formData.get('competition_id'))
  const homeScore = Number(formData.get('home_score'))
  const awayScore = Number(formData.get('away_score'))
  const homeTeamId = Number(formData.get('home_team_id'))
  const awayTeamId = Number(formData.get('away_team_id'))

  if (!gameId || !competitionId || isNaN(homeScore) || isNaN(awayScore)) {
    return NextResponse.redirect(new URL('/admin?error=invalid', req.url))
  }

  const margin = Math.abs(homeScore - awayScore)
  const winnerId = homeScore > awayScore ? homeTeamId : homeScore < awayScore ? awayTeamId : null

  // Update game with result
  const { error: gameError } = await supabase
    .from('games')
    .update({
      home_score: homeScore,
      away_score: awayScore,
      winner_team_id: winnerId,
    })
    .eq('id', gameId)

  if (gameError) {
    console.error('Game update error:', gameError)
    return NextResponse.redirect(new URL('/admin?error=game_update', req.url))
  }

  // Get all tips for this game in this competition
  const { data: tips } = await supabase
    .from('tips')
    .select('id, picked_team_id')
    .eq('game_id', gameId)
    .eq('competition_id', competitionId)

  if (tips && tips.length > 0) {
    // Grade each tip:
    // points_awarded = margin if picked winner, -margin if picked loser, 0 if draw
    for (const tip of tips) {
      let pointsAwarded = 0
      let isCorrect: boolean | null = null

      if (winnerId === null) {
        // Draw
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

  return NextResponse.redirect(new URL('/admin?graded=1', req.url))
}