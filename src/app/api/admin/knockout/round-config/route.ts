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
  const top_team_id = formData.get('top_team_id') ? Number(formData.get('top_team_id')) : null
  const bottom_team_id = formData.get('bottom_team_id') ? Number(formData.get('bottom_team_id')) : null

  if (!round_id) {
    return NextResponse.redirect(new URL('/admin/knockout?error=missing_round', req.url))
  }

  const { error } = await supabase
    .from('knockout_round_config')
    .upsert(
      { round_id, top_team_id, bottom_team_id },
      { onConflict: 'round_id' }
    )

  if (error) {
    console.error('Round config error:', error)
    return NextResponse.redirect(new URL('/admin/knockout?error=config_save_failed', req.url))
  }

  return NextResponse.redirect(new URL('/admin/knockout', req.url))
}
