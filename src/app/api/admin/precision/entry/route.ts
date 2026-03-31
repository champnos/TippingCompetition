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
  const user_id = formData.get('user_id') as string
  const payment_amount = Number(formData.get('payment_amount'))

  if (!competition_id || !user_id) {
    return NextResponse.redirect(new URL('/admin/precision?error=missing_fields', req.url))
  }

  const { error } = await supabase
    .from('precision_entries')
    .insert({
      competition_id,
      user_id,
      total_paid: payment_amount || 0,
    })

  if (error) {
    console.error('Precision entry error:', error)
    return NextResponse.redirect(new URL('/admin/precision?error=entry_save_failed', req.url))
  }

  return NextResponse.redirect(new URL('/admin/precision', req.url))
}
