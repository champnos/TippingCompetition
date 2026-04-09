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
  const competition_id = Number(formData.get('competition_id'))
  const finals_week = Number(formData.get('finals_week'))
  const home_team_id = Number(formData.get('home_team_id'))
  const away_team_id = Number(formData.get('away_team_id'))
  const match_time = formData.get('match_time') as string
  const venue = (formData.get('venue') as string) || null

  if (!competition_id || !finals_week || !home_team_id || !away_team_id || !match_time) {
    return NextResponse.redirect(new URL('/admin/finals?error=missing_fields', req.url))
  }

  // Look up season_id from the competition
  const { data: competition } = await supabase
    .from('competitions')
    .select('season_id')
    .eq('id', competition_id)
    .single()

  if (!competition?.season_id) {
    return NextResponse.redirect(new URL('/admin/finals?error=game_failed', req.url))
  }

  const round_number = 99 + finals_week // 100, 101, 102, 103

  // Find or create the round for this finals week
  const { data: existingRound } = await supabase
    .from('rounds')
    .select('id')
    .eq('season_id', competition.season_id)
    .eq('round_number', round_number)
    .single()

  let round_id: number

  if (existingRound) {
    round_id = existingRound.id
  } else {
    const { data: newRound, error: roundError } = await supabase
      .from('rounds')
      .insert({ season_id: competition.season_id, round_number, locked: false })
      .select('id')
      .single()

    if (roundError || !newRound) {
      return NextResponse.redirect(new URL('/admin/finals?error=game_failed', req.url))
    }

    round_id = newRound.id
  }

  // Insert the game
  const { error: gameError } = await supabase
    .from('games')
    .insert({
      round_id,
      home_team_id,
      away_team_id,
      match_time,
      venue,
      is_final: true,
    })

  if (gameError) {
    return NextResponse.redirect(new URL('/admin/finals?error=game_failed', req.url))
  }

  return NextResponse.redirect(new URL('/admin/finals?game_added=1', req.url))
}
