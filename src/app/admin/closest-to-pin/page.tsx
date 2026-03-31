import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type CtpEntry = {
  id: number
  competition_id: number
  user_id: string
  total_paid: number
  created_at: string
  profiles: { full_name: string | null } | null
}

type CtpTipWithEntry = {
  id: number
  entry_id: number
  team_id: number
  margin: number
  actual_margin: number | null
  correct_team: boolean | null
  raw_score: number | null
  round_score: number | null
  accuracy_factor: number | null
  result: string | null
  team: { name: string; short_name: string | null }
  closest_to_pin_entries: { user_id: string; profiles: { full_name: string | null } | null }
}

export default async function AdminClosestToPinPage({
  searchParams,
}: {
  searchParams: { error?: string; processed?: string; info?: string }
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

  // Find active closest-to-pin competition
  const { data: competition } = await supabase
    .from('competitions')
    .select('id, name, season_id')
    .eq('is_active', true)
    .ilike('name', '%closest%')
    .single()

  const [
    { data: allRounds },
    { data: allUsers },
  ] = await Promise.all([
    supabase.from('rounds').select('id, season_id, round_number, locked').order('round_number'),
    supabase.from('profiles').select('id, full_name').order('full_name'),
  ])

  // Get entries for this competition
  let ctpEntries: CtpEntry[] = []
  let currentRoundTips: CtpTipWithEntry[] = []

  if (competition) {
    const { data: entriesData } = await supabase
      .from('closest_to_pin_entries')
      .select(`
        id, competition_id, user_id, total_paid, created_at,
        profiles(full_name)
      `)
      .eq('competition_id', competition.id)
      .order('created_at', { ascending: true })

    ctpEntries = (entriesData ?? []) as unknown as CtpEntry[]

    // Find current round (lowest unlocked)
    const seasonRounds = (allRounds ?? []).filter((r) => r.season_id === competition.season_id)
    const currentRound = seasonRounds.find((r) => !r.locked) ?? null

    if (currentRound && ctpEntries.length > 0) {
      const entryIds = ctpEntries.map((e) => e.id)
      const { data: tipsData } = await supabase
        .from('closest_to_pin_tips')
        .select(`
          id, entry_id, team_id, margin, actual_margin, correct_team,
          raw_score, round_score, accuracy_factor, result,
          team:teams!closest_to_pin_tips_team_id_fkey(name, short_name),
          closest_to_pin_entries!inner(user_id, profiles(full_name))
        `)
        .eq('round_id', currentRound.id)
        .in('entry_id', entryIds)

      currentRoundTips = (tipsData ?? []) as unknown as CtpTipWithEntry[]
    }
  }

  const prizePool = ctpEntries.reduce((sum, e) => sum + Number(e.total_paid), 0)

  const seasonRoundsForComp = competition
    ? (allRounds ?? []).filter((r) => r.season_id === competition.season_id)
    : []

  const tipByEntryId = new Map(currentRoundTips.map((t) => [t.entry_id, t]))

  const errorMsg = searchParams.error ? `Error: ${searchParams.error}` : null
  const successMsg = searchParams.processed ? 'Round results processed successfully.' : null
  const infoMsg = searchParams.info === 'no_pending_tips' ? 'No pending tips found for this round.' : null

  return (
    <main className="page-container-wide">
      <div className="page-header">
        <h1>🎯 Admin — Closest to Pin</h1>
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

      {!competition && (
        <div className="section-card">
          <p>No active Closest to Pin competition found. Create a competition with &ldquo;Closest&rdquo; in its name and set it as active.</p>
        </div>
      )}

      {/* ── Process Results ── */}
      {competition && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Process Round Results</h2>
          </div>
          <p style={{ marginBottom: 16 }}>
            After entering game scores in the main Admin panel, process Closest to Pin results here
            to calculate scores for each entrant.
          </p>
          <form action="/api/admin/closest-to-pin/result" method="POST">
            <input type="hidden" name="competition_id" value={competition.id} />
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
      {competition && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Prize Pool</h2>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--gold-dark)' }}>
            ${prizePool.toFixed(2)}
          </div>
          <p style={{ marginTop: 8 }}>Total collected from {ctpEntries.length} entrant{ctpEntries.length !== 1 ? 's' : ''}</p>
        </div>
      )}

      {/* ── Entries ── */}
      {competition && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Entries</h2>
          </div>

          {ctpEntries.length > 0 ? (
            <div className="table-wrap" style={{ marginBottom: 20 }}>
              <table className="afl-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className="center">Total Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {ctpEntries.map((e) => (
                    <tr key={e.id}>
                      <td>{e.profiles?.full_name ?? e.user_id}</td>
                      <td className="center">${Number(e.total_paid).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ marginBottom: 16 }}>No entries yet.</p>
          )}

          <h3 style={{ marginBottom: 14 }}>Add Entrant</h3>
          <form action="/api/admin/closest-to-pin/entry" method="POST">
            <input type="hidden" name="competition_id" value={competition?.id ?? ''} />
            <div className="form-grid">
              <div className="form-field">
                <label className="form-label">User</label>
                <select name="user_id" required className="form-select">
                  <option value="">Select user…</option>
                  {(allUsers ?? []).map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name ?? u.id}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Payment Amount ($)</label>
                <input
                  type="number"
                  name="payment_amount"
                  min={0}
                  step="0.01"
                  placeholder="e.g. 20"
                  className="form-input"
                />
              </div>
              <div className="form-field" style={{ justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary">Add Entrant</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ── Current Round Tips ── */}
      {competition && ctpEntries.length > 0 && (
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
                  <th className="center">Margin</th>
                  <th className="center">Actual Margin</th>
                  <th className="center">Factor</th>
                  <th className="center">Round Score</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {ctpEntries.map((e) => {
                  const tip = tipByEntryId.get(e.id)
                  const name = e.profiles?.full_name ?? e.user_id
                  return (
                    <tr key={e.id}>
                      <td>{name}</td>
                      <td>
                        {tip
                          ? (tip.team.short_name ?? tip.team.name)
                          : <span style={{ color: 'var(--danger)' }}>⚠️ Not submitted</span>}
                      </td>
                      <td className="center">{tip?.margin ?? '—'}</td>
                      <td className="center">{tip?.actual_margin ?? '—'}</td>
                      <td className="center">{tip?.accuracy_factor != null ? `×${tip.accuracy_factor}` : '—'}</td>
                      <td className="center">{tip?.round_score ?? '—'}</td>
                      <td>
                        {tip?.result === 'correct' && <span style={{ color: 'var(--success)', fontWeight: 700 }}>✅ Correct</span>}
                        {tip?.result === 'wrong' && <span style={{ color: 'var(--danger)', fontWeight: 700 }}>❌ Wrong</span>}
                        {tip?.result === 'draw' && <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>— Draw</span>}
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
    </main>
  )
}
