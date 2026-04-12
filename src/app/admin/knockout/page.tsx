import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type KnockoutEntry = {
  id: number
  competition_id: number
  user_id: string
  is_active: boolean
  eliminated_round: number | null
  got_my_back_used: boolean
  free_pass_used: boolean
  free_pass_available: boolean
  total_paid: number
  finals_active: boolean
  profiles: { full_name: string | null; short_name: string | null } | null
}

type KnockoutTipWithEntry = {
  id: number
  entry_id: number
  team_id: number
  got_my_back_team_id: number | null
  got_my_back_activated: boolean
  free_pass_used: boolean
  result: string | null
  team: { name: string; short_name: string | null }
  got_my_back_team: { name: string; short_name: string | null } | null
  knockout_entries: { user_id: string; profiles: { full_name: string | null; short_name: string | null } | null }
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
  knockout_entries: { user_id: string; profiles: { full_name: string | null; short_name: string | null } | null }
}

export default async function AdminKnockoutPage({
  searchParams,
}: {
  searchParams: { error?: string; processed?: string; info?: string; finals_activated?: string; config_saved?: string; finals_processed?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/dashboard')

  // Find active knockout competition
  const { data: competition } = await supabase
    .from('competitions')
    .select('id, name, season_id')
    .eq('is_active', true)
    .ilike('name', '%knockout%')
    .single()

  const [
    { data: allCompetitions },
    { data: allTeams },
    { data: allRounds },
    { data: allUsers },
  ] = await Promise.all([
    supabase.from('competitions').select('id, name, season_id, is_active').order('id', { ascending: false }),
    supabase.from('teams').select('id, name, short_name').order('name'),
    supabase.from('rounds').select('id, season_id, round_number, locked').order('round_number'),
    supabase.from('profiles').select('id, full_name, short_name').order('full_name'),
  ])

  const activeComp = competition ?? (allCompetitions ?? []).find((c) => c.is_active) ?? null

  // Get knockout entries for active competition
  let knockoutEntries: KnockoutEntry[] = []
  let currentRoundTips: KnockoutTipWithEntry[] = []
  let roundConfigs: Array<{ round_id: number; top_team_id: number | null; bottom_team_id: number | null }> = []
  let finalsConfigs: FinalsConfig[] = []
  let openFinalsTips: FinalsTip[] = []

  if (activeComp) {
    const { data: entriesData } = await supabase
      .from('knockout_entries')
      .select(`
        id, competition_id, user_id, is_active, eliminated_round,
        got_my_back_used, free_pass_used, free_pass_available, total_paid, finals_active,
        profiles(full_name, short_name)
      `)
      .eq('competition_id', activeComp.id)
      .order('is_active', { ascending: false })

    knockoutEntries = (entriesData ?? []) as unknown as KnockoutEntry[]

    // Find current round (lowest unlocked)
    const seasonRounds = (allRounds ?? []).filter((r) => r.season_id === activeComp.season_id)
    const currentRound = seasonRounds.find((r) => !r.locked) ?? null

    if (currentRound && knockoutEntries.length > 0) {
      const entryIds = knockoutEntries.filter((e) => e.is_active).map((e) => e.id)
      if (entryIds.length > 0) {
        const { data: tipsData } = await supabase
          .from('knockout_tips')
          .select(`
            id, entry_id, team_id, got_my_back_team_id, got_my_back_activated, free_pass_used, result,
            team:teams!knockout_tips_team_id_fkey(name, short_name),
            got_my_back_team:teams!knockout_tips_got_my_back_team_id_fkey(name, short_name),
            knockout_entries!inner(user_id, profiles(full_name, short_name))
          `)
          .eq('round_id', currentRound.id)
          .in('entry_id', entryIds)

        currentRoundTips = (tipsData ?? []) as unknown as KnockoutTipWithEntry[]
      }
    }

    // Get round configs for this season
    const roundIds = seasonRounds.map((r) => r.id)
    if (roundIds.length > 0) {
      const { data: configsData } = await supabase
        .from('knockout_round_config')
        .select('round_id, top_team_id, bottom_team_id')
        .in('round_id', roundIds)
      roundConfigs = configsData ?? []
    }

    // Get finals configs for this competition
    const { data: finalsConfigData } = await supabase
      .from('knockout_finals_config')
      .select('id, competition_id, finals_round, is_open, cut_line, actual_margin, winner_team_id')
      .eq('competition_id', activeComp.id)
      .order('id')
    finalsConfigs = (finalsConfigData ?? []) as FinalsConfig[]

    // Get tips for the currently open finals round
    const openConfig = finalsConfigs.find((c) => c.is_open)
    if (openConfig) {
      const { data: finalsTipsData } = await supabase
        .from('knockout_finals_tips')
        .select(`
          id, entry_id, finals_round, team_id, predicted_margin, margin_error, result, eliminated,
          team:teams!knockout_finals_tips_team_id_fkey(name, short_name),
          knockout_entries!inner(user_id, profiles(full_name, short_name))
        `)
        .eq('finals_round', openConfig.finals_round)
        .eq('knockout_entries.competition_id', activeComp.id)
        .eq('knockout_entries.finals_active', true)
      openFinalsTips = (finalsTipsData ?? []) as unknown as FinalsTip[]
    }
  }

  // Prize pool
  const prizePool = knockoutEntries.reduce((sum, e) => sum + Number(e.total_paid), 0)

  const seasonRoundsForComp = activeComp
    ? (allRounds ?? []).filter((r) => r.season_id === activeComp.season_id)
    : []

  // Map entry_id → tip for current round display
  const tipByEntryId = new Map(currentRoundTips.map((t) => [t.entry_id, t]))

  const errorMsg = searchParams.error ? `Error: ${searchParams.error}` : null
  const successMsg = searchParams.processed ? 'Round results processed successfully.' : null
  const infoMsg = searchParams.info === 'no_pending_tips' ? 'No pending tips found for this round.' : searchParams.info === 'no_finals_tips' ? 'No pending finals tips found for this round.' : null
  const finalsActivatedMsg = searchParams.finals_activated ? 'Finals activated — all active entries are now in the finals series.' : null
  const configSavedMsg = searchParams.config_saved ? 'Finals config saved successfully.' : null
  const finalsProcessedMsg = searchParams.finals_processed ? 'Finals results processed successfully.' : null

  return (
    <main className="page-container-wide">
      <div className="page-header">
        <h1>🥊 Admin — Knockout</h1>
        <a href="/admin" className="btn btn-primary btn-sm">← Admin Panel</a>
      </div>

      {errorMsg && <div className="alert-error">{errorMsg}</div>}
      {successMsg && (
        <div style={{ background: '#f0fff4', border: '1px solid #bbf7d0', color: 'var(--success)', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
          {successMsg}
        </div>
      )}
      {infoMsg && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
          {infoMsg}
        </div>
      )}
      {finalsActivatedMsg && (
        <div style={{ background: '#f0fff4', border: '1px solid #bbf7d0', color: 'var(--success)', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
          {finalsActivatedMsg}
        </div>
      )}
      {configSavedMsg && (
        <div style={{ background: '#f0fff4', border: '1px solid #bbf7d0', color: 'var(--success)', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
          {configSavedMsg}
        </div>
      )}
      {finalsProcessedMsg && (
        <div style={{ background: '#f0fff4', border: '1px solid #bbf7d0', color: 'var(--success)', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
          {finalsProcessedMsg}
        </div>
      )}

      {!activeComp && (
        <div className="section-card">
          <p>No active Knockout competition found. Create a competition with &ldquo;Knockout&rdquo; in its name and set it as active.</p>
        </div>
      )}

      {/* ── Round Config ── */}
      {activeComp && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Round Config — Top / Bottom Team</h2>
          </div>
          <p style={{ marginBottom: 16 }}>Set the top-of-ladder and bottom-of-ladder team for each round. These restrict which teams can be tipped.</p>

          {roundConfigs.length > 0 && (
            <div className="table-wrap" style={{ marginBottom: 20 }}>
              <table className="afl-table">
                <thead>
                  <tr>
                    <th>Round</th>
                    <th>Top Team (cannot tip)</th>
                    <th>Bottom Team (cannot tip against)</th>
                  </tr>
                </thead>
                <tbody>
                  {roundConfigs.map((cfg) => {
                    const rnd = seasonRoundsForComp.find((r) => r.id === cfg.round_id)
                    const topTeam = (allTeams ?? []).find((t) => t.id === cfg.top_team_id)
                    const bottomTeam = (allTeams ?? []).find((t) => t.id === cfg.bottom_team_id)
                    return (
                      <tr key={cfg.round_id}>
                        <td>Round {rnd?.round_number ?? cfg.round_id}</td>
                        <td>{topTeam?.name ?? '—'}</td>
                        <td>{bottomTeam?.name ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <h3 style={{ marginBottom: 14 }}>Set / Update Round Config</h3>
          <form action="/api/admin/knockout/round-config" method="POST">
            <div className="form-grid">
              <div className="form-field">
                <label className="form-label">Round</label>
                <select name="round_id" required className="form-select">
                  <option value="">Select round…</option>
                  {seasonRoundsForComp.map((r) => (
                    <option key={r.id} value={r.id}>Round {r.round_number}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Top Team (cannot tip)</label>
                <select name="top_team_id" className="form-select">
                  <option value="">None</option>
                  {(allTeams ?? []).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Bottom Team (cannot tip against)</label>
                <select name="bottom_team_id" className="form-select">
                  <option value="">None</option>
                  {(allTeams ?? []).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field" style={{ justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary">Save Config</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ── Process Results ── */}
      {activeComp && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Process Round Results</h2>
          </div>
          <p style={{ marginBottom: 16 }}>After entering game scores in the main Admin panel, process knockout results here to mark tips as win/loss/draw and eliminate entrants.</p>
          <form action="/api/admin/knockout/result" method="POST">
            <input type="hidden" name="competition_id" value={activeComp.id} />
            <div className="form-grid">
              <div className="form-field">
                <label className="form-label">Round</label>
                <select name="round_id" required className="form-select">
                  <option value="">Select round…</option>
                  {seasonRoundsForComp.map((r) => (
                    <option key={r.id} value={r.id}>Round {r.round_number}{r.locked ? ' 🔒' : ''}</option>
                  ))}
                </select>
              </div>
              <div className="form-field" style={{ justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-gold">Process Results</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ── Prize Pool ── */}
      {activeComp && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Prize Pool</h2>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--gold-dark)' }}>
            ${prizePool.toFixed(2)}
          </div>
          <p style={{ marginTop: 8 }}>
            Total collected from {knockoutEntries.length} entrant{knockoutEntries.length !== 1 ? 's' : ''} (entry fee: $100, buy-backs included)
          </p>

          {knockoutEntries.length >= 3 && (
            <div style={{ marginTop: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <div className="form-label">3rd Last Place</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>$100</div>
              </div>
              <div>
                <div className="form-label">🥇 1st Place (70%)</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>${Math.round(((prizePool - 100) * 0.70) / 10) * 10}</div>
              </div>
              <div>
                <div className="form-label">🥈 2nd Place (30%)</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>${(prizePool - 100) - Math.round(((prizePool - 100) * 0.70) / 10) * 10}</div>
              </div>
            </div>
          )}
          {knockoutEntries.length > 0 && knockoutEntries.length < 3 && (
            <p style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Prize breakdown requires at least 3 entrants.
            </p>
          )}
        </div>
      )}

      {/* ── Entries ── */}
      {activeComp && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Entries</h2>
          </div>

          {knockoutEntries.length > 0 ? (
            <div className="table-wrap" style={{ marginBottom: 20 }}>
              <table className="afl-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Eliminated</th>
                    <th>Got My Back</th>
                    <th>Free Pass</th>
                    <th>Total Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {knockoutEntries.map((e) => (
                    <tr key={e.id}>
                      <td>{e.profiles?.full_name ?? e.profiles?.short_name ?? e.user_id}</td>
                      <td>{e.is_active ? '✅ Active' : '❌ Eliminated'}</td>
                      <td>{e.eliminated_round ? `Round ${e.eliminated_round}` : '—'}</td>
                      <td>{e.got_my_back_used ? '✓ Used' : '⭐ Available'}</td>
                      <td>
                        {e.free_pass_used ? '✓ Used' : e.free_pass_available ? '⭐ Available' : '—'}
                      </td>
                      <td>${Number(e.total_paid).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ marginBottom: 16 }}>No entries yet.</p>
          )}

          <h3 style={{ marginBottom: 14 }}>Add Entrant / Record Buy-in</h3>
          <form action="/api/admin/knockout/entry" method="POST">
            <input type="hidden" name="competition_id" value={activeComp.id} />
            <div className="form-grid">
              <div className="form-field">
                <label className="form-label">User</label>
                <select name="user_id" required className="form-select">
                  <option value="">Select user…</option>
                  {(allUsers ?? []).map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name ?? u.short_name ?? u.id}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Action</label>
                <select name="action" required className="form-select">
                  <option value="new">New Entry ($100 initial)</option>
                  <option value="buyin">Buy Back In</option>
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Payment Amount ($)</label>
                <input type="number" name="payment_amount" min={0} step="0.01" placeholder="e.g. 100" className="form-input" />
              </div>
              <div className="form-field" style={{ justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary">Save Entry</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ── Current Round Tips ── */}
      {activeComp && knockoutEntries.filter((e) => e.is_active).length > 0 && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Current Round Tips</h2>
          </div>
          <div className="table-wrap">
            <table className="afl-table">
              <thead>
                <tr>
                  <th>Entrant</th>
                  <th>Team Picked</th>
                  <th>Got My Back</th>
                  <th>Free Pass</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {knockoutEntries
                  .filter((e) => e.is_active)
                  .map((e) => {
                    const tip = tipByEntryId.get(e.id)
                    const name = e.profiles?.full_name ?? e.profiles?.short_name ?? e.user_id
                    return (
                      <tr key={e.id}>
                        <td>{name}</td>
                        <td>
                          {tip
                            ? (tip.team.short_name ?? tip.team.name)
                            : <span style={{ color: 'var(--danger)' }}>⚠️ Not submitted</span>}
                        </td>
                        <td>
                          {tip?.got_my_back_team
                            ? (tip.got_my_back_team.short_name ?? tip.got_my_back_team.name)
                            : '—'}
                        </td>
                        <td>{tip?.free_pass_used ? '✅' : '—'}</td>
                        <td>
                          {tip?.result === 'win' && <span style={{ color: 'var(--success)' }}>✅ Win</span>}
                          {tip?.result === 'loss' && <span style={{ color: 'var(--danger)' }}>❌ Loss</span>}
                          {tip?.result === 'draw' && <span>— Draw</span>}
                          {tip?.result === 'pending' && <span style={{ color: 'var(--text-muted)' }}>⏳ Pending</span>}
                          {!tip?.result && '—'}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Finals Series Management ── */}
      {activeComp && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>🏆 Finals Series Management</h2>
          </div>

          {/* (A) Activate Finals */}
          {knockoutEntries.every((e) => !e.finals_active) && (
            <div style={{ marginBottom: 24 }}>
              <p style={{ marginBottom: 12 }}>Activate the finals series for all currently active entries.</p>
              <form action="/api/admin/knockout/activate-finals" method="POST">
                <input type="hidden" name="competition_id" value={activeComp.id} />
                <button type="submit" className="btn btn-gold">🏆 Activate Finals</button>
              </form>
            </div>
          )}

          {/* (B) Finals Config */}
          <h3 style={{ marginBottom: 12 }}>Finals Round Config</h3>
          {finalsConfigs.length > 0 && (
            <div className="table-wrap" style={{ marginBottom: 16 }}>
              <table className="afl-table">
                <thead>
                  <tr>
                    <th>Round</th>
                    <th>Open</th>
                    <th>Cut Line</th>
                    <th>Actual Margin</th>
                    <th>Winner</th>
                  </tr>
                </thead>
                <tbody>
                  {finalsConfigs.map((cfg) => {
                    const winnerTeam = (allTeams ?? []).find((t) => t.id === cfg.winner_team_id)
                    return (
                      <tr key={cfg.id}>
                        <td>{cfg.finals_round}</td>
                        <td>{cfg.is_open ? '✅ Open' : '🔒 Closed'}</td>
                        <td>{cfg.cut_line ?? '—'}</td>
                        <td>{cfg.actual_margin ?? '—'}</td>
                        <td>{winnerTeam?.name ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <form action="/api/admin/knockout/finals-config" method="POST" style={{ marginBottom: 24 }}>
            <input type="hidden" name="competition_id" value={activeComp.id} />
            <div className="form-grid">
              <div className="form-field">
                <label className="form-label">Finals Round</label>
                <select name="finals_round" required className="form-select">
                  <option value="">Select…</option>
                  {['QF', 'SF', 'PF', 'GF'].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Cut Line (survivors)</label>
                <input type="number" name="cut_line" min={1} className="form-input" placeholder="e.g. 4" />
              </div>
              <div className="form-field">
                <label className="form-label" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" name="is_open" value="on" />
                  Open for Tips
                </label>
              </div>
              <div className="form-field" style={{ justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary">Save Config</button>
              </div>
            </div>
          </form>

          {/* (C) Process Finals Results */}
          <h3 style={{ marginBottom: 12 }}>Process Finals Results</h3>
          <form action="/api/admin/knockout/finals-result" method="POST" style={{ marginBottom: 24 }}>
            <input type="hidden" name="competition_id" value={activeComp.id} />
            <div className="form-grid">
              <div className="form-field">
                <label className="form-label">Finals Round</label>
                <select name="finals_round" required className="form-select">
                  <option value="">Select…</option>
                  {['QF', 'SF', 'PF', 'GF'].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Winning Team</label>
                <select name="winner_team_id" required className="form-select">
                  <option value="">Select team…</option>
                  {(allTeams ?? []).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Actual Margin</label>
                <input type="number" name="actual_margin" required className="form-input" placeholder="e.g. 24" />
              </div>
              <div className="form-field" style={{ justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-gold">Process Results</button>
              </div>
            </div>
          </form>

          {/* (D) Current Finals Tips */}
          {openFinalsTips.length > 0 && (
            <>
              <h3 style={{ marginBottom: 12 }}>Current Finals Tips</h3>
              <div className="table-wrap">
                <table className="afl-table">
                  <thead>
                    <tr>
                      <th>Entrant</th>
                      <th>Round</th>
                      <th>Team</th>
                      <th>Predicted Margin</th>
                      <th>Margin Error</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openFinalsTips.map((tip) => {
                      const name = tip.knockout_entries.profiles?.full_name ?? tip.knockout_entries.profiles?.short_name ?? tip.knockout_entries.user_id
                      return (
                        <tr key={tip.id}>
                          <td>{name}</td>
                          <td>{tip.finals_round}</td>
                          <td>{tip.team?.short_name ?? tip.team?.name ?? '—'}</td>
                          <td>{tip.predicted_margin ?? '—'}</td>
                          <td>{tip.margin_error ?? '—'}</td>
                          <td>
                            {tip.result === 'win' && <span style={{ color: 'var(--success)' }}>✅ Win</span>}
                            {tip.result === 'loss' && <span style={{ color: 'var(--danger)' }}>❌ Loss</span>}
                            {tip.result === 'pending' && <span style={{ color: 'var(--text-muted)' }}>⏳ Pending</span>}
                            {!tip.result && '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </main>
  )
}
