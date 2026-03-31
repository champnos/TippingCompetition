import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) { redirect('/login') }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, full_name, short_name')
    .eq('id', user.id)
    .single()

  const displayName = profile?.short_name || profile?.full_name || user.email

  return (
    <main className="page-container">
      <div className="welcome-banner">
        <h1>G&apos;day, {displayName}! 🏉</h1>
        <p>Welcome to Mancini Tipping — your AFL tipping competition hub.</p>
      </div>

      <div className="card-grid">
        <a href="/tips" className="nav-card">
          <span className="nav-card-icon">🏉</span>
          <span className="nav-card-title">Submit Tips</span>
          <span className="nav-card-desc">Pick your winners for upcoming rounds.</span>
        </a>
        <a href="/leaderboard" className="nav-card">
          <span className="nav-card-icon">🏆</span>
          <span className="nav-card-title">Leaderboard</span>
          <span className="nav-card-desc">See how you stack up against the comp.</span>
        </a>
        <a href="/payments" className="nav-card">
          <span className="nav-card-icon">💰</span>
          <span className="nav-card-title">Payments</span>
          <span className="nav-card-desc">Check entry fees and prize pool details.</span>
        </a>
        {profile?.is_admin && (
          <a href="/admin" className="nav-card">
            <span className="nav-card-icon">⚙️</span>
            <span className="nav-card-title">Admin Panel</span>
            <span className="nav-card-desc">Manage seasons, teams, fixtures and results.</span>
          </a>
        )}
      </div>
    </main>
  )
}