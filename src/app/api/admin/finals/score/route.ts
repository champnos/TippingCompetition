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
  const game_id = Number(formData.get('game_id'))
  const home_score = Number(formData.get('home_score'))
  const away_score = Number(formData.get('away_score'))
  const home_team_id = Number(formData.get('home_team_id'))
  const away_team_id = Number(formData.get('away_team_id'))

  if (!game_id || isNaN(home_score) || isNaN(away_score) || !home_team_id || !away_team_id) {
    return NextResponse.redirect(new URL('/admin/finals?error=missing_fields', req.url))
  }

  const winner_team_id =
    home_score > away_score ? home_team_id
    : away_score > home_score ? away_team_id
    : null

  const { error } = await supabase
    .from('games')
    .update({ home_score, away_score, winner_team_id })
    .eq('id', game_id)

  if (error) {
    return NextResponse.redirect(new URL('/admin/finals?error=score_failed', req.url))
  }

  return NextResponse.redirect(new URL('/admin/finals?score_saved=1', req.url))
}
