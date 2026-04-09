import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: { success?: string; error?: string }
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

  const [
    { data: profiles },
    { data: transactions },
    { data: transactionTypes },
  ] = await Promise.all([
    supabase.from('profiles').select('id, full_name, short_name').order('full_name'),
    supabase.from('transactions').select('profile_id, amount, transaction_types(name)'),
    supabase.from('transaction_types').select('id, name').order('name'),
  ])

  // Calculate balance per user
  const balanceMap: Record<string, number> = {}
  for (const t of transactions ?? []) {
    if (!balanceMap[t.profile_id]) balanceMap[t.profile_id] = 0
    balanceMap[t.profile_id] += Number(t.amount)
  }

  return (
    <main className="page-container-wide">
      <div className="page-header">
        <h1>💰 Payments &amp; Balances</h1>
        <a href="/admin" className="btn btn-primary btn-sm">← Admin</a>
      </div>

      {searchParams.success && (
        <div style={{ background: '#f0fff4', border: '1px solid #bbf7d0', color: 'var(--success)', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
          ✅ Transaction added successfully.
        </div>
      )}
      {searchParams.error && (
        <div style={{ background: '#fff0f0', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
          ❌ Failed to add transaction. Please check all fields.
        </div>
      )}

      {/* User Balances Summary */}
      <div className="section-card">
        <div className="section-card-header">
          <h2>User Balances</h2>
        </div>
        <div className="table-wrap">
          <table className="afl-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {(profiles ?? []).map((p) => {
                const bal = balanceMap[p.id] ?? 0
                return (
                  <tr key={p.id}>
                    <td>{p.full_name ?? p.short_name ?? p.id}</td>
                    <td
                      className="right"
                      style={{ fontWeight: 'bold', color: bal >= 0 ? 'var(--success)' : '#c00' }}
                    >
                      {bal >= 0 ? '+' : ''}${bal.toFixed(2)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Transaction */}
      <div className="section-card">
        <div className="section-card-header">
          <h2>Add Transaction</h2>
        </div>
        <form action="/api/admin/payments/transaction" method="POST">
          <div className="form-grid">
            <div className="form-field">
              <label className="form-label">User</label>
              <select name="profile_id" required className="form-select">
                <option value="">Select user…</option>
                {(profiles ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name ?? p.short_name ?? p.id}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Amount ($)</label>
              <input
                type="number"
                name="amount"
                step="0.01"
                placeholder="e.g. 20 (credit) or -20 (debit)"
                required
                className="form-input"
              />
            </div>
            <div className="form-field">
              <label className="form-label">Type</label>
              <select name="type_name" required className="form-select">
                <option value="">Select type…</option>
                {(transactionTypes ?? []).map((tt) => (
                  <option key={tt.id} value={tt.name}>{tt.name}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Notes (optional)</label>
              <input
                type="text"
                name="notes"
                placeholder="e.g. Cash payment received"
                className="form-input"
              />
            </div>
            <div className="form-field" style={{ justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-gold">Add Transaction</button>
            </div>
          </div>
        </form>
      </div>
    </main>
  )
}
