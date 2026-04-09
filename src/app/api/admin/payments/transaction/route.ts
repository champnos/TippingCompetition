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
  const profile_id = formData.get('profile_id') as string
  const amount = Number(formData.get('amount'))
  const type_name = formData.get('type_name') as string
  const notes = (formData.get('notes') as string) || null
  const competition_id = formData.get('competition_id') ? Number(formData.get('competition_id')) : null

  if (!profile_id || isNaN(amount) || !type_name) {
    return NextResponse.redirect(new URL('/admin/payments?error=1', req.url))
  }

  const { data: txType } = await supabase
    .from('transaction_types')
    .select('id')
    .eq('name', type_name)
    .single()

  if (!txType) {
    return NextResponse.redirect(new URL('/admin/payments?error=1', req.url))
  }

  const { error } = await supabase.from('transactions').insert({
    profile_id,
    competition_id: competition_id || null,
    type_id: txType.id,
    amount,
    notes,
    created_by: user.id,
  })

  if (error) {
    console.error('Transaction insert error:', error)
    return NextResponse.redirect(new URL('/admin/payments?error=1', req.url))
  }

  return NextResponse.redirect(new URL('/admin/payments?success=1', req.url))
}
