import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const formData = await req.formData()
  const entry_id = Number(formData.get('entry_id'))
  const finals_round = formData.get('finals_round') as string
  const team_id = formData.get('team_id') ? Number(formData.get('team_id')) : null
  const predicted_margin = formData.get('predicted_margin') ? Number(formData.get('predicted_margin')) : null

  if (!entry_id || !finals_round || !team_id || predicted_margin === null) {
    return NextResponse.redirect(new URL('/knockout?error=missing_fields', req.url))
  }

  // Verify entry belongs to the user and is finals_active
  const { data: entry } = await supabase
    .from('knockout_entries')
    .select('id, user_id, finals_active, competition_id')
    .eq('id', entry_id)
    .single()

  if (!entry || entry.user_id !== user.id) {
    return NextResponse.redirect(new URL('/knockout?error=not_owner', req.url))
  }

  if (!entry.finals_active) {
    return NextResponse.redirect(new URL('/knockout?error=not_finals_active', req.url))
  }

  // Verify the finals round is open for this competition
  const { data: config } = await supabase
    .from('knockout_finals_config')
    .select('is_open')
    .eq('competition_id', entry.competition_id)
    .eq('finals_round', finals_round)
    .single()

  if (!config?.is_open) {
    return NextResponse.redirect(new URL('/knockout?error=finals_round_not_open', req.url))
  }

  // Upsert the finals tip
  const { error: tipError } = await supabase
    .from('knockout_finals_tips')
    .upsert(
      {
        entry_id,
        finals_round,
        team_id,
        predicted_margin,
        result: 'pending',
        eliminated: false,
      },
      { onConflict: 'entry_id,finals_round' }
    )

  if (tipError) {
    console.error('Finals tip error:', tipError)
    return NextResponse.redirect(new URL('/knockout?error=tip_save_failed', req.url))
  }

  return NextResponse.redirect(new URL('/knockout', req.url))
}
