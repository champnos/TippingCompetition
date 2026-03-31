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
    return NextResponse.redirect(new URL('/admin/long-haul?error=missing_fields', req.url))
  }

  const { error } = await supabase
    .from('long_haul_entries')
    .update({ is_locked: true })
    .eq('competition_id', competition_id)

  if (error) {
    console.error('Lock entries error:', error)
    return NextResponse.redirect(new URL('/admin/long-haul?error=lock_failed', req.url))
  }

  return NextResponse.redirect(new URL('/admin/long-haul?locked=1', req.url))
}
