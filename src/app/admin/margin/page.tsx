import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { marginPrizes } from '@/lib/margin'

type MarginEntry = {
  id: number
  competition_id: number
  user_id: string
  total_paid: number
  total_score: number
  correct_tips_count: number
  created_at: string
  profiles: { full_name: string | null } | null
}

type LeaderboardRow = {
  entry_id: number
  user_id: string
  full_name: string | null
  total_score: number
  correct_tips_count: number
  average: number
}

export default async function AdminMarginPage({
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

  // Find active margin competition
  const { data: competition } = await supabase
    .from('competitions')
    .select('id, name, season_id, entry_fee')
    .eq('is_active', true)
    .ilike('name', '%margin%')
    .single()

  const [{ data: allRoundsData }, { data: allUsersData }] = await Promise.all([
    supabase.from('rounds').select('id, season_id, round_number').order('round_number'),
    supabase.from('profiles').select('id, full_name').order('full_name'),
  ])

  const allRounds = allRoundsData ?? []
  const allUsers = allUsersData ?? []

  let entries: MarginEntry[] = []
  let leaderboard: LeaderboardRow[] = []

  const seasonRounds = competition
    ? allRounds.filter((r) => r.season_id === competition.season_id)
    : []

  if (competition) {
    const { data: entriesData } = await supabase
      .from('margin_entries')
      .select(`
        id, competition_id, user_id, total_paid, total_score, correct_tips_count, created_at,
        profiles(full_name)
      `)
      .eq('competition_id', competition.id)
      .order('created_at', { ascending: true })

    entries = (entriesData ?? []) as unknown as MarginEntry[]

    leaderboard = [...entries]
      .map((e) => {
        const totalScore = Number(e.total_score)
        const correctTips = Number(e.correct_tips_count ?? 0)
        const average = correctTips > 0 ? totalScore / correctTips : 9999
        return {
          entry_id: e.id,
          user_id: e.user_id,
          full_name: e.profiles?.full_name ?? null,
          total_score: totalScore,
          correct_tips_count: correctTips,
          average,
        }
      })
      .sort((a, b) => a.average - b.average)
  }

  const entryFee = Number(competition?.entry_fee ?? 40)
  const prizePool = entries.reduce((s, e) => s + Number(e.total_paid), 0)
  const prizes = entries.length >= 3 ? marginPrizes(entries.length, entryFee) : null

  const errorMsg = searchParams.error ? `Error: ${searchParams.error}` : null
  const processedMsg = searchParams.processed ? 'Round results processed successfully.' : null
  const infoMsg =
    searchParams.info === 'no_entries' ? 'No entries found for this competition.' :
    searchParams.info === 'no_tips' ? 'No tips found for this round.' : null

  return (
    <main className="page-container-wide">
      <div className="page-header">
        <h1>📐 Admin — Margin Tipping</h1>
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
          <p>No active Margin competition found. Create a competition with &ldquo;Margin&rdquo; (case-insensitive) in its name and set it as active.</p>
        </div>
      )}

      {/* ── Process Round Results ── */}
      {competition && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Process Round Results</h2>
          </div>
          <p style={{ marginBottom: 16 }}>
            After entering game scores in the main Admin panel, process Margin results here to award points.
            Score = ABS(predicted margin − actual team margin) × accuracy factor. No tip = skipped entirely.
          </p>
          <form action="/api/admin/margin/result" method="POST">
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
          <p style={{ marginTop: 8 }}>Total collected from {entries.length} entrant{entries.length !== 1 ? 's' : ''} (entry fee: ${entryFee.toFixed(0)})</p>
          {prizes && (
            <div style={{ marginTop: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <div className="form-label">🥇 1st Place</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>${prizes.first.toFixed(0)}</div>
              </div>
              <div>
                <div className="form-label">🥈 2nd Place</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>${prizes.second.toFixed(0)}</div>
              </div>
              <div>
                <div className="form-label">3rd Last Place</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>${prizes.thirdLast.toFixed(0)}</div>
              </div>
            </div>
          )}
          {!prizes && entries.length > 0 && (
            <p style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Prize breakdown requires at least 3 entrants.
            </p>
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
                    <th className="center">Total Paid</th>
                    <th className="center">Total Weighted</th>
                    <th className="center">Correct Tips</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td>{e.profiles?.full_name ?? e.user_id}</td>
                      <td className="center">${Number(e.total_paid).toFixed(2)}</td>
                      <td className="center">
                        {Number(e.total_score).toFixed(0)}
                      </td>
                      <td className="center">{Number(e.correct_tips_count ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ marginBottom: 16 }}>No entries yet.</p>
          )}

          <h3 style={{ marginBottom: 14 }}>Add Entrant</h3>
          <form action="/api/admin/margin/entry" method="POST">
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

      {/* ── Leaderboard ── */}
      {leaderboard.length > 0 && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Leaderboard</h2>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Lower average = better</span>
          </div>
          <div className="table-wrap">
            <table className="afl-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th className="center">Total Weighted</th>
                  <th className="center">Correct Tips</th>
                  <th className="center">Average</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row, idx) => (
                  <tr
                    key={row.entry_id}
                    className={idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : ''}
                  >
                    <td className="center">{idx + 1}</td>
                    <td>{row.full_name ?? row.user_id}</td>
                    <td className="center">{row.total_score.toFixed(0)}</td>
                    <td className="center">{row.correct_tips_count}</td>
                    <td className="center" style={{ fontWeight: 700 }}>
                      {row.average === 9999 ? '—' : row.average.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  )
}
