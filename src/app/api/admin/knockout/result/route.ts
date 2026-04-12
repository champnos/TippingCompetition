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
  const round_id = Number(formData.get('round_id'))
  const competition_id = Number(formData.get('competition_id'))

  if (!round_id || !competition_id) {
    return NextResponse.redirect(new URL('/admin/knockout?error=missing_fields', req.url))
  }

  // Get the round details
  const { data: round } = await supabase
    .from('rounds')
    .select('id, round_number, season_id')
    .eq('id', round_id)
    .single()

  if (!round) {
    return NextResponse.redirect(new URL('/admin/knockout?error=round_not_found', req.url))
  }

  // Get all pending knockout tips for this round, joined with entry info
  const { data: tips } = await supabase
    .from('knockout_tips')
    .select(`
      id, entry_id, team_id, got_my_back_team_id, got_my_back_activated, result, free_pass_used,
      knockout_entries!inner(id, is_active, got_my_back_used, competition_id)
    `)
    .eq('round_id', round_id)
    .eq('result', 'pending')

  if (!tips || tips.length === 0) {
    return NextResponse.redirect(new URL('/admin/knockout?info=no_pending_tips', req.url))
  }

  type TipWithEntry = {
    id: number
    entry_id: number
    team_id: number
    got_my_back_team_id: number | null
    got_my_back_activated: boolean
    result: string | null
    free_pass_used: boolean
    knockout_entries: {
      id: number
      is_active: boolean
      got_my_back_used: boolean
      competition_id: number
    }
  }

  const typedTips = tips as unknown as TipWithEntry[]

  // Filter tips to this competition only
  const compTips = typedTips.filter((t) => t.knockout_entries.competition_id === competition_id)

  // Get all games in this round
  const { data: games } = await supabase
    .from('games')
    .select('id, home_team_id, away_team_id, winner_team_id, home_score, away_score')
    .eq('round_id', round_id)

  if (!games) {
    return NextResponse.redirect(new URL('/admin/knockout?error=no_games', req.url))
  }

  // Process each tip
  for (const tip of compTips) {
    const game = games.find(
      (g) => g.home_team_id === tip.team_id || g.away_team_id === tip.team_id
    )

    if (!game) continue

    let result: 'win' | 'loss' | 'draw' = 'loss'

    if (game.winner_team_id === tip.team_id) {
      result = 'win'
    } else if (game.home_score !== null && game.away_score !== null && game.home_score === game.away_score) {
      result = 'draw'
    } else if (game.winner_team_id && game.winner_team_id !== tip.team_id) {
      // Primary pick lost — check Got My Back
      if (
        tip.got_my_back_team_id &&
        !tip.got_my_back_activated &&
        !tip.knockout_entries.got_my_back_used
      ) {
        const gmbGame = games.find(
          (g) => g.home_team_id === tip.got_my_back_team_id || g.away_team_id === tip.got_my_back_team_id
        )
        if (gmbGame && gmbGame.winner_team_id === tip.got_my_back_team_id) {
          result = 'win'
          // Activate got my back
          await supabase
            .from('knockout_tips')
            .update({ got_my_back_activated: true })
            .eq('id', tip.id)
          // Mark got my back as used on the entry
          await supabase
            .from('knockout_entries')
            .update({ got_my_back_used: true })
            .eq('id', tip.entry_id)
        } else {
          result = 'loss'
        }
      } else {
        result = 'loss'
      }
    }

    // Update tip result
    await supabase
      .from('knockout_tips')
      .update({ result })
      .eq('id', tip.id)

    // Eliminate entry on loss or draw (per rule 5a: draws result in elimination)
    // Free pass survives one loss/draw if used on this tip
    if (result === 'loss' || result === 'draw') {
      if (tip.free_pass_used) {
        // Free pass consumed — user survives this round
      } else {
        await supabase
          .from('knockout_entries')
          .update({ is_active: false, eliminated_round: round.round_number })
          .eq('id', tip.entry_id)
      }
    }
  }

  // If this was round 11, award free pass to all still-active entries in this competition
  if (round.round_number === 11) {
    const { data: activeEntries } = await supabase
      .from('knockout_entries')
      .select('id')
      .eq('competition_id', competition_id)
      .eq('is_active', true)

    if (activeEntries && activeEntries.length > 0) {
      await supabase
        .from('knockout_entries')
        .update({ free_pass_available: true })
        .in('id', activeEntries.map((e) => e.id))
    }
  }

  // If this was round 18, expire any free passes that were not used
  if (round.round_number === 18) {
    await supabase
      .from('knockout_entries')
      .update({ free_pass_available: false })
      .eq('competition_id', competition_id)
      .eq('free_pass_available', true)
      .eq('free_pass_used', false)
  }

  return NextResponse.redirect(new URL('/admin/knockout?processed=1', req.url))
}
