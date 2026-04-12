import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const formData = await req.formData()
  const competition_id = Number(formData.get('competition_id'))
  const round_id = Number(formData.get('round_id'))
  const game_id = Number(formData.get('game_id'))
  const team_id = Number(formData.get('team_id'))
  const predicted_margin = Number(formData.get('predicted_margin'))

  if (!competition_id || !round_id || !game_id || !team_id || isNaN(predicted_margin) || predicted_margin < 0) {
    return NextResponse.redirect(new URL('/margin?error=missing_fields', req.url))
  }

  // Verify round is not locked
  const { data: round } = await supabase
    .from('rounds')
    .select('id, locked')
    .eq('id', round_id)
    .single()

  if (!round) {
    return NextResponse.redirect(new URL('/margin?error=missing_fields', req.url))
  }
  if (round.locked) {
    return NextResponse.redirect(new URL('/margin?error=round_locked', req.url))
  }

  // Verify user has an entry in this competition
  const { data: entry } = await supabase
    .from('margin_entries')
    .select('id')
    .eq('competition_id', competition_id)
    .eq('user_id', user.id)
    .single()

  if (!entry) {
    return NextResponse.redirect(new URL('/margin?error=no_entry', req.url))
  }

  // Delete any existing tip for this entry+round (one tip per round rule)
  await supabase
    .from('margin_tips')
    .delete()
    .eq('entry_id', entry.id)
    .eq('round_id', round_id)

  // Insert the new tip
  const { error } = await supabase
    .from('margin_tips')
    .insert({
      entry_id: entry.id,
      game_id,
      round_id,
      team_id,
      predicted_margin,
    })

  if (error) {
    console.error('Margin tip insert error:', error)
    return NextResponse.redirect(new URL('/margin?error=tips_save_failed', req.url))
  }

  return NextResponse.redirect(new URL('/margin?saved=1', req.url))
}
