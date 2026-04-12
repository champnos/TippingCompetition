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
  const finals_round = formData.get('finals_round') as string
  const winner_team_id = Number(formData.get('winner_team_id'))
  const actual_margin = Number(formData.get('actual_margin'))

  if (!competition_id || !finals_round || !winner_team_id || isNaN(actual_margin)) {
    return NextResponse.redirect(new URL('/admin/knockout?error=missing_fields', req.url))
  }

  // Get config for cut line
  const { data: config } = await supabase
    .from('knockout_finals_config')
    .select('cut_line')
    .eq('competition_id', competition_id)
    .eq('finals_round', finals_round)
    .single()

  const cut_line = config?.cut_line ?? null

  // Get all tips for this round where the entry is finals_active
  const { data: tips } = await supabase
    .from('knockout_finals_tips')
    .select(`
      id, entry_id, team_id, predicted_margin,
      knockout_entries!inner(id, finals_active, competition_id)
    `)
    .eq('finals_round', finals_round)
    .eq('knockout_entries.finals_active', true)
    .eq('knockout_entries.competition_id', competition_id)

  if (!tips || tips.length === 0) {
    return NextResponse.redirect(new URL('/admin/knockout?info=no_finals_tips', req.url))
  }

  type FinalsTypedTip = {
    id: number
    entry_id: number
    team_id: number | null
    predicted_margin: number | null
    knockout_entries: {
      id: number
      finals_active: boolean
      competition_id: number
    }
  }

  const typedTips = tips as unknown as FinalsTypedTip[]

  // Process each tip
  const winners: Array<{ tip_id: number; entry_id: number; margin_error: number }> = []
  const losers: Array<{ tip_id: number; entry_id: number }> = []

  for (const tip of typedTips) {
    const pickedWinner = tip.team_id === winner_team_id
    // Positive margin if tipped team won, negative if they lost
    const teamPerspectiveMargin = pickedWinner ? actual_margin : -actual_margin
    const predicted = tip.predicted_margin ?? 0
    const margin_error = Math.abs(predicted - teamPerspectiveMargin)
    const result = pickedWinner ? 'win' : 'loss'

    // Update the tip
    await supabase
      .from('knockout_finals_tips')
      .update({ actual_margin: teamPerspectiveMargin, margin_error, result })
      .eq('id', tip.id)

    if (result === 'win') {
      winners.push({ tip_id: tip.id, entry_id: tip.entry_id, margin_error })
    } else {
      losers.push({ tip_id: tip.id, entry_id: tip.entry_id })
    }
  }

  // Eliminate all losers
  for (const loser of losers) {
    await supabase
      .from('knockout_finals_tips')
      .update({ eliminated: true })
      .eq('id', loser.tip_id)

    await supabase
      .from('knockout_entries')
      .update({ finals_active: false, finals_eliminated_round: finals_round })
      .eq('id', loser.entry_id)
  }

  if (finals_round === 'GF') {
    // GF: among winners, keep those with minimum margin_error (ties all survive for prize split)
    if (winners.length > 0) {
      const minError = Math.min(...winners.map((w) => w.margin_error))
      for (const winner of winners) {
        if (winner.margin_error > minError) {
          await supabase
            .from('knockout_finals_tips')
            .update({ eliminated: true })
            .eq('id', winner.tip_id)

          await supabase
            .from('knockout_entries')
            .update({ finals_active: false, finals_eliminated_round: finals_round })
            .eq('id', winner.entry_id)
        }
      }
    }
  } else {
    // QF/SF/PF: keep top cut_line winners by margin_error ascending; eliminate the rest
    if (cut_line !== null && winners.length > 0) {
      const sorted = [...winners].sort((a, b) => a.margin_error - b.margin_error)
      const toEliminate = sorted.slice(cut_line)
      for (const w of toEliminate) {
        await supabase
          .from('knockout_finals_tips')
          .update({ eliminated: true })
          .eq('id', w.tip_id)

        await supabase
          .from('knockout_entries')
          .update({ finals_active: false, finals_eliminated_round: finals_round })
          .eq('id', w.entry_id)
      }
    }
  }

  // Store actual_margin and winner on config, close round
  await supabase
    .from('knockout_finals_config')
    .update({ actual_margin, winner_team_id, is_open: false })
    .eq('competition_id', competition_id)
    .eq('finals_round', finals_round)

  return NextResponse.redirect(new URL('/admin/knockout?finals_processed=1', req.url))
}
