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

  if (!competition_id) {
    return NextResponse.redirect(new URL('/admin/knockout?error=missing_fields', req.url))
  }

  // Activate finals for all currently active entries in this competition
  const { error } = await supabase
    .from('knockout_entries')
    .update({ finals_active: true })
    .eq('competition_id', competition_id)
    .eq('is_active', true)

  if (error) {
    console.error('Activate finals error:', error)
    return NextResponse.redirect(new URL('/admin/knockout?error=activate_finals_failed', req.url))
  }

  return NextResponse.redirect(new URL('/admin/knockout?finals_activated=1', req.url))
}
