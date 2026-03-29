import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const formData = await req.formData()
  const competition_id = Number(formData.get('competition_id'))

  // Collect all tip_<game_id> fields
  const tips: { profile_id: string; competition_id: number; game_id: number; picked_team_id: number }[] = []
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('tip_')) {
      const game_id = Number(key.replace('tip_', ''))
      const picked_team_id = Number(value)
      if (game_id && picked_team_id) {
        tips.push({ profile_id: user.id, competition_id, game_id, picked_team_id })
      }
    }
  }

  if (tips.length > 0) {
    const { error } = await supabase
      .from('tips')
      .upsert(tips, { onConflict: 'profile_id,competition_id,game_id' })

    if (error) {
      return NextResponse.redirect(new URL('/tips?error=save_failed', req.url))
    }
  }

  return NextResponse.redirect(new URL('/tips?saved=1', req.url))
}