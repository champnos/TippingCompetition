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

  if (!competition_id || !finals_week) {
    return NextResponse.redirect(new URL('/admin/finals?error=missing_fields', req.url))
  }

  const { error } = await supabase
    .from('finals_weeks')
    .upsert(
      { competition_id, finals_week, locked: true },
      { onConflict: 'competition_id,finals_week' }
    )

  if (error) {
    console.error('Finals lock error:', error)
    return NextResponse.redirect(new URL('/admin/finals?error=lock_failed', req.url))
  }

  return NextResponse.redirect(new URL('/admin/finals?locked=1', req.url))
}
