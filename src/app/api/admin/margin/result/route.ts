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

  // Build a lookup of game results by game_id
  type GameResult = {
    id: number
    home_team_id: number
    away_team_id: number
    winner_team_id: number | null
    home_score: number | null
    away_score: number | null
  }
  const gameById = new Map<number, GameResult>()
  for (const g of games as GameResult[]) {
    gameById.set(g.id, g)
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

  // Get all existing margin_tips for this round
  const { data: tipsData } = await supabase
    .from('margin_tips')
    .select('id, entry_id, game_id, team_id')
    .eq('round_id', round_id)
    .in('entry_id', entryIds)

  type TipRow = {
    id: number
    entry_id: number
    game_id: number
    team_id: number | null
  }

  const tips = (tipsData ?? []) as TipRow[]

  // Group tips by entry_id
  const tipsByEntry = new Map<number, TipRow[]>()
  for (const tip of tips) {
    if (!tipsByEntry.has(tip.entry_id)) tipsByEntry.set(tip.entry_id, [])
    tipsByEntry.get(tip.entry_id)!.push(tip)
  }

  // Score each tip and handle no-tip penalty
  const tipUpdates: Promise<void>[] = []
  const roundScoreByEntry = new Map<number, number>()
  const correctCountByEntry = new Map<number, number>()

  for (const entry of entries) {
    const entryTips = tipsByEntry.get(entry.id) ?? []

    if (entryTips.length === 0) {
      // No tips submitted for the round — flat -50 penalty (no multiplier)
      roundScoreByEntry.set(entry.id, -50)

      // Insert a no_tip sentinel row using the first game in the round
      const firstGameId = games[0].id
      tipUpdates.push(
        (async () => {
          await supabase
            .from('margin_tips')
            .upsert(
              {
                entry_id: entry.id,
                game_id: firstGameId,
                round_id,
                team_id: null,
                raw_score: -50,
                multiplier: 1,
                final_score: -50,
                result: 'no_tip',
              },
              { onConflict: 'entry_id,game_id' }
            )
        })()
      )
    } else {
      // Calculate base_round_score from all tipped games
      let base_round_score = 0
      let correctTips = 0

      for (const tip of entryTips) {
        const game = gameById.get(tip.game_id)

        // Skip if game has no scores yet
        if (!game || game.home_score === null || game.away_score === null) continue

        const marginDiff = Math.abs(game.home_score - game.away_score)
        const isDraw = game.home_score === game.away_score

        let raw_score: number
        let result: string

        if (isDraw) {
          raw_score = 0
          result = 'draw'
        } else if (game.winner_team_id === tip.team_id) {
          // Picked team won — positive margin
          raw_score = marginDiff
          result = 'win'
          correctTips++
        } else {
          // Picked team lost — negative margin
          raw_score = -marginDiff
          result = 'loss'
        }

        const final_score = raw_score * multiplier
        base_round_score += raw_score

        // eslint-disable-next-line no-loop-func
        tipUpdates.push(
          (async (t, rs, fs, r) => {
            await supabase
              .from('margin_tips')
              .update({
                raw_score: rs,
                multiplier,
                final_score: fs,
                result: r,
              })
              .eq('id', t.id)
          })(tip, raw_score, final_score, result)
        )
      }

      roundScoreByEntry.set(entry.id, base_round_score * multiplier)
      correctCountByEntry.set(entry.id, correctTips)
    }
  }

  await Promise.all(tipUpdates)

  // Recalculate total_score and correct_tips_count for all entries from all scored tips
  const { data: allScoredTips } = await supabase
    .from('margin_tips')
    .select('entry_id, final_score, result')
    .in('entry_id', entryIds)
    .not('result', 'is', null)
    .neq('result', 'pending')

  const totalByEntry = new Map<number, number>()
  const totalCorrectByEntry = new Map<number, number>()

  for (const t of allScoredTips ?? []) {
    if (t.result === 'no_tip') {
      // no_tip row carries the -50 flat penalty
      totalByEntry.set(t.entry_id, (totalByEntry.get(t.entry_id) ?? 0) + Number(t.final_score ?? 0))
    } else {
      totalByEntry.set(t.entry_id, (totalByEntry.get(t.entry_id) ?? 0) + Number(t.final_score ?? 0))
      if (t.result === 'win') {
        totalCorrectByEntry.set(t.entry_id, (totalCorrectByEntry.get(t.entry_id) ?? 0) + 1)
      }
    }
  }

  const entryUpdates: Promise<void>[] = entries.map((entry) =>
    (async () => {
      await supabase
        .from('margin_entries')
        .update({
          total_score: totalByEntry.get(entry.id) ?? 0,
          correct_tips_count: totalCorrectByEntry.get(entry.id) ?? 0,
        })
        .eq('id', entry.id)
    })()
  )
  await Promise.all(entryUpdates)

  return NextResponse.redirect(new URL('/admin/margin?processed=1', req.url))
}
