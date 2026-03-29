import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function PaymentsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: competition } = await supabase
    .from('competitions')
    .select('id, name, entry_fee, prize_pool')
    .eq('is_active', true)
    .single()

  const { data: transactions } = await supabase
    .from('transactions')
    .select('id, amount, notes, created_at, transaction_types(name)')
    .eq('profile_id', user.id)
    .order('created_at', { ascending: false })

  const { data: bankDetails } = await supabase
    .from('bank_details')
    .select('bsb, account_number, account_name, notes')
    .eq('profile_id', user.id)
    .single()

  const balance = (transactions ?? []).reduce((sum, t) => sum + Number(t.amount), 0)

  type Transaction = {
    id: number
    amount: number
    notes: string | null
    created_at: string
    transaction_types: { name: string } | null
  }

  return (
    <main style={{ maxWidth: 800, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Payments</h1>
        <a href="/dashboard">← Dashboard</a>
      </div>

      {competition && (
        <div style={{
          background: '#f0f4ff', borderRadius: 8, padding: '16px 20px',
          marginBottom: 32, display: 'flex', gap: 32, flexWrap: 'wrap'
        }}>
          <div>
            <div style={{ fontSize: 12, color: '#888' }}>Competition</div>
            <div style={{ fontWeight: 'bold' }}>{competition.name}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#888' }}>Entry Fee</div>
            <div style={{ fontWeight: 'bold' }}>${Number(competition.entry_fee).toFixed(2)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#888' }}>Prize Pool</div>
            <div style={{ fontWeight: 'bold' }}>${Number(competition.prize_pool).toFixed(2)}</div>
          </div>
        </div>
      )}

      <div style={{
        border: `2px solid ${balance >= 0 ? '#4a4' : '#c00'}`,
        borderRadius: 8, padding: '16px 20px', marginBottom: 32,
        background: balance >= 0 ? '#f0fff0' : '#fff0f0'
      }}>
        <div style={{ fontSize: 13, color: '#888' }}>Your Balance</div>
        <div style={{ fontSize: 28, fontWeight: 'bold', color: balance >= 0 ? '#2a2' : '#c00' }}>
          {balance >= 0 ? '+' : ''}${balance.toFixed(2)}
        </div>
        {balance < 0 && (
          <div style={{ fontSize: 13, color: '#c00', marginTop: 4 }}>
            Outstanding amount owed — please pay the competition organiser.
          </div>
        )}
      </div>

      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Transaction History</h2>
      {(transactions ?? []).length === 0 ? (
        <p style={{ color: '#888' }}>No transactions yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 40 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ccc', textAlign: 'left' }}>
              <th style={{ padding: '8px 4px' }}>Date</th>
              <th style={{ padding: '8px 4px' }}>Type</th>
              <th style={{ padding: '8px 4px' }}>Notes</th>
              <th style={{ padding: '8px 4px', textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {(transactions as unknown as Transaction[]).map((t) => (
              <tr key={t.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '8px 4px', fontSize: 13, color: '#555' }}>
                  {new Date(t.created_at).toLocaleDateString('en-AU', {
                    day: 'numeric', month: 'short', year: 'numeric'
                  })}
                </td>
                <td style={{ padding: '8px 4px', fontSize: 13 }}>
                  {t.transaction_types?.name ?? '—'}
                </td>
                <td style={{ padding: '8px 4px', fontSize: 13, color: '#666' }}>
                  {t.notes ?? '—'}
                </td>
                <td style={{
                  padding: '8px 4px', textAlign: 'right', fontWeight: 'bold',
                  color: Number(t.amount) >= 0 ? '#2a2' : '#c00'
                }}>
                  {Number(t.amount) >= 0 ? '+' : ''}${Number(t.amount).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Your Bank Details</h2>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
        Provide your bank details so the organiser can pay out winnings.
      </p>
      <form action="/api/payments/bank" method="POST">
        <div style={{ display: 'grid', gap: 12, maxWidth: 400 }}>
          <div>
            <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Account Name</label>
            <input
              type="text" name="account_name"
              defaultValue={bankDetails?.account_name ?? ''}
              placeholder="John Smith"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 4, border: '1px solid #ccc', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>BSB</label>
            <input
              type="text" name="bsb"
              defaultValue={bankDetails?.bsb ?? ''}
              placeholder="000-000" maxLength={7}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 4, border: '1px solid #ccc', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Account Number</label>
            <input
              type="text" name="account_number"
              defaultValue={bankDetails?.account_number ?? ''}
              placeholder="123456789"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 4, border: '1px solid #ccc', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Notes (optional)</label>
            <input
              type="text" name="notes"
              defaultValue={bankDetails?.notes ?? ''}
              placeholder="e.g. PayID: 0400 000 000"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 4, border: '1px solid #ccc', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
          <button type="submit" style={{
            background: '#1a73e8', color: '#fff', border: 'none',
            padding: '10px 24px', borderRadius: 4, fontSize: 14, cursor: 'pointer', width: 'fit-content'
          }}>
            Save Bank Details
          </button>
        </div>
      </form>
    </main>
  )
}