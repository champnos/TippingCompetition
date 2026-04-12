import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const formData = await req.formData()
  const competition_id = Number(formData.get('competition_id'))
  const round_id = Number(formData.get('round_id'))
  const team_id = Number(formData.get('team_id'))

  if (!competition_id || !round_id || !team_id) {
    return NextResponse.redirect(new URL('/precision?error=missing_fields', req.url))
  }

  // Get the user's entry
  const { data: entry } = await supabase
    .from('precision_entries')
    .select('id, is_active')
    .eq('competition_id', competition_id)
    .eq('user_id', user.id)
    .single()

  if (!entry) {
    return NextResponse.redirect(new URL('/precision?error=no_entry', req.url))
  }

  // Check round is not locked
  const { data: round } = await supabase
    .from('rounds')
    .select('id, locked')
    .eq('id', round_id)
    .single()

  if (!round) {
    return NextResponse.redirect(new URL('/precision?error=round_not_found', req.url))
  }

  if (round.locked) {
    return NextResponse.redirect(new URL('/precision?error=round_locked', req.url))
  }

  // Check this team has not been previously used by this entry in any round
  const { data: priorTips } = await supabase
    .from('precision_tips')
    .select('id, round_id')
    .eq('entry_id', entry.id)
    .eq('team_id', team_id)

  // Allow the same tip in the same round (update), but not in a different round
  const conflictInOtherRound = (priorTips ?? []).some((t) => t.round_id !== round_id)
  if (conflictInOtherRound) {
    return NextResponse.redirect(new URL('/precision?error=team_already_used', req.url))
  }

  // Upsert tip
  const { error } = await supabase
    .from('precision_tips')
    .upsert(
      { entry_id: entry.id, round_id, team_id, result: 'pending' },
      { onConflict: 'entry_id,round_id' }
    )

  if (error) {
    console.error('Precision tip error:', error)
    return NextResponse.redirect(new URL('/precision?error=tip_save_failed', req.url))
  }

  return NextResponse.redirect(new URL('/precision?saved=1', req.url))
}
