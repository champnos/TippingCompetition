import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function PaymentsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: transactions },
    { data: bankDetails },
    { data: marginEntries },
    { data: knockoutEntries },
    { data: precisionEntries },
    { data: closestToPinEntries },
    { data: longHaulEntries },
    { data: finalsEntries },
  ] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, amount, notes, created_at, transaction_types(name)')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('bank_details')
      .select('bsb, account_number, account_name, notes')
      .eq('profile_id', user.id)
      .single(),
    supabase
      .from('margin_entries')
      .select('competition_id, total_paid, competitions(name)')
      .eq('user_id', user.id),
    supabase
      .from('knockout_entries')
      .select('competition_id, total_paid, is_active, competitions(name)')
      .eq('user_id', user.id),
    supabase
      .from('precision_entries')
      .select('competition_id, total_paid, is_active, competitions(name)')
      .eq('user_id', user.id),
    supabase
      .from('closest_to_pin_entries')
      .select('competition_id, total_paid, competitions(name)')
      .eq('user_id', user.id),
    supabase
      .from('long_haul_entries')
      .select('competition_id, total_paid, competitions(name)')
      .eq('user_id', user.id),
    supabase
      .from('finals_entries')
      .select('competition_id, total_paid, is_active, competitions(name)')
      .eq('user_id', user.id),
  ])

  const balance = (transactions ?? []).reduce((sum, t) => sum + Number(t.amount), 0)

  type Transaction = {
    id: number
    amount: number
    notes: string | null
    created_at: string
    transaction_types: { name: string } | null
  }

  type CompEntry = {
    competition_id: number
    total_paid: number
    type: string
    name: string
    status?: string
  }

  const compEntries: CompEntry[] = [
    ...(marginEntries ?? []).map((e) => ({
      competition_id: e.competition_id,
      total_paid: Number(e.total_paid),
      type: 'Margin',
      name: (e.competitions as unknown as { name: string }[] | null)?.[0]?.name ?? '—',
      status: 'Active',
    })),
    ...(knockoutEntries ?? []).map((e) => ({
      competition_id: e.competition_id,
      total_paid: Number(e.total_paid),
      type: 'Knockout',
      name: (e.competitions as unknown as { name: string }[] | null)?.[0]?.name ?? '—',
      status: e.is_active ? 'Active' : 'Eliminated',
    })),
    ...(precisionEntries ?? []).map((e) => ({
      competition_id: e.competition_id,
      total_paid: Number(e.total_paid),
      type: 'Precision',
      name: (e.competitions as unknown as { name: string }[] | null)?.[0]?.name ?? '—',
      status: e.is_active ? 'Active' : 'Eliminated',
    })),
    ...(closestToPinEntries ?? []).map((e) => ({
      competition_id: e.competition_id,
      total_paid: Number(e.total_paid),
      type: 'Closest to Pin',
      name: (e.competitions as unknown as { name: string }[] | null)?.[0]?.name ?? '—',
      status: 'Active',
    })),
    ...(longHaulEntries ?? []).map((e) => ({
      competition_id: e.competition_id,
      total_paid: Number(e.total_paid),
      type: 'Long Haul',
      name: (e.competitions as unknown as { name: string }[] | null)?.[0]?.name ?? '—',
      status: 'Active',
    })),
    ...(finalsEntries ?? []).map((e) => ({
      competition_id: e.competition_id,
      total_paid: Number(e.total_paid),
      type: 'Finals',
      name: (e.competitions as unknown as { name: string }[] | null)?.[0]?.name ?? '—',
      status: e.is_active ? 'Active' : 'Eliminated',
    })),
  ]

  return (
    <main className="page-container-wide">
      <div className="page-header">
        <h1>💰 Payments</h1>
        <a href="/dashboard" className="btn btn-primary btn-sm">← Dashboard</a>
      </div>

      {/* Balance */}
      <div
        className="section-card"
        style={{
          border: `2px solid ${balance >= 0 ? 'var(--success)' : '#c00'}`,
          background: balance >= 0 ? '#f0fff0' : '#fff0f0',
        }}
      >
        <div style={{ fontSize: 13, color: '#888' }}>Your Balance</div>
        <div style={{ fontSize: 28, fontWeight: 'bold', color: balance >= 0 ? 'var(--success)' : '#c00' }}>
          {balance >= 0 ? '+' : ''}${balance.toFixed(2)}
        </div>
        {balance >= 0 ? (
          <div style={{ fontSize: 13, color: 'var(--success)', marginTop: 4 }}>✅ You&apos;re all paid up!</div>
        ) : (
          <div style={{ fontSize: 13, color: '#c00', marginTop: 4 }}>
            ⚠️ ${Math.abs(balance).toFixed(2)} outstanding — please pay the competition organiser.
          </div>
        )}
      </div>

      {/* Your Competitions */}
      {compEntries.length > 0 && (
        <div className="section-card">
          <div className="section-card-header">
            <h2>Your Competitions</h2>
          </div>
          <div className="table-wrap">
            <table className="afl-table">
              <thead>
                <tr>
                  <th>Competition</th>
                  <th>Type</th>
                  <th className="center">Total Paid</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {compEntries.map((e, i) => (
                  <tr key={i}>
                    <td>{e.name}</td>
                    <td>{e.type}</td>
                    <td className="center">${e.total_paid.toFixed(2)}</td>
                    <td>
                      <span style={{ color: e.status === 'Eliminated' ? '#c00' : 'var(--success)', fontWeight: 600 }}>
                        {e.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transaction History */}
      <div className="section-card">
        <div className="section-card-header">
          <h2>Transaction History</h2>
        </div>
        {(transactions ?? []).length === 0 ? (
          <p>No transactions yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="afl-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Notes</th>
                  <th className="center">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(transactions as unknown as Transaction[]).map((t) => (
                  <tr key={t.id}>
                    <td>
                      {new Date(t.created_at).toLocaleDateString('en-AU', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </td>
                    <td>{t.transaction_types?.name ?? '—'}</td>
                    <td>{t.notes ?? '—'}</td>
                    <td
                      className="center"
                      style={{ fontWeight: 'bold', color: Number(t.amount) >= 0 ? 'var(--success)' : '#c00' }}
                    >
                      {Number(t.amount) >= 0 ? '+' : ''}${Number(t.amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bank Details */}
      <div className="section-card">
        <div className="section-card-header">
          <h2>Your Bank Details</h2>
        </div>
        <p style={{ marginBottom: 16 }}>
          Provide your bank details so the organiser can pay out winnings.
        </p>
        <form action="/api/payments/bank" method="POST">
          <div className="form-grid">
            <div className="form-field">
              <label className="form-label">Account Name</label>
              <input
                type="text" name="account_name"
                defaultValue={bankDetails?.account_name ?? ''}
                placeholder="John Smith"
                className="form-input"
              />
            </div>
            <div className="form-field">
              <label className="form-label">BSB</label>
              <input
                type="text" name="bsb"
                defaultValue={bankDetails?.bsb ?? ''}
                placeholder="000-000" maxLength={7}
                className="form-input"
              />
            </div>
            <div className="form-field">
              <label className="form-label">Account Number</label>
              <input
                type="text" name="account_number"
                defaultValue={bankDetails?.account_number ?? ''}
                placeholder="123456789"
                className="form-input"
              />
            </div>
            <div className="form-field">
              <label className="form-label">Notes (optional)</label>
              <input
                type="text" name="notes"
                defaultValue={bankDetails?.notes ?? ''}
                placeholder="e.g. PayID: 0400 000 000"
                className="form-input"
              />
            </div>
            <div className="form-field" style={{ justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-gold">Save Bank Details</button>
            </div>
          </div>
        </form>
      </div>
    </main>
  )
}