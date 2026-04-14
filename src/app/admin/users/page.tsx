import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: {
    created?: string
    error?: string
    bulk_created?: string
    bulk_failed?: string
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

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, short_name, is_admin')
    .order('full_name')

  return (
    <main className="page-container-wide">
      <div className="page-header">
        <h1>👥 User Management</h1>
        <a href="/admin" className="btn btn-primary btn-sm">← Admin Panel</a>
      </div>

      {searchParams.created === '1' && (
        <div style={{ background: '#f0fff4', border: '1px solid #bbf7d0', color: 'var(--success)', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
          ✅ User created successfully.
        </div>
      )}
      {searchParams.error === 'create_failed' && (
        <div className="alert-error" style={{ marginBottom: 14 }}>
          ❌ Failed to create user. Check that the email is not already in use.
        </div>
      )}
      {searchParams.bulk_created !== undefined && (
        <div style={{ background: '#f0fff4', border: '1px solid #bbf7d0', color: 'var(--success)', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
          ✅ Bulk import complete: {searchParams.bulk_created} created, {searchParams.bulk_failed ?? 0} failed.
        </div>
      )}

      {/* ── Existing Users ── */}
      <div className="section-card">
        <div className="section-card-header">
          <h2>Existing Users</h2>
        </div>
        {(profiles ?? []).length > 0 ? (
          <div className="table-wrap">
            <table className="afl-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Short Name</th>
                  <th>Admin</th>
                </tr>
              </thead>
              <tbody>
                {(profiles ?? []).map((p) => (
                  <tr key={p.id}>
                    <td>{p.full_name ?? '—'}</td>
                    <td>{p.short_name ?? '—'}</td>
                    <td>{p.is_admin ? '✅ Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No users yet.</p>
        )}
      </div>

      {/* ── Create Single User ── */}
      <div className="section-card">
        <div className="section-card-header">
          <h2>Create User</h2>
        </div>
        <form action="/api/admin/users/create" method="POST">
          <div className="form-grid">
            <div className="form-field">
              <label className="form-label">Full Name *</label>
              <input type="text" name="full_name" required className="form-input" placeholder="e.g. John Smith" />
            </div>
            <div className="form-field">
              <label className="form-label">Short Name</label>
              <input type="text" name="short_name" className="form-input" placeholder="e.g. Smithy" />
            </div>
            <div className="form-field">
              <label className="form-label">Email *</label>
              <input type="email" name="email" required className="form-input" placeholder="john@example.com" />
            </div>
            <div className="form-field">
              <label className="form-label">Password *</label>
              <input type="password" name="password" required className="form-input" placeholder="Temporary password" />
            </div>
            <div className="form-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" name="is_admin" id="is_admin" />
              <label className="form-label" htmlFor="is_admin" style={{ marginBottom: 0 }}>Admin user</label>
            </div>
            <div className="form-field" style={{ justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary">Create User</button>
            </div>
          </div>
        </form>
      </div>

      {/* ── Bulk CSV Import ── */}
      <div className="section-card">
        <div className="section-card-header">
          <h2>Bulk Create Users (CSV)</h2>
        </div>
        <form action="/api/admin/users/bulk" method="POST" encType="multipart/form-data">
          <div className="form-field" style={{ marginBottom: 12 }}>
            <label className="form-label">CSV Data</label>
            <textarea
              name="csv"
              rows={8}
              className="form-input"
              style={{ fontFamily: 'monospace' }}
              placeholder={'full_name,short_name,email,password,is_admin\nJohn Smith,Smithy,john@example.com,TempPass123,false\nJane Doe,,jane@example.com,TempPass456,false'}
            />
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            CSV format: <code>full_name,short_name,email,password,is_admin</code> (header row required).
            <br />
            <code>short_name</code> is optional (leave blank). <code>is_admin</code> accepts <code>true</code> or <code>false</code>.
          </p>
          <button type="submit" className="btn btn-gold">Bulk Create Users</button>
        </form>
      </div>
    </main>
  )
}
