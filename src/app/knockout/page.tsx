import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type Game = {
  id: number
  match_time: string
  venue: string | null
  home_team_id: number
  away_team_id: number
  home_team: { id: number; name: string; short_name: string | null }
  away_team: { id: number; name: string; short_name: string | null }
}

type KnockoutTip = {
  id: number
  entry_id: number
  round_id: number
  team_id: number
  got_my_back_team_id: number | null
  got_my_back_activated: boolean
  free_pass_used: boolean
  result: string | null
  rounds: { round_number: number }
  team: { name: string; short_name: string | null }
  got_my_back_team: { name: string; short_name: string | null } | null
}

type FinalsTip = {
  id: number
  entry_id: number
  finals_round: string
  team_id: number | null
  predicted_margin: number | null
  margin_error: number | null
  result: string | null
  eliminated: boolean
  team: { name: string; short_name: string | null } | null
}

type FinalsConfig = {
  id: number
  competition_id: number
  finals_round: string
  is_open: boolean
  cut_line: number | null
  actual_margin: number | null
  winner_team_id: number | null
}

type Team = {
  id: number
  name: string
  short_name: string | null
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'Please fill in all required fields.',
  not_owner: 'You do not own this entry.',
  not_active: 'Your entry is not active.',
  not_finals_active: 'Your entry is not active in the finals series.',
  finals_round_not_open: 'This finals round is not currently open for tips.',
  round_locked: 'This round is locked.',
  no_games: 'No games found for this round.',
  team_not_playing: 'Selected team is not playing this round.',
  game_started: 'The selected game has already started.',
  cannot_tip_top_team: 'You cannot tip the team at the top of the ladder.',
  cannot_tip_against_bottom_team: 'You cannot tip against the team at the bottom of the ladder.',
  same_team_consecutive: 'You cannot tip the same team two rounds in a row.',
  same_opponent_consecutive: 'You cannot tip against the same team two rounds in a row.',
  got_my_back_already_used: 'You have already used your Got My Back.',
  gmb_team_not_playing: 'Your Got My Back team is not playing this round.',
  gmb_game_started: 'Your Got My Back team\'s game has already started.',
  gmb_is_opponent: 'Your Got My Back team cannot be the opponent of your primary team.',
  gmb_cannot_tip_top_team: 'Your Got My Back team cannot be the top team.',
  gmb_cannot_tip_against_bottom_team: 'Your Got My Back team cannot tip against the bottom team.',
  free_pass_not_available: 'Free Pass is not available.',
  tip_save_failed: 'Failed to save your tip. Please try again.',
}

