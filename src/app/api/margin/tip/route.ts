import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const formData = await req.formData()
  const competition_id = Number(formData.get('competition_id'))
  const round_id = Number(formData.get('round_id'))

  if (!competition_id || !round_id) {
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

  // Collect all tip_<game_id> fields
  const tips: { entry_id: number; game_id: number; round_id: number; team_id: number }[] = []

  for (const [key, value] of formData.entries()) {
    if (key.startsWith('tip_')) {
      const game_id = Number(key.replace('tip_', ''))
      const team_id = Number(value)
      if (game_id && team_id) {
        tips.push({ entry_id: entry.id, game_id, round_id, team_id })
      }
    }
  }

  if (tips.length > 0) {
    const { error } = await supabase
      .from('margin_tips')
      .upsert(tips, { onConflict: 'entry_id,game_id' })

    if (error) {
      console.error('Margin tips upsert error:', error)
      return NextResponse.redirect(new URL('/margin?error=tips_save_failed', req.url))
    }
  }

  return NextResponse.redirect(new URL('/margin?saved=1', req.url))
}
