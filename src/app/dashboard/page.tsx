import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) { redirect('/login') }

  return (
    <main style={{ maxWidth: 800, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Dashboard</h1>
        <form action="/api/auth/signout" method="post">
          <button type="submit">Log Out</button>
        </form>
      </div>
      <p>Welcome, {user.email}!</p>
      <nav style={{ marginTop: 24 }}>
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <li><a href="/tips" style={{ fontSize: 16 }}>🏉 Submit Tips</a></li>
          <li><a href="/leaderboard" style={{ fontSize: 16 }}>🏆 Leaderboard</a></li>
          <li><a href="/payments" style={{ fontSize: 16 }}>💰 Payments</a></li>
        </ul>
      </nav>
    </main>
  )
}