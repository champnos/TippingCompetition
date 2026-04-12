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
  const id = Number(formData.get('id'))
  const name = (formData.get('name') as string | null)?.trim() ?? ''
  const entry_fee = formData.get('entry_fee') ? Number(formData.get('entry_fee')) : null

  if (isNaN(id) || id < 1 || !name) return NextResponse.redirect(new URL('/admin?error=comp_update_failed', req.url))

  const { error } = await supabase
    .from('competitions')
    .update({ name, entry_fee })
    .eq('id', id)

  if (error) return NextResponse.redirect(new URL('/admin?error=comp_update_failed', req.url))
  return NextResponse.redirect(new URL('/admin?comp_updated=1', req.url))
}