export default async function KnockoutPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Find active knockout competition
  const { data: competition } = await supabase
    .from('competitions')
    .select('id, name, season_id')
    .eq('is_active', true)
    .ilike('name', '%knockout%')
    .single()

  // Fallback to any active competition if no knockout-named comp found
  const { data: fallbackComp } = !competition
    ? await supabase
        .from('competitions')
        .select('id, name, season_id')
        .eq('is_active', true)
        .single()
    : { data: null }

  const activeComp = competition ?? fallbackComp

  if (!activeComp) {
    return (
      <main className="page-container">
        <div className="page-header">
          <h1>🥊 Knockout</h1>
          <a href="/dashboard" className="btn btn-primary btn-sm">← Dashboard</a>
        </div>
        <div className="section-card">
          <p>No active knockout competition found.</p>
        </div>
      </main>
    )
  }

  // Get user's entry
  const { data: entry } = await supabase
    .from('knockout_entries')
    .select('id, is_active, eliminated_round, got_my_back_used, free_pass_used, free_pass_available, total_paid, finals_active')
    .eq('competition_id', activeComp.id)
    .eq('user_id', user.id)
    .single()

  // Get current round (lowest round_number where locked = false)
  const { data: currentRound } = await supabase
    .from('rounds')
    .select('id, round_number, locked')
    .eq('season_id', activeComp.season_id)
    .eq('locked', false)
    .order('round_number', { ascending: true })
    .limit(1)
    .single()

  // Get round config for current round
  const roundConfig = currentRound
    ? await supabase
        .from('knockout_round_config')
        .select('top_team_id, bottom_team_id')
        .eq('round_id', currentRound.id)
        .single()
        .then((r) => r.data)
    : null

  // Get games for current round
  let currentGames: Game[] = []
  if (currentRound) {
    const { data: gamesData } = await supabase
      .from('games')
      .select(`
        id, match_time, venue, home_team_id, away_team_id,
        home_team:teams!games_home_team_id_fkey(id, name, short_name),
        away_team:teams!games_away_team_id_fkey(id, name, short_name)
      `)
      .eq('round_id', currentRound.id)
      .order('match_time', { ascending: true })
    currentGames = (gamesData ?? []) as unknown as Game[]
  }

  // Get tip history for this entry
  let tipHistory: KnockoutTip[] = []
  if (entry) {
    const { data: tipsData } = await supabase
      .from('knockout_tips')
      .select(`
        id, entry_id, round_id, team_id, got_my_back_team_id, got_my_back_activated, free_pass_used, result,
        rounds(round_number),
        team:teams!knockout_tips_team_id_fkey(name, short_name),
        got_my_back_team:teams!knockout_tips_got_my_back_team_id_fkey(name, short_name)
      `)
      .eq('entry_id', entry.id)
      .order('rounds(round_number)', { ascending: false })
    tipHistory = (tipsData ?? []) as unknown as KnockoutTip[]
  }

  // Get current round tip (if exists)
  const currentTip = currentRound
    ? tipHistory.find((t) => t.round_id === currentRound.id)
    : null

  // Finals series data
  let openFinalsConfig: FinalsConfig | null = null
  let allTeams: Team[] = []
  let finalsTipHistory: FinalsTip[] = []

  if (entry?.finals_active) {
    const [{ data: finalsConfigData }, { data: teamsData }, { data: finalsTipsData }] = await Promise.all([
      supabase
        .from('knockout_finals_config')
        .select('id, competition_id, finals_round, is_open, cut_line, actual_margin, winner_team_id')
        .eq('competition_id', activeComp.id)
        .eq('is_open', true)
        .single(),
      supabase.from('teams').select('id, name, short_name').order('name'),
      supabase
        .from('knockout_finals_tips')
        .select(`
          id, entry_id, finals_round, team_id, predicted_margin, margin_error, result, eliminated,
          team:teams!knockout_finals_tips_team_id_fkey(name, short_name)
        `)
        .eq('entry_id', entry.id)
        .order('id', { ascending: false }),
    ])
    openFinalsConfig = (finalsConfigData as FinalsConfig | null) ?? null
    allTeams = (teamsData ?? []) as Team[]
    finalsTipHistory = (finalsTipsData ?? []) as unknown as FinalsTip[]
  }

  const now = new Date()
  const errorMsg = searchParams.error ? ERROR_MESSAGES[searchParams.error] ?? searchParams.error : null

  // Determine which teams are restricted
  const restrictedTeamIds = new Set<number>()
  if (roundConfig?.top_team_id) {
    restrictedTeamIds.add(roundConfig.top_team_id)
  }
  if (roundConfig?.bottom_team_id) {
    // Find the opponent of bottom team and restrict them
    const bottomGame = currentGames.find(
      (g) => g.home_team_id === roundConfig.bottom_team_id || g.away_team_id === roundConfig.bottom_team_id
    )
    if (bottomGame) {
      const opponent =
        bottomGame.home_team_id === roundConfig.bottom_team_id
          ? bottomGame.away_team_id
          : bottomGame.home_team_id
      restrictedTeamIds.add(opponent)
    }
  }

  // Filter games to not-yet-started for selection
  const availableGames = currentGames.filter((g) => new Date(g.match_time) > now)

  // Flatten teams from available games
  const availableTeams = availableGames
    .flatMap((g) => [g.home_team, g.away_team])
    .filter((t) => !restrictedTeamIds.has(t.id))

  const canTip = !!entry && entry.is_active && !!currentRound && !currentRound.locked
  const canUseFreePass =
    entry?.free_pass_available &&
    !entry?.free_pass_used &&
    !!currentRound &&
    currentRound.round_number >= 12 &&
    currentRound.round_number <= 18

  return (
    <main className="page-container">
      <div className="page-header">
        <h1>🥊 Knockout</h1>
        <a href="/dashboard" className="btn btn-primary btn-sm">← Dashboard</a>
      </div>
      <p style={{ marginBottom: 24, color: 'var(--text-muted)' }}>{activeComp.name}</p>

      {errorMsg && (
        <div className="alert-error" style={{ marginBottom: 20 }}>{errorMsg}</div>
      )}

      {/* Entry Status */}
      {entry ? (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Your Status</h2>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div className="form-label">Status</div>
              <div style={{ marginTop: 4, fontSize: '1.1rem', fontWeight: 700, color: entry.is_active ? 'var(--success)' : 'var(--danger)' }}>
                {entry.is_active ? '✅ Active' : `❌ Eliminated (Round ${entry.eliminated_round})`}
              </div>
            </div>
            <div>
              <div className="form-label">Got My Back</div>
              <div style={{ marginTop: 4 }}>
                {entry.got_my_back_used ? '✓ Used' : '⭐ Available'}
              </div>
            </div>
            <div>
              <div className="form-label">Free Pass</div>
              <div style={{ marginTop: 4 }}>
                {entry.free_pass_used
                  ? '✓ Used'
                  : entry.free_pass_available
                  ? '⭐ Available'
                  : 'Not yet earned (survive past Round 11)'}
              </div>
            </div>
            <div>
              <div className="form-label">Total Paid</div>
              <div style={{ marginTop: 4 }}>${entry.total_paid}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="section-card">
          <p>You are not entered in this knockout competition. Please contact the admin.</p>
        </div>
      )}

      {/* Tip Submission */}
      {canTip && currentRound && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Round {currentRound.round_number} Tip</h2>
            {currentTip && <span className="badge-tipped">✓ Tip submitted</span>}
          </div>

          {currentTip && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: '#f0fff4', borderRadius: 6, border: '1px solid #bbf7d0' }}>
              <strong>Current tip:</strong>{' '}
              {currentTip.team.short_name ?? currentTip.team.name}
              {currentTip.got_my_back_team_id && (
                <span style={{ marginLeft: 12, color: 'var(--text-muted)' }}>
                  (Got My Back: {currentTip.got_my_back_team?.short_name ?? currentTip.got_my_back_team?.name})
                </span>
              )}
              {' '}— you can update until the game starts.
            </div>
          )}

          {availableTeams.length === 0 ? (
            <p>No games available to tip (all games have started or no teams available).</p>
          ) : (
            <form action="/api/knockout/tip" method="POST">
              <input type="hidden" name="entry_id" value={entry!.id} />
              <input type="hidden" name="round_id" value={currentRound.id} />

              <div className="form-grid">
                <div className="form-field">
                  <label className="form-label">Pick Your Team</label>
                  <select name="team_id" required className="form-select" defaultValue={currentTip?.team_id ?? ''}>
                    <option value="">Select a team…</option>
                    {availableGames.map((game) => {
                      const matchDate = new Date(game.match_time).toLocaleString('en-AU', {
                        weekday: 'short', day: 'numeric', month: 'short',
                        hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Melbourne',
                      })
                      return (
                        <optgroup key={game.id} label={`${matchDate}${game.venue ? ` · ${game.venue}` : ''}`}>
                          {!restrictedTeamIds.has(game.home_team_id) && (
                            <option value={game.home_team_id}>
                              {game.home_team.name}
                              {roundConfig?.top_team_id === game.home_team_id ? ' ⛔ (Top)' : ''}
                            </option>
                          )}
                          {!restrictedTeamIds.has(game.away_team_id) && (
                            <option value={game.away_team_id}>
                              {game.away_team.name}
                              {roundConfig?.top_team_id === game.away_team_id ? ' ⛔ (Top)' : ''}
                            </option>
                          )}
                        </optgroup>
                      )
                    })}
                  </select>
                </div>

                {!entry!.got_my_back_used && (
                  <div className="form-field">
                    <label className="form-label">Got My Back (optional backup — 1 use)</label>
                    <select name="got_my_back_team_id" className="form-select" defaultValue={currentTip?.got_my_back_team_id ?? ''}>
                      <option value="">No Got My Back</option>
                      {availableGames.map((game) => {
                        const matchDate = new Date(game.match_time).toLocaleString('en-AU', {
                          weekday: 'short', day: 'numeric', month: 'short',
                          hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Melbourne',
                        })
                        return (
                          <optgroup key={game.id} label={`${matchDate}${game.venue ? ` · ${game.venue}` : ''}`}>
                            {!restrictedTeamIds.has(game.home_team_id) && (
                              <option value={game.home_team_id}>{game.home_team.name}</option>
                            )}
                            {!restrictedTeamIds.has(game.away_team_id) && (
                              <option value={game.away_team_id}>{game.away_team.name}</option>
                            )}
                          </optgroup>
                        )
                      })}
                    </select>
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      Cannot be the opponent of your primary team. Used once per season.
                    </small>
                  </div>
                )}

                {canUseFreePass && (
                  <div className="form-field">
                    <label className="form-label" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="checkbox" name="use_free_pass" value="true"
                        defaultChecked={currentTip?.free_pass_used} />
                      Use Free Pass (rounds 12–18, 1 use)
                    </label>
                  </div>
                )}
              </div>

              <div style={{ marginTop: 20 }}>
                <button type="submit" className="btn btn-gold">
                  {currentTip ? '🔄 Update Tip' : '💾 Submit Tip'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {!canTip && entry && !entry.is_active && (
        <div className="section-card">
          <p>You have been eliminated. Contact the admin to buy back in (available up to and including Round 11).</p>
        </div>
      )}

      {!canTip && currentRound?.locked && entry?.is_active && (
        <div className="section-card">
          <p>Round {currentRound.round_number} is locked. Tips can no longer be changed.</p>
        </div>
      )}

      {/* Tip History */}
      {tipHistory.length > 0 && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Tip History</h2>
          </div>
          <div className="table-wrap">
            <table className="afl-table">
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Team Picked</th>
                  <th>Got My Back</th>
                  <th>GMB Activated</th>
                  <th>Free Pass</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {tipHistory.map((tip) => (
                  <tr key={tip.id}>
                    <td>{tip.rounds.round_number}</td>
                    <td>{tip.team.short_name ?? tip.team.name}</td>
                    <td>
                      {tip.got_my_back_team
                        ? (tip.got_my_back_team.short_name ?? tip.got_my_back_team.name)
                        : '—'}
                    </td>
                    <td>{tip.got_my_back_activated ? '✅ Yes' : '—'}</td>
                    <td>{tip.free_pass_used ? '✅ Yes' : '—'}</td>
                    <td>
                      {tip.result === 'win' && <span style={{ color: 'var(--success)', fontWeight: 700 }}>✅ Win</span>}
                      {tip.result === 'loss' && <span style={{ color: 'var(--danger)', fontWeight: 700 }}>❌ Loss</span>}
                      {tip.result === 'draw' && <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>— Draw</span>}
                      {tip.result === 'pending' && <span style={{ color: 'var(--text-muted)' }}>⏳ Pending</span>}
                      {!tip.result && '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Finals Series */}
      {entry?.finals_active && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>🏆 Finals Series</h2>
          </div>

          {openFinalsConfig ? (
            <>
              <p style={{ marginBottom: 16 }}>
                <strong>{openFinalsConfig.finals_round}</strong> is currently open. Pick your team and predict the winning margin.
              </p>
              {(() => {
                const existingFinalsTip = finalsTipHistory.find(
                  (t) => t.finals_round === openFinalsConfig!.finals_round
                )
                return (
                  <>
                    {existingFinalsTip && (
                      <div style={{ marginBottom: 16, padding: '10px 14px', background: '#f0fff4', borderRadius: 6, border: '1px solid #bbf7d0' }}>
                        <strong>Current tip:</strong>{' '}
                        {existingFinalsTip.team?.short_name ?? existingFinalsTip.team?.name ?? '—'}
                        {existingFinalsTip.predicted_margin !== null && (
                          <span style={{ marginLeft: 12, color: 'var(--text-muted)' }}>
                            by {existingFinalsTip.predicted_margin} pts
                          </span>
                        )}
                        {' '}— you can update until results are processed.
                      </div>
                    )}
                    <form action="/api/knockout/finals-tip" method="POST">
                      <input type="hidden" name="entry_id" value={entry.id} />
                      <input type="hidden" name="finals_round" value={openFinalsConfig.finals_round} />
                      <div className="form-grid">
                        <div className="form-field">
                          <label className="form-label">Pick Your Team</label>
                          <select name="team_id" required className="form-select" defaultValue={existingFinalsTip?.team_id ?? ''}>
                            <option value="">Select a team…</option>
                            {allTeams.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-field">
                          <label className="form-label">Predicted Winning Margin</label>
                          <input
                            type="number"
                            name="predicted_margin"
                            required
                            min={1}
                            className="form-input"
                            placeholder="e.g. 24"
                            defaultValue={existingFinalsTip?.predicted_margin ?? ''}
                          />
                        </div>
                      </div>
                      <div style={{ marginTop: 20 }}>
                        <button type="submit" className="btn btn-gold">
                          {existingFinalsTip ? '🔄 Update Finals Tip' : '💾 Submit Finals Tip'}
                        </button>
                      </div>
                    </form>
                  </>
                )
              })()}
            </>
          ) : (
            <p>No finals round is currently open for tips.</p>
          )}

          {finalsTipHistory.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ marginBottom: 12 }}>Finals Tip History</h3>
              <div className="table-wrap">
                <table className="afl-table">
                  <thead>
                    <tr>
                      <th>Round</th>
                      <th>Team Picked</th>
                      <th>Predicted Margin</th>
                      <th>Margin Error</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finalsTipHistory.map((tip) => (
                      <tr key={tip.id}>
                        <td>{tip.finals_round}</td>
                        <td>{tip.team?.short_name ?? tip.team?.name ?? '—'}</td>
                        <td>{tip.predicted_margin ?? '—'}</td>
                        <td>{tip.margin_error ?? '—'}</td>
                        <td>
                          {tip.result === 'win' && <span style={{ color: 'var(--success)', fontWeight: 700 }}>✅ Win</span>}
                          {tip.result === 'loss' && <span style={{ color: 'var(--danger)', fontWeight: 700 }}>❌ Loss</span>}
                          {tip.result === 'pending' && <span style={{ color: 'var(--text-muted)' }}>⏳ Pending</span>}
                          {!tip.result && '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
