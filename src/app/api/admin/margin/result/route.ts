import { createClient } from '@/lib/supabase/server'
import { marginMultiplier } from '@/lib/margin'
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
    return NextResponse.redirect(new URL('/admin/margin?error=missing_fields', req.url))
  }

  // Get round details
  const { data: round } = await supabase
    .from('rounds')
    .select('id, round_number')
    .eq('id', round_id)
    .single()

  if (!round) {
    return NextResponse.redirect(new URL('/admin/margin?error=round_not_found', req.url))
  }

  const multiplier = marginMultiplier(round.round_number)

  // Get all games in this round with scores
  const { data: games } = await supabase
    .from('games')
    .select('id, home_team_id, away_team_id, winner_team_id, home_score, away_score')
    .eq('round_id', round_id)

  if (!games || games.length === 0) {
    return NextResponse.redirect(new URL('/admin/margin?error=no_games', req.url))
  }

  // Get all entries for this competition
  const { data: entriesData } = await supabase
    .from('margin_entries')
    .select('id')
    .eq('competition_id', competition_id)

  const entries = entriesData ?? []

  if (entries.length === 0) {
    return NextResponse.redirect(new URL('/admin/margin?info=no_entries', req.url))
  }

  const entryIds = entries.map((e) => e.id)

  // Get all existing margin_tips for this round in this competition
  const { data: tipsData } = await supabase
    .from('margin_tips')
    .select(`
      id, entry_id, game_id, team_id,
      margin_entries!inner(id, competition_id)
    `)
    .eq('round_id', round_id)
    .in('entry_id', entryIds)

  type TipWithEntry = {
    id: number
    entry_id: number
    game_id: number
    team_id: number | null
    margin_entries: { id: number; competition_id: number }
  }

  const compTips = (tipsData ?? []) as unknown as TipWithEntry[]

  // Process each game
  for (const game of games) {
    // Skip games without scores
    if (game.home_score === null || game.away_score === null) continue

    const actualMargin = Math.abs(game.home_score - game.away_score)
    const isDraw = game.home_score === game.away_score

    // Update existing tips for this game
    const gameTips = compTips.filter((t) => t.game_id === game.id)
    const tippedEntryIds = new Set(gameTips.map((t) => t.entry_id))

    // Collect updates for existing tips in this game
    const tipUpdates: Promise<void>[] = []
    for (const tip of gameTips) {
      let raw_score: number
      let result: string
      let final_score: number

      if (isDraw) {
        raw_score = 0
        result = 'draw'
        final_score = 0
      } else if (game.winner_team_id === tip.team_id) {
        raw_score = actualMargin
        result = 'win'
        final_score = raw_score * multiplier
      } else {
        raw_score = -actualMargin
        result = 'loss'
        final_score = raw_score * multiplier
      }

      // eslint-disable-next-line no-loop-func
      tipUpdates.push(
        (async () => {
          await supabase
            .from('margin_tips')
            .update({ raw_score, multiplier, final_score, result })
            .eq('id', tip.id)
        })()
      )
    }
    await Promise.all(tipUpdates)

    // Insert no_tip records for entries that didn't tip this game
    const noTipEntries = entryIds.filter((id) => !tippedEntryIds.has(id))
    if (noTipEntries.length > 0) {
      const noTipRows = noTipEntries.map((entry_id) => ({
        entry_id,
        game_id: game.id,
        round_id,
        team_id: null,
        raw_score: null,
        multiplier,
        final_score: -50,
        result: 'no_tip',
      }))

      // Upsert in case partial inserts were done before
      await supabase
        .from('margin_tips')
        .upsert(noTipRows, { onConflict: 'entry_id,game_id' })
    }
  }

  // Recalculate total_score for all entries in this competition in a single query
  const { data: allScoredTips } = await supabase
    .from('margin_tips')
    .select('entry_id, final_score')
    .in('entry_id', entryIds)
    .not('final_score', 'is', null)

  // Group totals by entry_id in application code
  const totalByEntry = new Map<number, number>()
  for (const t of allScoredTips ?? []) {
    totalByEntry.set(t.entry_id, (totalByEntry.get(t.entry_id) ?? 0) + Number(t.final_score))
  }

  const entryUpdates: Promise<void>[] = entries.map((entry) =>
    (async () => {
      await supabase
        .from('margin_entries')
        .update({ total_score: totalByEntry.get(entry.id) ?? 0 })
        .eq('id', entry.id)
    })()
  )
  await Promise.all(entryUpdates)

  return NextResponse.redirect(new URL('/admin/margin?processed=1', req.url))
}
