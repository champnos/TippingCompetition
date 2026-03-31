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
        <a href="/leaderboard" className="nav-card">
          <span className="nav-card-icon">🏆</span>
          <span className="nav-card-title">Leaderboard</span>
          <span className="nav-card-desc">See how you stack up against the comp.</span>
        </a>
        <a href="/margin" className="nav-card">
          <span className="nav-card-icon">📐</span>
          <span className="nav-card-title">Margin Tipping</span>
          <span className="nav-card-desc">Tip the winner and earn points by margin.</span>
        </a>
        <a href="/knockout" className="nav-card">
          <span className="nav-card-icon">🥊</span>
          <span className="nav-card-title">Knockout</span>
          <span className="nav-card-desc">Tip your team to survive each round.</span>
        </a>
        <a href="/closest-to-pin" className="nav-card">
          <span className="nav-card-icon">🎯</span>
          <span className="nav-card-title">Closest to Pin</span>
          <span className="nav-card-desc">Tip the winner and margin each round.</span>
        </a>
        <a href="/long-haul" className="nav-card">
          <span className="nav-card-icon">🏁</span>
          <span className="nav-card-title">Long Haul</span>
          <span className="nav-card-desc">Pick 8 teams to win across the season.</span>
        </a>
        <a href="/precision" className="nav-card">
          <span className="nav-card-icon">🎯</span>
          <span className="nav-card-title">Precision</span>
          <span className="nav-card-desc">One team. Survive every round.</span>
        </a>
        <a href="/finals" className="nav-card">
          <span className="nav-card-icon">🏆</span>
          <span className="nav-card-title">Finals Tipping</span>
          <span className="nav-card-desc">Survive 4 finals weeks — closest to the pin wins.</span>
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