import { createClient } from '@/lib/supabase/server'
import { insertEntryFeeTransaction } from '@/lib/transactions'
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
  const action = formData.get('action') as string

  if (!competition_id || !user_id || !action) {
    return NextResponse.redirect(new URL('/admin/knockout?error=missing_fields', req.url))
  }

  if (action === 'new') {
    const { error } = await supabase
      .from('knockout_entries')
      .insert({
        competition_id,
        user_id,
        is_active: true,
        total_paid: payment_amount || 0,
      })

    if (error) {
      console.error('New entry error:', error)
      return NextResponse.redirect(new URL('/admin/knockout?error=entry_save_failed', req.url))
    }

    // Auto-debit entry fee for new entries
    await insertEntryFeeTransaction(supabase, { user_id, competition_id, created_by: user.id })
  } else if (action === 'buyin') {
    // Get the existing entry
    const { data: existingEntry } = await supabase
      .from('knockout_entries')
      .select('id, total_paid')
      .eq('competition_id', competition_id)
      .eq('user_id', user_id)
      .single()

    if (!existingEntry) {
      return NextResponse.redirect(new URL('/admin/knockout?error=entry_not_found', req.url))
    }

    const { error } = await supabase
      .from('knockout_entries')
      .update({
        is_active: true,
        eliminated_round: null,
        total_paid: Number(existingEntry.total_paid) + (payment_amount || 0),
      })
      .eq('id', existingEntry.id)

    if (error) {
      console.error('Buy-in error:', error)
      return NextResponse.redirect(new URL('/admin/knockout?error=buyin_save_failed', req.url))
    }
  } else {
    return NextResponse.redirect(new URL('/admin/knockout?error=invalid_action', req.url))
  }

  return NextResponse.redirect(new URL('/admin/knockout', req.url))
}
