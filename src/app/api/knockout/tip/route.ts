import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const formData = await req.formData()
  const entry_id = Number(formData.get('entry_id'))
  const round_id = Number(formData.get('round_id'))
  const team_id = Number(formData.get('team_id'))
  const got_my_back_team_id = formData.get('got_my_back_team_id')
    ? Number(formData.get('got_my_back_team_id'))
    : null
  const use_free_pass = formData.get('use_free_pass') === 'true'

  if (!entry_id || !round_id || !team_id) {
    return NextResponse.redirect(new URL('/knockout?error=missing_fields', req.url))
  }

  // 1. Verify entry ownership and active status
  const { data: entry } = await supabase
    .from('knockout_entries')
    .select('id, user_id, is_active, got_my_back_used, free_pass_used, free_pass_available, competition_id')
    .eq('id', entry_id)
    .single()

  if (!entry || entry.user_id !== user.id) {
    return NextResponse.redirect(new URL('/knockout?error=not_owner', req.url))
  }

  if (!entry.is_active) {
    return NextResponse.redirect(new URL('/knockout?error=not_active', req.url))
  }

  // 2. Verify round is not locked
  const { data: round } = await supabase
    .from('rounds')
    .select('id, round_number, locked, season_id')
    .eq('id', round_id)
    .single()

  if (!round || round.locked) {
    return NextResponse.redirect(new URL('/knockout?error=round_locked', req.url))
  }

  // 3. Get round config (top/bottom team restrictions)
  const { data: roundConfig } = await supabase
    .from('knockout_round_config')
    .select('top_team_id, bottom_team_id')
    .eq('round_id', round_id)
    .single()

  // 4. Find the first round of the competition's season to check if restrictions apply
  const { data: competition } = await supabase
    .from('competitions')
    .select('id, season_id')
    .eq('id', entry.competition_id)
    .single()

  let isFirstRound = false
  if (competition) {
    const { data: firstRound } = await supabase
      .from('rounds')
      .select('id, round_number')
      .eq('season_id', competition.season_id)
      .order('round_number', { ascending: true })
      .limit(1)
      .single()

    isFirstRound = firstRound?.id === round_id
  }

  // Get all games in this round
  const { data: games } = await supabase
    .from('games')
    .select('id, home_team_id, away_team_id, match_time')
    .eq('round_id', round_id)

  if (!games || games.length === 0) {
    return NextResponse.redirect(new URL('/knockout?error=no_games', req.url))
  }

  // 5. Find the game for team_id
  const pickedGame = games.find(
    (g) => g.home_team_id === team_id || g.away_team_id === team_id
  )

  if (!pickedGame) {
    return NextResponse.redirect(new URL('/knockout?error=team_not_playing', req.url))
  }

  // 6. Verify the game has not started
  if (new Date(pickedGame.match_time) <= new Date()) {
    return NextResponse.redirect(new URL('/knockout?error=game_started', req.url))
  }

  if (!isFirstRound && roundConfig) {
    // 7a. Cannot tip the top team
    if (roundConfig.top_team_id && team_id === roundConfig.top_team_id) {
      return NextResponse.redirect(new URL('/knockout?error=cannot_tip_top_team', req.url))
    }

    // 7b. Cannot tip against the bottom team
    // = cannot pick a team playing AGAINST the bottom team
    if (roundConfig.bottom_team_id) {
      const bottomTeamGame = games.find(
        (g) => g.home_team_id === roundConfig.bottom_team_id || g.away_team_id === roundConfig.bottom_team_id
      )
      if (bottomTeamGame) {
        const opponentOfBottom =
          bottomTeamGame.home_team_id === roundConfig.bottom_team_id
            ? bottomTeamGame.away_team_id
            : bottomTeamGame.home_team_id
        if (team_id === opponentOfBottom) {
          return NextResponse.redirect(new URL('/knockout?error=cannot_tip_against_bottom_team', req.url))
        }
      }
    }
  }

  // 8. Check previous round tip constraints
  // Get the previous round tip for this entry
  const { data: previousTips } = await supabase
    .from('knockout_tips')
    .select(`
      id, team_id, got_my_back_team_id, got_my_back_activated, result,
      rounds!inner(round_number, season_id)
    `)
    .eq('entry_id', entry_id)
    .order('rounds(round_number)', { ascending: false })
    .limit(2)

  if (!isFirstRound && previousTips && previousTips.length > 0) {
    // Find tips from previous rounds (not current round)
    type TipWithRound = {
      id: number
      team_id: number
      got_my_back_team_id: number | null
      got_my_back_activated: boolean
      result: string | null
      rounds: { round_number: number; season_id: number }
    }
    const prevTips = (previousTips as unknown as TipWithRound[]).filter(
      (t) => t.rounds.round_number < round.round_number
    )

    if (prevTips.length > 0) {
      const lastTip = prevTips[0]
      // Effective team from last round
      const lastEffectiveTeam = lastTip.got_my_back_activated
        ? lastTip.got_my_back_team_id
        : lastTip.team_id

      // Cannot pick same team as last round's effective team
      if (team_id === lastEffectiveTeam) {
        return NextResponse.redirect(new URL('/knockout?error=same_team_consecutive', req.url))
      }

      // Cannot tip against the same opponent as last round
      // Get last round's round_id to look up its games
      const { data: lastRound } = await supabase
        .from('rounds')
        .select('id')
        .eq('season_id', round.season_id)
        .eq('round_number', lastTip.rounds.round_number)
        .single()

      if (lastRound) {
        const { data: lastRoundGames } = await supabase
          .from('games')
          .select('id, home_team_id, away_team_id')
          .eq('round_id', lastRound.id)

        if (lastRoundGames) {
          const lastPickedGame = lastRoundGames.find(
            (g) => g.home_team_id === lastEffectiveTeam || g.away_team_id === lastEffectiveTeam
          )

          if (lastPickedGame) {
            const lastOpponent =
              lastPickedGame.home_team_id === lastEffectiveTeam
                ? lastPickedGame.away_team_id
                : lastPickedGame.home_team_id

            // Current pick's opponent
            const currentOpponent =
              pickedGame.home_team_id === team_id
                ? pickedGame.away_team_id
                : pickedGame.home_team_id

            if (currentOpponent === lastOpponent) {
              return NextResponse.redirect(new URL('/knockout?error=same_opponent_consecutive', req.url))
            }
          }
        }
      }
    }
  }

  // 7. Validate Got My Back
  if (got_my_back_team_id) {
    if (entry.got_my_back_used) {
      return NextResponse.redirect(new URL('/knockout?error=got_my_back_already_used', req.url))
    }

    // Find game for got_my_back team
    const gmb_game = games.find(
      (g) => g.home_team_id === got_my_back_team_id || g.away_team_id === got_my_back_team_id
    )

    if (!gmb_game) {
      return NextResponse.redirect(new URL('/knockout?error=gmb_team_not_playing', req.url))
    }

    // Got My Back game must not have started
    if (new Date(gmb_game.match_time) <= new Date()) {
      return NextResponse.redirect(new URL('/knockout?error=gmb_game_started', req.url))
    }

    // GMB team cannot be the opponent of the primary team
    const pickedGameOpponent =
      pickedGame.home_team_id === team_id ? pickedGame.away_team_id : pickedGame.home_team_id

    if (got_my_back_team_id === pickedGameOpponent) {
      return NextResponse.redirect(new URL('/knockout?error=gmb_is_opponent', req.url))
    }

    if (!isFirstRound && roundConfig) {
      // GMB team cannot be the top team
      if (roundConfig.top_team_id && got_my_back_team_id === roundConfig.top_team_id) {
        return NextResponse.redirect(new URL('/knockout?error=gmb_cannot_tip_top_team', req.url))
      }

      // GMB team cannot be the opponent of the bottom team
      if (roundConfig.bottom_team_id) {
        const bottomTeamGame = games.find(
          (g) => g.home_team_id === roundConfig.bottom_team_id || g.away_team_id === roundConfig.bottom_team_id
        )
        if (bottomTeamGame) {
          const opponentOfBottom =
            bottomTeamGame.home_team_id === roundConfig.bottom_team_id
              ? bottomTeamGame.away_team_id
              : bottomTeamGame.home_team_id
          if (got_my_back_team_id === opponentOfBottom) {
            return NextResponse.redirect(new URL('/knockout?error=gmb_cannot_tip_against_bottom_team', req.url))
          }
        }
      }
    }
  }

  // Validate free pass usage
  if (use_free_pass) {
    if (!entry.free_pass_available || entry.free_pass_used) {
      return NextResponse.redirect(new URL('/knockout?error=free_pass_not_available', req.url))
    }
  }

  // Upsert the tip
  const { error: tipError } = await supabase
    .from('knockout_tips')
    .upsert(
      {
        entry_id,
        round_id,
        team_id,
        got_my_back_team_id: got_my_back_team_id ?? null,
        got_my_back_activated: false,
        free_pass_used: use_free_pass,
        result: 'pending',
      },
      { onConflict: 'entry_id,round_id' }
    )

  if (tipError) {
    console.error('Knockout tip error:', tipError)
    return NextResponse.redirect(new URL('/knockout?error=tip_save_failed', req.url))
  }

  // If using free pass, mark it as used on the entry
  if (use_free_pass) {
    await supabase
      .from('knockout_entries')
      .update({ free_pass_used: true })
      .eq('id', entry_id)
  }

  return NextResponse.redirect(new URL('/knockout', req.url))
}
