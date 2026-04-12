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
  const entry_id = Number(formData.get('entry_id'))
  const finals_week = Number(formData.get('finals_week'))

  if (!entry_id || entry_id <= 0 || !finals_week || finals_week < 1 || finals_week > 4) {
    return NextResponse.redirect(new URL('/admin/finals?error=eliminate_failed', req.url))
  }

  const { error } = await supabase
    .from('finals_entries')
    .update({ is_active: false, eliminated_week: finals_week })
    .eq('id', entry_id)

  if (error) {
    console.error('Finals eliminate error:', error)
    return NextResponse.redirect(new URL('/admin/finals?error=eliminate_failed', req.url))
  }

  return NextResponse.redirect(new URL('/admin/finals?eliminated=1', req.url))
}
