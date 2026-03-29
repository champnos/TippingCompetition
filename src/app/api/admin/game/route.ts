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
  const home_team_id = Number(formData.get('home_team_id'))
  const away_team_id = Number(formData.get('away_team_id'))
  const match_time = formData.get('match_time') as string
  const venue = formData.get('venue') as string | null

  const { error } = await supabase.from('games').insert({
    round_id,
    home_team_id,
    away_team_id,
    match_time,
    venue: venue || null,
  })

  if (error) return NextResponse.redirect(new URL('/admin?error=game', req.url))
  return NextResponse.redirect(new URL('/admin', req.url))
}
