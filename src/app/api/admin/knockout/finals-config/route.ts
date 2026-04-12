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
  const finals_round = formData.get('finals_round') as string
  const cut_line = formData.get('cut_line') ? Number(formData.get('cut_line')) : null
  const is_open = formData.get('is_open') === 'on' || formData.get('is_open') === 'true'

  if (!competition_id || !finals_round) {
    return NextResponse.redirect(new URL('/admin/knockout?error=missing_fields', req.url))
  }

  const { error } = await supabase
    .from('knockout_finals_config')
    .upsert(
      { competition_id, finals_round, cut_line, is_open },
      { onConflict: 'competition_id,finals_round' }
    )

  if (error) {
    console.error('Finals config error:', error)
    return NextResponse.redirect(new URL('/admin/knockout?error=config_save_failed', req.url))
  }

  return NextResponse.redirect(new URL('/admin/knockout?config_saved=1', req.url))
}
