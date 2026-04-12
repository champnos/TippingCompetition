import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type PrecisionEntry = {
  id: number
  competition_id: number
  user_id: string
  total_paid: number
  is_active: boolean
  eliminated_round: number | null
  created_at: string
  profiles: { full_name: string | null } | null
}

export default async function AdminPrecisionPage({
  searchParams,
}: {
  searchParams: {
    error?: string
    processed?: string
    info?: string
  }
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

  // Find active precision competition
  const { data: competition } = await supabase
    .from('competitions')
    .select('id, name, season_id, entry_fee')
    .eq('is_active', true)
    .ilike('name', '%precision%')
    .single()

  const [{ data: allRoundsData }, { data: allUsersData }] = await Promise.all([
    supabase.from('rounds').select('id, season_id, round_number').order('round_number'),
    supabase.from('profiles').select('id, full_name').order('full_name'),
  ])

  const allRounds = allRoundsData ?? []
  const allUsers = allUsersData ?? []

  const seasonRounds = competition
    ? allRounds.filter((r) => r.season_id === competition.season_id)
    : []

  let entries: PrecisionEntry[] = []

  if (competition) {
    const { data: entriesData } = await supabase
      .from('precision_entries')
      .select(`
        id, competition_id, user_id, total_paid, is_active, eliminated_round, created_at,
        profiles(full_name)
      `)
      .eq('competition_id', competition.id)
      .order('created_at', { ascending: true })

    entries = (entriesData ?? []) as unknown as PrecisionEntry[]
  }

  const entryFee = Number(competition?.entry_fee ?? 30)
  const prizePool = entries.reduce((s, e) => s + Number(e.total_paid), 0)

  // Determine final round (highest eliminated_round among eliminated entries)
  const eliminatedRounds = entries
    .filter((e) => e.eliminated_round !== null)
    .map((e) => e.eliminated_round as number)

  const finalRound = eliminatedRounds.length > 0 ? Math.max(...eliminatedRounds) : null

  // Winners are those eliminated in the final round
  const winners = finalRound !== null
    ? entries.filter((e) => e.eliminated_round === finalRound)
    : entries.filter((e) => e.is_active)

  const prizePerWinner = winners.length > 0 ? prizePool / winners.length : 0

  // Prize breakdown: $30 for 3rd last, 70/30 split of remainder for 1st/2nd
  const thirdLastPrize = 30
  const remainingPool = prizePool - thirdLastPrize
  const firstPrize = Math.round((remainingPool * 0.7) / 10) * 10
  const secondPrize = Math.round((remainingPool * 0.3) / 10) * 10
  const showPrizeBreakdown = entries.length >= 3

  const activeCount = entries.filter((e) => e.is_active).length
  const eliminatedCount = entries.filter((e) => !e.is_active).length

  // Sort leaderboard: active first, then by eliminated_round descending
  const leaderboard = [...entries].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
    return (b.eliminated_round ?? 0) - (a.eliminated_round ?? 0)
  })

  const errorMsg = searchParams.error ? `Error: ${searchParams.error}` : null
  const processedMsg = searchParams.processed ? 'Round results processed successfully.' : null
  const infoMsg =
    searchParams.info === 'no_active_entries' ? 'No active entries found for this competition.' : null

  return (
    <main className="page-container-wide">
      <div className="page-header">
        <h1>🎯 Admin — Precision</h1>
        <a href="/admin" className="btn btn-primary btn-sm">← Admin Panel</a>
      </div>

      {errorMsg && <div className="alert-error">{errorMsg}</div>}
      {processedMsg && (
        <div style={{ background: '#f0fff4', border: '1px solid #bbf7d0', color: 'var(--success)', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
          {processedMsg}
        </div>
      )}
      {infoMsg && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
          {infoMsg}
        </div>
      )}

      {!competition && (
        <div className="section-card">
          <p>No active Precision competition found. Create a competition with &ldquo;Precision&rdquo; (case-insensitive) in its name and set it as active.</p>
        </div>
      )}

      {/* ── Process Round Results ── */}
      {competition && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Process Round Results</h2>
          </div>
          <p style={{ marginBottom: 16 }}>
            After game results are entered, process Precision results here.
            Loss, draw, or no tip = eliminated. Teams exhausted = eliminated. Round 18 survivors also paid out.
          </p>
          <form action="/api/admin/precision/result" method="POST">
            <input type="hidden" name="competition_id" value={competition.id} />
            <div className="form-grid">
              <div className="form-field">
                <label className="form-label">Round</label>
                <select name="round_id" required className="form-select">
                  <option value="">Select round…</option>
                  {seasonRounds.map((r) => (
                    <option key={r.id} value={r.id}>Round {r.round_number}</option>
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
          <p style={{ marginTop: 8 }}>
            Total collected from {entries.length} entrant{entries.length !== 1 ? 's' : ''} @ ${entryFee.toFixed(0)}/entry
          </p>
          <div style={{ marginTop: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div className="form-label">Active</div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--success)' }}>{activeCount}</div>
            </div>
            <div>
              <div className="form-label">Eliminated</div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--danger)' }}>{eliminatedCount}</div>
            </div>
            {finalRound !== null && (
              <div>
                <div className="form-label">Final Elimination Round</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Round {finalRound}</div>
              </div>
            )}
            {winners.length > 0 && prizePool > 0 && !showPrizeBreakdown && (
              <div>
                <div className="form-label">Prize per Winner ({winners.length} winner{winners.length !== 1 ? 's' : ''})</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--gold-dark)' }}>
                  ${prizePerWinner.toFixed(2)}
                </div>
              </div>
            )}
          </div>

          {showPrizeBreakdown && prizePool > 0 && (
            <div style={{ marginTop: 20, padding: '14px 16px', background: 'var(--surface-alt, #f3f4f6)', borderRadius: 8 }}>
              <div className="form-label" style={{ marginBottom: 10, fontSize: '0.85rem', letterSpacing: '0.05em' }}>PRIZE BREAKDOWN</div>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div>
                  <div className="form-label">3rd Last Prize</div>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--gold-dark)' }}>${thirdLastPrize}</div>
                </div>
                <div>
                  <div className="form-label">1st Place (70%)</div>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--gold-dark)' }}>${firstPrize}</div>
                </div>
                <div>
                  <div className="form-label">2nd Place (30%)</div>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--gold-dark)' }}>${secondPrize}</div>
                </div>
              </div>
              <p style={{ marginTop: 10, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Note: Only players with <strong>is_active = true</strong> at end of season are eligible for 1st/2nd place prizes.
              </p>
            </div>
          )}

          {winners.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="form-label" style={{ marginBottom: 6 }}>
                {finalRound !== null ? `Round ${finalRound} Eliminees (split pot)` : 'Still Active (split pot if season ends)'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {winners.map((w) => (
                  <span key={w.id} style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 4, padding: '2px 8px', fontSize: '0.9rem' }}>
                    {w.profiles?.full_name ?? w.user_id}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Entries ── */}
      {competition && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Entries</h2>
          </div>

          {entries.length > 0 ? (
            <div className="table-wrap" style={{ marginBottom: 20 }}>
              <table className="afl-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className="center">Status</th>
                    <th className="center">Eliminated Round</th>
                    <th className="center">Total Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((e, idx) => {
                    const prev = idx > 0 ? leaderboard[idx - 1] : null
                    const showDivider = prev?.is_active && !e.is_active
                    return (
                      <>
                        {showDivider && (
                          <tr key={`divider-${e.id}`}>
                            <td colSpan={4} style={{ textAlign: 'center', padding: '8px', background: 'var(--surface-alt, #f3f4f6)', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.05em' }}>
                              — NO MONIES —
                            </td>
                          </tr>
                        )}
                        <tr key={e.id}>
                          <td>{e.profiles?.full_name ?? e.user_id}</td>
                          <td className="center">
                            {e.is_active
                              ? <span style={{ color: 'var(--success)', fontWeight: 700 }}>✅ Active</span>
                              : <span style={{ color: 'var(--danger)' }}>❌ Eliminated</span>
                            }
                          </td>
                          <td className="center">{e.eliminated_round ?? '—'}</td>
                          <td className="center">${Number(e.total_paid).toFixed(2)}</td>
                        </tr>
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ marginBottom: 16 }}>No entries yet.</p>
          )}

          <h3 style={{ marginBottom: 14 }}>Add Entrant</h3>
          <form action="/api/admin/precision/entry" method="POST">
            <input type="hidden" name="competition_id" value={competition?.id ?? ''} />
            <div className="form-grid">
              <div className="form-field">
                <label className="form-label">User</label>
                <select name="user_id" required className="form-select">
                  <option value="">Select user…</option>
                  {allUsers.map((u) => (
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
                  placeholder={`e.g. ${entryFee.toFixed(0)}`}
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
    </main>
  )
}
