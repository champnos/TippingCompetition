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
    return NextResponse.redirect(new URL('/admin/precision?error=missing_fields', req.url))
  }

  // Get round details
  const { data: round } = await supabase
    .from('rounds')
    .select('id, round_number, season_id')
    .eq('id', round_id)
    .single()

  if (!round) {
    return NextResponse.redirect(new URL('/admin/precision?error=round_not_found', req.url))
  }

  // Get all games in this round with results
  const { data: games } = await supabase
    .from('games')
    .select('id, home_team_id, away_team_id, winner_team_id, home_score, away_score')
    .eq('round_id', round_id)

  if (!games || games.length === 0) {
    return NextResponse.redirect(new URL('/admin/precision?error=no_games', req.url))
  }

  // Get all active entries for this competition
  const { data: entriesData } = await supabase
    .from('precision_entries')
    .select('id, user_id')
    .eq('competition_id', competition_id)
    .eq('is_active', true)

  const entries = entriesData ?? []

  if (entries.length === 0) {
    return NextResponse.redirect(new URL('/admin/precision?info=no_active_entries', req.url))
  }

  // Get all teams so we can count them (for exhaustion check)
  const { data: allTeams } = await supabase.from('teams').select('id')
  const totalTeams = (allTeams ?? []).length

  // Get all prior precision_tips for these entries (across all rounds) to check team exhaustion
  const entryIds = entries.map((e) => e.id)

  const { data: allPriorTipsData } = await supabase
    .from('precision_tips')
    .select('entry_id, team_id, round_id')
    .in('entry_id', entryIds)

  const allPriorTips = allPriorTipsData ?? []

  // Get tips submitted for this specific round
  const { data: roundTipsData } = await supabase
    .from('precision_tips')
    .select('id, entry_id, team_id, result')
    .eq('round_id', round_id)
    .in('entry_id', entryIds)

  const roundTips = roundTipsData ?? []
  const tippedEntryIds = new Set(roundTips.map((t) => t.entry_id))

  // Process each active entry
  for (const entry of entries) {
    // Count teams used prior to this round (excluding this round)
    const teamsUsedBeforeThisRound = new Set(
      allPriorTips
        .filter((t) => t.entry_id === entry.id && t.round_id !== round_id && t.team_id !== null)
        .map((t) => t.team_id)
    )

    const tip = roundTips.find((t) => t.entry_id === entry.id)

    // No tip submitted — eliminate
    if (!tippedEntryIds.has(entry.id) || !tip?.team_id) {
      await supabase
        .from('precision_tips')
        .upsert(
          { entry_id: entry.id, round_id, team_id: null, result: 'no_tip' },
          { onConflict: 'entry_id,round_id' }
        )
      await supabase
        .from('precision_entries')
        .update({ is_active: false, eliminated_round: round.round_number })
        .eq('id', entry.id)
      continue
    }

    // Check if team exhausted — all teams were already used before this round
    if (teamsUsedBeforeThisRound.size >= totalTeams) {
      // All teams exhausted — eliminate
      await supabase
        .from('precision_tips')
        .update({ result: 'no_tip' })
        .eq('id', tip.id)
      await supabase
        .from('precision_entries')
        .update({ is_active: false, eliminated_round: round.round_number })
        .eq('id', entry.id)
      continue
    }

    // Find the game for the picked team in this round
    const game = games.find(
      (g) => g.home_team_id === tip.team_id || g.away_team_id === tip.team_id
    )

    if (!game || game.home_score === null || game.away_score === null) {
      // Game not yet played or team not in this round — skip (leave as pending)
      continue
    }

    const isDraw = game.home_score === game.away_score
    let result: 'win' | 'loss' | 'draw'

    if (isDraw) {
      result = 'draw'
    } else if (game.winner_team_id === tip.team_id) {
      result = 'win'
    } else {
      result = 'loss'
    }

    // Update the tip result
    await supabase
      .from('precision_tips')
      .update({ result })
      .eq('id', tip.id)

    // Eliminate on loss or draw
    if (result === 'loss' || result === 'draw') {
      await supabase
        .from('precision_entries')
        .update({ is_active: false, eliminated_round: round.round_number })
        .eq('id', entry.id)
    }

    // Auto-eliminate after round 18 (anyone still active after max round is paid out)
    if (round.round_number >= 18 && result === 'win') {
      await supabase
        .from('precision_entries')
        .update({ is_active: false, eliminated_round: round.round_number })
        .eq('id', entry.id)
    }
  }

  return NextResponse.redirect(new URL('/admin/precision?processed=1', req.url))
}
