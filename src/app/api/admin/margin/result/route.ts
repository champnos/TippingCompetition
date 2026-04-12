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

  const accuracy_factor = marginMultiplier(round.round_number)

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

  // Get all existing margin_tips for this round in this competition (one per entry)
  const { data: tipsData } = await supabase
    .from('margin_tips')
    .select('id, entry_id, game_id, team_id, predicted_margin')
    .eq('round_id', round_id)
    .in('entry_id', entryIds)

  type TipRow = {
    id: number
    entry_id: number
    game_id: number
    team_id: number | null
    predicted_margin: number | null
  }

  const tips = (tipsData ?? []) as TipRow[]

  // Process each tip
  const tipUpdates: Promise<void>[] = []
  for (const tip of tips) {
    const game = gameById.get(tip.game_id)

    // Skip if game has no scores yet
    if (!game || game.home_score === null || game.away_score === null) continue

    const marginDiff = Math.abs(game.home_score - game.away_score)
    const isDraw = game.home_score === game.away_score
    const pickedTeamWon = !isDraw && game.winner_team_id === tip.team_id
    const pickedTeamLost = !isDraw && game.winner_team_id !== tip.team_id

    let actual_team_margin: number
    let result: string
    if (isDraw) {
      actual_team_margin = 0
      result = 'draw'
    } else if (pickedTeamWon) {
      actual_team_margin = marginDiff
      result = 'win'
    } else {
      actual_team_margin = -marginDiff
      result = 'loss'
    }

    const predicted = tip.predicted_margin ?? 0
    const error = Math.abs(predicted - actual_team_margin)
    const weighted_score = error * accuracy_factor

    // eslint-disable-next-line no-loop-func
    tipUpdates.push(
      (async () => {
        await supabase
          .from('margin_tips')
          .update({
            raw_score: error,
            multiplier: accuracy_factor,
            final_score: weighted_score,
            result,
          })
          .eq('id', tip.id)
      })()
    )
  }
  await Promise.all(tipUpdates)

  // Recalculate total_score and correct_tips_count for all entries from all scored tips
  const { data: allScoredTips } = await supabase
    .from('margin_tips')
    .select('entry_id, final_score, result')
    .in('entry_id', entryIds)
    .not('result', 'is', null)
    .not('result', 'in', '("pending","no_tip")')

  const totalByEntry = new Map<number, number>()
  const correctCountByEntry = new Map<number, number>()

  for (const t of allScoredTips ?? []) {
    totalByEntry.set(t.entry_id, (totalByEntry.get(t.entry_id) ?? 0) + Number(t.final_score ?? 0))
    if (t.result === 'win') {
      correctCountByEntry.set(t.entry_id, (correctCountByEntry.get(t.entry_id) ?? 0) + 1)
    }
  }

  const entryUpdates: Promise<void>[] = entries.map((entry) =>
    (async () => {
      await supabase
        .from('margin_entries')
        .update({
          total_score: totalByEntry.get(entry.id) ?? 0,
          correct_tips_count: correctCountByEntry.get(entry.id) ?? 0,
        })
        .eq('id', entry.id)
    })()
  )
  await Promise.all(entryUpdates)

  return NextResponse.redirect(new URL('/admin/margin?processed=1', req.url))
}
