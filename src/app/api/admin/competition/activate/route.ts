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

  // Deactivate all competitions first
  await supabase.from('competitions').update({ is_active: false }).neq('id', 0)

  // Activate the selected one
  const { error } = await supabase.from('competitions').update({ is_active: true }).eq('id', id)

  if (error) return NextResponse.redirect(new URL('/admin?error=activate', req.url))
  return NextResponse.redirect(new URL('/admin', req.url))
}
