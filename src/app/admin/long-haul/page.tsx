import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type LhEntry = {
  id: number
  competition_id: number
  user_id: string
  joker_round_1: number | null
  joker_round_2: number | null
  is_locked: boolean
  total_paid: number
  created_at: string
  profiles: { full_name: string | null } | null
}

type ScoredTip = {
  entry_id: number
  round_id: number
  points_awarded: number
  rounds: { round_number: number } | null
}

type LeaderboardRow = {
  entry_id: number
  user_id: string
  full_name: string | null
  raw_score: number
  joker_bonus: number
  total_score: number
  mid_year_score: number
}

const MID_YEAR_ROUND = 11

export default async function AdminLongHaulPage({
  searchParams,
}: {
  searchParams: { error?: string; locked?: string; processed?: string; info?: string }
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

  // Find active long haul competition
  const { data: competition } = await supabase
    .from('competitions')
    .select('id, name, season_id')
    .eq('is_active', true)
    .ilike('name', '%long haul%')
    .single()

  const [{ data: allRoundsData }, { data: allUsersData }] = await Promise.all([
    supabase.from('rounds').select('id, season_id, round_number').order('round_number'),
    supabase.from('profiles').select('id, full_name').order('full_name'),
  ])

  const allRounds = allRoundsData ?? []
  const allUsers = allUsersData ?? []

  let entries: LhEntry[] = []
  let leaderboard: LeaderboardRow[] = []

  const seasonRounds = competition
    ? allRounds.filter((r) => r.season_id === competition.season_id)
    : []

  if (competition) {
    const { data: entriesData } = await supabase
      .from('long_haul_entries')
      .select(`
        id, competition_id, user_id, joker_round_1, joker_round_2,
        is_locked, total_paid, created_at,
        profiles(full_name)
      `)
      .eq('competition_id', competition.id)
      .order('created_at', { ascending: true })

    entries = (entriesData ?? []) as unknown as LhEntry[]

    // Build leaderboard
    const entryIds = entries.map((e) => e.id)
    if (entryIds.length > 0) {
      const { data: scoredTipsData } = await supabase
        .from('long_haul_tips')
        .select('entry_id, round_id, points_awarded, rounds(round_number)')
        .in('entry_id', entryIds)
        .not('points_awarded', 'is', null)

      const scoredTips = (scoredTipsData ?? []) as unknown as ScoredTip[]

      leaderboard = entries.map((e) => {
        const myTips = scoredTips.filter((t) => t.entry_id === e.id)

        const roundTotals = new Map<number, number>()
        for (const t of myTips) {
          const rn = t.rounds?.round_number ?? 0
          roundTotals.set(rn, (roundTotals.get(rn) ?? 0) + t.points_awarded)
        }

        let rawScore = 0
        let jokerBonus = 0
        let midYearScore = 0

        for (const [rn, pts] of roundTotals) {
          rawScore += pts
          if (rn <= MID_YEAR_ROUND) {
            midYearScore += pts  // raw tips only — joker multipliers never apply to mid-year
          }
          if (rn === e.joker_round_1) {
            jokerBonus += pts * 1
          } else if (rn === e.joker_round_2) {
            jokerBonus += pts * 2
          }
        }

        return {
          entry_id: e.id,
          user_id: e.user_id,
          full_name: e.profiles?.full_name ?? null,
          raw_score: rawScore,
          joker_bonus: jokerBonus,
          total_score: rawScore + jokerBonus,
          mid_year_score: midYearScore,
        }
      })
    }
  }

  const fullLeaderboard = [...leaderboard].sort((a, b) => b.total_score - a.total_score)
  const midYearLeaderboard = [...leaderboard].sort((a, b) => b.mid_year_score - a.mid_year_score)

  const prizePool = entries.reduce((s, e) => s + Number(e.total_paid), 0)

  const errorMsg = searchParams.error ? `Error: ${searchParams.error}` : null
  const lockedMsg = searchParams.locked ? 'All entries have been locked.' : null
  const processedMsg = searchParams.processed ? 'Round results processed successfully.' : null
  const infoMsg = searchParams.info === 'no_tips' ? 'No tips found for this round.' : null

  return (
    <main className="page-container-wide">
      <div className="page-header">
        <h1>🏁 Admin — Long Haul</h1>
        <a href="/admin" className="btn btn-primary btn-sm">← Admin Panel</a>
      </div>

      {errorMsg && <div className="alert-error">{errorMsg}</div>}
      {lockedMsg && (
        <div style={{ background: '#f0fff4', border: '1px solid #bbf7d0', color: 'var(--success)', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
          {lockedMsg}
        </div>
      )}
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
          <p>No active Long Haul competition found. Create a competition with &ldquo;Long Haul&rdquo; (case-insensitive) in its name and set it as active.</p>
        </div>
      )}

      {/* ── Lock Season ── */}
      {competition && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Lock Season</h2>
          </div>
          <p style={{ marginBottom: 16 }}>
            Lock all entries when the first game of the season starts. Entrants will no longer be able to change their tips.
          </p>
          <form action="/api/admin/long-haul/lock" method="POST">
            <input type="hidden" name="competition_id" value={competition.id} />
            <button type="submit" className="btn btn-gold">🔒 Lock All Entries</button>
          </form>
        </div>
      )}

      {/* ── Process Round Results ── */}
      {competition && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Process Round Results</h2>
          </div>
          <p style={{ marginBottom: 16 }}>
            After entering game scores in the main Admin panel, process Long Haul results here to award points.
          </p>
          <form action="/api/admin/long-haul/result" method="POST">
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
          <p style={{ marginTop: 8 }}>Total collected from {entries.length} entrant{entries.length !== 1 ? 's' : ''}</p>
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
                    <th className="center">Joker 1 (×2)</th>
                    <th className="center">Joker 2 (×3)</th>
                    <th className="center">Locked</th>
                    <th className="center">Total Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td>{e.profiles?.full_name ?? e.user_id}</td>
                      <td className="center">
                        {e.joker_round_1 != null ? `Round ${e.joker_round_1}` : '—'}
                      </td>
                      <td className="center">
                        {e.joker_round_2 != null ? `Round ${e.joker_round_2}` : '—'}
                      </td>
                      <td className="center">
                        {e.is_locked ? '🔒 Yes' : '🔓 No'}
                      </td>
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
          <form action="/api/admin/long-haul/entry" method="POST">
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
                  placeholder="e.g. 30"
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

      {/* ── Mid-Year Leaderboard ── */}
      {leaderboard.length > 0 && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Mid-Year Standings (after Round {MID_YEAR_ROUND}, jokers excluded)</h2>
          </div>
          <div className="table-wrap">
            <table className="afl-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th className="center">Score</th>
                </tr>
              </thead>
              <tbody>
                {midYearLeaderboard.map((row, idx) => (
                  <tr
                    key={row.entry_id}
                    className={idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : ''}
                  >
                    <td className="center">{idx + 1}</td>
                    <td>{row.full_name ?? row.user_id}</td>
                    <td className="center">{row.mid_year_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Full Season Leaderboard ── */}
      {leaderboard.length > 0 && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Full Season Standings</h2>
          </div>
          <div className="table-wrap">
            <table className="afl-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th className="center">Raw Score</th>
                  <th className="center">Joker Bonus</th>
                  <th className="center">Total</th>
                </tr>
              </thead>
              <tbody>
                {fullLeaderboard.map((row, idx) => (
                  <tr
                    key={row.entry_id}
                    className={idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : ''}
                  >
                    <td className="center">{idx + 1}</td>
                    <td>{row.full_name ?? row.user_id}</td>
                    <td className="center">{row.raw_score}</td>
                    <td className="center">+{row.joker_bonus}</td>
                    <td className="center" style={{ fontWeight: 700 }}>{row.total_score}</td>
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
