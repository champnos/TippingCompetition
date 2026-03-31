import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const formData = await req.formData()
  const competition_id = Number(formData.get('competition_id'))
  const joker_round_1 = Number(formData.get('joker_round_1'))
  const joker_round_2 = Number(formData.get('joker_round_2'))

  if (!competition_id || !joker_round_1 || !joker_round_2) {
    return NextResponse.redirect(new URL('/long-haul?error=missing_fields', req.url))
  }

  if (joker_round_1 === joker_round_2) {
    return NextResponse.redirect(new URL('/long-haul?error=joker_same_round', req.url))
  }

  // Validate competition exists and get season_id
  const { data: competition } = await supabase
    .from('competitions')
    .select('id, season_id')
    .eq('id', competition_id)
    .single()

  if (!competition) {
    return NextResponse.redirect(new URL('/long-haul?error=competition_not_found', req.url))
  }

  // Validate joker rounds are valid round_numbers in this season
  const { data: validRounds } = await supabase
    .from('rounds')
    .select('id, round_number')
    .eq('season_id', competition.season_id)

  const roundNumbers = new Set((validRounds ?? []).map((r) => r.round_number))
  if (!roundNumbers.has(joker_round_1) || !roundNumbers.has(joker_round_2)) {
    return NextResponse.redirect(new URL('/long-haul?error=invalid_joker_rounds', req.url))
  }

  // Get or create entry — check if already locked
  const { data: existingEntry } = await supabase
    .from('long_haul_entries')
    .select('id, is_locked')
    .eq('competition_id', competition_id)
    .eq('user_id', user.id)
    .single()

  if (existingEntry?.is_locked) {
    return NextResponse.redirect(new URL('/long-haul?error=entry_locked', req.url))
  }

  // Upsert entry with joker rounds
  const { data: entry, error: entryError } = await supabase
    .from('long_haul_entries')
    .upsert(
      {
        competition_id,
        user_id: user.id,
        joker_round_1,
        joker_round_2,
      },
      { onConflict: 'competition_id,user_id' }
    )
    .select('id')
    .single()

  if (entryError || !entry) {
    console.error('Long haul entry upsert error:', entryError)
    return NextResponse.redirect(new URL('/long-haul?error=entry_save_failed', req.url))
  }

  // Collect all tip_<game_id> fields
  const tips: { entry_id: number; game_id: number; round_id: number; team_id: number }[] = []

  // Build a map of game_id → round_id from the rounds data
  const { data: gamesData } = await supabase
    .from('games')
    .select('id, round_id, rounds!inner(season_id)')
    .eq('rounds.season_id', competition.season_id)

  type GameRow = { id: number; round_id: number; rounds: { season_id: number } }
  const gameRoundMap = new Map<number, number>()
  for (const g of (gamesData ?? []) as unknown as GameRow[]) {
    gameRoundMap.set(g.id, g.round_id)
  }

  for (const [key, value] of formData.entries()) {
    if (key.startsWith('tip_')) {
      const game_id = Number(key.replace('tip_', ''))
      const team_id = Number(value)
      const round_id = gameRoundMap.get(game_id)
      if (game_id && team_id && round_id) {
        tips.push({ entry_id: entry.id, game_id, round_id, team_id })
      }
    }
  }

  // Delete existing tips for this entry and bulk insert new ones
  await supabase.from('long_haul_tips').delete().eq('entry_id', entry.id)

  if (tips.length > 0) {
    const { error: tipsError } = await supabase.from('long_haul_tips').insert(tips)
    if (tipsError) {
      console.error('Long haul tips insert error:', tipsError)
      return NextResponse.redirect(new URL('/long-haul?error=tips_save_failed', req.url))
    }
  }

  return NextResponse.redirect(new URL('/long-haul', req.url))
}
