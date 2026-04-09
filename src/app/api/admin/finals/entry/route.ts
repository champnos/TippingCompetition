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
    return NextResponse.redirect(new URL('/admin/finals?error=missing_fields', req.url))
  }

  const { error } = await supabase
    .from('finals_entries')
    .insert({
      competition_id,
      user_id,
      total_paid: payment_amount || 0,
    })

  if (error) {
    console.error('Finals entry error:', error)
    return NextResponse.redirect(new URL('/admin/finals?error=entry_save_failed', req.url))
  }

  // Auto-debit entry fee
  try {
    const { data: comp } = await supabase
      .from('competitions')
      .select('entry_fee, name')
      .eq('id', competition_id)
      .single()

    if (comp && Number(comp.entry_fee) > 0) {
      const { data: txType } = await supabase
        .from('transaction_types')
        .select('id')
        .eq('name', 'Entry Fee')
        .single()

      if (txType) {
        const { error: txError } = await supabase.from('transactions').insert({
          profile_id: user_id,
          competition_id,
          type_id: txType.id,
          amount: -Number(comp.entry_fee),
          notes: `Entry fee — ${comp.name}`,
          created_by: user.id,
        })
        if (txError) console.error('Entry fee transaction error:', txError)
      }
    }
  } catch (txErr) {
    console.error('Entry fee transaction error:', txErr)
  }

  return NextResponse.redirect(new URL('/admin/finals', req.url))
}
