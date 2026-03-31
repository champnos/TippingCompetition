import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const formData = await req.formData()
  const competition_id = Number(formData.get('competition_id'))
  const finals_week = Number(formData.get('finals_week'))
  const team_id = Number(formData.get('team_id'))
  const margin = Number(formData.get('margin'))

  if (!competition_id || !finals_week || !team_id || isNaN(margin) || margin < 0) {
    return NextResponse.redirect(new URL('/finals?error=missing_fields', req.url))
  }

  // Get the user's entry
  const { data: entry } = await supabase
    .from('finals_entries')
    .select('id, is_active')
    .eq('competition_id', competition_id)
    .eq('user_id', user.id)
    .single()

  if (!entry) {
    return NextResponse.redirect(new URL('/finals?error=no_entry', req.url))
  }

  if (!entry.is_active) {
    return NextResponse.redirect(new URL('/finals?error=not_active', req.url))
  }

  // Check week is not locked
  const { data: weekRow } = await supabase
    .from('finals_weeks')
    .select('locked')
    .eq('competition_id', competition_id)
    .eq('finals_week', finals_week)
    .single()

  if (weekRow?.locked) {
    return NextResponse.redirect(new URL('/finals?error=week_locked', req.url))
  }

  // Upsert tip
  const { error } = await supabase
    .from('finals_tips')
    .upsert(
      { entry_id: entry.id, finals_week, team_id, margin },
      { onConflict: 'entry_id,finals_week' }
    )

  if (error) {
    console.error('Finals tip error:', error)
    return NextResponse.redirect(new URL('/finals?error=tip_save_failed', req.url))
  }

  return NextResponse.redirect(new URL('/finals?saved=1', req.url))
}
