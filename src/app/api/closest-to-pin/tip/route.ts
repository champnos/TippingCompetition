import { createClient } from '@/lib/supabase/server'
import { ctpAccuracyFactor } from '@/lib/ctp'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const formData = await req.formData()
  const entry_id = Number(formData.get('entry_id'))
  const round_id = Number(formData.get('round_id'))
  const team_id = Number(formData.get('team_id'))
  const margin = Number(formData.get('margin'))

  if (!entry_id || !round_id || !team_id || !margin) {
    return NextResponse.redirect(new URL('/closest-to-pin?error=missing_fields', req.url))
  }

  if (margin <= 0 || !Number.isInteger(margin)) {
    return NextResponse.redirect(new URL('/closest-to-pin?error=invalid_margin', req.url))
  }

  // 1. Verify entry ownership
  const { data: entry } = await supabase
    .from('closest_to_pin_entries')
    .select('id, user_id, competition_id')
    .eq('id', entry_id)
    .single()

  if (!entry || entry.user_id !== user.id) {
    return NextResponse.redirect(new URL('/closest-to-pin?error=not_owner', req.url))
  }

  // 2. Verify round is not locked
  const { data: round } = await supabase
    .from('rounds')
    .select('id, round_number, locked')
    .eq('id', round_id)
    .single()

  if (!round || round.locked) {
    return NextResponse.redirect(new URL('/closest-to-pin?error=round_locked', req.url))
  }

  // 3. Verify team is playing in this round
  const { data: games } = await supabase
    .from('games')
    .select('id, home_team_id, away_team_id, match_time')
    .eq('round_id', round_id)

  if (!games || games.length === 0) {
    return NextResponse.redirect(new URL('/closest-to-pin?error=no_games', req.url))
  }

  const pickedGame = games.find(
    (g) => g.home_team_id === team_id || g.away_team_id === team_id
  )

  if (!pickedGame) {
    return NextResponse.redirect(new URL('/closest-to-pin?error=team_not_playing', req.url))
  }

  // 4. Upsert the tip
  const factor = ctpAccuracyFactor(round.round_number)
  const { error: tipError } = await supabase
    .from('closest_to_pin_tips')
    .upsert(
      {
        entry_id,
        round_id,
        team_id,
        margin,
        accuracy_factor: factor,
        result: 'pending',
      },
      { onConflict: 'entry_id,round_id' }
    )

  if (tipError) {
    console.error('Closest to pin tip error:', tipError)
    return NextResponse.redirect(new URL('/closest-to-pin?error=tip_save_failed', req.url))
  }

  return NextResponse.redirect(new URL('/closest-to-pin', req.url))
}
