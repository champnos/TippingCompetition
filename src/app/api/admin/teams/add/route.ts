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
  const name = (formData.get('name') as string)?.trim()
  const short_name = (formData.get('short_name') as string)?.trim() || null
  const abbreviation = (formData.get('abbreviation') as string)?.trim() || null
  const state = (formData.get('state') as string)?.trim() || null

  if (!name) {
    return NextResponse.redirect(new URL('/admin/teams?error=missing_name', req.url))
  }

  const { error } = await supabase
    .from('teams')
    .insert({ name, short_name, abbreviation, state })

  if (error) {
    console.error('Add team error:', error)
    return NextResponse.redirect(new URL('/admin/teams?error=save_failed', req.url))
  }

  return NextResponse.redirect(new URL('/admin/teams?added=1', req.url))
}
