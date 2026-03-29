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
  const name = formData.get('name') as string
  const season_id = Number(formData.get('season_id'))
  const entry_fee = formData.get('entry_fee') ? Number(formData.get('entry_fee')) : null

  const { error } = await supabase.from('competitions').insert({
    name,
    season_id,
    entry_fee,
    is_active: false,
  })

  if (error) return NextResponse.redirect(new URL('/admin?error=competition', req.url))
  return NextResponse.redirect(new URL('/admin', req.url))
}
