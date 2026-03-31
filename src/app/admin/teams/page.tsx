import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type Team = {
  id: number
  name: string
  short_name: string | null
  abbreviation: string | null
  state: string | null
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_name: 'Team name is required.',
  save_failed: 'Failed to save team. The name may already be taken.',
  no_file: 'Please select a CSV file to upload.',
  empty_csv: 'The CSV file is empty or has no rows.',
  missing_name_column: 'CSV must have a "name" column.',
  no_valid_rows: 'No valid rows found in CSV.',
  import_failed: 'Import failed. Please check your CSV file.',
}

export default async function AdminTeamsPage({
  searchParams,
}: {
  searchParams: { error?: string; added?: string; imported?: string }
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

  const { data: teamsData } = await supabase
    .from('teams')
    .select('id, name, short_name, abbreviation, state')
    .order('name')

  const teams = (teamsData ?? []) as Team[]

  const errorMsg = searchParams.error ? ERROR_MESSAGES[searchParams.error] ?? searchParams.error : null
  const addedMsg = searchParams.added ? 'Team added successfully.' : null
  const importedMsg = searchParams.imported ? `${searchParams.imported} team(s) imported/updated.` : null

  return (
    <main className="page-container-wide">
      <div className="page-header">
        <h1>🏈 Admin — Teams</h1>
        <a href="/admin" className="btn btn-primary btn-sm">← Admin Panel</a>
      </div>

      {errorMsg && <div className="alert-error">{errorMsg}</div>}
      {addedMsg && (
        <div style={{ background: '#f0fff4', border: '1px solid #bbf7d0', color: 'var(--success)', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
          {addedMsg}
        </div>
      )}
      {importedMsg && (
        <div style={{ background: '#f0fff4', border: '1px solid #bbf7d0', color: 'var(--success)', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
          {importedMsg}
        </div>
      )}

      {/* ── Teams List ── */}
      <div className="section-card">
        <div className="section-card-header">
          <h2>All Teams ({teams.length})</h2>
        </div>
        {teams.length > 0 ? (
          <div className="table-wrap">
            <table className="afl-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Short Name</th>
                  <th>Abbrev</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => (
                  <tr key={t.id}>
                    <td>{t.id}</td>
                    <td>{t.name}</td>
                    <td>{t.short_name ?? '—'}</td>
                    <td>{t.abbreviation ?? '—'}</td>
                    <td>{t.state ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No teams yet.</p>
        )}
      </div>

      {/* ── Add Team ── */}
      <div className="section-card">
        <div className="section-card-header">
          <h2>Add Team</h2>
        </div>
        <form action="/api/admin/teams/add" method="POST">
          <div className="form-grid">
            <div className="form-field">
              <label className="form-label">Name *</label>
              <input type="text" name="name" required placeholder="e.g. Richmond Tigers" className="form-input" />
            </div>
            <div className="form-field">
              <label className="form-label">Short Name</label>
              <input type="text" name="short_name" placeholder="e.g. Richmond" className="form-input" />
            </div>
            <div className="form-field">
              <label className="form-label">Abbreviation</label>
              <input type="text" name="abbreviation" placeholder="e.g. RIC" maxLength={5} className="form-input" />
            </div>
            <div className="form-field">
              <label className="form-label">State</label>
              <input type="text" name="state" placeholder="e.g. VIC" className="form-input" />
            </div>
            <div className="form-field" style={{ justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary">Add Team</button>
            </div>
          </div>
        </form>
      </div>

      {/* ── CSV Import ── */}
      <div className="section-card">
        <div className="section-card-header">
          <h2>Import Teams via CSV</h2>
        </div>
        <p style={{ marginBottom: 14 }}>
          Upload a CSV file with columns: <code>name</code>, <code>short_name</code>, <code>abbreviation</code>, <code>state</code>.
          The <code>name</code> column is required. Existing teams with the same name will be updated.
        </p>
        <form action="/api/admin/teams/import" method="POST" encType="multipart/form-data">
          <div className="form-grid">
            <div className="form-field">
              <label className="form-label">CSV File</label>
              <input type="file" name="csv_file" accept=".csv,text/csv" required className="form-input" />
            </div>
            <div className="form-field" style={{ justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-gold">Import CSV</button>
            </div>
          </div>
        </form>
      </div>
    </main>
  )
}
